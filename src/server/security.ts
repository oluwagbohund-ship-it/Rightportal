import crypto from 'node:crypto';
import type { AuthEnvironment, RoleCode, UserType } from './types.ts';

export const SESSION_COOKIE_NAME = 'dt_edtech_session';
const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS)
    .toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  if (!salt || !originalHex) {
    return false;
  }
  try {
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    const original = Buffer.from(originalHex, 'hex');
    if (derived.length !== original.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, original);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const segment of cookieHeader.split(';')) {
    const idx = segment.indexOf('=');
    if (idx === -1) continue;
    const key = segment.slice(0, idx).trim();
    const val = segment.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function buildSessionCookieHeader(
  token: string,
  options: { maxAgeSeconds: number; isHttps: boolean },
): string {
  const encoded = encodeURIComponent(token);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encoded}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function isAllowedEnvironmentForUser(
  userType: UserType,
  roleCode: RoleCode,
  targetEnvironment: AuthEnvironment,
): boolean {
  if (targetEnvironment === 'workers') {
    return (
      userType === 'workforce' &&
      (roleCode === 'platform_owner' ||
        roleCode === 'workforce_admin' ||
        roleCode === 'workforce_support')
    );
  }
  return (
    userType === 'school_member' &&
    (roleCode === 'school_admin' ||
      roleCode === 'teacher' ||
      roleCode === 'student' ||
      roleCode === 'parent')
  );
}

export function hasPermission(userPermissions: readonly string[], required: string): boolean {
  return userPermissions.includes(required);
}

export function assertTenantScope(
  sessionSchoolId: string | null,
  recordSchoolId: string | null | undefined,
): boolean {
  if (!sessionSchoolId || !recordSchoolId) {
    return false;
  }
  return sessionSchoolId === recordSchoolId;
}

export function slugifySchoolName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function sanitizeDisplayFilename(name: string): string {
  const base = name
    .replace(/[/\\]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (base || 'uploaded-file').slice(0, 120);
}

export function isOriginTrusted(options: {
  originHeader?: string;
  hostHeader?: string;
  forwardedHostHeader?: string;
  requestedWithHeader?: string;
}): boolean {
  if (options.originHeader) {
    try {
      const originHost = new URL(options.originHeader).host;
      const expectedHost = options.forwardedHostHeader || options.hostHeader;
      return Boolean(expectedHost && originHost === expectedHost);
    } catch {
      return false;
    }
  }
  return options.requestedWithHeader === 'XMLHttpRequest';
}
