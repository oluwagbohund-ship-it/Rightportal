import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../db/client.ts';
import { recordAuditLog } from '../audit.ts';
import {
  getClientIp,
  isRequestHttps,
  requireAuth,
  requireCsrfCheck,
  type AuthenticatedRequest,
} from '../middleware.ts';
import {
  checkRateLimit,
  clearRateLimit,
  recordRateLimitedAttempt,
} from '../rate-limiter.ts';
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  generateOpaqueToken,
  hashPassword,
  isAllowedEnvironmentForUser,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  sha256Hex,
  verifyPassword,
} from '../security.ts';
import {
  createAuthSession,
  purgeExpiredSessions,
  resolveAuthContextFromToken,
  revokeAllSessionsForUser,
  revokeSessionByToken,
  rotateSessionToken,
} from '../session-service.ts';
import {
  evaluateIdCardValidity,
  extractIdCardTokenFromScan,
  ID_CARD_TOKEN_PREFIX,
} from '../id-card-helpers.ts';
import {
  createTelegramToken,
  getBotToken,
  resolveBotUsername,
  resolveUserAccountContext,
  sendTelegramMessage,
} from '../telegram-bot.ts';
import type { RoleCode, UserType } from '../types.ts';
import {
  bootstrapOwnerSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  schoolLoginSchema,
  studentQrLoginSchema,
} from '../validation.ts';

export const authRouter = Router();

const MAX_FAILED_LOGIN_PER_ACCOUNT = 5;
const MAX_FAILED_LOGIN_PER_IP = 15;
const RATE_WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

authRouter.get('/session', (req, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    res.json({ authenticated: false, user: null });
    return;
  }

  const user = resolveAuthContextFromToken(rawToken);
  if (!user) {
    res.setHeader('Set-Cookie', buildClearSessionCookieHeader(isRequestHttps(req)));
    res.json({ authenticated: false, user: null });
    return;
  }

  res.json({ authenticated: true, user });
});

authRouter.post('/rotate', requireCsrfCheck, requireAuth, (req: AuthenticatedRequest, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const rotated = rotateSessionToken(rawToken, {
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] ?? '',
  });
  if (!rotated) {
    res.status(401).json({ error: 'Session is invalid or expired.' });
    return;
  }

  recordAuditLog({
    actorUserId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.roleCode,
    schoolId: req.auth!.activeSchoolId,
    authEnvironment: req.auth!.authEnvironment,
    action: 'auth.session.rotated',
    resourceType: 'session',
    outcome: 'success',
    ipAddress: getClientIp(req),
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rotated.rawToken, {
      maxAgeSeconds: rotated.maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );
  res.json({ ok: true });
});

authRouter.post('/logout', requireCsrfCheck, (req, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (rawToken) {
    const user = resolveAuthContextFromToken(rawToken);
    revokeSessionByToken(rawToken);
    if (user) {
      recordAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.roleCode,
        schoolId: user.activeSchoolId,
        authEnvironment: user.authEnvironment,
        action: 'auth.logout',
        resourceType: 'session',
        outcome: 'success',
        ipAddress: getClientIp(req),
      });
    }
  }
  res.setHeader('Set-Cookie', buildClearSessionCookieHeader(isRequestHttps(req)));
  res.json({ ok: true });
});

authRouter.post('/logout-all', requireCsrfCheck, requireAuth, (req: AuthenticatedRequest, res) => {
  const revokedCount = revokeAllSessionsForUser(req.auth!.id);
  recordAuditLog({
    actorUserId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.roleCode,
    schoolId: req.auth!.activeSchoolId,
    authEnvironment: req.auth!.authEnvironment,
    action: 'auth.logout_all',
    resourceType: 'session',
    outcome: 'success',
    metadata: { revokedCount },
    ipAddress: getClientIp(req),
  });
  res.setHeader('Set-Cookie', buildClearSessionCookieHeader(isRequestHttps(req)));
  res.json({ ok: true, revokedCount });
});

authRouter.get('/workers/bootstrap-status', (_req, res) => {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM workforce_assignments wa
      INNER JOIN roles r ON r.id = wa.role_id
      WHERE r.code = 'platform_owner'
    `)
    .get() as { count: number };

  const requiresBootstrapKey = Boolean(
    process.env.DT_BOOTSTRAP_KEY && process.env.DT_BOOTSTRAP_KEY.trim().length > 0,
  );

  res.json({
    ownerClaimed: row.count > 0,
    requiresBootstrapKey,
  });
});

authRouter.post('/workers/bootstrap', requireCsrfCheck, (req, res) => {
  const parsed = bootstrapOwnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid owner setup details.',
    });
    return;
  }

  const configuredKey = process.env.DT_BOOTSTRAP_KEY?.trim() || '';
  if (configuredKey.length > 0) {
    const provided = parsed.data.bootstrapKey ?? '';
    const a = Buffer.from(provided);
    const b = Buffer.from(configuredKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'Invalid platform initialization key.' });
      return;
    }
  }

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const userId = `usr_${crypto.randomUUID()}`;
  const assignmentId = `wrk_${crypto.randomUUID()}`;
  const passwordHash = hashPassword(parsed.data.password);

  db.exec('BEGIN IMMEDIATE');
  try {
    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM workforce_assignments wa
        INNER JOIN roles r ON r.id = wa.role_id
        WHERE r.code = 'platform_owner'
      `)
      .get() as { count: number };

    if (countRow.count > 0) {
      db.exec('ROLLBACK');
      res.status(409).json({
        error: 'Platform Owner access has already been initialized. Please sign in.',
      });
      return;
    }

    const existingEmail = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
      .get(email) as { id: string } | undefined;
    if (existingEmail) {
      db.exec('ROLLBACK');
      res.status(409).json({ error: 'This email is already registered.' });
      return;
    }

    db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
      VALUES (?, ?, ?, ?, 'workforce', 1)
    `).run(userId, email, parsed.data.fullName, passwordHash);

    db.prepare(`
      INSERT INTO workforce_assignments (id, user_id, role_id, department, clearance_level)
      VALUES (?, ?, 'role_platform_owner', 'Executive Platform Architecture', 'owner')
    `).run(assignmentId, userId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Platform owner bootstrap failed:', err);
    res.status(500).json({ error: 'Failed to initialize Platform Owner account.' });
    return;
  }

  const { rawToken, maxAgeSeconds } = createAuthSession({
    userId,
    authEnvironment: 'workers',
    activeSchoolId: null,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: userId,
    actorEmail: email,
    actorRole: 'platform_owner',
    authEnvironment: 'workers',
    action: 'platform.owner.bootstrapped',
    resourceType: 'user',
    resourceId: userId,
    outcome: 'success',
    ipAddress: getClientIp(req),
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rawToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  res.status(201).json({
    redirectPath: '/dashboard/owner',
  });
});

authRouter.post('/workers/login', requireCsrfCheck, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login details.' });
    return;
  }

  const db = getDb();
  purgeExpiredSessions();
  const email = parsed.data.email.toLowerCase();
  const ip = getClientIp(req) || 'unknown';
  const emailRateKey = `login:workers:email:${email}`;
  const ipRateKey = `login:workers:ip:${ip}`;

  const emailLimit = checkRateLimit(emailRateKey, MAX_FAILED_LOGIN_PER_ACCOUNT, RATE_WINDOW_MINUTES);
  const ipLimit = checkRateLimit(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfter = Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
    recordAuditLog({
      actorEmail: email,
      actorRole: 'unknown',
      authEnvironment: 'workers',
      action: 'auth.workers.rate_limited',
      resourceType: 'session',
      outcome: 'denied',
      metadata: { retryAfter },
      ipAddress: ip,
    });
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    });
    return;
  }

  const user = db
    .prepare(`
      SELECT
        u.id, u.email, u.full_name, u.password_hash, u.user_type, u.is_active,
        r.code AS role_code
      FROM users u
      LEFT JOIN workforce_assignments wa ON wa.user_id = u.id
      LEFT JOIN roles r ON r.id = wa.role_id
      WHERE LOWER(u.email) = ?
    `)
    .get(email) as
    | {
        id: string;
        email: string;
        full_name: string;
        password_hash: string;
        user_type: UserType;
        is_active: number;
        role_code: RoleCode | null;
      }
    | undefined;

  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    recordRateLimitedAttempt(
      emailRateKey,
      MAX_FAILED_LOGIN_PER_ACCOUNT,
      RATE_WINDOW_MINUTES,
      LOCKOUT_MINUTES,
    );
    recordRateLimitedAttempt(
      ipRateKey,
      MAX_FAILED_LOGIN_PER_IP,
      RATE_WINDOW_MINUTES,
      LOCKOUT_MINUTES,
    );
    recordAuditLog({
      actorEmail: email,
      actorRole: 'unknown',
      authEnvironment: 'workers',
      action: 'auth.workers.login_failed',
      resourceType: 'session',
      outcome: 'failure',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid workforce credentials.' });
    return;
  }

  if (
    user.is_active !== 1 ||
    !user.role_code ||
    !isAllowedEnvironmentForUser(user.user_type, user.role_code, 'workers')
  ) {
    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role_code ?? user.user_type,
      authEnvironment: 'workers',
      action: 'auth.workers.environment_rejected',
      resourceType: 'session',
      outcome: 'denied',
      ipAddress: ip,
    });
    res.status(403).json({
      error:
        user.is_active !== 1
          ? 'This workforce account has been suspended.'
          : 'Access denied. This environment is exclusively for authorized DT platform personnel.',
    });
    return;
  }

  clearRateLimit(emailRateKey);
  clearRateLimit(ipRateKey);

  const { rawToken, maxAgeSeconds } = createAuthSession({
    userId: user.id,
    authEnvironment: 'workers',
    activeSchoolId: null,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role_code,
    authEnvironment: 'workers',
    action: 'auth.workers.login_success',
    resourceType: 'session',
    outcome: 'success',
    ipAddress: ip,
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rawToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  res.json({ redirectPath: '/dashboard/owner' });
});

authRouter.post('/school/login', requireCsrfCheck, (req, res) => {
  const parsed = schoolLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login details.' });
    return;
  }

  const db = getDb();
  purgeExpiredSessions();
  const email = parsed.data.email.toLowerCase();
  const schoolCodeInput = parsed.data.schoolCode.trim().toUpperCase();
  const ip = getClientIp(req) || 'unknown';
  const emailRateKey = `login:school:email:${email}`;
  const ipRateKey = `login:school:ip:${ip}`;

  const emailLimit = checkRateLimit(emailRateKey, MAX_FAILED_LOGIN_PER_ACCOUNT, RATE_WINDOW_MINUTES);
  const ipLimit = checkRateLimit(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfter = Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
    recordAuditLog({
      actorEmail: email,
      actorRole: 'unknown',
      authEnvironment: 'school',
      action: 'auth.school.rate_limited',
      resourceType: 'session',
      outcome: 'denied',
      metadata: { retryAfter },
      ipAddress: ip,
    });
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    });
    return;
  }

  const user = db
    .prepare(`
      SELECT id, email, full_name, password_hash, user_type, is_active
      FROM users
      WHERE LOWER(email) = ?
    `)
    .get(email) as
    | {
        id: string;
        email: string;
        full_name: string;
        password_hash: string;
        user_type: UserType;
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    recordRateLimitedAttempt(
      emailRateKey,
      MAX_FAILED_LOGIN_PER_ACCOUNT,
      RATE_WINDOW_MINUTES,
      LOCKOUT_MINUTES,
    );
    recordRateLimitedAttempt(
      ipRateKey,
      MAX_FAILED_LOGIN_PER_IP,
      RATE_WINDOW_MINUTES,
      LOCKOUT_MINUTES,
    );
    recordAuditLog({
      actorEmail: email,
      actorRole: 'unknown',
      authEnvironment: 'school',
      action: 'auth.school.login_failed',
      resourceType: 'session',
      outcome: 'failure',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid school account credentials.' });
    return;
  }

  if (user.user_type !== 'school_member' || user.is_active !== 1) {
    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.user_type,
      authEnvironment: 'school',
      action: 'auth.school.environment_rejected',
      resourceType: 'session',
      outcome: 'denied',
      ipAddress: ip,
    });
    res.status(403).json({
      error:
        user.is_active !== 1
          ? 'Your user account has been suspended.'
          : 'This account is not authorized for the School Portal login environment.',
    });
    return;
  }

  const membershipQuery = schoolCodeInput
    ? db.prepare(`
        SELECT
          sm.school_id, sm.status AS membership_status,
          r.code AS role_code, sch.code AS school_code, sch.status AS school_status
        FROM school_memberships sm
        INNER JOIN roles r ON r.id = sm.role_id
        INNER JOIN schools sch ON sch.id = sm.school_id
        WHERE sm.user_id = ? AND UPPER(sch.code) = ?
      `)
    : db.prepare(`
        SELECT
          sm.school_id, sm.status AS membership_status,
          r.code AS role_code, sch.code AS school_code, sch.status AS school_status
        FROM school_memberships sm
        INNER JOIN roles r ON r.id = sm.role_id
        INNER JOIN schools sch ON sch.id = sm.school_id
        WHERE sm.user_id = ?
        ORDER BY sm.created_at ASC
        LIMIT 1
      `);

  const membership = (
    schoolCodeInput ? membershipQuery.get(user.id, schoolCodeInput) : membershipQuery.get(user.id)
  ) as
    | {
        school_id: string;
        membership_status: string;
        role_code: RoleCode;
        school_code: string;
        school_status: string;
      }
    | undefined;

  if (
    !membership ||
    membership.membership_status !== 'active' ||
    !isAllowedEnvironmentForUser(user.user_type, membership.role_code, 'school')
  ) {
    res.status(403).json({
      error: schoolCodeInput
        ? 'No active membership found for this email under the specified School Code.'
        : 'No active school membership is assigned to this account.',
    });
    return;
  }

  if (membership.school_status === 'suspended') {
    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: membership.role_code,
      schoolId: membership.school_id,
      authEnvironment: 'school',
      action: 'auth.school.tenant_suspended',
      resourceType: 'school',
      resourceId: membership.school_id,
      outcome: 'denied',
      ipAddress: ip,
    });
    res.status(403).json({
      error: 'This school tenant is currently suspended. Contact Dave Timi EdTech Support.',
    });
    return;
  }

  clearRateLimit(emailRateKey);
  clearRateLimit(ipRateKey);

  const { rawToken, maxAgeSeconds } = createAuthSession({
    userId: user.id,
    authEnvironment: 'school',
    activeSchoolId: membership.school_id,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: membership.role_code,
    schoolId: membership.school_id,
    authEnvironment: 'school',
    action: 'auth.school.login_success',
    resourceType: 'session',
    outcome: 'success',
    ipAddress: ip,
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rawToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  const redirectMap: Record<string, string> = {
    school_admin: '/dashboard/school-admin',
    teacher: '/dashboard/teacher',
    student: '/dashboard/student',
    parent: '/dashboard/parent',
  };

  res.json({
    redirectPath: redirectMap[membership.role_code] ?? '/dashboard/school-admin',
  });
});

authRouter.post('/school/qr-login', requireCsrfCheck, (req, res) => {
  const parsed = studentQrLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid ID Card QR payload.' });
    return;
  }

  const db = getDb();
  purgeExpiredSessions();
  const ip = getClientIp(req) || 'unknown';
  const ipRateKey = `login:school_qr:ip:${ip}`;
  const ipLimit = checkRateLimit(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES);
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfterSeconds));
    res.status(429).json({
      error: `Too many failed QR sign-in attempts. Try again in ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`,
    });
    return;
  }

  const extractedToken = extractIdCardTokenFromScan(parsed.data.qrToken);
  if (!extractedToken.startsWith(ID_CARD_TOKEN_PREFIX) || extractedToken.length < 16) {
    recordRateLimitedAttempt(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES, LOCKOUT_MINUTES);
    res.status(401).json({ error: 'Unrecognized Digital ID Card QR code.' });
    return;
  }

  const tokenHash = sha256Hex(extractedToken);
  const cardRateKey = `login:school_qr:card:${tokenHash.slice(0, 24)}`;
  const cardLimit = checkRateLimit(cardRateKey, MAX_FAILED_LOGIN_PER_ACCOUNT, RATE_WINDOW_MINUTES);
  if (!cardLimit.allowed) {
    res.setHeader('Retry-After', String(cardLimit.retryAfterSeconds));
    res.status(429).json({
      error: `QR login temporarily locked for this card. Try again in ${Math.ceil(cardLimit.retryAfterSeconds / 60)} minute(s).`,
    });
    return;
  }

  const row = db
    .prepare(`
      SELECT
        ic.id AS card_id,
        ic.school_id,
        ic.student_id,
        ic.card_number,
        ic.status AS card_status,
        ic.expires_at,
        ic.revoked_at,
        s.status AS student_status,
        s.user_id,
        s.first_name,
        s.last_name,
        sch.code AS school_code,
        sch.status AS school_status,
        u.email AS user_email,
        u.user_type,
        u.is_active AS user_active,
        sm.status AS membership_status,
        r.code AS role_code
      FROM student_id_cards ic
      INNER JOIN students s ON s.id = ic.student_id AND s.school_id = ic.school_id
      INNER JOIN schools sch ON sch.id = ic.school_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN school_memberships sm ON sm.user_id = u.id AND sm.school_id = ic.school_id
      LEFT JOIN roles r ON r.id = sm.role_id
      WHERE ic.qr_token_hash = ?
      LIMIT 1
    `)
    .get(tokenHash) as
    | {
        card_id: string;
        school_id: string;
        student_id: string;
        card_number: string;
        card_status: string;
        expires_at: string;
        revoked_at: string | null;
        student_status: string;
        user_id: string | null;
        first_name: string;
        last_name: string;
        school_code: string;
        school_status: string;
        user_email: string | null;
        user_type: UserType | null;
        user_active: number | null;
        membership_status: string | null;
        role_code: RoleCode | null;
      }
    | undefined;

  if (!row) {
    recordRateLimitedAttempt(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES, LOCKOUT_MINUTES);
    recordRateLimitedAttempt(cardRateKey, MAX_FAILED_LOGIN_PER_ACCOUNT, RATE_WINDOW_MINUTES, LOCKOUT_MINUTES);
    recordAuditLog({
      actorEmail: 'qr-login',
      actorRole: 'unknown',
      authEnvironment: 'school',
      action: 'auth.school.qr_login_failed',
      resourceType: 'student_id_card',
      outcome: 'failure',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid or unregistered Student Digital ID Card.' });
    return;
  }

  const optionalSchoolCode = parsed.data.schoolCode.trim().toUpperCase();
  if (optionalSchoolCode && row.school_code.toUpperCase() !== optionalSchoolCode) {
    recordRateLimitedAttempt(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES, LOCKOUT_MINUTES);
    res.status(403).json({ error: 'This Digital ID Card does not belong to the entered School Code.' });
    return;
  }

  const cardCheck = evaluateIdCardValidity({
    status: row.card_status,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  });
  if (!cardCheck.valid) {
    if (row.card_status === 'active' && !row.revoked_at) {
      db.prepare("UPDATE student_id_cards SET status = 'expired' WHERE id = ? AND status = 'active'").run(
        row.card_id,
      );
    }
    recordRateLimitedAttempt(ipRateKey, MAX_FAILED_LOGIN_PER_IP, RATE_WINDOW_MINUTES, LOCKOUT_MINUTES);
    recordAuditLog({
      actorUserId: row.user_id,
      actorEmail: row.user_email ?? 'unlinked-student',
      actorRole: 'student',
      schoolId: row.school_id,
      authEnvironment: 'school',
      action: 'auth.school.qr_card_invalid',
      resourceType: 'student_id_card',
      resourceId: row.card_id,
      outcome: 'denied',
      metadata: { reason: cardCheck.reason },
      ipAddress: ip,
    });
    res.status(403).json({ error: cardCheck.reason });
    return;
  }

  if (row.school_status === 'suspended') {
    res.status(403).json({
      error: 'This school tenant is currently suspended. Contact Dave Timi EdTech Support.',
    });
    return;
  }

  if (row.student_status !== 'active') {
    res.status(403).json({
      error: `Student enrollment is currently "${row.student_status}". Portal sign-in is disabled.`,
    });
    return;
  }

  if (
    !row.user_id ||
    !row.user_email ||
    row.user_active !== 1 ||
    row.user_type !== 'school_member' ||
    row.membership_status !== 'active' ||
    row.role_code !== 'student' ||
    !isAllowedEnvironmentForUser(row.user_type, row.role_code, 'school')
  ) {
    res.status(403).json({
      error:
        'No active Student Portal login is linked to this ID Card yet. Ask your School Administrator to enable your student account.',
    });
    return;
  }

  clearRateLimit(ipRateKey);
  clearRateLimit(cardRateKey);

  db.prepare("UPDATE student_id_cards SET last_used_login_at = datetime('now') WHERE id = ?").run(
    row.card_id,
  );

  const { rawToken, maxAgeSeconds } = createAuthSession({
    userId: row.user_id,
    authEnvironment: 'school',
    activeSchoolId: row.school_id,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: row.user_id,
    actorEmail: row.user_email,
    actorRole: 'student',
    schoolId: row.school_id,
    authEnvironment: 'school',
    action: 'auth.school.qr_login_success',
    resourceType: 'student_id_card',
    resourceId: row.card_id,
    outcome: 'success',
    metadata: { studentId: row.student_id, cardNumber: row.card_number },
    ipAddress: ip,
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rawToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  res.json({ redirectPath: '/dashboard/student' });
});

authRouter.post('/password-reset/request', requireCsrfCheck, (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid reset request.' });
    return;
  }

  const ip = getClientIp(req) || 'unknown';
  const rateKey = `pwd_reset:ip:${ip}`;
  const limit = checkRateLimit(rateKey, 5, 15);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({
      error: 'Too many password recovery requests. Please wait before trying again.',
    });
    return;
  }
  recordRateLimitedAttempt(rateKey, 5, 15, 15);

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const environment = parsed.data.environment;
  const expectedUserType = environment === 'workers' ? 'workforce' : 'school_member';

  const user = db
    .prepare(`
      SELECT id, email, user_type, is_active
      FROM users
      WHERE LOWER(email) = ? AND user_type = ? AND is_active = 1
    `)
    .get(email, expectedUserType) as
    | { id: string; email: string; user_type: UserType; is_active: number }
    | undefined;

  if (user) {
    const rawResetToken = generateOpaqueToken(32);
    const tokenHash = sha256Hex(rawResetToken);
    const tokenId = `prt_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      // Invalidate any prior unused recovery tokens for this user
      db.prepare(
        "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      ).run(user.id);

      db.prepare(`
        INSERT INTO password_reset_tokens (
          id, user_id, token_hash, auth_environment, requested_ip, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(tokenId, user.id, tokenHash, environment, ip, expiresAt);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Password reset request DB error:', err);
      res.status(500).json({ error: 'Unable to process recovery request.' });
      return;
    }

    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.user_type,
      authEnvironment: environment,
      action: 'auth.password_reset.requested',
      resourceType: 'password_reset_token',
      resourceId: tokenId,
      outcome: 'success',
      metadata: { emailDispatchConfigured: false },
      ipAddress: ip,
    });
  }

  // Always return a generic response to prevent account enumeration
  res.json({
    ok: true,
    emailDispatchConfigured: false,
    message:
      'If an active account matches that email and environment, a 30-minute recovery record has been created. Because outbound SMTP email delivery is not configured in Phase 1.5, contact your School Administrator or Platform Owner to obtain a one-time recovery link.',
  });
});

authRouter.post('/password-reset/confirm', requireCsrfCheck, (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid password reset payload.',
    });
    return;
  }

  const db = getDb();
  const tokenHash = sha256Hex(parsed.data.token.trim());
  const ip = getClientIp(req) || 'unknown';

  const row = db
    .prepare(`
      SELECT prt.id, prt.user_id, prt.auth_environment, prt.expires_at, prt.used_at,
             u.email, u.is_active, u.user_type
      FROM password_reset_tokens prt
      INNER JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ?
    `)
    .get(tokenHash) as
    | {
        id: string;
        user_id: string;
        auth_environment: 'workers' | 'school';
        expires_at: string;
        used_at: string | null;
        email: string;
        is_active: number;
        user_type: UserType;
      }
    | undefined;

  if (!row || row.used_at !== null || row.is_active !== 1) {
    res.status(400).json({ error: 'Recovery token is invalid or has already been used.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ error: 'Recovery token has expired. Request a new recovery link.' });
    return;
  }

  if (row.auth_environment === 'workers') {
    const pw = parsed.data.newPassword;
    if (pw.length < 10 || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
      res.status(400).json({
        error:
          'Workforce passwords must be at least 10 characters with an uppercase letter and a number.',
      });
      return;
    }
  }

  const newHash = hashPassword(parsed.data.newPassword);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      newHash,
      row.user_id,
    );
    db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(
      row.id,
    );
    db.prepare(
      "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
    ).run(row.user_id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Password reset confirm error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
    return;
  }

  clearRateLimit(`login:${row.auth_environment}:email:${row.email.toLowerCase()}`);

  recordAuditLog({
    actorUserId: row.user_id,
    actorEmail: row.email,
    actorRole: row.user_type,
    authEnvironment: row.auth_environment,
    action: 'auth.password_reset.completed',
    resourceType: 'user',
    resourceId: row.user_id,
    outcome: 'success',
    ipAddress: ip,
  });

  res.setHeader('Set-Cookie', buildClearSessionCookieHeader(isRequestHttps(req)));
  res.json({
    ok: true,
    environment: row.auth_environment,
    redirectPath: row.auth_environment === 'workers' ? '/login/workers' : '/login/school',
  });
});

authRouter.post('/telegram-connect-token', requireCsrfCheck, requireAuth, async (req: AuthenticatedRequest, res) => {
  const ctx = resolveUserAccountContext(req.auth!.id);
  if (!ctx) {
    res.status(403).json({ error: 'Account is inactive or has no active portal context.' });
    return;
  }

  const rawToken = createTelegramToken({
    purpose: 'connect_link',
    userId: ctx.userId,
    schoolId: ctx.schoolId,
    profileId: ctx.profileId,
    authEnvironment: ctx.authEnvironment,
    role: ctx.role,
    ttlMinutes: 15,
  });

  const botConfigured = Boolean(getBotToken());
  const botUsername = botConfigured ? await resolveBotUsername() : null;
  const startParam = `link_${rawToken}`;

  recordAuditLog({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    actorRole: ctx.role,
    schoolId: ctx.schoolId,
    authEnvironment: ctx.authEnvironment,
    action: 'auth.telegram.connect_token_issued',
    resourceType: 'telegram_login_token',
    outcome: 'success',
    ipAddress: getClientIp(req),
  });

  res.status(201).json({
    botConfigured,
    botUsername,
    command: `/start ${startParam}`,
    deepLinkUrl: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(startParam)}` : null,
    expiresInMinutes: 15,
  });
});

authRouter.get('/telegram-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const botConfigured = Boolean(getBotToken());
  const botUsername = botConfigured ? await resolveBotUsername() : null;

  const links = db
    .prepare(`
      SELECT telegram_chat_id AS chatId, username, linked_at AS linkedAt
      FROM telegram_links
      WHERE user_id = ?
      ORDER BY linked_at DESC
    `)
    .all(req.auth!.id) as Array<{
    chatId: string;
    username: string | null;
    linkedAt: string;
  }>;

  res.json({
    botConfigured,
    botUsername,
    botUrl: botUsername ? `https://t.me/${botUsername}` : null,
    linked: links.length > 0,
    links,
  });
});

authRouter.delete('/telegram-link', requireCsrfCheck, requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const requestedChatId =
    typeof req.query.chatId === 'string' && req.query.chatId.trim()
      ? req.query.chatId.trim()
      : typeof req.body?.chatId === 'string' && req.body.chatId.trim()
        ? req.body.chatId.trim()
        : null;

  const matchingRows = requestedChatId
    ? (db
        .prepare('SELECT telegram_chat_id FROM telegram_links WHERE user_id = ? AND telegram_chat_id = ?')
        .all(req.auth!.id, requestedChatId) as Array<{ telegram_chat_id: string }>)
    : (db
        .prepare('SELECT telegram_chat_id FROM telegram_links WHERE user_id = ?')
        .all(req.auth!.id) as Array<{ telegram_chat_id: string }>);

  if (matchingRows.length === 0) {
    res.json({ ok: true, removedCount: 0 });
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (requestedChatId) {
      db.prepare('DELETE FROM telegram_links WHERE user_id = ? AND telegram_chat_id = ?').run(
        req.auth!.id,
        requestedChatId,
      );
    } else {
      db.prepare('DELETE FROM telegram_links WHERE user_id = ?').run(req.auth!.id);
    }
    for (const row of matchingRows) {
      db.prepare('DELETE FROM telegram_chat_states WHERE telegram_chat_id = ?').run(row.telegram_chat_id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Self-service Telegram unlink failed:', err);
    res.status(500).json({ error: 'Unable to disconnect Telegram account.' });
    return;
  }

  for (const row of matchingRows) {
    await sendTelegramMessage(
      row.telegram_chat_id,
      '🔌 Your Telegram chat was disconnected from your portal settings. Send `/link` anytime to reconnect.',
    ).catch(() => {});
  }

  recordAuditLog({
    actorUserId: req.auth!.id,
    actorEmail: req.auth!.email,
    actorRole: req.auth!.roleCode,
    schoolId: req.auth!.activeSchoolId,
    authEnvironment: req.auth!.authEnvironment,
    action: 'auth.telegram.unlinked_by_user',
    resourceType: 'telegram_links',
    resourceId: matchingRows.map((r) => r.telegram_chat_id).join(','),
    outcome: 'success',
    metadata: { removedCount: matchingRows.length },
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, removedCount: matchingRows.length });
});

