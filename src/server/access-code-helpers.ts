import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeSchoolAccessCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function generateUniqueSchoolAccessCode(prefix = 'DT'): string {
  const cleanPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'DT';

  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `${cleanPrefix}-${suffix}`;
}

export interface AccessCodeEvaluation {
  valid: boolean;
  reason?: string;
}

export function evaluateAccessCodeStatus(
  record: { status: string; expires_at: string | null } | undefined | null,
  nowMs = Date.now(),
): AccessCodeEvaluation {
  if (!record) {
    return {
      valid: false,
      reason: 'Invalid School Access Code. Please obtain a valid unique code from the Platform Owner.',
    };
  }
  if (record.status === 'used') {
    return {
      valid: false,
      reason: 'This School Access Code has already been used to register a school.',
    };
  }
  if (record.status === 'revoked') {
    return {
      valid: false,
      reason: 'This School Access Code has been revoked by the Platform Owner.',
    };
  }
  if (record.status !== 'available') {
    return {
      valid: false,
      reason: 'This School Access Code is not active.',
    };
  }
  if (record.expires_at) {
    const expMs = Date.parse(record.expires_at);
    if (!Number.isNaN(expMs) && expMs <= nowMs) {
      return {
        valid: false,
        reason: 'This School Access Code has expired. Request a fresh code from the Platform Owner.',
      };
    }
  }
  return { valid: true };
}
