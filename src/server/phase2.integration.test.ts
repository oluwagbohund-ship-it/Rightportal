import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

// Configure isolated temporary directories before importing DB-bound modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-p2-'));
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

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
  } = {},
) {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
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

before(async () => {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use('/api/school/files', express.json({ limit: '8mb' }));
  app.use('/api/school/profile/logo', express.json({ limit: '8mb' }));
  app.use('/api/school/students', express.json({ limit: '8mb' }));
  app.use('/api/school/teachers', express.json({ limit: '8mb' }));
  app.use('/api/school/admissions', express.json({ limit: '8mb' }));
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

let schoolACookie = '';
let schoolBCookie = '';
let ownerCookie = '';
let schoolACode = '';
let schoolBCode = '';
let classJss1Id = '';
let classJss2Id = '';
let armJss1AId = '';
let armJss2AId = '';
let archivedClassId = '';
let teacherId = '';
let teacherCookie = '';
let subjectMathId = '';
let student1Id = '';
let student1Cookie = '';
let parent1Id = '';
let parent1Cookie = '';

test('Phase 2 Setup: Bootstrap Owner, register two isolated school tenants', async () => {
  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  assert.ok(integrity.migrations.some((m) => m.version.startsWith('003_')));

  const boot = await api('/api/auth/workers/bootstrap', {
    method: 'POST',
    body: {
      fullName: 'David Oluwagbohun',
      email: 'owner@davetimi.com',
      password: 'OwnerStrongPassword2026',
    },
  });
  assert.equal(boot.status, 201);
  ownerCookie = boot.cookie!;

  const codeA = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Horizon Scholars College' },
  });
  assert.equal(codeA.status, 201);
  schoolACode = (codeA.json.accessCode as { code: string }).code;

  const codeB = await api('/api/owner/school-access-codes', {
    method: 'POST',
    cookie: ownerCookie,
    body: { intendedSchoolName: 'Summit Crest Academy' },
  });
  assert.equal(codeB.status, 201);
  schoolBCode = (codeB.json.accessCode as { code: string }).code;

  const regA = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolACode,
      schoolName: 'Horizon Scholars College',
      country: 'Nigeria',
      city: 'Lagos',
      contactEmail: 'admin@horizon.edu',
      adminFullName: 'Horizon Principal',
      adminEmail: 'principal@horizon.edu',
      adminPassword: 'HorizonPassword2026',
      initialSessionName: '2026/2027 Session',
    },
  });
  assert.equal(regA.status, 201);
  schoolACookie = regA.cookie!;

  const regB = await api('/api/public/register-school', {
    method: 'POST',
    body: {
      accessCode: schoolBCode,
      schoolName: 'Summit Crest Academy',
      country: 'Ghana',
      city: 'Accra',
      contactEmail: 'admin@summit.edu',
      adminFullName: 'Summit Principal',
      adminEmail: 'principal@summit.edu',
      adminPassword: 'SummitPassword2026',
    },
  });
  assert.equal(regB.status, 201);
  schoolBCookie = regB.cookie!;
});

test('School Profile, Logo upload, and Admission Number Format settings persist per tenant', async () => {
  const putProfile = await api('/api/school/profile', {
    method: 'PUT',
    cookie: schoolACookie,
    body: {
      name: 'Horizon Scholars International College',
      contactEmail: 'office@horizon.edu',
      phone: '+2348011112222',
      country: 'Nigeria',
      state: 'Lagos State',
      city: 'Ikeja',
      physicalAddress: '14 Admiralty Way, Ikeja',
      registrationNumber: 'LAG-EDU-9942',
      website: 'https://horizon.edu',
      motto: 'Excellence Through Knowledge',
      description: 'Comprehensive multi-level institution.',
      schoolType: 'Combined K-12',
      schoolOwnership: 'Private',
      establishedYear: 2012,
    },
  });
  assert.equal(putProfile.status, 200);
  assert.equal((putProfile.json.profile as { registration_number: string }).registration_number, 'LAG-EDU-9942');

  const logoRes = await api('/api/school/profile/logo', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      category: 'school_logo',
      fileName: 'horizon-crest.png',
      mimeType: 'image/png',
      contentBase64: VALID_PNG_BASE64,
    },
  });
  assert.equal(logoRes.status, 201);
  assert.ok((logoRes.json.logoFileId as string).startsWith('fil_'));

  const settingsRes = await api('/api/school/settings', {
    method: 'PUT',
    cookie: schoolACookie,
    body: {
      admissionNumberPrefix: 'HSC',
      admissionNumberFormat: '{PREFIX}-{YEAR}-{SEQ}',
      admissionNextSeq: 100,
      applicationRefPrefix: 'HAPP',
    },
  });
  assert.equal(settingsRes.status, 200);
  assert.match(
    (settingsRes.json.settings as { previewAdmissionNumber: string }).previewAdmissionNumber,
    /^HSC-\d{4}-0100$/,
  );
});

test('Classes creation, class-arm uniqueness, and archived class protection', async () => {
  const c1 = await api('/api/school/classes', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      name: 'JSS 1',
      code: 'JSS1',
      levelOrder: 7,
      section: 'Junior Secondary',
      capacity: 60,
      initialArms: [{ name: 'Gold', capacity: 30, room: 'Block B-101' }],
    },
  });
  assert.equal(c1.status, 201);
  const cls1 = c1.json.class as { id: string; arms: Array<{ id: string; name: string }> };
  classJss1Id = cls1.id;
  armJss1AId = cls1.arms[0]!.id;

  // Duplicate class+arm blocked
  const dupArm = await api(`/api/school/classes/${classJss1Id}/arms`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { name: 'gold', capacity: 25 },
  });
  assert.equal(dupArm.status, 409);

  // Second class with initial arm
  const c2 = await api('/api/school/classes', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      name: 'JSS 2',
      code: 'JSS2',
      levelOrder: 8,
      section: 'Junior Secondary',
      capacity: 60,
      initialArms: [{ name: 'Silver', capacity: 30 }],
    },
  });
  assert.equal(c2.status, 201);
  const cls2 = c2.json.class as { id: string; arms: Array<{ id: string }> };
  classJss2Id = cls2.id;
  armJss2AId = cls2.arms[0]!.id;

  // Archived class cannot receive students
  const cArch = await api('/api/school/classes', {
    method: 'POST',
    cookie: schoolACookie,
    body: { name: 'Legacy Class', levelOrder: 99, capacity: 20 },
  });
  assert.equal(cArch.status, 201);
  archivedClassId = (cArch.json.class as { id: string }).id;

  const archPatch = await api(`/api/school/classes/${archivedClassId}`, {
    method: 'PATCH',
    cookie: schoolACookie,
    body: {
      name: 'Legacy Class',
      code: '',
      levelOrder: 99,
      section: 'General',
      description: '',
      capacity: 20,
      status: 'archived',
    },
  });
  assert.equal(archPatch.status, 200);
});

test('Teacher registration, Subject creation, class-subject & teacher-subject assignments', async () => {
  const mathRes = await api('/api/school/subjects', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      name: 'Mathematics',
      code: 'MTH101',
      category: 'Core',
      isCompulsoryDefault: true,
    },
  });
  assert.equal(mathRes.status, 201);
  subjectMathId = (mathRes.json.subject as { id: string }).id;

  const linkClassSub = await api(`/api/school/subjects/${subjectMathId}/classes`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { classId: classJss1Id, isCompulsory: true, weeklyPeriods: 5 },
  });
  assert.equal(linkClassSub.status, 201);

  const tchRes = await api('/api/school/teachers', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      firstName: 'Kemi',
      lastName: 'Balogun',
      gender: 'Female',
      email: 'kemi.balogun@horizon.edu',
      phone: '+2348099887766',
      staffIdNumber: 'STF-001',
      employmentDate: '2026-09-01',
      qualifications: 'B.Sc, PGDE Mathematics',
      specialization: 'Mathematics',
      employmentStatus: 'active',
      assignedSubjectIds: [subjectMathId],
      assignedClassIds: [classJss1Id],
      portalAccount: { createLogin: true, password: 'TeacherPassword2026' },
    },
  });
  assert.equal(tchRes.status, 201);
  teacherId = (tchRes.json.teacher as { id: string }).id;

  // Also assign teacher specifically to JSS 1 for Mathematics
  const assignSubTch = await api(`/api/school/subjects/${subjectMathId}/teachers`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { teacherId, classId: classJss1Id, armId: armJss1AId },
  });
  assert.equal(assignSubTch.status, 201);

  // Teacher logs in and verifies workspace
  const tchLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'kemi.balogun@horizon.edu', password: 'TeacherPassword2026' },
  });
  assert.equal(tchLogin.status, 200);
  teacherCookie = tchLogin.cookie!;
});

test('Student registration, duplicate admission number block, archived class rejection, profile edit, and non-destructive promotion history', async () => {
  // Reject archived class assignment
  const badClassStu = await api('/api/school/students', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      firstName: 'Blocked',
      lastName: 'Student',
      dateOfBirth: '2014-05-12',
      gender: 'Male',
      admissionDate: '2026-09-05',
      currentClassId: archivedClassId,
    },
  });
  assert.equal(badClassStu.status, 400);

  // Register Student 1 with auto admission number and portal login
  const stuRes = await api('/api/school/students', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      firstName: 'Chidi',
      middleName: 'Oluwaseun',
      lastName: 'Nwachukwu',
      dateOfBirth: '2014-03-18',
      gender: 'Male',
      admissionDate: '2026-09-05',
      studentEmail: 'chidi.student@horizon.edu',
      studentPhone: '+2348033334444',
      nationality: 'Nigerian',
      stateOfOrigin: 'Anambra',
      currentClassId: classJss1Id,
      currentArmId: armJss1AId,
      portalAccount: { createLogin: true, password: 'StudentPassword2026' },
    },
  });
  assert.equal(stuRes.status, 201);
  const stu = stuRes.json.student as { id: string; admission_number: string };
  student1Id = stu.id;
  assert.equal(stu.admission_number, 'HSC-2026-0100');

  // Duplicate admission number within same school must be blocked
  const dupAdmRes = await api('/api/school/students', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      firstName: 'Duplicate',
      lastName: 'Candidate',
      dateOfBirth: '2014-04-01',
      gender: 'Female',
      admissionNumber: 'HSC-2026-0100',
      admissionDate: '2026-09-05',
      currentClassId: classJss1Id,
    },
  });
  assert.equal(dupAdmRes.status, 409);

  // Update student profile
  const editRes = await api(`/api/school/students/${student1Id}`, {
    method: 'PATCH',
    cookie: schoolACookie,
    body: {
      firstName: 'Chidi',
      middleName: 'Oluwaseun',
      lastName: 'Nwachukwu',
      dateOfBirth: '2014-03-18',
      gender: 'Male',
      admissionNumber: 'HSC-2026-0100',
      admissionDate: '2026-09-05',
      studentEmail: 'chidi.student@horizon.edu',
      studentPhone: '+2348033334444',
      residentialAddress: '22 Allen Avenue, Ikeja',
      nationality: 'Nigerian',
      stateOfOrigin: 'Anambra',
      previousSchool: 'St. Jude Primary',
      currentClassId: classJss1Id,
      currentArmId: armJss1AId,
      emergencyContactName: 'Mrs. Nwachukwu',
      emergencyContactPhone: '+2348055556666',
      emergencyContactRelationship: 'Mother',
    },
  });
  assert.equal(editRes.status, 200);

  // Teacher sees student while student is in JSS 1
  const tchWsBefore = await api('/api/school/teacher-workspace', { cookie: teacherCookie });
  assert.equal(tchWsBefore.status, 200);
  assert.ok(
    (tchWsBefore.json.permittedStudents as Array<{ id: string }>).some((s) => s.id === student1Id),
  );

  // Promote student to JSS 2 Silver — preserves JSS 1 Gold in history!
  const promoRes = await api(`/api/school/students/${student1Id}/promote`, {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      toClassId: classJss2Id,
      toArmId: armJss2AId,
      actionType: 'promotion',
      effectiveDate: '2027-09-01',
      notes: 'Annual promotion after passing JSS 1 examinations',
    },
  });
  assert.equal(promoRes.status, 201);

  const profileAfterPromo = await api(`/api/school/students/${student1Id}`, {
    cookie: schoolACookie,
  });
  assert.equal(profileAfterPromo.status, 200);
  const history = profileAfterPromo.json.history as Array<{
    action_type: string;
    from_class_name: string | null;
    to_class_name: string;
  }>;
  assert.equal(history.length, 2);
  assert.equal(history[0]!.action_type, 'promotion');
  assert.equal(history[0]!.from_class_name, 'JSS 1');
  assert.equal(history[0]!.to_class_name, 'JSS 2');
  assert.equal(history[1]!.action_type, 'initial_placement');

  // Student logs in and sees their own enrollment & promotion history
  const stuLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'chidi.student@horizon.edu', password: 'StudentPassword2026' },
  });
  assert.equal(stuLogin.status, 200);
  student1Cookie = stuLogin.cookie!;

  const stuWs = await api('/api/school/student-workspace', { cookie: student1Cookie });
  assert.equal(stuWs.status, 200);
  assert.equal((stuWs.json.studentRecord as { id: string }).id, student1Id);
  assert.equal((stuWs.json.promotionHistory as unknown[]).length, 2);
});

test('Parent registration, guardian linking, and verified Parent ward-only isolation', async () => {
  const parRes = await api('/api/school/parents', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      fullName: 'Grace Nwachukwu',
      email: 'grace.parent@horizon.edu',
      phone: '+2348055556666',
      residentialAddress: '22 Allen Avenue, Ikeja',
      occupation: 'Civil Engineer',
      initialLink: {
        studentId: student1Id,
        relationship: 'Mother',
        isPrimaryGuardian: true,
        isEmergencyContact: true,
        canPickup: true,
        canViewAcademicRecords: true,
        canReceiveNotifications: true,
      },
      portalAccount: { createLogin: true, password: 'ParentPassword2026' },
    },
  });
  assert.equal(parRes.status, 201);
  parent1Id = (parRes.json.parent as { id: string }).id;

  // Duplicate guardian link to same student blocked
  const dupLink = await api(`/api/school/parents/${parent1Id}/guardians`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { studentId: student1Id, relationship: 'Mother' },
  });
  assert.equal(dupLink.status, 409);

  // Parent logs in and sees ONLY linked ward
  const parLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { schoolCode: schoolACode, email: 'grace.parent@horizon.edu', password: 'ParentPassword2026' },
  });
  assert.equal(parLogin.status, 200);
  parent1Cookie = parLogin.cookie!;

  const parWs = await api('/api/school/parent-workspace', { cookie: parent1Cookie });
  assert.equal(parWs.status, 200);
  const wards = parWs.json.wards as Array<{ student_id: string }>;
  assert.equal(wards.length, 1);
  assert.equal(wards[0]!.student_id, student1Id);
});

test('Admissions workflow: approval does not auto-create student until explicit conversion; rejection blocks conversion', async () => {
  // 1. Submit two admission applications
  const app1Res = await api('/api/school/admissions', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      applicantFirstName: 'Zainab',
      lastNameFallback: '',
      applicantLastName: 'Mohammed',
      dateOfBirth: '2014-07-10',
      gender: 'Female',
      desiredClassId: classJss1Id,
      desiredArmId: armJss1AId,
      guardianName: 'Ibrahim Mohammed',
      guardianPhone: '+2348077778888',
      guardianRelationship: 'Father',
    },
  });
  assert.equal(app1Res.status, 201);
  const app1Id = (app1Res.json.application as { id: string }).id;

  const app2Res = await api('/api/school/admissions', {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      applicantFirstName: 'Tolu',
      applicantLastName: 'Ojo',
      dateOfBirth: '2014-08-20',
      gender: 'Male',
      desiredClassId: classJss1Id,
      guardianName: 'Seyi Ojo',
      guardianPhone: '+2348066667777',
    },
  });
  assert.equal(app2Res.status, 201);
  const app2Id = (app2Res.json.application as { id: string }).id;

  // Reject converting unapproved application
  const convertBeforeApprove = await api(`/api/school/admissions/${app1Id}/convert`, {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      admissionDate: '2026-09-10',
      classId: classJss1Id,
      armId: armJss1AId,
    },
  });
  assert.equal(convertBeforeApprove.status, 400);

  // Approve Application 1 -> still NOT in students table yet!
  const approveRes = await api(`/api/school/admissions/${app1Id}/review`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { decision: 'approve', reviewNotes: 'Entrance assessment passed.' },
  });
  assert.equal(approveRes.status, 200);

  const studentsBeforeConvert = await api('/api/school/students', { cookie: schoolACookie });
  assert.equal((studentsBeforeConvert.json.pagination as { total: number }).total, 1);

  // Explicitly convert approved Application 1 into Student
  const convertRes = await api(`/api/school/admissions/${app1Id}/convert`, {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      admissionDate: '2026-09-10',
      classId: classJss1Id,
      armId: armJss1AId,
      createGuardianRecord: true,
    },
  });
  assert.equal(convertRes.status, 201);
  assert.ok((convertRes.json.studentId as string).startsWith('stu_'));

  const studentsAfterConvert = await api('/api/school/students', { cookie: schoolACookie });
  assert.equal((studentsAfterConvert.json.pagination as { total: number }).total, 2);

  // Reject Application 2 -> cannot be converted
  const rejectRes = await api(`/api/school/admissions/${app2Id}/review`, {
    method: 'POST',
    cookie: schoolACookie,
    body: { decision: 'reject', reviewNotes: 'Age threshold not met for JSS 1.' },
  });
  assert.equal(rejectRes.status, 200);

  const convertRejected = await api(`/api/school/admissions/${app2Id}/convert`, {
    method: 'POST',
    cookie: schoolACookie,
    body: {
      admissionDate: '2026-09-10',
      classId: classJss1Id,
    },
  });
  assert.equal(convertRejected.status, 400);
});

test('Cross-tenant isolation and Role-Based Access Control enforcement', async () => {
  // School B Admin cannot read, edit, or delete School A students, teachers, classes, parents, or admissions
  const crossStudent = await api(`/api/school/students/${student1Id}`, { cookie: schoolBCookie });
  assert.equal(crossStudent.status, 404);

  const crossTeacher = await api(`/api/school/teachers/${teacherId}`, { cookie: schoolBCookie });
  assert.equal(crossTeacher.status, 404);

  const crossClass = await api(`/api/school/classes/${classJss1Id}`, { cookie: schoolBCookie });
  assert.equal(crossClass.status, 404);

  const crossParent = await api(`/api/school/parents/${parent1Id}`, { cookie: schoolBCookie });
  assert.equal(crossParent.status, 404);

  // Cross-tenant guardian linking blocked (School B Admin cannot link School A student to a parent)
  const summitParent = await api('/api/school/parents', {
    method: 'POST',
    cookie: schoolBCookie,
    body: { fullName: 'Summit Guardian', phone: '+233201112222' },
  });
  assert.equal(summitParent.status, 201);
  const summitParentId = (summitParent.json.parent as { id: string }).id;

  const crossLink = await api(`/api/school/parents/${summitParentId}/guardians`, {
    method: 'POST',
    cookie: schoolBCookie,
    body: { studentId: student1Id, relationship: 'Father' },
  });
  assert.equal(crossLink.status, 404);

  // Teacher, Student, and Parent cannot access School Admin management routes (403)
  assert.equal((await api('/api/school/students', { cookie: teacherCookie })).status, 403);
  assert.equal((await api('/api/school/students', { cookie: student1Cookie })).status, 403);
  assert.equal((await api('/api/school/students', { cookie: parent1Cookie })).status, 403);
  assert.equal((await api('/api/school/admissions', { cookie: teacherCookie })).status, 403);
  assert.equal(
    (
      await api('/api/school/classes', {
        method: 'POST',
        cookie: student1Cookie,
        body: { name: 'Hack Class' },
      })
    ).status,
    403,
  );

  // Platform Owner (workers environment) cannot access School Tenant student endpoints
  const ownerOnSchoolStudents = await api('/api/school/students', { cookie: ownerCookie });
  assert.equal(ownerOnSchoolStudents.status, 403);

  // Overview reflects real database counts for Horizon Scholars
  const overview = await api('/api/school/overview', { cookie: schoolACookie });
  assert.equal(overview.status, 200);
  const counts = overview.json.counts as Record<string, number>;
  assert.equal(counts.students, 2);
  assert.equal(counts.teachers, 1);
  assert.equal(counts.parents, 2);
  assert.equal(counts.classes, 2);
  assert.equal(counts.subjects, 1);
});
