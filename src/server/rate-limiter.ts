import { getDb } from '../db/client.ts';

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  rateKey: string,
  maxAttempts: number,
  windowMinutes: number,
): RateLimitStatus {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT attempts, first_attempt_at, locked_until FROM login_rate_limits WHERE rate_key = ?',
    )
    .get(rateKey) as
    | { attempts: number; first_attempt_at: string; locked_until: string | null }
    | undefined;

  if (!row) {
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }

  const nowMs = Date.now();
  if (row.locked_until) {
    const lockedUntilMs = new Date(row.locked_until).getTime();
    if (lockedUntilMs > nowMs) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000)),
      };
    }
    // Lockout expired — reset bucket
    db.prepare('DELETE FROM login_rate_limits WHERE rate_key = ?').run(rateKey);
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }

  const windowStartMs = new Date(row.first_attempt_at).getTime();
  if (nowMs - windowStartMs > windowMinutes * 60 * 1000) {
    db.prepare('DELETE FROM login_rate_limits WHERE rate_key = ?').run(rateKey);
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }

  const remaining = Math.max(0, maxAttempts - row.attempts);
  return {
    allowed: row.attempts < maxAttempts,
    remainingAttempts: remaining,
    retryAfterSeconds: 0,
  };
}

export function recordRateLimitedAttempt(
  rateKey: string,
  maxAttempts: number,
  windowMinutes: number,
  lockoutMinutes: number,
): RateLimitStatus {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const row = db
    .prepare(
      'SELECT attempts, first_attempt_at, locked_until FROM login_rate_limits WHERE rate_key = ?',
    )
    .get(rateKey) as
    | { attempts: number; first_attempt_at: string; locked_until: string | null }
    | undefined;

  if (!row || nowMs - new Date(row.first_attempt_at).getTime() > windowMinutes * 60 * 1000) {
    const lockedUntil =
      maxAttempts <= 1 ? new Date(nowMs + lockoutMinutes * 60 * 1000).toISOString() : null;
    db.prepare(`
      INSERT INTO login_rate_limits (rate_key, attempts, first_attempt_at, locked_until, updated_at)
      VALUES (?, 1, ?, ?, datetime('now'))
      ON CONFLICT(rate_key) DO UPDATE SET
        attempts = 1,
        first_attempt_at = excluded.first_attempt_at,
        locked_until = excluded.locked_until,
        updated_at = datetime('now')
    `).run(rateKey, nowIso, lockedUntil);

    return {
      allowed: lockedUntil === null,
      remainingAttempts: Math.max(0, maxAttempts - 1),
      retryAfterSeconds: lockedUntil ? lockoutMinutes * 60 : 0,
    };
  }

  const nextAttempts = row.attempts + 1;
  const shouldLock = nextAttempts >= maxAttempts;
  const lockedUntil = shouldLock
    ? new Date(nowMs + lockoutMinutes * 60 * 1000).toISOString()
    : row.locked_until;

  db.prepare(`
    UPDATE login_rate_limits
    SET attempts = ?, locked_until = ?, updated_at = datetime('now')
    WHERE rate_key = ?
  `).run(nextAttempts, lockedUntil, rateKey);

  return {
    allowed: !shouldLock,
    remainingAttempts: Math.max(0, maxAttempts - nextAttempts),
    retryAfterSeconds: shouldLock ? lockoutMinutes * 60 : 0,
  };
}

export function clearRateLimit(rateKey: string): void {
  const db = getDb();
  db.prepare('DELETE FROM login_rate_limits WHERE rate_key = ?').run(rateKey);
}

export function listActiveRateLimitLockouts(): Array<{
  rate_key: string;
  attempts: number;
  locked_until: string | null;
  updated_at: string;
}> {
  const db = getDb();
  return db
    .prepare(`
      SELECT rate_key, attempts, locked_until, updated_at
      FROM login_rate_limits
      WHERE locked_until IS NOT NULL AND datetime(locked_until) > datetime('now')
      ORDER BY updated_at DESC
      LIMIT 30
    `)
    .all() as Array<{
    rate_key: string;
    attempts: number;
    locked_until: string | null;
    updated_at: string;
  }>;
}
