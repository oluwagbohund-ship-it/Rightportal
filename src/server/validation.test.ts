import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapOwnerSchema,
  contactInquirySchema,
  createAcademicSessionSchema,
  createSchoolAccessCodeSchema,
  createSchoolMemberSchema,
  createSchoolNotificationSchema,
  openRegisterSchoolSchema,
  ownerCreateSchoolSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchoolSchema,
  restoreBackupSchema,
  schoolLoginSchema,
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

test('registerSchoolSchema requires accessCode and validates institutional fields', () => {
  const missingCode = registerSchoolSchema.safeParse({
    schoolName: 'Rightec International School',
    country: 'Nigeria',
    city: 'Lagos',
    contactEmail: 'admin@rightec.edu',
    adminFullName: 'Adaeze Okafor',
    adminEmail: 'adaeze@rightec.edu',
    adminPassword: 'Password123',
  });
  assert.equal(missingCode.success, false);

  const missingName = registerSchoolSchema.safeParse({
    accessCode: 'DT-7K9M2P',
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
    accessCode: 'DT-7K9M2P',
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

  assert.equal(
    schoolLoginSchema.safeParse({
      email: 'admin@rightec.edu',
      password: 'Password123',
    }).success,
    false,
  );
  assert.equal(
    schoolLoginSchema.safeParse({
      schoolCode: 'DT-7K9M2P',
      email: 'admin@rightec.edu',
      password: 'Password123',
    }).success,
    true,
  );
  assert.equal(
    createSchoolAccessCodeSchema.safeParse({
      intendedSchoolName: 'Rightec International School',
      customCode: 'bad code!',
    }).success,
    false,
  );
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

test('openRegisterSchoolSchema and ownerCreateSchoolSchema validate direct and open school onboarding', () => {
  const openValid = openRegisterSchoolSchema.safeParse({
    schoolName: 'Horizon Academy',
    country: 'Nigeria',
    city: 'Abuja',
    contactEmail: 'admin@horizon.edu',
    adminFullName: 'Tunde Bakare',
    adminEmail: 'tunde@horizon.edu',
    adminPassword: 'Password123',
  });
  assert.equal(openValid.success, true);

  const openWeakPass = openRegisterSchoolSchema.safeParse({
    schoolName: 'Horizon Academy',
    country: 'Nigeria',
    city: 'Abuja',
    contactEmail: 'admin@horizon.edu',
    adminFullName: 'Tunde Bakare',
    adminEmail: 'tunde@horizon.edu',
    adminPassword: 'short',
  });
  assert.equal(openWeakPass.success, false);

  const ownerValid = ownerCreateSchoolSchema.safeParse({
    customCode: 'DT-DIRECT01',
    initialStatus: 'active',
    schoolName: 'Summit College',
    country: 'Ghana',
    city: 'Accra',
    contactEmail: 'office@summit.edu',
    adminFullName: 'Kwame Mensah',
    adminEmail: 'kwame@summit.edu',
    adminPassword: 'Password123',
  });
  assert.equal(ownerValid.success, true);

  const ownerBadStatus = ownerCreateSchoolSchema.safeParse({
    initialStatus: 'suspended',
    schoolName: 'Summit College',
    country: 'Ghana',
    city: 'Accra',
    contactEmail: 'office@summit.edu',
    adminFullName: 'Kwame Mensah',
    adminEmail: 'kwame@summit.edu',
    adminPassword: 'Password123',
  });
  assert.equal(ownerBadStatus.success, false);
});

