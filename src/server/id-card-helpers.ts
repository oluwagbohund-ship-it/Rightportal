import crypto from 'node:crypto';
import { getDb } from '../db/client.ts';
import { generateOpaqueToken } from './security.ts';

export const ID_CARD_TOKEN_PREFIX = 'DTID-';

export function generateIdCardQrToken(): string {
  return `${ID_CARD_TOKEN_PREFIX}${generateOpaqueToken(24)}`;
}

export function formatIdCardNumber(sequence: number, year = new Date().getUTCFullYear()): string {
  const safeSeq = Math.max(1, Math.floor(sequence));
  return `DT-IDC-${year}-${String(safeSeq).padStart(4, '0')}`;
}

export function extractIdCardTokenFromScan(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith(ID_CARD_TOKEN_PREFIX)) {
    return trimmed;
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { token?: unknown; qrToken?: unknown };
      const candidate =
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.qrToken === 'string'
            ? parsed.qrToken
            : '';
      if (candidate.trim().startsWith(ID_CARD_TOKEN_PREFIX)) {
        return candidate.trim();
      }
    } catch {
      // Fall through to URL or direct string parsing
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const fromQuery =
        url.searchParams.get('token') ??
        url.searchParams.get('qrToken') ??
        url.searchParams.get('qr') ??
        '';
      if (fromQuery.trim().startsWith(ID_CARD_TOKEN_PREFIX)) {
        return fromQuery.trim();
      }
    } catch {
      // Fall through
    }
  }

  return trimmed;
}

export function evaluateIdCardValidity(
  card: { status: string; expires_at: string; revoked_at: string | null },
  nowMs = Date.now(),
): { valid: boolean; reason: string } {
  if (card.revoked_at || card.status === 'revoked') {
    return { valid: false, reason: 'This Digital ID Card has been revoked by the school.' };
  }
  if (card.status === 'expired') {
    return { valid: false, reason: 'This Digital ID Card has expired.' };
  }
  const expiresMs = new Date(card.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { valid: false, reason: 'This Digital ID Card has passed its validity date.' };
  }
  if (card.status !== 'active') {
    return { valid: false, reason: 'This Digital ID Card is not active.' };
  }
  return { valid: true, reason: '' };
}

function deriveAesKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

export function encryptIdCardToken(rawToken: string, secret: string): string {
  const key = deriveAesKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptIdCardToken(payload: string, secret: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const key = deriveAesKey(secret);
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(dataB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function getOrCreateIdCardMasterSecret(): string {
  const envSecret = process.env.ID_CARD_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'id_card_master_secret'")
    .get() as { value_json: string } | undefined;

  if (existing?.value_json) {
    try {
      const parsed = JSON.parse(existing.value_json);
      if (typeof parsed === 'string' && parsed.length >= 16) {
        return parsed;
      }
    } catch {
      // Regenerate below if malformed
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO platform_settings (key, value_json, updated_by)
    VALUES ('id_card_master_secret', ?, 'system')
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(JSON.stringify(generated));

  return generated;
}
