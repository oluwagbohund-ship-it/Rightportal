import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-p711-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_BACKUP_DIR = path.join(tmpDir, 'backups');
process.env.FILE_STORAGE_DIR = path.join(tmpDir, 'storage');
delete process.env.GEMINI_API_KEY;
delete process.env.SMTP_HOST;

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
  return { res, status: res.status, json, rawText: text, cookie: extractSessionCookie(res) };
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

test('Phases 7-11 integration: Comms, Timetable Conflicts, Public Website + Admission Intake, AI Core Honest State, Owner Operations', async () => {
  // 1. Bootstrap Platform Owner & register School
  const boot = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'David Oluwagbohun',
      email: 'owner@davetimi.test',
      password: 'OwnerPassword123',
    },
  });
  assert.equal(boot.status, 201);
  const ownerCookie = boot.cookie!;

  const issueRes = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Crestview International College' },
  });
  assert.equal(issueRes.status, 201);
  const schoolCode = (issueRes.json.accessCode as { code: string }).code;

  const reg = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolCode,
      schoolName: 'Crestview International College',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'info@crestview.edu.ng',
      adminFullName: 'Dr. Femi Balogun',
      adminEmail: 'admin@crestview.edu.ng',
      adminPassword: 'Password123',
      initialSessionName: '2026/2027',
    },
  });
  assert.equal(reg.status, 201);
  const adminCookie = reg.cookie!;
  const schoolId = reg.json.school.id;

  // Owner verifies school via Phase 11 Verification Queue
  const queue = await api('/api/owner/verification-queue', { cookie: ownerCookie });
  assert.equal(queue.status, 200);
  const pendingRow = queue.json.schools.find((s: any) => s.id === schoolId);
  assert.equal(pendingRow.status, 'pending_verification');

  const approve = await api(`/api/owner/verification-queue/${schoolId}/decision`, {
    method: 'POST',
    cookie: ownerCookie,
    body: { decision: 'approve', notes: 'Verified school registration documents.' },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.status, 'active');

  // Setup classes, subjects, teachers, student
  const c1 = await api('/api/school/classes', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'JSS 1', code: 'JSS1', levelOrder: 1, capacity: 40 },
  });
  const c2 = await api('/api/school/classes', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'JSS 2', code: 'JSS2', levelOrder: 2, capacity: 40 },
  });
  const s1 = await api('/api/school/subjects', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'English Studies', code: 'ENG101', category: 'Core' },
  });
  const t1 = await api('/api/school/teachers', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      firstName: 'Ngozi',
      lastName: 'Eze',
      gender: 'Female',
      email: 'ngozi@crestview.edu.ng',
      staffIdNumber: 'CR-T01',
      employmentDate: '2026-01-10',
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  const stu = await api('/api/school/students', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      firstName: 'Chidi',
      lastName: 'Nwosu',
      dateOfBirth: '2013-03-11',
      gender: 'Male',
      admissionDate: '2026-09-01',
      studentEmail: 'chidi@crestview.edu.ng',
      currentClassId: c1.json.class.id,
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  const tchCookie = (
    await api('/api/auth/school/login', {
      method: 'POST',
      body: { schoolCode, email: 'ngozi@crestview.edu.ng', password: 'Password123' },
    })
  ).cookie!;
  const stuCookie = (
    await api('/api/auth/school/login', {
      method: 'POST',
      body: { schoolCode, email: 'chidi@crestview.edu.ng', password: 'Password123' },
    })
  ).cookie!;

  // === PHASE 7: COMMUNICATIONS ===
  const annRes = await api('/api/school/communications/announcements', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      title: 'Term Resumption Briefing',
      body: 'Classes begin Monday at 8:00 AM sharp.',
      audienceScope: 'school',
      priority: 'important',
      status: 'published',
    },
  });
  assert.equal(annRes.status, 201);

  const stuAnns = await api('/api/school/communications/announcements', { cookie: stuCookie });
  assert.equal(stuAnns.status, 200);
  assert.equal(stuAnns.json.announcements.length, 1);

  const readAck = await api(`/api/school/communications/announcements/${annRes.json.announcement.id}/read`, {
    method: 'POST',
    cookie: stuCookie,
  });
  assert.equal(readAck.status, 200);

  const receipts = await api(`/api/school/communications/announcements/${annRes.json.announcement.id}/receipts`, {
    cookie: adminCookie,
  });
  assert.equal(receipts.json.receipts.length, 1);

  // Delivery logs must honestly show email & fcm as not_configured when unconfigured
  const deliveryLogs = await api('/api/school/communications/delivery-logs', { cookie: adminCookie });
  assert.equal(deliveryLogs.status, 200);
  assert.ok(deliveryLogs.json.logs.some((l: any) => l.channel === 'in_app' && l.status === 'delivered'));
  assert.ok(deliveryLogs.json.logs.some((l: any) => l.channel === 'fcm' && l.status === 'not_configured'));

  // === PHASE 8: TIMETABLE & CONFLICT ENGINE ===
  const rmRes = await api('/api/school/timetable/rooms', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Room 101', code: 'R101', building: 'Main Block', roomType: 'classroom', capacity: 45 },
  });
  assert.equal(rmRes.status, 201);

  const ttSettings = await api('/api/school/timetable/settings', { cookie: adminCookie });
  const teachingPeriod = ttSettings.json.periods.find((p: any) => p.is_break === 0);
  const breakPeriod = ttSettings.json.periods.find((p: any) => p.is_break === 1);
  assert.ok(teachingPeriod && breakPeriod);

  const tt1 = await api('/api/school/timetable/timetables', {
    method: 'POST',
    cookie: adminCookie,
    body: { classId: c1.json.class.id, title: 'JSS 1 Weekly Timetable' },
  });
  const tt2 = await api('/api/school/timetable/timetables', {
    method: 'POST',
    cookie: adminCookie,
    body: { classId: c2.json.class.id, title: 'JSS 2 Weekly Timetable' },
  });
  assert.equal(tt1.status, 201);
  assert.equal(tt2.status, 201);

  // Valid slot on Monday Period 1
  const slotOk = await api(`/api/school/timetable/timetables/${tt1.json.timetable.id}/slots`, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      dayOfWeek: 'Monday',
      periodId: teachingPeriod.id,
      subjectId: s1.json.subject.id,
      teacherId: t1.json.teacher.id,
      roomId: rmRes.json.room.id,
    },
  });
  assert.equal(slotOk.status, 201);

  // Break-period rejection (409)
  const breakSlot = await api(`/api/school/timetable/timetables/${tt1.json.timetable.id}/slots`, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      dayOfWeek: 'Monday',
      periodId: breakPeriod.id,
      subjectId: s1.json.subject.id,
    },
  });
  assert.equal(breakSlot.status, 409);

  // Teacher & room conflict rejection across JSS 2 (409)
  const clashSlot = await api(`/api/school/timetable/timetables/${tt2.json.timetable.id}/slots`, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      dayOfWeek: 'Monday',
      periodId: teachingPeriod.id,
      subjectId: s1.json.subject.id,
      teacherId: t1.json.teacher.id,
      roomId: rmRes.json.room.id,
    },
  });
  assert.equal(clashSlot.status, 409);

  await api(`/api/school/timetable/timetables/${tt1.json.timetable.id}/publish`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'published' },
  });

  const stuSched = await api('/api/school/timetable/my-schedule', { cookie: stuCookie });
  assert.equal(stuSched.status, 200);
  assert.equal(stuSched.json.slots.length, 1);

  // === PHASE 9: SCHOOL PUBLIC WEBSITE & ONLINE ADMISSIONS ===
  const overviewWeb = await api('/api/school/website/overview', { cookie: adminCookie });
  assert.equal(overviewWeb.status, 200);
  const slug = overviewWeb.json.school.slug;

  const updWeb = await api('/api/school/website/settings', {
    method: 'PUT',
    cookie: adminCookie,
    body: {
      isPublished: true,
      themePreset: 'classic_navy',
      primaryColor: '#1E3A8A',
      accentColor: '#2563EB',
      heroTitle: 'Crestview International College',
      heroSubtitle: 'Shaping future leaders with modern technology.',
      aboutContent: 'Founded to advance science and leadership.',
      principalName: 'Dr. Femi Balogun',
      principalTitle: 'Principal',
      principalMessage: 'Welcome to our digital campus.',
      academicsSummary: 'Junior and Senior Secondary STEM & Humanities.',
      admissionsIntro: 'Apply online for 2026/2027 intake.',
      admissionsOpen: true,
      contactHours: 'Mon - Fri 8:00 AM - 4:00 PM',
    },
  });
  assert.equal(updWeb.status, 200);

  const pubSite = await api(`/api/public/schools/${slug}`);
  assert.equal(pubSite.status, 200);
  assert.equal(pubSite.json.school.name, 'Crestview International College');

  const pubAdm = await api(`/api/public/schools/${slug}/admissions`, {
    method: 'POST',
    body: {
      applicantFirstName: 'Amaka',
      applicantLastName: 'Obi',
      dateOfBirth: '2014-02-14',
      gender: 'Female',
      desiredClassId: c1.json.class.id,
      guardianName: 'Chief Obi',
      guardianPhone: '08091112222',
      guardianRelationship: 'Father',
    },
  });
  assert.equal(pubAdm.status, 201);
  assert.ok(pubAdm.json.applicationReference);

  // Verify application appears inside School Admin Admissions
  const adminAdms = await api('/api/school/admissions', { cookie: adminCookie });
  assert.equal(adminAdms.status, 200);
  assert.ok(adminAdms.json.applications.some((a: any) => a.applicant_first_name === 'Amaka'));

  // === PHASE 10: DT AI CORE HONEST STATE & SQL ANALYTICS ===
  const aiOverview = await api('/api/school/ai/overview', { cookie: adminCookie });
  assert.equal(aiOverview.status, 200);
  assert.equal(aiOverview.json.geminiStatus.configured, false);
  assert.equal(aiOverview.json.analytics.counts.students, 1);

  const aiQuery = await api('/api/school/ai/assistant', {
    method: 'POST',
    cookie: tchCookie,
    body: { prompt: 'Summarize class attendance and student counts.', moduleDomain: 'academic_insights' },
  });
  assert.equal(aiQuery.status, 200);
  assert.equal(aiQuery.json.providerStatus, 'inactive_no_key');
  assert.equal(aiQuery.json.answer, null);

  // === PHASE 11: OWNER ANALYTICS & SYSTEM HEALTH ===
  const ownerAnalytics = await api('/api/owner/analytics', { cookie: ownerCookie });
  assert.equal(ownerAnalytics.status, 200);
  assert.equal(ownerAnalytics.json.totals.publishedWebsites, 1);

  const health = await api('/api/owner/system-health', { cookie: ownerCookie });
  assert.equal(health.status, 200);
  assert.equal(health.json.database.ok, true);
  assert.equal(health.json.integrations.geminiAi.configured, false);

  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.foreignKeyViolations, 0);
  void stu;
});
