import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapOwnerSchema,
  contactInquirySchema,
  createAcademicSessionSchema,
  createSchoolMemberSchema,
  createSchoolNotificationSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchoolSchema,
  restoreBackupSchema,
  uploadFileSchema,
} from './validation.ts';

test('bootstrapOwnerSchema enforces strong password rules', () => {
  const weak = bootstrapOwnerSchema.safeParse({
    fullName: 'David Oluwagbohun',
    email: 'owner@davetimi.com',
    password: 'lowercaseonly',
  });
  assert.equal(weak.success, false);

  const valid = bootstrapOwnerSchema.safeParse({
    fullName: 'David Oluwagbohun',
    email: 'owner@davetimi.com',
    password: 'PlatformOwner2026',
  });
  assert.equal(valid.success, true);
});

test('registerSchoolSchema validates required institutional fields', () => {
  const missingName = registerSchoolSchema.safeParse({
    schoolName: 'A',
    country: 'Nigeria',
    city: 'Lagos',
    contactEmail: 'info@school.edu',
    adminFullName: 'Adaeze Okafor',
    adminEmail: 'adaeze@school.edu',
    adminPassword: 'Password123',
  });
  assert.equal(missingName.success, false);

  const valid = registerSchoolSchema.safeParse({
    schoolName: 'Rightec International School',
    country: 'Nigeria',
    city: 'Lagos',
    contactEmail: 'admin@rightec.edu',
    adminFullName: 'Adaeze Okafor',
    adminEmail: 'adaeze@rightec.edu',
    adminPassword: 'Password123',
    initialSessionName: '2026/2027 Academic Session',
  });
  assert.equal(valid.success, true);
});

test('createAcademicSessionSchema enforces endDate after startDate', () => {
  const invalidDates = createAcademicSessionSchema.safeParse({
    name: '2026/2027 Session',
    term: 'First Term',
    startDate: '2026-09-14',
    endDate: '2026-09-01',
  });
  assert.equal(invalidDates.success, false);

  const validDates = createAcademicSessionSchema.safeParse({
    name: '2026/2027 Session',
    term: 'First Term',
    startDate: '2026-09-14',
    endDate: '2026-12-18',
    isCurrent: true,
  });
  assert.equal(validDates.success, true);
});

test('createSchoolMemberSchema allows only valid school roles', () => {
  const invalidRole = createSchoolMemberSchema.safeParse({
    fullName: 'Test User',
    email: 'test@school.edu',
    password: 'Password123',
    roleCode: 'platform_owner',
  });
  assert.equal(invalidRole.success, false);

  const validTeacher = createSchoolMemberSchema.safeParse({
    fullName: 'Samuel Adeyemi',
    email: 'samuel@school.edu',
    password: 'Password123',
    roleCode: 'teacher',
    title: 'Senior Mathematics Teacher',
  });
  assert.equal(validTeacher.success, true);
});

test('contactInquirySchema requires meaningful message length', () => {
  const tooShort = contactInquirySchema.safeParse({
    fullName: 'Jane',
    email: 'jane@school.edu',
    subject: 'Demo',
    message: 'Hi',
  });
  assert.equal(tooShort.success, false);
});

test('passwordReset schemas validate environment, token length, and password strength', () => {
  assert.equal(
    passwordResetRequestSchema.safeParse({ email: 'user@school.edu', environment: 'invalid' })
      .success,
    false,
  );
  assert.equal(
    passwordResetRequestSchema.safeParse({ email: 'user@school.edu', environment: 'school' })
      .success,
    true,
  );
  assert.equal(
    passwordResetConfirmSchema.safeParse({ token: 'short', newPassword: 'Password123' }).success,
    false,
  );
  assert.equal(
    passwordResetConfirmSchema.safeParse({
      token: 'a'.repeat(32),
      newPassword: 'onlyletters',
    }).success,
    false,
  );
  assert.equal(
    passwordResetConfirmSchema.safeParse({
      token: 'a'.repeat(32),
      newPassword: 'ValidPass2026',
    }).success,
    true,
  );
});

test('uploadFileSchema and createSchoolNotificationSchema reject invalid categories and scopes', () => {
  assert.equal(
    uploadFileSchema.safeParse({
      category: 'executable_script',
      fileName: 'bad.exe',
      mimeType: 'application/octet-stream',
      contentBase64: 'AAAA',
    }).success,
    false,
  );
  assert.equal(
    createSchoolNotificationSchema.safeParse({
      scope: 'platform',
      title: 'Forbidden',
      body: 'School admin cannot publish platform-wide notices',
    }).success,
    false,
  );
});

test('restoreBackupSchema enforces safe filename format and explicit boolean confirmation', () => {
  assert.equal(
    restoreBackupSchema.safeParse({
      filename: '../evil.sqlite',
      confirmRestore: true,
    }).success,
    false,
  );
  assert.equal(
    restoreBackupSchema.safeParse({
      filename: 'dt_edtech_backup_2026-01-01.sqlite',
      confirmRestore: false,
    }).success,
    false,
  );
  assert.equal(
    restoreBackupSchema.safeParse({
      filename: 'dt_edtech_backup_2026-01-01.sqlite',
      confirmRestore: true,
    }).success,
    true,
  );
});
