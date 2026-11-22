import crypto from 'node:crypto';
import { getDb } from '../db/client.ts';
import { generateSessionToken, hashSessionToken } from './security.ts';
import type { AuthContextUser, AuthEnvironment, RoleCode, SchoolStatus, UserType } from './types.ts';

const DEFAULT_ROTATION_INTERVAL_MS = 30 * 60 * 1000;

export function getSessionTtlHours(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'session_ttl_hours'")
    .get() as { value_json: string } | undefined;
  if (!row) return 24;
  try {
    const parsed = Number(JSON.parse(row.value_json));
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 168) {
      return parsed;
    }
  } catch {
    // fallback to default
  }
  return 24;
}

export function purgeExpiredSessions(): number {
  const db = getDb();
  const res = db
    .prepare("DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')")
    .run();
  return Number(res.changes ?? 0);
}

export function createAuthSession(params: {
  userId: string;
  authEnvironment: AuthEnvironment;
  activeSchoolId: string | null;
  ipAddress: string;
  userAgent: string;
}): { sessionId: string; rawToken: string; maxAgeSeconds: number } {
  const db = getDb();
  const ttlHours = getSessionTtlHours();
  const maxAgeSeconds = ttlHours * 3600;
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  const sessionId = `ses_${crypto.randomUUID()}`;

  db.prepare(`
    INSERT INTO auth_sessions (
      id, token_hash, user_id, auth_environment, active_school_id,
      ip_address, user_agent, expires_at, rotated_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    tokenHash,
    params.userId,
    params.authEnvironment,
    params.activeSchoolId,
    params.ipAddress,
    params.userAgent.slice(0, 240),
    expiresAt,
    nowIso,
    nowIso,
  );

  return { sessionId, rawToken, maxAgeSeconds };
}

export function rotateSessionToken(
  rawToken: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): { rawToken: string; maxAgeSeconds: number } | null {
  const db = getDb();
  const oldHash = hashSessionToken(rawToken);
  const existing = db
    .prepare(`
      SELECT id, user_id, auth_environment, active_school_id, expires_at, revoked_at, ip_address, user_agent
      FROM auth_sessions
      WHERE token_hash = ?
    `)
    .get(oldHash) as
    | {
        id: string;
        user_id: string;
        auth_environment: AuthEnvironment;
        active_school_id: string | null;
        expires_at: string;
        revoked_at: string | null;
        ip_address: string;
        user_agent: string;
      }
    | undefined;

  if (!existing || existing.revoked_at !== null) {
    return null;
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const ttlHours = getSessionTtlHours();
  const maxAgeSeconds = ttlHours * 3600;
  const newRawToken = generateSessionToken();
  const newTokenHash = hashSessionToken(newRawToken);
  const nowIso = new Date().toISOString();
  const nextExpiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  const nextSessionId = `ses_${crypto.randomUUID()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ?").run(
      existing.id,
    );
    db.prepare(`
      INSERT INTO auth_sessions (
        id, token_hash, user_id, auth_environment, active_school_id,
        ip_address, user_agent, expires_at, rotated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nextSessionId,
      newTokenHash,
      existing.user_id,
      existing.auth_environment,
      existing.active_school_id,
      meta.ipAddress ?? existing.ip_address,
      (meta.userAgent ?? existing.user_agent).slice(0, 240),
      nextExpiresAt,
      nowIso,
      nowIso,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { rawToken: newRawToken, maxAgeSeconds };
}

export function revokeSessionByToken(rawToken: string): void {
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  db.prepare(
    "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL",
  ).run(tokenHash);
}

export function revokeSessionById(sessionId: string): number {
  const db = getDb();
  const res = db
    .prepare(
      "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
    )
    .run(sessionId);
  return Number(res.changes ?? 0);
}

export function revokeAllSessionsForUser(userId: string): number {
  const db = getDb();
  const res = db
    .prepare(
      "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
    )
    .run(userId);
  return Number(res.changes ?? 0);
}

export function revokeSessionsForSchool(schoolId: string): number {
  const db = getDb();
  const res = db
    .prepare(
      "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE active_school_id = ? AND revoked_at IS NULL",
    )
    .run(schoolId);
  return Number(res.changes ?? 0);
}

export interface ResolvedSessionResult {
  user: AuthContextUser;
  sessionId: string;
  needsRotation: boolean;
}

export function resolveSessionWithMetadata(
  rawToken: string,
  rotationIntervalMs = DEFAULT_ROTATION_INTERVAL_MS,
): ResolvedSessionResult | null {
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);

  const sessionRow = db
    .prepare(`
      SELECT
        s.id AS session_id,
        s.user_id,
        s.auth_environment,
        s.active_school_id,
        s.expires_at,
        s.revoked_at,
        s.rotated_at,
        s.created_at,
        u.email,
        u.full_name,
        u.user_type,
        u.is_active
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as
    | {
        session_id: string;
        user_id: string;
        auth_environment: AuthEnvironment;
        active_school_id: string | null;
        expires_at: string;
        revoked_at: string | null;
        rotated_at: string | null;
        created_at: string;
        email: string;
        full_name: string;
        user_type: UserType;
        is_active: number;
      }
    | undefined;

  if (!sessionRow) return null;
  if (sessionRow.revoked_at !== null) return null;
  if (sessionRow.is_active !== 1) return null;
  if (new Date(sessionRow.expires_at).getTime() <= Date.now()) return null;

  const anchorTime = sessionRow.rotated_at || sessionRow.created_at;
  const anchorMs = new Date(anchorTime.includes('T') ? anchorTime : `${anchorTime}Z`).getTime();
  const needsRotation = Number.isFinite(anchorMs) && Date.now() - anchorMs >= rotationIntervalMs;

  if (sessionRow.auth_environment === 'workers') {
    if (sessionRow.user_type !== 'workforce') return null;
    const assignment = db
      .prepare(`
        SELECT r.id AS role_id, r.code AS role_code, r.name AS role_name
        FROM workforce_assignments wa
        INNER JOIN roles r ON r.id = wa.role_id
        WHERE wa.user_id = ?
      `)
      .get(sessionRow.user_id) as
      | { role_id: string; role_code: RoleCode; role_name: string }
      | undefined;

    if (!assignment) return null;

    const perms = db
      .prepare(`
        SELECT p.code
        FROM role_permissions rp
        INNER JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `)
      .all(assignment.role_id) as Array<{ code: string }>;

    db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      sessionRow.session_id,
    );

    return {
      sessionId: sessionRow.session_id,
      needsRotation,
      user: {
        id: sessionRow.user_id,
        email: sessionRow.email,
        fullName: sessionRow.full_name,
        userType: sessionRow.user_type,
        roleCode: assignment.role_code,
        roleName: assignment.role_name,
        permissions: perms.map((p) => p.code),
        authEnvironment: 'workers',
        activeSchoolId: null,
        activeSchoolName: null,
        activeSchoolCode: null,
        activeSchoolStatus: null,
      },
    };
  }

  if (sessionRow.user_type !== 'school_member' || !sessionRow.active_school_id) {
    return null;
  }

  const membership = db
    .prepare(`
      SELECT
        r.id AS role_id,
        r.code AS role_code,
        r.name AS role_name,
        sm.status AS membership_status,
        sch.id AS school_id,
        sch.name AS school_name,
        sch.code AS school_code,
        sch.status AS school_status
      FROM school_memberships sm
      INNER JOIN roles r ON r.id = sm.role_id
      INNER JOIN schools sch ON sch.id = sm.school_id
      WHERE sm.user_id = ? AND sm.school_id = ?
    `)
    .get(sessionRow.user_id, sessionRow.active_school_id) as
    | {
        role_id: string;
        role_code: RoleCode;
        role_name: string;
        membership_status: string;
        school_id: string;
        school_name: string;
        school_code: string;
        school_status: SchoolStatus;
      }
    | undefined;

  if (!membership || membership.membership_status !== 'active') return null;
  if (membership.school_status === 'suspended') return null;

  const perms = db
    .prepare(`
      SELECT p.code
      FROM role_permissions rp
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `)
    .all(membership.role_id) as Array<{ code: string }>;

  db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    sessionRow.session_id,
  );

  return {
    sessionId: sessionRow.session_id,
    needsRotation,
    user: {
      id: sessionRow.user_id,
      email: sessionRow.email,
      fullName: sessionRow.full_name,
      userType: sessionRow.user_type,
      roleCode: membership.role_code,
      roleName: membership.role_name,
      permissions: perms.map((p) => p.code),
      authEnvironment: 'school',
      activeSchoolId: membership.school_id,
      activeSchoolName: membership.school_name,
      activeSchoolCode: membership.school_code,
      activeSchoolStatus: membership.school_status,
    },
  };
}

export function resolveAuthContextFromToken(rawToken: string): AuthContextUser | null {
  return resolveSessionWithMetadata(rawToken)?.user ?? null;
}
