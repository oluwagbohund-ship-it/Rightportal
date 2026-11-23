import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-p46-'));
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

test('Phases 4, 5, 6 end-to-end integration: Attendance + QR, Finance + Proof Verification + Reversal, CBT + Essay + Phase 3 Sync', async () => {
  // 0. Bootstrap Platform Owner & issue School Access Codes
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

  const issueA = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Horizon Academy Lagos' },
  });
  assert.equal(issueA.status, 201);
  const schoolACode = (issueA.json.accessCode as { code: string }).code;

  const issueB = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Summit School Abuja' },
  });
  assert.equal(issueB.status, 201);
  const schoolBCode = (issueB.json.accessCode as { code: string }).code;

  // 1. Register School A & School B (for tenant isolation tests)
  const regA = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolACode,
      schoolName: 'Horizon Academy Lagos',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'office@horizon.edu.ng',
      adminFullName: 'Adaeze Principal',
      adminEmail: 'principal@horizon.edu.ng',
      adminPassword: 'Password123',
      initialSessionName: '2026/2027',
    },
  });
  assert.equal(regA.status, 201);
  const adminACookie = regA.cookie!;

  const regB = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolBCode,
      schoolName: 'Summit School Abuja',
      country: 'Nigeria',
      city: 'Abuja',
      contactEmail: 'office@summit.edu.ng',
      adminFullName: 'Bala Principal',
      adminEmail: 'principal@summit.edu.ng',
      adminPassword: 'Password123',
      initialSessionName: '2026/2027',
    },
  });
  assert.equal(regB.status, 201);
  const adminBCookie = regB.cookie!;

  // Fetch active session and term for School A
  const sessionsRes = await api('/api/school/sessions', { cookie: adminACookie });
  assert.equal(sessionsRes.status, 200);
  const termsRes = await api('/api/school/academics/terms', { cookie: adminACookie });
  assert.equal(termsRes.status, 200);
  const activeSession = sessionsRes.json.sessions[0];
  const activeTerm = termsRes.json.terms.find((t: any) => t.is_current === 1) ?? termsRes.json.terms[0];
  assert.ok(activeSession && activeTerm);

  const clsRes = await api('/api/school/classes', {
    method: 'POST',
    cookie: adminACookie,
    body: { name: 'SS 1', code: 'SS1', levelOrder: 10, section: 'Senior Secondary', capacity: 40 },
  });
  assert.equal(clsRes.status, 201);
  const classAId = clsRes.json.class.id;

  const subRes = await api('/api/school/subjects', {
    method: 'POST',
    cookie: adminACookie,
    body: { name: 'Mathematics', code: 'MTH101', category: 'Core' },
  });
  assert.equal(subRes.status, 201);
  const subjectAId = subRes.json.subject.id;

  // Create Teacher, Student, Parent with portal accounts
  const tchRes = await api('/api/school/teachers', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      firstName: 'Kemi',
      lastName: 'Adeyemi',
      gender: 'Female',
      email: 'kemi.teacher@horizon.edu.ng',
      staffIdNumber: 'TCH-001',
      employmentDate: '2025-09-01',
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  assert.equal(tchRes.status, 201);
  const teacherAId = tchRes.json.teacher.id;

  const assignClassTch = await api(`/api/school/classes/${classAId}/teachers`, {
    method: 'POST',
    cookie: adminACookie,
    body: { teacherId: teacherAId, roleLabel: 'Class Teacher' },
  });
  assert.equal(assignClassTch.status, 201);

  const assignSubjTch = await api(`/api/school/subjects/${subjectAId}/teachers`, {
    method: 'POST',
    cookie: adminACookie,
    body: { teacherId: teacherAId, classId: classAId },
  });
  assert.equal(assignSubjTch.status, 201);

  const stuRes = await api('/api/school/students', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      firstName: 'Tunde',
      lastName: 'Okafor',
      dateOfBirth: '2011-05-12',
      gender: 'Male',
      admissionDate: '2026-09-01',
      studentEmail: 'tunde.student@horizon.edu.ng',
      currentClassId: classAId,
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  assert.equal(stuRes.status, 201);
  const studentAId = stuRes.json.student.id;

  const parRes = await api('/api/school/parents', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      fullName: 'Mrs. Okafor',
      email: 'mrs.okafor@horizon.edu.ng',
      phone: '08030001111',
      initialLink: { studentId: studentAId, relationship: 'Mother' },
      portalAccount: { createLogin: true, password: 'Password123' },
    },
  });
  assert.equal(parRes.status, 201);

  // Login Teacher, Student, Parent
  const tchLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'kemi.teacher@horizon.edu.ng', password: 'Password123' },
  });
  assert.equal(tchLogin.status, 200);
  const teacherCookie = tchLogin.cookie!;

  const stuLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'tunde.student@horizon.edu.ng', password: 'Password123' },
  });
  assert.equal(stuLogin.status, 200);
  const studentCookie = stuLogin.cookie!;

  const parLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'mrs.okafor@horizon.edu.ng', password: 'Password123' },
  });
  assert.equal(parLogin.status, 200);
  const parentCookie = parLogin.cookie!;

  // === PHASE 4: ATTENDANCE & QR CHECK-IN ===
  const attSettings = await api('/api/school/attendance/overview', { cookie: adminACookie });
  assert.equal(attSettings.status, 200);

  const attMark = await api('/api/school/attendance/register', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      classId: classAId,
      academicTermId: activeTerm.id,
      attendanceDate: '2026-10-05',
      sessionLabel: 'Morning Roll Call',
      entries: [{ studentId: studentAId, status: 'absent', remarks: 'Not at desk' }],
    },
  });
  assert.equal(attMark.status, 201);

  const hist = await api(`/api/school/attendance/history?studentId=${studentAId}`, { cookie: teacherCookie });
  assert.equal(hist.status, 200);
  assert.equal(hist.json.records.length, 1);
  const recordId = hist.json.records[0].id;

  // Teacher requests correction -> Admin approves
  const corrReq = await api('/api/school/attendance/corrections', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      attendanceRecordId: recordId,
      requestedStatus: 'late',
      reason: 'Student arrived with bus delay slip.',
    },
  });
  assert.equal(corrReq.status, 201);

  const corrApprove = await api(`/api/school/attendance/corrections/${corrReq.json.id}`, {
    method: 'PATCH',
    cookie: adminACookie,
    body: { decision: 'approved', reviewNotes: 'Verified with transport officer' },
  });
  assert.equal(corrApprove.status, 200);

  // QR generation + Student QR scan + duplicate block
  const qrGen = await api('/api/school/attendance/qr', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      classId: classAId,
      academicTermId: activeTerm.id,
      title: 'SS 1 Morning QR Check-In',
      attendanceDate: '2026-10-06',
      ttlMinutes: 20,
    },
  });
  assert.equal(qrGen.status, 201);
  assert.ok(qrGen.json.qrDataUrl.startsWith('data:image/png;base64,'));

  const qrScan1 = await api('/api/school/attendance/qr/scan', {
    method: 'POST',
    cookie: studentCookie,
    body: { token: qrGen.json.token },
  });
  assert.equal(qrScan1.status, 201);

  const qrScanDup = await api('/api/school/attendance/qr/scan', {
    method: 'POST',
    cookie: studentCookie,
    body: { token: qrGen.json.token },
  });
  assert.equal(qrScanDup.status, 409);

  // Parent reads ward attendance
  const parAtt = await api('/api/school/parent/attendance', { cookie: parentCookie });
  assert.equal(parAtt.status, 200);
  assert.equal(parAtt.json.wards.length, 1);
  assert.equal(parAtt.json.wards[0].stats.totalMarked, 2);

  // === PHASE 5: FINANCE MANAGEMENT ===
  const catRes = await api('/api/school/finance/categories', {
    method: 'POST',
    cookie: adminACookie,
    body: { name: 'Tuition Fee', code: 'TUITION', description: 'Term tuition charges' },
  });
  assert.equal(catRes.status, 201);

  const structRes = await api('/api/school/finance/structures', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      feeCategoryId: catRes.json.category.id,
      academicSessionId: activeSession.id,
      academicTermId: activeTerm.id,
      classId: classAId,
      name: 'SS1 First Term Tuition',
      amount: 100000,
      dueDate: '2026-10-15',
      isMandatory: true,
    },
  });
  assert.equal(structRes.status, 201);

  const assignFee = await api('/api/school/finance/billing/assign', {
    method: 'POST',
    cookie: adminACookie,
    body: { feeStructureId: structRes.json.structure.id, classId: classAId },
  });
  assert.equal(assignFee.status, 201);
  assert.equal(assignFee.json.createdCount, 1);

  const billingList = await api('/api/school/finance/billing', { cookie: adminACookie });
  const assignmentId = billingList.json.assignments[0].id;

  // Apply 10% merit scholarship -> net amount becomes 90,000
  const schRes = await api('/api/school/finance/scholarships', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      studentId: studentAId,
      feeAssignmentId: assignmentId,
      title: 'Academic Merit 10%',
      discountType: 'percentage',
      value: 10,
      reason: 'Top entrance score',
    },
  });
  assert.equal(schRes.status, 201);

  // Upload payment proof (small valid PNG base64) -> MUST stay pending_verification, NEVER auto-verified
  const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const payRes = await api('/api/school/finance/payments', {
    method: 'POST',
    cookie: adminACookie,
    body: {
      studentId: studentAId,
      feeAssignmentId: assignmentId,
      amountPaid: 40000,
      paymentMethod: 'bank_transfer',
      referenceCode: 'TRF-90881',
      paymentDate: '2026-10-06',
      verifyImmediately: true,
      proofFile: {
        fileName: 'transfer_receipt.png',
        mimeType: 'image/png',
        contentBase64: tinyPngBase64,
      },
    },
  });
  assert.equal(payRes.status, 201);
  assert.equal(payRes.json.payment.status, 'pending_verification');

  // Verify manually -> assignment becomes partial with 50,000 balance
  const verifyRes = await api(`/api/school/finance/payments/${payRes.json.payment.id}/verify`, {
    method: 'PATCH',
    cookie: adminACookie,
    body: { decision: 'verified', notes: 'Confirmed on bank statement' },
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.json.status, 'verified');

  const stuFin = await api('/api/school/student/finance', { cookie: studentCookie });
  assert.equal(stuFin.status, 200);
  assert.equal(stuFin.json.totals.netAmount, 90000);
  assert.equal(stuFin.json.totals.amountPaid, 40000);
  assert.equal(stuFin.json.totals.balanceDue, 50000);

  // Student PDF receipt download works cleanly
  const pdfRes = await fetch(`${baseUrl}/api/school/finance/payments/${payRes.json.payment.id}/receipt.pdf`, {
    headers: { Cookie: studentCookie },
  });
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');

  // Teacher forbidden from accessing school finance overview
  const tchFinBlocked = await api('/api/school/finance/overview', { cookie: teacherCookie });
  assert.equal(tchFinBlocked.status, 403);

  // Cross-tenant admin B blocked from reading School A payment verification
  const crossTenantVerify = await api(`/api/school/finance/payments/${payRes.json.payment.id}/verify`, {
    method: 'PATCH',
    cookie: adminBCookie,
    body: { decision: 'verified' },
  });
  assert.equal(crossTenantVerify.status, 404);

  // === PHASE 6: CBT & CLEAN PHASE 3 RESULTS SYNC ===
  const q1 = await api('/api/school/cbt/questions', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      subjectId: subjectAId,
      classId: classAId,
      questionType: 'mcq',
      difficulty: 'easy',
      topic: 'Algebra',
      questionText: 'What is 5 + 7?',
      options: ['10', '12', '14', '15'],
      correctAnswer: '12',
      marks: 4,
    },
  });
  assert.equal(q1.status, 201);

  const q2 = await api('/api/school/cbt/questions', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      subjectId: subjectAId,
      classId: classAId,
      questionType: 'essay',
      difficulty: 'medium',
      topic: 'Proofs',
      questionText: 'Explain why an even integer plus an even integer is even.',
      marks: 6,
    },
  });
  assert.equal(q2.status, 201);

  // Resolve Phase 3 First CA component for clean CBT -> Results Engine sync
  const componentsRes = await api('/api/school/academics/assessment-components', { cookie: adminACookie });
  const caComponent = componentsRes.json.components.find((c: any) => !c.is_exam);
  assert.ok(caComponent);

  const examRes = await api('/api/school/cbt/exams', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      academicSessionId: activeSession.id,
      academicTermId: activeTerm.id,
      classId: classAId,
      subjectId: subjectAId,
      linkedComponentId: caComponent.id,
      title: 'SS1 Mathematics CA CBT',
      durationMinutes: 30,
      passMarkPercent: 50,
      showResultImmediately: true,
    },
  });
  assert.equal(examRes.status, 201);
  const cbtExamId = examRes.json.exam.id;

  const attachQs = await api(`/api/school/cbt/exams/${cbtExamId}/questions`, {
    method: 'POST',
    cookie: teacherCookie,
    body: { questionIds: [q1.json.question.id, q2.json.question.id] },
  });
  assert.equal(attachQs.status, 200);

  const pubExam = await api(`/api/school/cbt/exams/${cbtExamId}/settings`, {
    method: 'PATCH',
    cookie: teacherCookie,
    body: { status: 'published' },
  });
  assert.equal(pubExam.status, 200);

  // Student sees CBT exam, starts attempt, answers both questions, logs tab event, submits
  const stuCbtList = await api('/api/school/student/cbt', { cookie: studentCookie });
  assert.equal(stuCbtList.status, 200);
  assert.equal(stuCbtList.json.exams.length, 1);

  const startRes = await api(`/api/school/student/cbt/${cbtExamId}/start`, {
    method: 'POST',
    cookie: studentCookie,
  });
  assert.equal(startRes.status, 201);
  const attemptId = startRes.json.attemptId;

  await api(`/api/school/student/cbt/attempts/${attemptId}/answer`, {
    method: 'PUT',
    cookie: studentCookie,
    body: { questionId: q1.json.question.id, answer: '12', isFlagged: false },
  });
  await api(`/api/school/student/cbt/attempts/${attemptId}/answer`, {
    method: 'PUT',
    cookie: studentCookie,
    body: { questionId: q2.json.question.id, answer: '2a + 2b = 2(a+b), divisible by 2.', isFlagged: true },
  });
  await api(`/api/school/student/cbt/attempts/${attemptId}/event`, {
    method: 'POST',
    cookie: studentCookie,
    body: { eventType: 'tab_hidden', detail: 'Switched window briefly' },
  });

  const subCbt = await api(`/api/school/student/cbt/attempts/${attemptId}/submit`, {
    method: 'POST',
    cookie: studentCookie,
  });
  assert.equal(subCbt.status, 200);
  assert.equal(subCbt.json.totals.objectiveScore, 4);

  // Teacher grades essay 5/6 -> total 9/10 = 90%
  const essayGrade = await api('/api/school/cbt/grade-essay', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      attemptId,
      questionId: q2.json.question.id,
      marksAwarded: 5,
      feedback: 'Clear algebraic proof.',
    },
  });
  assert.equal(essayGrade.status, 200);
  assert.equal(essayGrade.json.totals.percentageScore, 90);

  // Admin syncs CBT scores to Phase 3 Results Engine (scales 90% of 20 max_score = 18)
  const syncRes = await api(`/api/school/cbt/exams/${cbtExamId}/sync-results`, {
    method: 'POST',
    cookie: adminACookie,
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.json.syncedCount, 1);

  const db = getDb();
  const syncedScore = db
    .prepare('SELECT score FROM assessment_scores WHERE student_id = ? AND subject_id = ? AND component_id = ?')
    .get(studentAId, subjectAId, caComponent.id) as { score: number } | undefined;
  assert.equal(syncedScore?.score, 18);

  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.foreignKeyViolations, 0);
});
