import crypto from 'node:crypto';
import { getDb } from '../db/client.ts';
import type { AuditOutcome } from './types.ts';

export interface RecordAuditParams {
  actorUserId?: string | null;
  actorEmail: string;
  actorRole: string;
  schoolId?: string | null;
  authEnvironment: 'workers' | 'school' | 'public';
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export function recordAuditLog(params: RecordAuditParams): void {
  const db = getDb();
  const id = `aud_${crypto.randomUUID()}`;
  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      id, actor_user_id, actor_email, actor_role, school_id,
      auth_environment, action, resource_type, resource_id,
      outcome, metadata_json, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    params.actorUserId ?? null,
    params.actorEmail,
    params.actorRole,
    params.schoolId ?? null,
    params.authEnvironment,
    params.action,
    params.resourceType,
    params.resourceId ?? '',
    params.outcome,
    JSON.stringify(params.metadata ?? {}),
    params.ipAddress ?? '',
  );
}
