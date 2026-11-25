import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

// Configure isolated temporary directories before importing DB-bound modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-test-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_BACKUP_DIR = path.join(tmpDir, 'backups');
process.env.FILE_STORAGE_DIR = path.join(tmpDir, 'storage');

const { closeDb, getDb, verifyDatabaseIntegrity } = await import('../db/client.ts');
const { createDatabaseBackup, restoreDatabaseBackup } = await import('../db/backup.ts');
const { resolveConfinedStoragePath } = await import('./file-storage.ts');
const { securityHeadersMiddleware } = await import('./middleware.ts');
const { authRouter } = await import('./routes/auth.ts');
const { ownerRouter } = await import('./routes/owner.ts');
const { publicRouter } = await import('./routes/public.ts');
const { schoolRouter } = await import('./routes/school.ts');

let server: http.Server;
let baseUrl: string;

function extractSessionCookie(res: Response): string | null {
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')!]
        : [];

  for (const header of setCookies) {
    const firstPart = header.split(';')[0];
    if (firstPart?.startsWith('dt_edtech_session=')) {
      const val = firstPart.slice('dt_edtech_session='.length);
      if (val.length > 0) return firstPart;
      return '';
    }
  }
  return null;
}

async function api(
  routePath: string,
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers ?? {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${routePath}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }

  return {
    res,
    status: res.status,
    json,
    cookie: extractSessionCookie(res),
  };
}

// Valid 1x1 transparent PNG signature bytes
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

before(async () => {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use('/api/school/files', express.json({ limit: '8mb' }));
  app.use('/api/owner/files', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/school', schoolRouter);

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Database integrity check passes on initialization and rejects foreign-key violations', () => {
  const report = verifyDatabaseIntegrity();
  assert.equal(report.ok, true);
  assert.equal(report.integrityCheck, 'ok');
  assert.equal(report.foreignKeyViolations, 0);
  assert.equal(report.foreignKeysEnabled, true);
  assert.ok(report.migrations.length >= 2);
  assert.ok(report.migrations.every((m) => m.checksumMatch));

  const db = getDb();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO school_memberships (id, school_id, user_id, role_id) VALUES ('mem_bad', 'missing_school', 'missing_user', 'role_teacher')",
    ).run();
  });
});

test('Security headers include nosniff and do not block iframe framing', async () => {
  const { res, json } = await api('/api/public/info');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), null);
  assert.equal(json.ownerClaimed, false);
  assert.equal(json.requireAccessCodeForSchoolRegistration, true);
});

let ownerCookie = '';
let schoolACookie = '';
let schoolBCookie = '';
let schoolAId = '';
let schoolBId = '';
let schoolACode = '';
let schoolBCode = '';
let teacherACookie = '';
let studentACookie = '';
let teacherAUserId = '';
let schoolAFileId = '';

test('Auth separation, Platform Owner bootstrap, duplicate school rejection, and login rate limiting', async () => {
  // 1. Bootstrap Platform Owner
  const boot = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'David Oluwagbohun',
      email: 'owner@davetimi.com',
      password: 'OwnerStrongPassword2026',
    },
  });
  assert.equal(boot.status, 201);
  assert.ok(boot.cookie && boot.cookie.length > 20);
  ownerCookie = boot.cookie!;

  const infoAfterBoot = await api('/api/public/info');
  assert.equal(infoAfterBoot.status, 200);
  assert.equal(infoAfterBoot.json.ownerClaimed, true);

  // Second bootstrap must fail
  const bootTwice = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'Attacker',
      email: 'evil@davetimi.com',
      password: 'EvilPassword2026',
    },
  });
  assert.equal(bootTwice.status, 409);

  // 2. School creation must require a valid Platform Owner access code
  const regNoCode = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      schoolName: 'Unauthorized Academy',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'unauth@alpha.edu',
      adminFullName: 'Unauth Principal',
      adminEmail: 'unauth-principal@alpha.edu',
      adminPassword: 'AlphaPassword2026',
    },
  });
  assert.equal(regNoCode.status, 400);

  const regBadCode = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: 'DT-INVALID1',
      schoolName: 'Unauthorized Academy',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'unauth@alpha.edu',
      adminFullName: 'Unauth Principal',
      adminEmail: 'unauth-principal@alpha.edu',
      adminPassword: 'AlphaPassword2026',
    },
  });
  assert.equal(regBadCode.status, 403);

  // Platform Owner issues unique codes (including one to test revocation)
  const issueRevoked = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Revoked School' },
  });
  assert.equal(issueRevoked.status, 201);
  const revokedCodeObj = issueRevoked.json.accessCode as { id: string; code: string };
  const revokeRes = await api(`/api/owner/school-access-codes/${revokedCodeObj.id}/revoke`, {
    method: 'PATCH',
    cookie: ownerCookie,
  });
  assert.equal(revokeRes.status, 200);

  const regWithRevoked = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: revokedCodeObj.code,
      schoolName: 'Revoked School',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'revoked@alpha.edu',
      adminFullName: 'Revoked Principal',
      adminEmail: 'revoked-principal@alpha.edu',
      adminPassword: 'AlphaPassword2026',
    },
  });
  assert.equal(regWithRevoked.status, 403);

  const issueA = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Alpha Model Academy' },
  });
  assert.equal(issueA.status, 201);
  schoolACode = (issueA.json.accessCode as { code: string }).code;

  const verifyA = await api('/api/public/verify-access-code', {
    method: 'POST',
    body: { accessCode: schoolACode },
  });
  assert.equal(verifyA.status, 200);
  assert.equal(verifyA.json.valid, true);

  // Register School A & School B using Platform Owner codes
  const regA = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolACode,
      schoolName: 'Alpha Model Academy',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'office@alpha.edu',
      adminFullName: 'Alpha Principal',
      adminEmail: 'principal@alpha.edu',
      adminPassword: 'AlphaPassword2026',
      initialSessionName: '2026/2027 Session',
    },
  });
  assert.equal(regA.status, 201);
  schoolACookie = regA.cookie!;
  schoolAId = (regA.json.school as { id: string }).id;
  assert.equal((regA.json.school as { code: string }).code, schoolACode);

  // Reusing the same access code must fail
  const reuseCodeRes = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolACode,
      schoolName: 'Clone Academy',
      country: 'Nigeria',
      city: 'Enugu',
      contactEmail: 'clone@alpha.edu',
      adminFullName: 'Clone Principal',
      adminEmail: 'clone@alpha.edu',
      adminPassword: 'AlphaPassword2026',
    },
  });
  assert.equal(reuseCodeRes.status, 403);

  // Duplicate school blocked even with a fresh code
  const issueB = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Beta High School' },
  });
  assert.equal(issueB.status, 201);
  schoolBCode = (issueB.json.accessCode as { code: string }).code;

  const dupSchool = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolBCode,
      schoolName: 'alpha model academy',
      country: 'Nigeria',
      city: 'lagos',
      contactEmail: 'other@alpha.edu',
      adminFullName: 'Another Principal',
      adminEmail: 'principal2@alpha.edu',
      adminPassword: 'AlphaPassword2026',
    },
  });
  assert.equal(dupSchool.status, 409);

  const regB = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolBCode,
      schoolName: 'Beta High School',
      country: 'Nigeria',
      city: 'Abuja',
      contactEmail: 'office@beta.edu',
      adminFullName: 'Beta Principal',
      adminEmail: 'principal@beta.edu',
      adminPassword: 'BetaPassword2026',
    },
  });
  assert.equal(regB.status, 201);
  schoolBCookie = regB.cookie!;
  schoolBId = (regB.json.school as { id: string }).id;

  // 3. Cross-environment boundary rejection & mandatory schoolCode at school login
  const schoolLoginWithoutCode = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'principal@alpha.edu', password: 'AlphaPassword2026' },
  });
  assert.equal(schoolLoginWithoutCode.status, 400);

  const schoolAdminOnWorkers = await api('/api/auth/workers/login', {
    method: 'POST',
    body: { email: 'principal@alpha.edu', password: 'AlphaPassword2026' },
  });
  assert.equal(schoolAdminOnWorkers.status, 403);

  const ownerOnSchool = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'owner@davetimi.com', password: 'OwnerStrongPassword2026' },
  });
  assert.equal(ownerOnSchool.status, 403);

  // School Admin cannot hit Owner endpoints
  const schoolCallingOwner = await api('/api/owner/overview', { cookie: schoolACookie });
  assert.equal(schoolCallingOwner.status, 403);

  // 4. Login Rate Limiting (5 failed attempts -> 429 lockout)
  for (let i = 0; i < 5; i++) {
    const failRes = await api('/api/auth/school/login', {
      method: 'POST',
      body: { schoolCode: schoolACode, email: 'ratelimit-victim@alpha.edu', password: 'WrongPassword123' },
    });
    assert.equal(failRes.status, 401);
  }
  const lockedRes = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'ratelimit-victim@alpha.edu', password: 'WrongPassword123' },
  });
  assert.equal(lockedRes.status, 429);
  assert.ok(Number(lockedRes.res.headers.get('retry-after')) > 0);
});

test('Session rotation invalidates prior token and logout-all revokes all sessions', async () => {
  const login = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolBCode, email: 'principal@beta.edu', password: 'BetaPassword2026' },
  });
  assert.equal(login.status, 200);
  const firstCookie = login.cookie!;

  const rotateRes = await api('/api/auth/rotate', { method: 'POST', cookie: firstCookie });
  assert.equal(rotateRes.status, 200);
  const rotatedCookie = rotateRes.cookie!;
  assert.notEqual(rotatedCookie, firstCookie);

  // Prior token must now be rejected
  const oldSessionCheck = await api('/api/school/overview', { cookie: firstCookie });
  assert.equal(oldSessionCheck.status, 401);

  // New token works
  const newSessionCheck = await api('/api/school/overview', { cookie: rotatedCookie });
  assert.equal(newSessionCheck.status, 200);

  // Logout-all revokes all active sessions for Beta Principal
  const logoutAll = await api('/api/auth/logout-all', { method: 'POST', cookie: rotatedCookie });
  assert.equal(logoutAll.status, 200);
  const afterLogoutAll = await api('/api/school/overview', { cookie: rotatedCookie });
  assert.equal(afterLogoutAll.status, 401);

  // Re-establish valid School B session for subsequent cross-tenant tests
  const reLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolBCode, email: 'principal@beta.edu', password: 'BetaPassword2026' },
  });
  assert.equal(reLogin.status, 200);
  schoolBCookie = reLogin.cookie!;
});

test('File upload validation, path confinement, tenant isolation, and role permissions', async () => {
  // Provision Teacher and Student in School A
  const createTeacher = await api('/api/school/members', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      fullName: 'Teacher Ada',
      email: 'teacher@alpha.edu',
      password: 'TeacherPassword2026',
      roleCode: 'teacher',
      title: 'Physics',
    },
  });
  assert.equal(createTeacher.status, 201);
  teacherAUserId = createTeacher.json.user_id as string;

  const createStudent = await api('/api/school/members', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      fullName: 'Student Tunde',
      email: 'student@alpha.edu',
      password: 'StudentPassword2026',
      roleCode: 'student',
      title: 'SS2',
    },
  });
  assert.equal(createStudent.status, 201);

  const teacherLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'teacher@alpha.edu', password: 'TeacherPassword2026' },
  });
  teacherACookie = teacherLogin.cookie!;

  const studentLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'student@alpha.edu', password: 'StudentPassword2026' },
  });
  studentACookie = studentLogin.cookie!;

  // 1. Reject spoofed EXE magic bytes claiming PNG
  const mzBase64 = Buffer.from('MZfakeexecutablepayload').toString('base64');
  const badExe = await api('/api/school/files', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      category: 'school_logo',
      fileName: 'malicious.png',
      mimeType: 'image/png',
      contentBase64: mzBase64,
    },
  });
  assert.equal(badExe.status, 400);

  // 2. Reject SVG/script masquerading as text/plain
  const svgBase64 = Buffer.from('<svg onload="alert(1)"><script>evil()</script></svg>').toString('base64');
  const badSvg = await api('/api/school/files', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      category: 'school_document',
      fileName: 'xss.txt',
      mimeType: 'text/plain',
      contentBase64: svgBase64,
    },
  });
  assert.equal(badSvg.status, 400);

  // 3. Reject student uploading a school_logo
  const studentForbiddenUpload = await api('/api/school/files', {
    method: 'POST',
    cookie: studentACookie,
    body: {
      category: 'school_logo',
      fileName: 'logo.png',
      mimeType: 'image/png',
      contentBase64: VALID_PNG_BASE64,
    },
  });
  assert.equal(studentForbiddenUpload.status, 403);

  // 4. Valid PNG upload by School A admin
  const validUpload = await api('/api/school/files', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      category: 'school_logo',
      fileName: '../../alpha-crest.png',
      mimeType: 'image/png',
      contentBase64: VALID_PNG_BASE64,
    },
  });
  assert.equal(validUpload.status, 201);
  const uploadedFile = validUpload.json.file as { id: string; original_name: string };
  schoolAFileId = uploadedFile.id;
  assert.ok(!uploadedFile.original_name.includes('..'));

  // 5. Cross-tenant download and deletion blocked (School B cannot see School A's file)
  const crossTenantDownload = await api(`/api/school/files/${schoolAFileId}/download`, {
    cookie: schoolBCookie,
  });
  assert.equal(crossTenantDownload.status, 404);

  const crossTenantDelete = await api(`/api/school/files/${schoolAFileId}`, {
    method: 'DELETE',
    cookie: schoolBCookie,
  });
  assert.equal(crossTenantDelete.status, 404);

  // 6. Path confinement helper rejects traversal
  assert.throws(() => resolveConfinedStoragePath('../outside.txt'));
});

test('Scoped notifications enforce audience boundaries and per-user read state', async () => {
  // Teacher-only notice in School A
  const teacherNotice = await api('/api/school/notifications', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      scope: 'teacher',
      title: 'Faculty Grading Meeting',
      body: 'Submit term rubrics by Friday.',
      severity: 'notice',
    },
  });
  assert.equal(teacherNotice.status, 201);
  const teacherNoticeId = (teacherNotice.json.notification as { id: string }).id;

  // Platform-wide notice by Owner
  const platformNotice = await api('/api/owner/notifications', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      scope: 'platform',
      title: 'Scheduled Maintenance Window',
      body: 'Platform backup audit runs Sunday 02:00 UTC.',
      severity: 'info',
    },
  });
  assert.equal(platformNotice.status, 201);

  // Teacher sees both teacher notice and platform notice
  const teacherFeed = await api('/api/school/notifications', { cookie: teacherACookie });
  assert.equal(teacherFeed.status, 200);
  const teacherNotifs = teacherFeed.json.notifications as Array<{ id: string }>;
  assert.ok(teacherNotifs.some((n) => n.id === teacherNoticeId));

  // Student must NOT see teacher-only notice, nor mark it read
  const studentFeed = await api('/api/school/notifications', { cookie: studentACookie });
  assert.equal(studentFeed.status, 200);
  const studentNotifs = studentFeed.json.notifications as Array<{ id: string }>;
  assert.equal(studentNotifs.some((n) => n.id === teacherNoticeId), false);

  const studentMarkTeacherNotif = await api(
    `/api/school/notifications/${teacherNoticeId}/read`,
    { method: 'PATCH', cookie: studentACookie },
  );
  assert.equal(studentMarkTeacherNotif.status, 404);

  // School B admin must NOT see School A's teacher notice
  const schoolBFeed = await api('/api/school/notifications', { cookie: schoolBCookie });
  assert.equal(schoolBFeed.status, 200);
  const schoolBNotifs = schoolBFeed.json.notifications as Array<{ id: string }>;
  assert.equal(schoolBNotifs.some((n) => n.id === teacherNoticeId), false);
});

test('Password recovery link resets password, invalidates single-use token, and revokes sessions', async () => {
  // School Admin issues recovery token for Teacher Ada
  const membersRes = await api('/api/school/members', { cookie: schoolACookie });
  const members = membersRes.json.members as Array<{ membership_id: string; user_id: string }>;
  const teacherMembership = members.find((m) => m.user_id === teacherAUserId)!;

  const issueRes = await api(
    `/api/school/members/${teacherMembership.membership_id}/recovery-token`,
    { method: 'POST', cookie: schoolACookie },
  );
  assert.equal(issueRes.status, 201);
  const recoveryToken = issueRes.json.token as string;
  assert.ok(recoveryToken.length > 20);

  // Confirm password reset
  const confirmRes = await api('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: {
      token: recoveryToken,
      newPassword: 'NewTeacherPassword2026',
    },
  });
  assert.equal(confirmRes.status, 200);

  // Prior teacher session must be revoked
  const oldTeacherCheck = await api('/api/school/teacher-workspace', { cookie: teacherACookie });
  assert.equal(oldTeacherCheck.status, 401);

  // Re-using the same token must fail
  const reuseRes = await api('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: {
      token: recoveryToken,
      newPassword: 'AnotherPassword2026',
    },
  });
  assert.equal(reuseRes.status, 400);

  // Logging in with new password succeeds
  const newLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'teacher@alpha.edu', password: 'NewTeacherPassword2026' },
  });
  assert.equal(newLogin.status, 200);
});

test('Suspending a school tenant immediately revokes active tenant sessions', async () => {
  // Verify School A admin currently works
  const beforeSuspend = await api('/api/school/overview', { cookie: schoolACookie });
  assert.equal(beforeSuspend.status, 200);

  // Platform Owner suspends School A
  const suspendRes = await api(`/api/owner/schools/${schoolAId}/status`, {
    method: 'PATCH',
    cookie: ownerCookie,
    body: { status: 'suspended' },
  });
  assert.equal(suspendRes.status, 200);

  // Active session is immediately rejected
  const afterSuspend = await api('/api/school/overview', { cookie: schoolACookie });
  assert.equal(afterSuspend.status, 401);

  // New login blocked while suspended
  const loginBlocked = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'principal@alpha.edu', password: 'AlphaPassword2026' },
  });
  assert.equal(loginBlocked.status, 403);
});

test('SQLite atomic backup and restore reliably reverts post-backup mutations', () => {
  // Create snapshot before mutation
  const backup = createDatabaseBackup('owner@davetimi.com', 'Pre-mutation checkpoint');
  assert.ok(backup.size_bytes > 0);
  assert.equal(backup.sha256_hex.length, 64);

  // Mutate School B name after backup
  const db = getDb();
  db.prepare("UPDATE schools SET name = 'Mutated School Name' WHERE id = ?").run(schoolBId);
  const mutatedRow = db
    .prepare('SELECT name FROM schools WHERE id = ?')
    .get(schoolBId) as { name: string };
  assert.equal(mutatedRow.name, 'Mutated School Name');

  // Restore snapshot
  const restore = restoreDatabaseBackup(backup.filename, 'owner@davetimi.com');
  assert.equal(restore.integrityOk, true);

  const restoredRow = getDb()
    .prepare('SELECT name FROM schools WHERE id = ?')
    .get(schoolBId) as { name: string };
  assert.equal(restoredRow.name, 'Beta High School');
});

test('Owner direct school provisioning and optional open self-registration create working Founding Admin accounts', async () => {
  // 1. Platform Owner creates a school + Founding Admin directly
  const ownerCreate = await api('/api/owner/schools', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      schoolName: 'Direct Provisioned Academy',
      country: 'Nigeria',
      city: 'Ibadan',
      contactEmail: 'hello@directacademy.edu',
      customCode: 'DT-DIRECT99',
      initialStatus: 'active',
      initialSessionName: '2026/2027 Session',
      adminFullName: 'Bolanle Adewale',
      adminEmail: 'bolanle@directacademy.edu',
      adminPassword: 'DirectPassword2026',
    },
  });
  assert.equal(ownerCreate.status, 201);
  const directSchool = ownerCreate.json.school as { id: string; code: string; status: string };
  assert.equal(directSchool.code, 'DT-DIRECT99');
  assert.equal(directSchool.status, 'active');

  // Founding Admin created by Owner can immediately log in via school portal
  const directLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: {
      schoolCode: directSchool.code,
      email: 'bolanle@directacademy.edu',
      password: 'DirectPassword2026',
    },
  });
  assert.equal(directLogin.status, 200);
  assert.ok(directLogin.cookie);

  // 2. Owner disables access code gate so schools can self-register openly
  const settingsGet = await api('/api/owner/settings', { cookie: ownerCookie });
  assert.equal(settingsGet.status, 200);
  const currentSettings = settingsGet.json as {
    allowPublicSchoolRegistration: boolean;
    requireAccessCodeForSchoolRegistration: boolean;
    requireSchoolVerificationBanner: boolean;
    sessionTtlHours: number;
  };
  assert.equal(currentSettings.requireAccessCodeForSchoolRegistration, true);

  const disableGate = await api('/api/owner/settings', {
    method: 'PUT',
    cookie: ownerCookie,
    body: {
      allowPublicSchoolRegistration: currentSettings.allowPublicSchoolRegistration,
      requireAccessCodeForSchoolRegistration: false,
      requireSchoolVerificationBanner: currentSettings.requireSchoolVerificationBanner,
      sessionTtlHours: currentSettings.sessionTtlHours,
    },
  });
  assert.equal(disableGate.status, 200);

  const publicInfoOpen = await api('/api/public/info');
  assert.equal(publicInfoOpen.json.requireAccessCodeForSchoolRegistration, false);

  // 3. School self-registers without an access code and gets an auto-generated DT-XXXXXX code
  const openReg = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      schoolName: 'Open Self-Service High',
      country: 'Nigeria',
      city: 'Port Harcourt',
      contactEmail: 'admin@openself.edu',
      adminFullName: 'Chidi Nwosu',
      adminEmail: 'chidi@openself.edu',
      adminPassword: 'OpenPassword2026',
      initialSessionName: '2026/2027 Session',
    },
  });
  assert.equal(openReg.status, 201);
  assert.ok(openReg.cookie);
  const openSchool = openReg.json.school as { code: string; status: string };
  assert.match(openSchool.code, /^DT-[A-Z0-9]+$/);

  const openSchoolCheck = await api('/api/school/overview', { cookie: openReg.cookie! });
  assert.equal(openSchoolCheck.status, 200);

  // 4. Re-enable access code gate and verify missing accessCode is rejected again
  const reenableGate = await api('/api/owner/settings', {
    method: 'PUT',
    cookie: ownerCookie,
    body: {
      allowPublicSchoolRegistration: currentSettings.allowPublicSchoolRegistration,
      requireAccessCodeForSchoolRegistration: true,
      requireSchoolVerificationBanner: currentSettings.requireSchoolVerificationBanner,
      sessionTtlHours: currentSettings.sessionTtlHours,
    },
  });
  assert.equal(reenableGate.status, 200);

  const blockedWithoutCode = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      schoolName: 'Gate Restored Academy',
      country: 'Nigeria',
      city: 'Kano',
      contactEmail: 'office@gaterestored.edu',
      adminFullName: 'Musa Bello',
      adminEmail: 'musa@gaterestored.edu',
      adminPassword: 'GatePassword2026',
    },
  });
  assert.equal(blockedWithoutCode.status, 400);
});

