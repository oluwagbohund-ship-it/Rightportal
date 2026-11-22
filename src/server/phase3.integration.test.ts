import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-p3-'));
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
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
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
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/school', schoolRouter);

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let alphaAdminCookie = '';
let betaAdminCookie = '';
let ownerCookie = '';
let assignedTeacherCookie = '';
let unassignedTeacherCookie = '';
let studentAliceCookie = '';
let parentAliceCookie = '';

let sessionId = '';
let termId = '';
let jss1Id = '';
let jss2Id = '';
let mathId = '';
let engId = '';
let aliceId = '';
let bobId = '';
let compCa1Id = '';
let compCa2Id = '';
let compExamId = '';
let computedResultId = '';

test('Phase 3 Setup: Register two schools, bootstrap owner, create classes, subjects, faculty, students, and guardian', async () => {
  const regA = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      schoolName: 'Alpha Collegiate',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'alpha@school.edu',
      adminFullName: 'Alpha Admin',
      adminEmail: 'admin@alpha.edu',
      adminPassword: 'Password123',
      initialSessionName: '2026/2027 Session',
    },
  });
  assert.equal(regA.status, 201);
  alphaAdminCookie = regA.cookie ?? '';

  const regB = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      schoolName: 'Beta Grammar',
      country: 'Ghana',
      city: 'Accra',
      contactEmail: 'beta@school.edu',
      adminFullName: 'Beta Admin',
      adminEmail: 'admin@beta.edu',
      adminPassword: 'Password123',
      initialSessionName: '2026/2027 Session',
    },
  });
  assert.equal(regB.status, 201);
  betaAdminCookie = regB.cookie ?? '';

  const boot = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'David Oluwagbohun',
      email: 'owner@davetimi.com',
      password: 'OwnerPassword123',
    },
  });
  assert.equal(boot.status, 201);
  ownerCookie = boot.cookie ?? '';

  // Create JSS 1 & JSS 2
  const c1 = await api('/api/school/classes', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { name: 'JSS 1', code: 'JSS1', levelOrder: 1, capacity: 40, initialArms: [{ name: 'A', capacity: 40 }] },
  });
  assert.equal(c1.status, 201);
  jss1Id = (c1.json.class as { id: string }).id;

  const c2 = await api('/api/school/classes', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { name: 'JSS 2', code: 'JSS2', levelOrder: 2, capacity: 40 },
  });
  assert.equal(c2.status, 201);
  jss2Id = (c2.json.class as { id: string }).id;

  // Create Mathematics & English
  const s1 = await api('/api/school/subjects', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { name: 'Mathematics', code: 'MTH101', category: 'Core' },
  });
  assert.equal(s1.status, 201);
  mathId = (s1.json.subject as { id: string }).id;

  const s2 = await api('/api/school/subjects', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { name: 'English Language', code: 'ENG101', category: 'Core' },
  });
  assert.equal(s2.status, 201);
  engId = (s2.json.subject as { id: string }).id;

  await api(`/api/school/subjects/${mathId}/classes`, {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { classId: jss1Id, isCompulsory: true, weeklyPeriods: 5 },
  });
  await api(`/api/school/subjects/${engId}/classes`, {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { classId: jss1Id, isCompulsory: true, weeklyPeriods: 5 },
  });

  // Assigned teacher & Unassigned teacher
  const t1 = await api('/api/school/teachers', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      gender: 'Female',
      email: 'ada@alpha.edu',
      staffIdNumber: 'STF-001',
      employmentDate: '2026-01-10',
      assignedSubjectIds: [mathId, engId],
      assignedClassIds: [jss1Id],
      portalAccount: { createLogin: true, password: 'TeacherPass123' },
    },
  });
  assert.equal(t1.status, 201);

  const t2 = await api('/api/school/teachers', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      firstName: 'Alan',
      lastName: 'Turing',
      gender: 'Male',
      email: 'alan@alpha.edu',
      staffIdNumber: 'STF-002',
      employmentDate: '2026-01-10',
      assignedSubjectIds: [],
      assignedClassIds: [jss2Id],
      portalAccount: { createLogin: true, password: 'TeacherPass123' },
    },
  });
  assert.equal(t2.status, 201);

  const loginT1 = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'ada@alpha.edu', password: 'TeacherPass123' },
  });
  assert.equal(loginT1.status, 200);
  assignedTeacherCookie = loginT1.cookie ?? '';

  const loginT2 = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'alan@alpha.edu', password: 'TeacherPass123' },
  });
  assert.equal(loginT2.status, 200);
  unassignedTeacherCookie = loginT2.cookie ?? '';

  // Create Students Alice & Bob
  const stu1 = await api('/api/school/students', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      firstName: 'Alice',
      lastName: 'Newton',
      dateOfBirth: '2014-05-12',
      gender: 'Female',
      admissionDate: '2026-09-01',
      studentEmail: 'alice@alpha.edu',
      currentClassId: jss1Id,
      portalAccount: { createLogin: true, password: 'StudentPass123' },
    },
  });
  assert.equal(stu1.status, 201);
  aliceId = (stu1.json.student as { id: string }).id;

  const stu2 = await api('/api/school/students', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      firstName: 'Bob',
      lastName: 'Maxwell',
      dateOfBirth: '2014-03-22',
      gender: 'Male',
      admissionDate: '2026-09-01',
      currentClassId: jss1Id,
    },
  });
  assert.equal(stu2.status, 201);
  bobId = (stu2.json.student as { id: string }).id;

  const par = await api('/api/school/parents', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      fullName: 'Mrs Newton',
      email: 'parent.newton@alpha.edu',
      phone: '+2348011112222',
      initialLink: {
        studentId: aliceId,
        relationship: 'Mother',
        isPrimaryGuardian: true,
        canViewAcademicRecords: true,
      },
      portalAccount: { createLogin: true, password: 'ParentPass123' },
    },
  });
  assert.equal(par.status, 201);

  const loginAlice = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'alice@alpha.edu', password: 'StudentPass123' },
  });
  studentAliceCookie = loginAlice.cookie ?? '';

  const loginParent = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'parent.newton@alpha.edu', password: 'ParentPass123' },
  });
  parentAliceCookie = loginParent.cookie ?? '';
});

test('Phase 3 Sessions, Terms (overlap check), Calendar Events & Subject Enrollments', async () => {
  const sesRes = await api('/api/school/academics/sessions', { cookie: alphaAdminCookie });
  assert.equal(sesRes.status, 200);
  const sessions = sesRes.json.sessions as Array<{ id: string }>;
  const terms = sesRes.json.terms as Array<{ id: string; academic_session_id: string }>;
  sessionId = sessions[0].id;
  termId = terms[0].id;

  // Overlapping term blocked by default settings
  const overlapTerm = await api('/api/school/academics/terms', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      name: 'Overlapping Term',
      termOrder: 2,
      startDate: '2026-09-10',
      endDate: '2026-12-20',
    },
  });
  assert.equal(overlapTerm.status, 409);

  // Non-overlapping Second Term succeeds
  const secondTerm = await api('/api/school/academics/terms', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      name: 'Second Term',
      termOrder: 2,
      startDate: '2027-09-01',
      endDate: '2027-12-15',
      examStartDate: '2027-12-01',
      examEndDate: '2027-12-10',
      resultPublicationDate: '2027-12-15',
    },
  });
  assert.equal(secondTerm.status, 201);

  // Create calendar event
  const ev = await api('/api/school/academics/events', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      academicTermId: termId,
      title: 'Mid-Term Assessment Week',
      eventType: 'assessment',
      startDate: '2026-10-15',
      endDate: '2026-10-19',
    },
  });
  assert.equal(ev.status, 201);

  // Bulk enroll Alice & Bob into Math & English
  const enroll = await api('/api/school/academics/enrollments/bulk', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      academicTermId: termId,
      classId: jss1Id,
      studentIds: [aliceId, bobId],
      subjectIds: [mathId, engId],
      isCompulsory: true,
    },
  });
  assert.equal(enroll.status, 201);
  assert.equal(enroll.json.createdCount, 4);

  // Duplicate bulk enroll skips instead of duplicating
  const enrollDup = await api('/api/school/academics/enrollments/bulk', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      academicTermId: termId,
      classId: jss1Id,
      studentIds: [aliceId, bobId],
      subjectIds: [mathId, engId],
    },
  });
  assert.equal(enrollDup.status, 201);
  assert.equal(enrollDup.json.skippedCount, 4);
});

test('Phase 3 Assessment Weight Validation, Grading Scale Validation, Teacher Authorization & Score Entry', async () => {
  const compRes = await api('/api/school/academics/assessment-components', { cookie: alphaAdminCookie });
  assert.equal(compRes.status, 200);
  const comps = compRes.json.effectiveComponents as Array<{ id: string; name: string; category_id: string }>;
  assert.equal(comps.length, 3);
  compCa1Id = comps[0].id;
  compCa2Id = comps[1].id;
  compExamId = comps[2].id;

  // Attempt to exceed 100% weight in school-wide scope
  const badComp = await api('/api/school/academics/assessment-components', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      categoryId: comps[0].category_id,
      name: 'Extra Quiz',
      maxScore: 10,
      weightPercentage: 10,
    },
  });
  assert.equal(badComp.status, 400);

  // Attempt invalid overlapping grading scale
  const badScale = await api('/api/school/academics/grading-systems', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      name: 'Invalid Scale',
      bands: [
        { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent', gradePoint: 4, isPassing: true },
        { minScore: 0, maxScore: 75, grade: 'F', remark: 'Fail', gradePoint: 0, isPassing: false },
      ],
    },
  });
  assert.equal(badScale.status, 400);

  // Unassigned teacher (Alan Turing) CANNOT enter scores for JSS 1 Math
  const unauthScore = await api('/api/school/academics/scores/batch', {
    method: 'POST',
    cookie: unassignedTeacherCookie,
    body: {
      academicTermId: termId,
      classId: jss1Id,
      subjectId: mathId,
      entries: [{ studentId: aliceId, componentId: compCa1Id, score: 15, status: 'scored' }],
    },
  });
  assert.equal(unauthScore.status, 403);

  // Out-of-bounds score (> 20) rejected
  const overScore = await api('/api/school/academics/scores/batch', {
    method: 'POST',
    cookie: assignedTeacherCookie,
    body: {
      academicTermId: termId,
      classId: jss1Id,
      subjectId: mathId,
      entries: [{ studentId: aliceId, componentId: compCa1Id, score: 25, status: 'scored' }],
    },
  });
  assert.equal(overScore.status, 400);

  // Assigned teacher enters valid scores for Alice & Bob across Math & English
  const saveMath = await api('/api/school/academics/scores/batch', {
    method: 'POST',
    cookie: assignedTeacherCookie,
    body: {
      academicTermId: termId,
      classId: jss1Id,
      subjectId: mathId,
      submitForReview: true,
      entries: [
        { studentId: aliceId, componentId: compCa1Id, score: 18, status: 'scored' },
        { studentId: aliceId, componentId: compCa2Id, score: 17, status: 'scored' },
        { studentId: aliceId, componentId: compExamId, score: 52, status: 'scored' }, // Total = 87 (A)
        { studentId: bobId, componentId: compCa1Id, score: 10, status: 'scored' },
        { studentId: bobId, componentId: compCa2Id, score: 8, status: 'scored' },
        { studentId: bobId, componentId: compExamId, score: 20, status: 'scored' }, // Total = 38 (F)
      ],
    },
  });
  assert.equal(saveMath.status, 200);

  const saveEng = await api('/api/school/academics/scores/batch', {
    method: 'POST',
    cookie: assignedTeacherCookie,
    body: {
      academicTermId: termId,
      classId: jss1Id,
      subjectId: engId,
      submitForReview: true,
      entries: [
        { studentId: aliceId, componentId: compCa1Id, score: 15, status: 'scored' },
        { studentId: aliceId, componentId: compCa2Id, score: 15, status: 'scored' },
        { studentId: aliceId, componentId: compExamId, score: 46, status: 'scored' }, // Total = 76 (A)
        { studentId: bobId, componentId: compCa1Id, score: 12, status: 'scored' },
        { studentId: bobId, componentId: compCa2Id, score: 10, status: 'scored' },
        { studentId: bobId, componentId: compExamId, score: 30, status: 'scored' }, // Total = 52 (C)
      ],
    },
  });
  assert.equal(saveEng.status, 200);

  // Teacher records behavioral traits, attendance, & comment for Alice
  const extras = await api('/api/school/academics/report-extras', {
    method: 'POST',
    cookie: assignedTeacherCookie,
    body: {
      academicTermId: termId,
      studentId: aliceId,
      attendance: { daysOpened: 60, daysPresent: 58, daysAbsent: 2, lateCount: 1 },
      traits: [{ traitCategory: 'affective', traitName: 'Punctuality', rating: 5 }],
      teacherComment: 'Exemplary analytical reasoning throughout the term.',
    },
  });
  assert.equal(extras.status, 200);
});

test('Phase 3 Computation, Unpublished Visibility Lock, Publication, PDF Report Card, Broadsheets, & Amendments', async () => {
  // Compute results on server
  const compute = await api('/api/school/academics/results/compute', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { academicTermId: termId, classId: jss1Id },
  });
  assert.equal(compute.status, 200);
  const summary = compute.json.summary as { studentsProcessed: number; computedSubjectsCount: number };
  assert.equal(summary.studentsProcessed, 2);
  assert.equal(summary.computedSubjectsCount, 4);

  // Verify unpublished results are STRICTLY HIDDEN from Student & Parent
  const stuBefore = await api('/api/school/academics/student/published-results', {
    cookie: studentAliceCookie,
  });
  assert.equal(stuBefore.status, 200);
  assert.equal((stuBefore.json.publications as unknown[]).length, 0);

  const reportBefore = await api(`/api/school/academics/report-cards/${aliceId}?academicTermId=${termId}`, {
    cookie: studentAliceCookie,
  });
  assert.equal(reportBefore.status, 403);

  const parentBefore = await api('/api/school/academics/parent/wards-results', {
    cookie: parentAliceCookie,
  });
  assert.equal(parentBefore.status, 200);
  assert.equal((parentBefore.json.publications as unknown[]).length, 0);

  // Publish results
  const pub = await api('/api/school/academics/results/publish', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { academicTermId: termId, classId: jss1Id, action: 'publish' },
  });
  assert.equal(pub.status, 200);

  // Student & Parent now see published results
  const stuAfter = await api('/api/school/academics/student/published-results', {
    cookie: studentAliceCookie,
  });
  assert.equal(stuAfter.status, 200);
  const stuPubs = stuAfter.json.publications as Array<{ average_score: number; class_position: number }>;
  assert.equal(stuPubs.length, 1);
  assert.equal(stuPubs[0].average_score, 81.5); // (87 + 76) / 2
  assert.equal(stuPubs[0].class_position, 1);

  const parentAfter = await api('/api/school/academics/parent/wards-results', {
    cookie: parentAliceCookie,
  });
  assert.equal(parentAfter.status, 200);
  assert.equal((parentAfter.json.publications as unknown[]).length, 1);

  // Download Student Report Card PDF
  const pdfRes = await api(
    `/api/school/academics/report-cards/${aliceId}/pdf?academicTermId=${termId}`,
    { cookie: studentAliceCookie },
  );
  assert.equal(pdfRes.status, 200);
  assert.ok(pdfRes.rawText.startsWith('%PDF-1.4'));

  // Download Class Broadsheet CSV & PDF
  const csvRes = await api(
    `/api/school/academics/broadsheet/export.csv?academicTermId=${termId}&classId=${jss1Id}`,
    { cookie: alphaAdminCookie },
  );
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.rawText.includes('Alice Newton'));

  const bsPdf = await api(
    `/api/school/academics/broadsheet/export.pdf?academicTermId=${termId}&classId=${jss1Id}`,
    { cookie: alphaAdminCookie },
  );
  assert.equal(bsPdf.status, 200);
  assert.ok(bsPdf.rawText.startsWith('%PDF-1.4'));

  // Direct score edit after publication MUST BE BLOCKED (409)
  const silentEdit = await api('/api/school/academics/scores/batch', {
    method: 'POST',
    cookie: assignedTeacherCookie,
    body: {
      academicTermId: termId,
      classId: jss1Id,
      subjectId: mathId,
      entries: [{ studentId: aliceId, componentId: compExamId, score: 59, status: 'scored' }],
    },
  });
  assert.equal(silentEdit.status, 409);

  // Authorized post-publication amendment succeeds & logs audit record
  const adminResults = await api(
    `/api/school/academics/results?academicTermId=${termId}&classId=${jss1Id}&studentId=${aliceId}`,
    { cookie: alphaAdminCookie },
  );
  const subResults = adminResults.json.subjectResults as Array<{ id: string; subject_id: string }>;
  computedResultId = subResults.find((r) => r.subject_id === mathId)!.id;

  const amend = await api('/api/school/academics/results/amend', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      computedResultId,
      componentId: compExamId,
      newScore: 56,
      newStatus: 'scored',
      reason: 'Script remarking verified an uncounted 4-mark bonus question.',
    },
  });
  assert.equal(amend.status, 200);

  const stuAmended = await api('/api/school/academics/student/published-results', {
    cookie: studentAliceCookie,
  });
  const amendedPub = (stuAmended.json.publications as Array<{ average_score: number; status: string }>)[0];
  assert.equal(amendedPub.status, 'amended');
  assert.equal(amendedPub.average_score, 83.5); // Math now 91, Eng 76 => 83.5
});

test('Phase 3 Promotion Recommendation + Explicit Admin Approval & Cross-Tenant Isolation', async () => {
  const gen = await api('/api/school/academics/promotions/recommendations/generate', {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: {
      academicSessionId: sessionId,
      academicTermId: termId,
      fromClassId: jss1Id,
      targetToClassId: jss2Id,
    },
  });
  assert.equal(gen.status, 201);

  const recsRes = await api(`/api/school/academics/promotions/recommendations?academicSessionId=${sessionId}`, {
    cookie: alphaAdminCookie,
  });
  const recs = recsRes.json.recommendations as Array<{
    id: string;
    student_id: string;
    recommendation: string;
    approval_status: string;
  }>;
  const aliceRec = recs.find((r) => r.student_id === aliceId)!;
  const bobRec = recs.find((r) => r.student_id === bobId)!;
  assert.equal(aliceRec.recommendation, 'recommended_promote');
  assert.equal(aliceRec.approval_status, 'pending');
  assert.equal(bobRec.recommendation, 'requires_review');

  // Verify Alice is STILL in JSS 1 before explicit approval
  const stuBeforePromote = await api(`/api/school/students/${aliceId}`, { cookie: alphaAdminCookie });
  assert.equal((stuBeforePromote.json.student as { current_class_id: string }).current_class_id, jss1Id);

  // Explicit Admin approval promotes Alice to JSS 2
  const approve = await api(`/api/school/academics/promotions/recommendations/${aliceRec.id}/decide`, {
    method: 'POST',
    cookie: alphaAdminCookie,
    body: { decision: 'approved', toClassId: jss2Id, notes: 'Approved for next academic session' },
  });
  assert.equal(approve.status, 200);

  const stuAfterPromote = await api(`/api/school/students/${aliceId}`, { cookie: alphaAdminCookie });
  assert.equal((stuAfterPromote.json.student as { current_class_id: string }).current_class_id, jss2Id);

  // Cross-tenant isolation: School Beta cannot read Alpha student history or report card
  const crossHistory = await api(`/api/school/academics/students/${aliceId}/academic-history`, {
    cookie: betaAdminCookie,
  });
  assert.equal(crossHistory.status, 404);

  const crossReport = await api(`/api/school/academics/report-cards/${aliceId}?academicTermId=${termId}`, {
    cookie: betaAdminCookie,
  });
  assert.equal(crossReport.status, 404);

  // Platform Owner cannot enter school academic endpoint
  const ownerBlocked = await api(`/api/school/academics/results?academicTermId=${termId}`, {
    cookie: ownerCookie,
  });
  assert.equal(ownerBlocked.status, 403);

  // Database integrity + all 4 migrations clean
  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.foreignKeyViolations, 0);
  assert.ok(integrity.migrations.length >= 4);
});
