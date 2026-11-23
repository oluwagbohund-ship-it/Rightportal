import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-idcards-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_BACKUP_DIR = path.join(tmpDir, 'backups');
process.env.FILE_STORAGE_DIR = path.join(tmpDir, 'storage');

const { closeDb, getDb, verifyDatabaseIntegrity } = await import('../db/client.ts');
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
      return val.length > 0 ? firstPart : '';
    }
  }
  return null;
}

async function api(
  routePath: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${routePath}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    json = { raw: text };
  }
  return { res, status: res.status, json, cookie: extractSessionCookie(res) };
}

before(async () => {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/school', schoolRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
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

test('Student Digital ID Cards: Issuance, QR Login, QR Attendance Scanning, Revocation & Tenant Isolation', async () => {
  // 1. Bootstrap Platform Owner and create two isolated schools (School A and School B)
  const boot = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'Owner Root',
      email: 'owner@idcards.test',
      password: 'OwnerPassword123',
    },
  });
  assert.equal(boot.status, 201);
  const ownerCookie = boot.cookie!;

  const codeA = (
    (
      await api('/api/owner/school-access-codes', {
        method: 'POST',
        cookie: ownerCookie,
        body: { intendedSchoolName: 'Beacon High' },
      })
    ).json.accessCode as { code: string }
  ).code;

  const codeB = (
    (
      await api('/api/owner/school-access-codes', {
        method: 'POST',
        cookie: ownerCookie,
        body: { intendedSchoolName: 'Crestwood Academy' },
      })
    ).json.accessCode as { code: string }
  ).code;

  const regA = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: codeA,
      schoolName: 'Beacon High',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'admin@beacon.test',
      adminFullName: 'Admin Beacon',
      adminEmail: 'admin@beacon.test',
      adminPassword: 'Password123',
    },
  });
  assert.equal(regA.status, 201);
  const schoolACode = (regA.json.school as { code: string }).code;

  const regB = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: codeB,
      schoolName: 'Crestwood Academy',
      country: 'Nigeria',
      city: 'Abuja',
      contactEmail: 'admin@crest.test',
      adminFullName: 'Admin Crest',
      adminEmail: 'admin@crest.test',
      adminPassword: 'Password123',
    },
  });
  assert.equal(regB.status, 201);

  const loginA = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'admin@beacon.test', password: 'Password123' },
  });
  assert.equal(loginA.status, 200);
  const adminACookie = loginA.cookie!;

  const loginB = await api('/api/auth/school/login', {
    method: 'POST',
    body: {
      schoolCode: (regB.json.school as { code: string }).code,
      email: 'admin@crest.test',
      password: 'Password123',
    },
  });
  assert.equal(loginB.status, 200);
  const adminBCookie = loginB.cookie!;

  // 2. Create Class JSS1 and Class JSS2, plus a Teacher assigned only to JSS1
  const cls1Res = await api('/api/school/classes', {
    method: 'POST',
    cookie: adminACookie,
    body: { name: 'JSS1', code: 'JSS1', levelOrder: 1, capacity: 40 },
  });
  assert.equal(cls1Res.status, 201);
  const jss1Id = cls1Res.json.class.id as string;

  const cls2Res = await api('/api/school/classes', {
    method: 'POST',
    cookie: adminACookie,
    body: { name: 'JSS2', code: 'JSS2', levelOrder: 2, capacity: 40 },
  });
  assert.equal(cls2Res.status, 201);
  const jss2Id = cls2Res.json.class.id as string;

  const teacherRes = await api('/api/school/teachers', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      firstName: 'Ada',
      lastName: 'Okafor',
      gender: 'Female',
      email: 'ada@beacon.test',
      staffIdNumber: 'STF-001',
      employmentDate: '2026-09-01',
      assignedClassIds: [jss1Id],
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  assert.equal(teacherRes.status, 201);

  const teacherLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'ada@beacon.test', password: 'Password123' },
  });
  assert.equal(teacherLogin.status, 200);
  const teacherCookie = teacherLogin.cookie!;

  // 3. Register Student 1 (with portal login) and Student 2 (without portal login) in JSS1 & JSS2
  const stu1Res = await api('/api/school/students', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      firstName: 'Tolu',
      lastName: 'Balogun',
      gender: 'Male',
      dateOfBirth: '2012-04-12',
      admissionDate: '2026-09-01',
      studentEmail: 'tolu@beacon.test',
      currentClassId: jss1Id,
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  assert.equal(stu1Res.status, 201);
  const stu1Id = stu1Res.json.student.id as string;

  const stu2Res = await api('/api/school/students', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      firstName: 'Chidi',
      lastName: 'Eze',
      gender: 'Male',
      dateOfBirth: '2011-08-19',
      admissionDate: '2026-09-01',
      currentClassId: jss2Id,
    },
  });
  assert.equal(stu2Res.status, 201);
  const stu2Id = stu2Res.json.student.id as string;

  // 4. Bulk issue cards -> issues 2 active Digital ID cards
  const bulkIssue = await api('/api/school/id-cards/bulk-issue', {
    method: 'POST',
    cookie: adminACookie,
    body: { validityDays: 365 },
  });
  assert.equal(bulkIssue.status, 201);
  assert.equal(bulkIssue.json.issuedCount, 2);

  // Admin retrieves Student 1 Digital ID card with QR DataURL & token
  const card1Get = await api(`/api/school/students/${stu1Id}/id-card`, { cookie: adminACookie });
  assert.equal(card1Get.status, 200);
  const card1 = card1Get.json.card;
  assert.equal(card1.status, 'active');
  assert.ok(card1.card_number.startsWith('DT-IDC-'));
  assert.ok(card1.qrToken.startsWith('DTID-'));
  assert.ok(card1.qrDataUrl.startsWith('data:image/png;base64,'));

  // Admin B (other school) must NOT see School A's student ID card
  const crossTenantCard = await api(`/api/school/students/${stu1Id}/id-card`, {
    cookie: adminBCookie,
  });
  assert.equal(crossTenantCard.status, 404);

  // 5. Student 1 signs into School Portal directly via ID Card QR Login
  const qrLogin = await api('/api/auth/school/qr-login', {
    method: 'POST',
    body: { qrToken: card1.qrToken },
  });
  assert.equal(qrLogin.status, 200);
  assert.equal(qrLogin.json.redirectPath, '/dashboard/student');
  const studentCookie = qrLogin.cookie!;
  assert.ok(studentCookie.length > 0);

  // Student fetches their own Digital ID card
  const ownCard = await api('/api/school/student/id-card', { cookie: studentCookie });
  assert.equal(ownCard.status, 200);
  assert.equal(ownCard.json.card.id, card1.id);
  assert.equal(ownCard.json.card.qrToken, card1.qrToken);

  // Student 2 (no linked portal account) gets blocked on QR Login with clear 403
  const card2Get = await api(`/api/school/students/${stu2Id}/id-card`, { cookie: adminACookie });
  const card2 = card2Get.json.card;
  const unlinkedQrLogin = await api('/api/auth/school/qr-login', {
    method: 'POST',
    body: { qrToken: card2.qrToken },
  });
  assert.equal(unlinkedQrLogin.status, 403);

  // Wrong optional School Code blocks QR Login
  const wrongCodeLogin = await api('/api/auth/school/qr-login', {
    method: 'POST',
    body: { qrToken: card1.qrToken, schoolCode: 'WRONG-CODE' },
  });
  assert.equal(wrongCodeLogin.status, 403);

  // 6. Teacher (assigned to JSS1) marks attendance by scanning Student 1's Digital ID Card QR
  const scan1 = await api('/api/school/attendance/id-card-scan', {
    method: 'POST',
    cookie: teacherCookie,
    body: { qrToken: card1.qrToken, attendanceDate: '2026-11-23', markStatus: 'present' },
  });
  assert.equal(scan1.status, 201);
  assert.equal(scan1.json.alreadyMarked, false);
  assert.equal(scan1.json.status, 'present');
  assert.equal(scan1.json.student.cardNumber, card1.card_number);

  // Repeat scan returns alreadyMarked=true safely without throwing 500
  const repeatScan = await api('/api/school/attendance/id-card-scan', {
    method: 'POST',
    cookie: teacherCookie,
    body: { qrToken: card1.qrToken, attendanceDate: '2026-11-23', markStatus: 'present' },
  });
  assert.equal(repeatScan.status, 200);
  assert.equal(repeatScan.json.alreadyMarked, true);

  // Teacher unassigned to JSS2 cannot mark Student 2 via ID Card scan
  const unassignedScan = await api('/api/school/attendance/id-card-scan', {
    method: 'POST',
    cookie: teacherCookie,
    body: { qrToken: card2.qrToken, attendanceDate: '2026-11-23' },
  });
  assert.equal(unassignedScan.status, 403);

  // Cross-school admin cannot scan School A's student ID card
  const crossSchoolScan = await api('/api/school/attendance/id-card-scan', {
    method: 'POST',
    cookie: adminBCookie,
    body: { qrToken: card1.qrToken, attendanceDate: '2026-11-23' },
  });
  assert.equal(crossSchoolScan.status, 404);

  // Verify Student 1 sees their QR attendance record
  const stuAtt = await api('/api/school/student/attendance', { cookie: studentCookie });
  assert.equal(stuAtt.status, 200);
  assert.equal(stuAtt.json.stats.present, 1);
  assert.equal(stuAtt.json.records[0].source, 'qr');

  // 7. Re-issuing (rotating) card revokes old token and activates new token
  const rotateRes = await api(`/api/school/students/${stu1Id}/id-card`, {
    method: 'POST',
    cookie: adminACookie,
    body: { validityDays: 365 },
  });
  assert.equal(rotateRes.status, 201);
  const rotatedCard = rotateRes.json.card;
  assert.notEqual(rotatedCard.qrToken, card1.qrToken);

  // Old QR token is now revoked and rejected on both login and attendance scan
  const oldQrLogin = await api('/api/auth/school/qr-login', {
    method: 'POST',
    body: { qrToken: card1.qrToken },
  });
  assert.equal(oldQrLogin.status, 403);

  const oldQrScan = await api('/api/school/attendance/id-card-scan', {
    method: 'POST',
    cookie: teacherCookie,
    body: { qrToken: card1.qrToken, attendanceDate: '2026-11-23' },
  });
  assert.equal(oldQrScan.status, 403);

  // Revoking new card also disables it immediately
  const revokeRes = await api(`/api/school/id-cards/${rotatedCard.id}/revoke`, {
    method: 'PATCH',
    cookie: adminACookie,
    body: { reason: 'Lost card' },
  });
  assert.equal(revokeRes.status, 200);

  const revokedLogin = await api('/api/auth/school/qr-login', {
    method: 'POST',
    body: { qrToken: rotatedCard.qrToken },
  });
  assert.equal(revokedLogin.status, 403);

  // Database integrity verification
  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.foreignKeyViolations, 0);
});
