import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTenantScope,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  generateOpaqueToken,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  hasPermission,
  isAllowedEnvironmentForUser,
  isOriginTrusted,
  parseCookieHeader,
  sanitizeDisplayFilename,
  SESSION_COOKIE_NAME,
  sha256Hex,
  slugifySchoolName,
  verifyPassword,
} from './security.ts';

test('scrypt password hashing verifies matching password and rejects wrong password', () => {
  const hash = hashPassword('StrongPass99!');
  assert.ok(hash.startsWith('scrypt:'));
  assert.equal(verifyPassword('StrongPass99!', hash), true);
  assert.equal(verifyPassword('WrongPass99!', hash), false);
  assert.equal(verifyPassword('StrongPass99!', 'invalid-hash-format'), false);
});

test('session token hashing is deterministic SHA-256 and never equals raw token', () => {
  const raw = generateSessionToken();
  const h1 = hashSessionToken(raw);
  const h2 = hashSessionToken(raw);
  assert.notEqual(raw, h1);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});

test('cookie header builder sets HttpOnly and environment-appropriate SameSite flags', () => {
  const httpsCookie = buildSessionCookieHeader('tok_123', { maxAgeSeconds: 3600, isHttps: true });
  assert.match(httpsCookie, /HttpOnly/);
  assert.match(httpsCookie, /Secure/);
  assert.match(httpsCookie, /SameSite=None/);
  assert.match(httpsCookie, /Partitioned/);

  const httpCookie = buildSessionCookieHeader('tok_123', { maxAgeSeconds: 3600, isHttps: false });
  assert.match(httpCookie, /HttpOnly/);
  assert.match(httpCookie, /SameSite=Lax/);

  const parsed = parseCookieHeader(`foo=bar; ${SESSION_COOKIE_NAME}=tok_123`);
  assert.equal(parsed[SESSION_COOKIE_NAME], 'tok_123');

  const cleared = buildClearSessionCookieHeader(false);
  assert.match(cleared, /Max-Age=0/);
});

test('workers and school login environments are strictly separated', () => {
  assert.equal(isAllowedEnvironmentForUser('workforce', 'platform_owner', 'workers'), true);
  assert.equal(isAllowedEnvironmentForUser('workforce', 'platform_owner', 'school'), false);
  assert.equal(isAllowedEnvironmentForUser('school_member', 'school_admin', 'school'), true);
  assert.equal(isAllowedEnvironmentForUser('school_member', 'school_admin', 'workers'), false);
  assert.equal(isAllowedEnvironmentForUser('school_member', 'teacher', 'workers'), false);
});

test('RBAC permission checks and tenant isolation strictly enforce boundaries', () => {
  const teacherPerms = ['school.overview.read', 'teacher.workspace.read'];
  assert.equal(hasPermission(teacherPerms, 'teacher.workspace.read'), true);
  assert.equal(hasPermission(teacherPerms, 'platform.schools.manage'), false);

  assert.equal(assertTenantScope('sch_a', 'sch_a'), true);
  assert.equal(assertTenantScope('sch_a', 'sch_b'), false);
  assert.equal(assertTenantScope(null, 'sch_a'), false);
  assert.equal(assertTenantScope('sch_a', null), false);
});

test('CSRF origin validation accepts same-host Origin or X-Requested-With and rejects mismatched Origin even with XHR header', () => {
  assert.equal(
    isOriginTrusted({ originHeader: 'http://localhost:3000', hostHeader: 'localhost:3000' }),
    true,
  );
  assert.equal(
    isOriginTrusted({ originHeader: 'https://evil.example', hostHeader: 'localhost:3000' }),
    false,
  );
  assert.equal(
    isOriginTrusted({
      originHeader: 'https://evil.example',
      hostHeader: 'localhost:3000',
      requestedWithHeader: 'XMLHttpRequest',
    }),
    false,
  );
  assert.equal(isOriginTrusted({ requestedWithHeader: 'XMLHttpRequest' }), true);
  assert.equal(isOriginTrusted({}), false);
});

test('school name slugifier and display filename sanitizer remove unsafe characters', () => {
  assert.equal(slugifySchoolName('Kingsway International Academy!'), 'kingsway-international-academy');
  assert.equal(sanitizeDisplayFilename('../../etc/passwd<script>.png'), 'etcpasswd_script_.png');
  assert.equal(sanitizeDisplayFilename('///'), 'uploaded-file');
});

test('opaque token generation and sha256Hex produce unique 64-char digests', () => {
  const t1 = generateOpaqueToken(32);
  const t2 = generateOpaqueToken(32);
  assert.notEqual(t1, t2);
  assert.equal(sha256Hex(t1).length, 64);
  assert.notEqual(sha256Hex(t1), sha256Hex(t2));
});
