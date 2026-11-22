import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import {
  createDatabaseBackup,
  listDatabaseBackups,
  resolveSafeBackupPath,
  restoreDatabaseBackup,
} from '../../db/backup.ts';
import { getDb, verifyDatabaseIntegrity } from '../../db/client.ts';
import {
  getAiCoreBlueprint,
  getGeminiStatus,
  runGroundedAiCoreQuery,
} from '../ai-core.ts';
import { recordAuditLog } from '../audit.ts';
import { getFcmIntegrationStatus } from '../notifications/fcm-adapter.ts';
import {
  deleteStoredFileById,
  resolveConfinedStoragePath,
  saveValidatedFile,
  type StoredFileRecord,
} from '../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireAuth,
  requireCsrfCheck,
  requireEnvironment,
  requirePermission,
} from '../middleware.ts';
import {
  createNotificationRecord,
  listPlatformNotifications,
  markNotificationReadForUser,
} from '../notifications/service.ts';
import { listActiveRateLimitLockouts } from '../rate-limiter.ts';
import { generateOpaqueToken, hashPassword, sha256Hex } from '../security.ts';
import {
  revokeAllSessionsForUser,
  revokeSessionById,
  revokeSessionsForSchool,
} from '../session-service.ts';
import {
  createBackupSchema,
  createPlatformNotificationSchema,
  createWorkforceMemberSchema,
  restoreBackupSchema,
  updatePlatformSettingsSchema,
  updateSchoolStatusSchema,
  updateWorkforceStatusSchema,
  uploadFileSchema,
} from '../validation.ts';

export const ownerRouter = Router();

ownerRouter.use(requireAuth, requireEnvironment('workers'));

ownerRouter.get('/overview', requirePermission('platform.overview.read'), (_req, res) => {
  const db = getDb();

  const schoolCounts = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
      FROM schools
    `)
    .get() as { total: number; active: number | null; pending: number | null; suspended: number | null };

  const userCounts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN user_type = 'workforce' THEN 1 ELSE 0 END) AS workforce,
        SUM(CASE WHEN user_type = 'school_member' THEN 1 ELSE 0 END) AS school_members
      FROM users
    `)
    .get() as { workforce: number | null; school_members: number | null };

  const sessionCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM auth_sessions
      WHERE revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `)
    .get() as { count: number };

  const inquiryCount = db
    .prepare('SELECT COUNT(*) AS count FROM contact_inquiries')
    .get() as { count: number };

  const recentAudits = db
    .prepare(`
      SELECT id, actor_email, actor_role, auth_environment, action, resource_type, resource_id, outcome, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 8
    `)
    .all();

  res.json({
    metrics: {
      totalSchools: schoolCounts.total ?? 0,
      activeSchools: schoolCounts.active ?? 0,
      pendingSchools: schoolCounts.pending ?? 0,
      suspendedSchools: schoolCounts.suspended ?? 0,
      workforceCount: userCounts.workforce ?? 0,
      schoolMembersCount: userCounts.school_members ?? 0,
      activeAuthSessions: sessionCount.count ?? 0,
      contactInquiriesCount: inquiryCount.count ?? 0,
    },
    recentAudits,
  });
});

ownerRouter.get('/schools', requirePermission('platform.schools.read'), (_req, res) => {
  const db = getDb();
  const schools = db
    .prepare(`
      SELECT
        s.id, s.name, s.slug, s.code, s.country, s.city, s.contact_email, s.phone, s.status, s.created_at,
        (SELECT COUNT(*) FROM school_memberships sm WHERE sm.school_id = s.id) AS member_count,
        (SELECT COUNT(*) FROM academic_sessions acs WHERE acs.school_id = s.id) AS session_count
      FROM schools s
      ORDER BY s.created_at DESC
    `)
    .all();

  res.json({ schools });
});

ownerRouter.patch(
  '/schools/:schoolId/status',
  requireCsrfCheck,
  requirePermission('platform.schools.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid status.' });
      return;
    }

    const db = getDb();
    const { schoolId } = req.params;
    const existing = db
      .prepare('SELECT id, name, status FROM schools WHERE id = ?')
      .get(schoolId) as { id: string; name: string; status: string } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'School tenant not found.' });
      return;
    }

    let revokedSessions = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE schools SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
        parsed.data.status,
        schoolId,
      );
      if (parsed.data.status === 'suspended') {
        revokedSessions = revokeSessionsForSchool(schoolId);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update school status failed:', err);
      res.status(500).json({ error: 'Unable to update school status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'workers',
      action: 'platform.school.status_updated',
      resourceType: 'school',
      resourceId: schoolId,
      outcome: 'success',
      metadata: {
        previousStatus: existing.status,
        newStatus: parsed.data.status,
        revokedSessions,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ id: schoolId, status: parsed.data.status, revokedSessions });
  },
);

ownerRouter.get('/workforce', requirePermission('platform.workforce.manage'), (_req, res) => {
  const db = getDb();
  const workforce = db
    .prepare(`
      SELECT
        u.id, u.email, u.full_name, u.is_active, u.created_at,
        r.code AS role_code, r.name AS role_name,
        wa.department, wa.clearance_level
      FROM users u
      INNER JOIN workforce_assignments wa ON wa.user_id = u.id
      INNER JOIN roles r ON r.id = wa.role_id
      ORDER BY u.created_at ASC
    `)
    .all();

  res.json({ workforce });
});

ownerRouter.post(
  '/workforce',
  requireCsrfCheck,
  requirePermission('platform.workforce.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createWorkforceMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid workforce member details.',
      });
      return;
    }

    const db = getDb();
    const email = parsed.data.email.toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const roleRow = db
      .prepare('SELECT id FROM roles WHERE code = ?')
      .get(parsed.data.roleCode) as { id: string } | undefined;
    if (!roleRow) {
      res.status(400).json({ error: 'Invalid workforce role.' });
      return;
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const assignmentId = `wrk_${crypto.randomUUID()}`;
    const passwordHash = hashPassword(parsed.data.password);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
        VALUES (?, ?, ?, ?, 'workforce', 1)
      `).run(userId, email, parsed.data.fullName, passwordHash);

      db.prepare(`
        INSERT INTO workforce_assignments (id, user_id, role_id, department, clearance_level)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        assignmentId,
        userId,
        roleRow.id,
        parsed.data.department,
        parsed.data.roleCode === 'workforce_admin' ? 'elevated' : 'standard',
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Workforce provisioning failed:', err);
      res.status(500).json({ error: 'Unable to provision workforce account.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.workforce.created',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { roleCode: parsed.data.roleCode, department: parsed.data.department },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      id: userId,
      email,
      fullName: parsed.data.fullName,
      roleCode: parsed.data.roleCode,
      department: parsed.data.department,
    });
  },
);

ownerRouter.patch(
  '/workforce/:userId/status',
  requireCsrfCheck,
  requirePermission('platform.workforce.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateWorkforceStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid status.' });
      return;
    }

    const { userId } = req.params;
    if (userId === req.auth!.id && !parsed.data.isActive) {
      res.status(400).json({ error: 'You cannot suspend your own active owner account.' });
      return;
    }

    const db = getDb();
    const target = db
      .prepare("SELECT id, email, is_active FROM users WHERE id = ? AND user_type = 'workforce'")
      .get(userId) as { id: string; email: string; is_active: number } | undefined;

    if (!target) {
      res.status(404).json({ error: 'Workforce account not found.' });
      return;
    }

    let revokedSessions = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(
        parsed.data.isActive ? 1 : 0,
        userId,
      );
      if (!parsed.data.isActive) {
        revokedSessions = revokeAllSessionsForUser(userId);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update workforce status failed:', err);
      res.status(500).json({ error: 'Unable to update workforce status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.workforce.status_updated',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { targetEmail: target.email, isActive: parsed.data.isActive, revokedSessions },
      ipAddress: getClientIp(req),
    });

    res.json({ id: userId, is_active: parsed.data.isActive ? 1 : 0, revokedSessions });
  },
);

ownerRouter.post(
  '/workforce/:userId/recovery-token',
  requireCsrfCheck,
  requirePermission('platform.workforce.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { userId } = req.params;
    const target = db
      .prepare("SELECT id, email, is_active FROM users WHERE id = ? AND user_type = 'workforce'")
      .get(userId) as { id: string; email: string; is_active: number } | undefined;

    if (!target || target.is_active !== 1) {
      res.status(404).json({ error: 'Active workforce account not found.' });
      return;
    }

    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256Hex(rawToken);
    const tokenId = `prt_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      ).run(target.id);
      db.prepare(`
        INSERT INTO password_reset_tokens (
          id, user_id, token_hash, auth_environment, requested_by_user_id, requested_ip, expires_at
        ) VALUES (?, ?, ?, 'workers', ?, ?, ?)
      `).run(tokenId, target.id, tokenHash, req.auth!.id, getClientIp(req), expiresAt);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Workforce recovery token issue failed:', err);
      res.status(500).json({ error: 'Unable to issue recovery link.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.workforce.recovery_issued',
      resourceType: 'password_reset_token',
      resourceId: tokenId,
      outcome: 'success',
      metadata: { targetEmail: target.email },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      email: target.email,
      expiresAt,
      recoveryPath: `/reset-password?token=${encodeURIComponent(rawToken)}`,
      token: rawToken,
    });
  },
);

ownerRouter.get('/settings', requirePermission('platform.settings.manage'), (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value_json, updated_by, updated_at FROM platform_settings').all() as Array<{
    key: string;
    value_json: string;
    updated_by: string;
    updated_at: string;
  }>;

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      settings[row.key] = row.value_json;
    }
  }

  res.json({
    allowPublicSchoolRegistration: Boolean(settings.allow_public_school_registration ?? true),
    requireSchoolVerificationBanner: Boolean(settings.require_school_verification_banner ?? true),
    sessionTtlHours: Number(settings.session_ttl_hours ?? 24),
    dtAiCoreEnabled: false,
  });
});

ownerRouter.put(
  '/settings',
  requireCsrfCheck,
  requirePermission('platform.settings.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updatePlatformSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings.' });
      return;
    }

    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO platform_settings (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `);

    upsert.run(
      'allow_public_school_registration',
      JSON.stringify(parsed.data.allowPublicSchoolRegistration),
      req.auth!.email,
    );
    upsert.run(
      'require_school_verification_banner',
      JSON.stringify(parsed.data.requireSchoolVerificationBanner),
      req.auth!.email,
    );
    upsert.run('session_ttl_hours', JSON.stringify(parsed.data.sessionTtlHours), req.auth!.email);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.settings.updated',
      resourceType: 'platform_settings',
      outcome: 'success',
      metadata: parsed.data,
      ipAddress: getClientIp(req),
    });

    res.json({
      ...parsed.data,
      dtAiCoreEnabled: false,
    });
  },
);

ownerRouter.get('/security', requirePermission('platform.security.read'), (_req, res) => {
  const db = getDb();

  const activeSessions = db
    .prepare(`
      SELECT
        s.id, s.auth_environment, s.ip_address, s.created_at, s.expires_at, s.rotated_at, s.last_seen_at,
        u.email AS user_email, u.full_name AS user_name,
        sch.name AS school_name
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      LEFT JOIN schools sch ON sch.id = s.active_school_id
      WHERE s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
      ORDER BY s.created_at DESC
      LIMIT 50
    `)
    .all();

  const deniedEvents = db
    .prepare(`
      SELECT id, actor_email, actor_role, auth_environment, action, resource_type, ip_address, created_at
      FROM audit_logs
      WHERE outcome IN ('denied', 'failure')
      ORDER BY created_at DESC
      LIMIT 25
    `)
    .all();

  const inquiries = db
    .prepare(`
      SELECT id, full_name, email, organization, subject, message, status, created_at
      FROM contact_inquiries
      ORDER BY created_at DESC
      LIMIT 25
    `)
    .all();

  const rateLimitLockouts = listActiveRateLimitLockouts();

  const passwordResetEvents = db
    .prepare(`
      SELECT
        prt.id, prt.auth_environment, prt.requested_ip, prt.expires_at, prt.used_at, prt.created_at,
        u.email AS user_email, u.full_name AS user_name
      FROM password_reset_tokens prt
      INNER JOIN users u ON u.id = prt.user_id
      ORDER BY prt.created_at DESC
      LIMIT 20
    `)
    .all();

  res.json({
    activeSessions,
    deniedEvents,
    inquiries,
    rateLimitLockouts,
    passwordResetEvents,
  });
});

ownerRouter.post(
  '/security/sessions/:sessionId/revoke',
  requireCsrfCheck,
  requirePermission('platform.security.read'),
  (req: AuthenticatedRequest, res) => {
    const { sessionId } = req.params;
    if (sessionId === req.sessionId) {
      res.status(400).json({ error: 'Use Sign Out to end your current session.' });
      return;
    }

    const revoked = revokeSessionById(sessionId);
    if (revoked === 0) {
      res.status(404).json({ error: 'Active session not found or already revoked.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.security.session_revoked',
      resourceType: 'session',
      resourceId: sessionId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, revokedSessionId: sessionId });
  },
);

ownerRouter.patch(
  '/security/inquiries/:inquiryId',
  requireCsrfCheck,
  requirePermission('platform.security.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { inquiryId } = req.params;
    const result = db
      .prepare("UPDATE contact_inquiries SET status = 'reviewed' WHERE id = ?")
      .run(inquiryId);

    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Contact inquiry not found.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.inquiry.reviewed',
      resourceType: 'contact_inquiry',
      resourceId: inquiryId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ id: inquiryId, status: 'reviewed' });
  },
);

ownerRouter.get('/audit-logs', requirePermission('platform.audit.read'), (req, res) => {
  const db = getDb();
  const outcomeFilter = typeof req.query.outcome === 'string' ? req.query.outcome : 'all';

  const rows =
    outcomeFilter === 'success' || outcomeFilter === 'denied' || outcomeFilter === 'failure'
      ? db
          .prepare(`
            SELECT
              a.id, a.actor_email, a.actor_role, a.auth_environment,
              a.action, a.resource_type, a.resource_id, a.outcome,
              a.ip_address, a.created_at, sch.name AS school_name
            FROM audit_logs a
            LEFT JOIN schools sch ON sch.id = a.school_id
            WHERE a.outcome = ?
            ORDER BY a.created_at DESC
            LIMIT 100
          `)
          .all(outcomeFilter)
      : db
          .prepare(`
            SELECT
              a.id, a.actor_email, a.actor_role, a.auth_environment,
              a.action, a.resource_type, a.resource_id, a.outcome,
              a.ip_address, a.created_at, sch.name AS school_name
            FROM audit_logs a
            LEFT JOIN schools sch ON sch.id = a.school_id
            ORDER BY a.created_at DESC
            LIMIT 100
          `)
          .all();

  res.json({ logs: rows });
});

// Database reliability, backup, and restoration (Platform Owner only)
ownerRouter.get('/database/status', requirePermission('platform.database.manage'), (_req, res) => {
  try {
    const integrity = verifyDatabaseIntegrity();
    const backups = listDatabaseBackups();
    res.json({ integrity, backups });
  } catch (err) {
    console.error('Database status check failed:', err);
    res.status(500).json({ error: 'Unable to inspect database health.' });
  }
});

ownerRouter.post(
  '/database/backups',
  requireCsrfCheck,
  requirePermission('platform.database.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createBackupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid backup notes.' });
      return;
    }

    try {
      const backup = createDatabaseBackup(req.auth!.email, parsed.data.notes);
      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        authEnvironment: 'workers',
        action: 'platform.database.backup_created',
        resourceType: 'database_backup',
        resourceId: backup.id,
        outcome: 'success',
        metadata: { filename: backup.filename, sizeBytes: backup.size_bytes },
        ipAddress: getClientIp(req),
      });
      res.status(201).json({ backup });
    } catch (err) {
      console.error('Create backup failed:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to create database backup.',
      });
    }
  },
);

ownerRouter.get(
  '/database/backups/:filename/download',
  requirePermission('platform.database.manage'),
  (req: AuthenticatedRequest, res) => {
    try {
      const targetPath = resolveSafeBackupPath(req.params.filename);
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Backup file not found.' });
        return;
      }

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        authEnvironment: 'workers',
        action: 'platform.database.backup_downloaded',
        resourceType: 'database_backup',
        resourceId: req.params.filename,
        outcome: 'success',
        ipAddress: getClientIp(req),
      });

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.download(targetPath, req.params.filename);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid backup filename.',
      });
    }
  },
);

ownerRouter.post(
  '/database/restore',
  requireCsrfCheck,
  requirePermission('platform.database.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = restoreBackupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid restore request.' });
      return;
    }

    try {
      const result = restoreDatabaseBackup(parsed.data.filename, req.auth!.email);
      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        authEnvironment: 'workers',
        action: 'platform.database.restored',
        resourceType: 'database_backup',
        resourceId: parsed.data.filename,
        outcome: 'success',
        metadata: result,
        ipAddress: getClientIp(req),
      });
      res.json(result);
    } catch (err) {
      console.error('Database restore failed:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to restore database backup.',
      });
    }
  },
);

// Platform-level File Management oversight
ownerRouter.get('/files', requirePermission('platform.files.manage'), (_req, res) => {
  const db = getDb();
  const files = db
    .prepare(`
      SELECT
        f.id, f.school_id, sch.name AS school_name, f.category, f.original_name,
        f.mime_type, f.size_bytes, f.visibility, f.created_at, u.email AS uploaded_by_email
      FROM stored_files f
      LEFT JOIN schools sch ON sch.id = f.school_id
      LEFT JOIN users u ON u.id = f.uploaded_by_user_id
      ORDER BY f.created_at DESC
      LIMIT 100
    `)
    .all();

  res.json({ files });
});

ownerRouter.post(
  '/files',
  requireCsrfCheck,
  requirePermission('platform.files.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = uploadFileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid file upload.' });
      return;
    }

    const db = getDb();
    let targetSchoolId: string | null = null;
    if (parsed.data.schoolId) {
      const sch = db
        .prepare('SELECT id FROM schools WHERE id = ?')
        .get(parsed.data.schoolId) as { id: string } | undefined;
      if (!sch) {
        res.status(404).json({ error: 'Target school tenant not found.' });
        return;
      }
      targetSchoolId = sch.id;
    }

    try {
      const file = saveValidatedFile({
        schoolId: targetSchoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: parsed.data.subjectUserId ?? null,
        category: parsed.data.category,
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: targetSchoolId ? 'private_tenant' : 'private_owner',
      });

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId: targetSchoolId,
        authEnvironment: 'workers',
        action: 'platform.file.uploaded',
        resourceType: 'stored_file',
        resourceId: file.id,
        outcome: 'success',
        metadata: { category: file.category, sizeBytes: file.size_bytes },
        ipAddress: getClientIp(req),
      });

      res.status(201).json({ file });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to store uploaded file.',
      });
    }
  },
);

ownerRouter.get(
  '/files/:fileId/download',
  requirePermission('platform.files.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM stored_files WHERE id = ?')
      .get(req.params.fileId) as StoredFileRecord | undefined;

    if (!row) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    try {
      const absPath = resolveConfinedStoragePath(row.storage_rel_path);
      if (!fs.existsSync(absPath)) {
        res.status(404).json({ error: 'Stored file missing on disk.' });
        return;
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', row.mime_type);
      const isSafeImage = ['image/png', 'image/jpeg', 'image/webp'].includes(row.mime_type);
      res.setHeader(
        'Content-Disposition',
        `${isSafeImage ? 'inline' : 'attachment'}; filename="${row.original_name.replace(/"/g, '')}"`,
      );
      res.sendFile(absPath);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'File access denied.' });
    }
  },
);

ownerRouter.delete(
  '/files/:fileId',
  requireCsrfCheck,
  requirePermission('platform.files.manage'),
  (req: AuthenticatedRequest, res) => {
    const deleted = deleteStoredFileById(req.params.fileId);
    if (!deleted) {
      res.status(404).json({ error: 'File record not found.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      authEnvironment: 'workers',
      action: 'platform.file.deleted',
      resourceType: 'stored_file',
      resourceId: req.params.fileId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);

// Platform Notifications
ownerRouter.get(
  '/notifications',
  requirePermission('platform.notifications.manage'),
  (req: AuthenticatedRequest, res) => {
    res.json(listPlatformNotifications(req.auth!.id));
  },
);

ownerRouter.post(
  '/notifications',
  requireCsrfCheck,
  requirePermission('platform.notifications.manage'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = createPlatformNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid notification payload.',
      });
      return;
    }

    const db = getDb();
    let targetSchoolId: string | null = null;
    if (parsed.data.scope === 'school') {
      if (!parsed.data.schoolId) {
        res.status(400).json({ error: 'Select a target school for school-scoped notifications.' });
        return;
      }
      const sch = db
        .prepare('SELECT id FROM schools WHERE id = ?')
        .get(parsed.data.schoolId) as { id: string } | undefined;
      if (!sch) {
        res.status(404).json({ error: 'Target school not found.' });
        return;
      }
      targetSchoolId = sch.id;
    }

    const notification = await createNotificationRecord({
      schoolId: targetSchoolId,
      scope: parsed.data.scope,
      createdByUserId: req.auth!.id,
      createdByName: req.auth!.fullName,
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity,
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId: targetSchoolId,
      authEnvironment: 'workers',
      action: 'platform.notification.published',
      resourceType: 'notification',
      resourceId: notification.id,
      outcome: 'success',
      metadata: { scope: parsed.data.scope, severity: parsed.data.severity },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ notification });
  },
);

ownerRouter.patch(
  '/notifications/:notificationId/read',
  requireCsrfCheck,
  requirePermission('platform.notifications.manage'),
  (req: AuthenticatedRequest, res) => {
    const ok = markNotificationReadForUser({
      notificationId: req.params.notificationId,
      userId: req.auth!.id,
      schoolId: null,
      roleCode: req.auth!.roleCode,
    });
    if (!ok) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

ownerRouter.get('/verification-queue', requirePermission('platform.schools.read'), (_req, res) => {
  const db = getDb();
  const schools = db
    .prepare(`
      SELECT
        s.id, s.name, s.slug, s.code, s.country, s.city, s.contact_email, s.phone, s.status, s.created_at, s.updated_at,
        sp.school_type, sp.school_ownership, sp.registration_number, sp.physical_address,
        (SELECT COUNT(*) FROM school_memberships sm WHERE sm.school_id = s.id) AS member_count,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS student_count,
        (SELECT COUNT(*) FROM teachers tc WHERE tc.school_id = s.id) AS teacher_count,
        (SELECT u.email FROM school_memberships sm2 INNER JOIN roles r2 ON r2.id = sm2.role_id INNER JOIN users u ON u.id = sm2.user_id WHERE sm2.school_id = s.id AND r2.code = 'school_admin' LIMIT 1) AS primary_admin_email
      FROM schools s
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      ORDER BY CASE WHEN s.status = 'pending_verification' THEN 0 WHEN s.status = 'suspended' THEN 1 ELSE 2 END ASC, s.created_at DESC
    `)
    .all();
  res.json({ schools });
});

ownerRouter.post(
  '/verification-queue/:schoolId/decision',
  requireCsrfCheck,
  requirePermission('platform.schools.manage'),
  async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { schoolId } = req.params;
    const decision = String(req.body?.decision || '');
    const notes = String(req.body?.notes || '').trim();

    if (!['approve', 'reject', 'suspend', 'reactivate'].includes(decision)) {
      res.status(400).json({ error: 'Decision must be approve, reject, suspend, or reactivate.' });
      return;
    }

    const existing = db
      .prepare('SELECT id, name, status FROM schools WHERE id = ?')
      .get(schoolId) as { id: string; name: string; status: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'School institution not found.' });
      return;
    }

    const nextStatus = decision === 'approve' || decision === 'reactivate' ? 'active' : 'suspended';
    let revokedSessions = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE schools SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, schoolId);
      if (nextStatus === 'suspended') {
        revokedSessions = revokeSessionsForSchool(schoolId);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Verification decision failed:', err);
      res.status(500).json({ error: 'Unable to apply verification decision.' });
      return;
    }

    await createNotificationRecord({
      schoolId,
      scope: 'school',
      createdByUserId: req.auth!.id,
      createdByName: req.auth!.fullName,
      title:
        nextStatus === 'active'
          ? `Institution Verified: ${existing.name}`
          : `Institution Status Notice: ${existing.name}`,
      body:
        notes ||
        (nextStatus === 'active'
          ? 'Your institution verification has been approved by Platform Administration.'
          : 'Your institution portal access has been suspended. Contact Platform Administration for details.'),
      severity: nextStatus === 'active' ? 'notice' : 'urgent',
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'workers',
      action: `platform.school.verification_${decision}`,
      resourceType: 'school',
      resourceId: schoolId,
      outcome: 'success',
      metadata: { previousStatus: existing.status, nextStatus, notes, revokedSessions },
      ipAddress: getClientIp(req),
    });

    res.json({ id: schoolId, status: nextStatus, decision, revokedSessions });
  },
);

ownerRouter.get('/analytics', requirePermission('platform.analytics.read'), (_req, res) => {
  const db = getDb();
  const schoolCounts = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
      FROM schools
    `)
    .get() as Record<string, number | null>;

  const totals = {
    students: (db.prepare('SELECT COUNT(*) AS c FROM students').get() as { c: number }).c,
    teachers: (db.prepare('SELECT COUNT(*) AS c FROM teachers').get() as { c: number }).c,
    parents: (db.prepare('SELECT COUNT(*) AS c FROM parents').get() as { c: number }).c,
    attendanceMarks: (db.prepare('SELECT COUNT(*) AS c FROM attendance_records').get() as { c: number }).c,
    cbtAttempts: (db.prepare('SELECT COUNT(*) AS c FROM cbt_exam_attempts').get() as { c: number }).c,
    announcements: (db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as { c: number }).c,
    publishedWebsites: (db.prepare('SELECT COUNT(*) AS c FROM school_website_settings WHERE is_published = 1').get() as { c: number }).c,
    aiQueries: (db.prepare('SELECT COUNT(*) AS c FROM ai_core_query_logs').get() as { c: number }).c,
    totalVerifiedFees: Number(
      (db.prepare("SELECT COALESCE(SUM(amount_paid), 0) AS total FROM fee_payments WHERE status = 'verified'").get() as { total: number }).total ?? 0,
    ),
  };

  const schoolLeaderboard = db
    .prepare(`
      SELECT
        s.id, s.name, s.code, s.country, s.city, s.status,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS active_students,
        (SELECT COUNT(*) FROM teachers tc WHERE tc.school_id = s.id AND tc.employment_status = 'active') AS active_teachers,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.school_id = s.id) AS attendance_marks,
        COALESCE((SELECT sws.is_published FROM school_website_settings sws WHERE sws.school_id = s.id), 0) AS website_published
      FROM schools s
      ORDER BY active_students DESC, s.created_at DESC
      LIMIT 30
    `)
    .all();

  res.json({
    schoolCounts: {
      total: schoolCounts.total ?? 0,
      active: schoolCounts.active ?? 0,
      pending: schoolCounts.pending ?? 0,
      suspended: schoolCounts.suspended ?? 0,
    },
    totals,
    schoolLeaderboard,
  });
});

ownerRouter.get('/system-health', requirePermission('platform.health.read'), (_req, res) => {
  const db = getDb();
  const integrity = verifyDatabaseIntegrity();
  const mem = process.memoryUsage();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const gemini = getGeminiStatus();
  const fcm = getFcmIntegrationStatus();

  const activeSessionsCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM auth_sessions WHERE revoked_at IS NULL AND datetime(expires_at) > datetime('now')")
      .get() as { c: number }
  ).c;
  const securityEvents24h = (
    db
      .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE outcome IN ('denied', 'failure') AND datetime(created_at) >= datetime('now', '-1 day')")
      .get() as { c: number }
  ).c;
  const backups = listDatabaseBackups();

  res.json({
    status: integrity.ok ? 'healthy' : 'attention_required',
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      timestamp: new Date().toISOString(),
    },
    database: {
      ok: integrity.ok,
      integrityCheck: integrity.integrityCheck,
      foreignKeyViolations: integrity.foreignKeyViolations,
      journalMode: integrity.journalMode,
      sizeBytes: integrity.dbSizeBytes,
      migrationsCount: integrity.migrations.length,
      allChecksumsMatch: integrity.migrations.every((m) => m.checksumMatch),
      latestBackupAt: backups[0]?.created_at ?? null,
      backupCount: backups.length,
    },
    integrations: {
      geminiAi: gemini,
      smtpEmail: {
        configured: Boolean(smtpHost && smtpHost !== 'MY_SMTP_HOST'),
        host: smtpHost ? smtpHost : null,
      },
      fcmPush: fcm,
    },
    security: {
      activeSessionsCount,
      securityEvents24h,
      activeLockoutsCount: listActiveRateLimitLockouts().length,
    },
  });
});

ownerRouter.get('/ai-core', requirePermission('ai.core.view'), (_req, res) => {
  const db = getDb();
  const blueprint = getAiCoreBlueprint();
  const geminiStatus = getGeminiStatus();
  const recentLogs = db
    .prepare(`
      SELECT l.*, u.full_name AS user_name, s.name AS school_name
      FROM ai_core_query_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN schools s ON s.id = l.school_id
      ORDER BY l.created_at DESC
      LIMIT 30
    `)
    .all();

  res.json({
    ...blueprint,
    geminiStatus,
    recentLogs,
  });
});

ownerRouter.post(
  '/ai-core/query',
  requireCsrfCheck,
  requirePermission('ai.core.use'),
  async (req: AuthenticatedRequest, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 3) {
      res.status(400).json({ error: 'Enter a valid prompt (at least 3 characters).' });
      return;
    }

    const db = getDb();
    const platformContext = {
      schools: db
        .prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
          FROM schools
        `)
        .get(),
      studentsTotal: (db.prepare('SELECT COUNT(*) AS c FROM students').get() as { c: number }).c,
      teachersTotal: (db.prepare('SELECT COUNT(*) AS c FROM teachers').get() as { c: number }).c,
      attendanceRecordsTotal: (db.prepare('SELECT COUNT(*) AS c FROM attendance_records').get() as { c: number }).c,
      cbtAttemptsTotal: (db.prepare('SELECT COUNT(*) AS c FROM cbt_exam_attempts').get() as { c: number }).c,
      publishedWebsitesTotal: (db.prepare('SELECT COUNT(*) AS c FROM school_website_settings WHERE is_published = 1').get() as { c: number }).c,
    };

    const result = await runGroundedAiCoreQuery({
      schoolId: null,
      userId: req.auth!.id,
      roleCode: req.auth!.roleCode,
      moduleDomain: 'school_performance',
      prompt,
      contextData: platformContext,
    });

    res.json({ ...result, platformContext });
  },
);

