import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  schoolCode: z.string().trim().max(32).optional(),
});

export const schoolLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  schoolCode: z
    .string()
    .trim()
    .min(3, 'Unique School Code is required to enter the platform')
    .max(32),
});

export const studentQrLoginSchema = z.object({
  qrToken: z.string().trim().min(10, 'Scan or enter a valid Digital ID Card QR code').max(512),
  schoolCode: z.string().trim().max(32).optional().default(''),
});

export const issueStudentIdCardSchema = z.object({
  validityDays: z.number().int().min(30).max(1825).optional().default(365),
});

export const revokeStudentIdCardSchema = z.object({
  reason: z.string().trim().max(240).optional().default('Revoked by School Administration'),
});

export const scanStudentIdAttendanceSchema = z.object({
  qrToken: z.string().trim().min(10, 'Scan or enter a valid Student ID Card QR code').max(512),
  classId: z.string().trim().max(80).optional().nullable(),
  attendanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date')
    .optional(),
  sessionLabel: z.string().trim().min(2).max(60).optional().default('Morning Roll Call'),
  markStatus: z.enum(['present', 'late']).optional().default('present'),
});

export const verifyAccessCodeSchema = z.object({
  accessCode: z
    .string()
    .trim()
    .min(4, 'Enter the unique code issued by the Platform Owner')
    .max(32),
});

export const createSchoolAccessCodeSchema = z.object({
  intendedSchoolName: z.string().trim().max(140).optional().default(''),
  recipientEmail: z
    .string()
    .trim()
    .email('Enter a valid recipient email')
    .max(160)
    .or(z.literal(''))
    .optional()
    .default(''),
  customCode: z
    .string()
    .trim()
    .min(4, 'Custom code must be at least 4 characters')
    .max(24, 'Custom code must be at most 24 characters')
    .regex(/^[A-Za-z0-9-]+$/, 'Code may contain only letters, numbers, and hyphens')
    .or(z.literal(''))
    .optional()
    .default(''),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional().default(null),
});

export const bootstrapOwnerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Enter a valid email address').max(160),
  password: z
    .string()
    .min(10, 'Owner password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  bootstrapKey: z.string().trim().max(128).optional(),
});

export const registerSchoolSchema = z.object({
  accessCode: z
    .string()
    .trim()
    .min(4, 'A unique Platform Owner access code is required to create a school')
    .max(32),
  schoolName: z.string().trim().min(3, 'School name must be at least 3 characters').max(140),
  country: z.string().trim().min(2, 'Country is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  contactEmail: z.string().trim().email('Enter a valid school contact email').max(160),
  phone: z.string().trim().max(40).optional().default(''),
  adminFullName: z.string().trim().min(2, 'Administrator full name is required').max(120),
  adminEmail: z.string().trim().email('Enter a valid administrator email').max(160),
  adminPassword: z
    .string()
    .min(8, 'Administrator password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  initialSessionName: z.string().trim().max(60).optional(),
});

export const createAcademicSessionSchema = z
  .object({
    name: z.string().trim().min(4, 'Session name is required (e.g. 2026/2027)').max(64),
    term: z.enum(['First Term', 'Second Term', 'Third Term', 'Annual']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD end date'),
    isCurrent: z.boolean().optional().default(false),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export const createSchoolMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  password: z.string().min(8, 'Temporary password must be at least 8 characters').max(128),
  roleCode: z.enum(['school_admin', 'teacher', 'student', 'parent']),
  title: z.string().trim().max(80).optional().default(''),
});

export const updateSchoolMemberStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const updateWorkforceStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateSchoolStatusSchema = z.object({
  status: z.enum(['pending_verification', 'active', 'suspended']),
});

export const createWorkforceMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  roleCode: z.enum(['workforce_admin', 'workforce_support']),
  department: z.string().trim().min(2).max(80),
});

export const updatePlatformSettingsSchema = z.object({
  allowPublicSchoolRegistration: z.boolean(),
  requireSchoolVerificationBanner: z.boolean(),
  sessionTtlHours: z.number().int().min(1).max(168),
});

export const contactInquirySchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  organization: z.string().trim().max(140).optional().default(''),
  subject: z.string().trim().min(3, 'Subject is required').max(140),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(160),
  environment: z.enum(['workers', 'school']),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(20, 'Invalid recovery token').max(256),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const uploadFileSchema = z.object({
  category: z.enum([
    'school_logo',
    'teacher_profile_picture',
    'student_profile_picture',
    'student_document',
    'staff_document',
    'school_document',
  ]),
  fileName: z.string().trim().min(1, 'File name is required').max(160),
  mimeType: z.string().trim().min(3, 'MIME type is required').max(120),
  contentBase64: z.string().min(4, 'File payload is required').max(8_000_000),
  subjectUserId: z.string().trim().max(80).optional(),
  schoolId: z.string().trim().max(80).optional(),
});

export const createSchoolNotificationSchema = z.object({
  scope: z.enum(['school', 'teacher', 'student', 'parent', 'direct']),
  targetUserId: z.string().trim().max(80).optional(),
  title: z.string().trim().min(3, 'Title is required').max(140),
  body: z.string().trim().min(5, 'Notification message is required').max(2000),
  severity: z.enum(['info', 'notice', 'urgent']).default('info'),
});

export const createPlatformNotificationSchema = z.object({
  scope: z.enum(['platform', 'school']),
  schoolId: z.string().trim().max(80).optional(),
  title: z.string().trim().min(3, 'Title is required').max(140),
  body: z.string().trim().min(5, 'Notification message is required').max(2000),
  severity: z.enum(['info', 'notice', 'urgent']).default('info'),
});

export const registerDeviceTokenSchema = z.object({
  platform: z.enum(['web', 'android', 'ios']),
  deviceToken: z.string().trim().min(16, 'Invalid device token').max(512),
});

export const createBackupSchema = z.object({
  notes: z.string().trim().max(200).optional().default(''),
});

export const restoreBackupSchema = z.object({
  filename: z
    .string()
    .trim()
    .regex(/^dt_edtech_backup_[A-Za-z0-9_-]+\.sqlite$/, 'Invalid backup filename'),
  confirmRestore: z.literal(true, {
    error: 'Explicit confirmation is required before restoring database',
  }),
});

// Phase 2 — School Administration Core Validation Schemas

export const updateSchoolProfileSchema = z.object({
  name: z.string().trim().min(3, 'Official school name must be at least 3 characters').max(140),
  contactEmail: z.string().trim().email('Enter a valid school email').max(160),
  phone: z.string().trim().max(40).optional().default(''),
  country: z.string().trim().min(2, 'Country is required').max(80),
  state: z.string().trim().max(80).optional().default(''),
  city: z.string().trim().min(2, 'City is required').max(80),
  physicalAddress: z.string().trim().max(240).optional().default(''),
  registrationNumber: z.string().trim().max(80).optional().default(''),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default('')
    .refine((v) => !v || /^https?:\/\/[A-Za-z0-9.-]+/.test(v), 'Website must begin with http:// or https://'),
  motto: z.string().trim().max(180).optional().default(''),
  description: z.string().trim().max(1200).optional().default(''),
  schoolType: z.string().trim().min(2, 'School type is required').max(60),
  schoolOwnership: z.string().trim().min(2, 'School ownership is required').max(60),
  establishedYear: z
    .union([z.number().int().min(1800).max(2100), z.null()])
    .optional()
    .default(null),
});

export const updateSchoolSettingsSchema = z.object({
  admissionNumberPrefix: z
    .string()
    .trim()
    .min(2, 'Prefix must be 2–12 characters')
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/, 'Prefix may only contain letters, numbers, hyphens, or underscores'),
  admissionNumberFormat: z
    .string()
    .trim()
    .min(5, 'Format template is required')
    .max(48)
    .refine((val) => val.includes('{SEQ}'), 'Format must contain {SEQ} placeholder'),
  admissionNextSeq: z.number().int().min(1).max(9999999),
  applicationRefPrefix: z
    .string()
    .trim()
    .min(2, 'Application prefix must be 2–12 characters')
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/, 'Application prefix may only contain letters, numbers, hyphens, or underscores'),
});

export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Class name is required').max(80),
  code: z.string().trim().max(24).optional().default(''),
  levelOrder: z.number().int().min(1).max(500).optional().default(1),
  section: z.string().trim().max(60).optional().default('General'),
  description: z.string().trim().max(400).optional().default(''),
  capacity: z.number().int().min(1).max(1000).optional().default(40),
  initialArms: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        capacity: z.number().int().min(1).max(500).optional().default(40),
        room: z.string().trim().max(60).optional().default(''),
      }),
    )
    .optional()
    .default([]),
});

export const updateClassSchema = z.object({
  name: z.string().trim().min(2, 'Class name is required').max(80),
  code: z.string().trim().max(24).optional().default(''),
  levelOrder: z.number().int().min(1).max(500),
  section: z.string().trim().max(60).optional().default('General'),
  description: z.string().trim().max(400).optional().default(''),
  capacity: z.number().int().min(1).max(1000),
  status: z.enum(['active', 'archived']).optional(),
});

export const createClassArmSchema = z.object({
  name: z.string().trim().min(1, 'Arm name is required').max(40),
  capacity: z.number().int().min(1).max(500).optional().default(40),
  room: z.string().trim().max(60).optional().default(''),
});

export const updateClassArmSchema = z.object({
  name: z.string().trim().min(1, 'Arm name is required').max(40),
  capacity: z.number().int().min(1).max(500),
  room: z.string().trim().max(60).optional().default(''),
  status: z.enum(['active', 'archived']).optional(),
});

export const assignClassTeacherSchema = z.object({
  teacherId: z.string().trim().min(4, 'Teacher is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  roleLabel: z.string().trim().min(2).max(60).optional().default('Class Teacher'),
});

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2, 'Subject name is required').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Subject code is required')
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Subject code may only contain letters, numbers, hyphens, or underscores'),
  category: z.string().trim().max(60).optional().default('Core'),
  description: z.string().trim().max(400).optional().default(''),
  isCompulsoryDefault: z.boolean().optional().default(true),
});

export const updateSubjectSchema = createSubjectSchema.extend({
  status: z.enum(['active', 'archived']).optional(),
});

export const assignClassSubjectSchema = z.object({
  classId: z.string().trim().min(4, 'Class is required').max(80),
  isCompulsory: z.boolean().default(true),
  weeklyPeriods: z.number().int().min(1).max(40).default(3),
});

export const assignTeacherSubjectSchema = z.object({
  teacherId: z.string().trim().min(4, 'Teacher is required').max(80),
  classId: z.string().trim().max(80).optional().nullable(),
  armId: z.string().trim().max(80).optional().nullable(),
});

const optionalDateSchema = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD date format')
  .optional()
  .default('');

const optionalEmailSchema = z
  .string()
  .trim()
  .max(160)
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address')
  .optional()
  .default('');

export const createStudentSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(80),
  middleName: z.string().trim().max(80).optional().default(''),
  lastName: z.string().trim().min(2, 'Last name is required').max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date of birth'),
  gender: z.enum(['Male', 'Female', 'Other']),
  admissionNumber: z.string().trim().max(48).optional().default(''),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD admission date'),
  studentEmail: optionalEmailSchema,
  studentPhone: z.string().trim().max(40).optional().default(''),
  residentialAddress: z.string().trim().max(240).optional().default(''),
  nationality: z.string().trim().max(80).optional().default(''),
  stateOfOrigin: z.string().trim().max(80).optional().default(''),
  previousSchool: z.string().trim().max(140).optional().default(''),
  currentClassId: z.string().trim().max(80).optional().nullable(),
  currentArmId: z.string().trim().max(80).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().default(''),
  emergencyContactPhone: z.string().trim().max(40).optional().default(''),
  emergencyContactRelationship: z.string().trim().max(60).optional().default(''),
  guardianLink: z
    .object({
      parentId: z.string().trim().min(4).max(80),
      relationship: z.string().trim().min(2).max(60),
      isPrimaryGuardian: z.boolean().optional().default(true),
      isEmergencyContact: z.boolean().optional().default(true),
    })
    .optional()
    .nullable(),
  portalAccount: z
    .object({
      createLogin: z.boolean().default(false),
      password: z.string().min(8).max(128).optional(),
    })
    .optional(),
});

export const updateStudentSchema = createStudentSchema
  .omit({ portalAccount: true, guardianLink: true })
  .extend({
    admissionNumber: z.string().trim().min(2, 'Admission number is required').max(48),
  });

export const updateStudentStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'graduated', 'withdrawn']),
});

export const promoteStudentSchema = z.object({
  toClassId: z.string().trim().min(4, 'Destination class is required').max(80),
  toArmId: z.string().trim().max(80).optional().nullable(),
  actionType: z.enum(['promotion', 'transfer', 'reassignment', 'demotion']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD effective date'),
  notes: z.string().trim().max(400).optional().default(''),
});

export const createTeacherSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(80),
  middleName: z.string().trim().max(80).optional().default(''),
  lastName: z.string().trim().min(2, 'Last name is required').max(80),
  gender: z.enum(['Male', 'Female', 'Other']),
  dateOfBirth: optionalDateSchema,
  email: z.string().trim().email('Valid staff email is required').max(160),
  phone: z.string().trim().max(40).optional().default(''),
  residentialAddress: z.string().trim().max(240).optional().default(''),
  staffIdNumber: z.string().trim().min(2, 'Staff ID number is required').max(48),
  employmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD employment date'),
  qualifications: z.string().trim().max(200).optional().default(''),
  specialization: z.string().trim().max(120).optional().default(''),
  employmentStatus: z.enum(['active', 'on_leave', 'suspended', 'terminated']).default('active'),
  assignedSubjectIds: z.array(z.string().trim().min(4).max(80)).optional().default([]),
  assignedClassIds: z.array(z.string().trim().min(4).max(80)).optional().default([]),
  portalAccount: z
    .object({
      createLogin: z.boolean().default(false),
      password: z.string().min(8).max(128).optional(),
    })
    .optional(),
});

export const updateTeacherSchema = createTeacherSchema.omit({
  portalAccount: true,
  assignedSubjectIds: true,
  assignedClassIds: true,
});

export const updateTeacherStatusSchema = z.object({
  employmentStatus: z.enum(['active', 'on_leave', 'suspended', 'terminated']),
});

export const createParentSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: optionalEmailSchema,
  phone: z.string().trim().min(5, 'Phone number is required').max(40),
  residentialAddress: z.string().trim().max(240).optional().default(''),
  occupation: z.string().trim().max(120).optional().default(''),
  initialLink: z
    .object({
      studentId: z.string().trim().min(4).max(80),
      relationship: z.string().trim().min(2).max(60),
      isPrimaryGuardian: z.boolean().optional().default(true),
      isEmergencyContact: z.boolean().optional().default(true),
      canPickup: z.boolean().optional().default(true),
      canViewAcademicRecords: z.boolean().optional().default(true),
      canReceiveNotifications: z.boolean().optional().default(true),
    })
    .optional()
    .nullable(),
  portalAccount: z
    .object({
      createLogin: z.boolean().default(false),
      password: z.string().min(8).max(128).optional(),
    })
    .optional(),
});

export const updateParentSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: optionalEmailSchema,
  phone: z.string().trim().min(5, 'Phone number is required').max(40),
  residentialAddress: z.string().trim().max(240).optional().default(''),
  occupation: z.string().trim().max(120).optional().default(''),
  status: z.enum(['active', 'suspended']).optional().default('active'),
});

export const linkStudentGuardianSchema = z.object({
  studentId: z.string().trim().min(4, 'Student is required').max(80),
  relationship: z.string().trim().min(2, 'Relationship is required').max(60),
  isPrimaryGuardian: z.boolean().optional().default(false),
  isEmergencyContact: z.boolean().optional().default(false),
  canPickup: z.boolean().optional().default(true),
  canViewAcademicRecords: z.boolean().optional().default(true),
  canReceiveNotifications: z.boolean().optional().default(true),
});

export const updateGuardianPermissionsSchema = z.object({
  relationship: z.string().trim().min(2).max(60),
  isPrimaryGuardian: z.boolean(),
  isEmergencyContact: z.boolean(),
  canPickup: z.boolean(),
  canViewAcademicRecords: z.boolean(),
  canReceiveNotifications: z.boolean(),
});

export const createAdmissionSchema = z.object({
  applicantFirstName: z.string().trim().min(2, 'Applicant first name is required').max(80),
  applicantMiddleName: z.string().trim().max(80).optional().default(''),
  applicantLastName: z.string().trim().min(2, 'Applicant last name is required').max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date of birth'),
  gender: z.enum(['Male', 'Female', 'Other']),
  applicantEmail: optionalEmailSchema,
  applicantPhone: z.string().trim().max(40).optional().default(''),
  residentialAddress: z.string().trim().max(240).optional().default(''),
  nationality: z.string().trim().max(80).optional().default(''),
  stateOfOrigin: z.string().trim().max(80).optional().default(''),
  previousSchool: z.string().trim().max(140).optional().default(''),
  desiredClassId: z.string().trim().min(4, 'Desired class is required').max(80),
  desiredArmId: z.string().trim().max(80).optional().nullable(),
  guardianName: z.string().trim().min(2, 'Parent / guardian name is required').max(120),
  guardianEmail: optionalEmailSchema,
  guardianPhone: z.string().trim().min(5, 'Parent / guardian phone is required').max(40),
  guardianRelationship: z.string().trim().min(2).max(60).optional().default('Parent'),
  guardianOccupation: z.string().trim().max(120).optional().default(''),
  guardianAddress: z.string().trim().max(240).optional().default(''),
  notes: z.string().trim().max(800).optional().default(''),
});

export const reviewAdmissionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'request_info']),
  reviewNotes: z.string().trim().min(3, 'Review comment is required').max(600),
});

export const convertAdmissionSchema = z.object({
  admissionNumber: z.string().trim().max(48).optional().default(''),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD admission date'),
  classId: z.string().trim().min(4, 'Class assignment is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  createGuardianRecord: z.boolean().optional().default(true),
});

export const entityDocumentUploadSchema = z.object({
  documentType: z.string().trim().min(2).max(80).default('Supporting Document'),
  title: z.string().trim().min(2, 'Document title is required').max(140),
  fileName: z.string().trim().min(1, 'File name is required').max(160),
  mimeType: z.string().trim().min(3, 'MIME type is required').max(120),
  contentBase64: z.string().min(4, 'File payload is required').max(8_000_000),
});

// Phase 3 — Academic Management & Results Engine Validation Schemas

export const updateSchoolAcademicSettingsSchema = z.object({
  sessionNamingConvention: z.string().trim().min(3).max(80),
  termNamingConvention: z.string().trim().min(3).max(120),
  defaultTermsPerSession: z.number().int().min(1).max(6),
  allowOverlappingSessions: z.boolean(),
  allowOverlappingTerms: z.boolean(),
  scoreRoundingMode: z.enum(['two_decimals', 'one_decimal', 'nearest_whole']),
  tieRankingMode: z.enum(['standard_competition', 'dense']),
  missingScorePolicy: z.enum(['exclude_from_weight', 'treat_pending_as_zero_on_compute']),
  promotionMinAverage: z.number().min(0).max(100),
  promotionMinPassSubjects: z.number().int().min(0).max(30),
});

export const updateSessionLifecycleSchema = z.object({
  name: z.string().trim().min(4).max(64).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['draft', 'active', 'closed', 'archived']).optional(),
  notes: z.string().trim().max(400).optional(),
});

export const createAcademicTermSchema = z
  .object({
    academicSessionId: z.string().trim().min(4, 'Academic session is required').max(80),
    name: z.string().trim().min(2, 'Term name is required').max(64),
    termOrder: z.number().int().min(1).max(12).default(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD end date'),
    examStartDate: optionalDateSchema.transform((v) => v || null),
    examEndDate: optionalDateSchema.transform((v) => v || null),
    resultPublicationDate: optionalDateSchema.transform((v) => v || null),
    status: z.enum(['draft', 'active', 'closed', 'archived']).optional().default('draft'),
    isCurrent: z.boolean().optional().default(false),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Term end date must be on or after start date',
    path: ['endDate'],
  });

export const updateAcademicTermSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  termOrder: z.number().int().min(1).max(12).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  examStartDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  examEndDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  resultPublicationDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  status: z.enum(['draft', 'active', 'closed', 'archived']).optional(),
});

export const createAcademicEventSchema = z
  .object({
    academicSessionId: z.string().trim().max(80).optional().nullable(),
    academicTermId: z.string().trim().max(80).optional().nullable(),
    title: z.string().trim().min(2, 'Event title is required').max(120),
    eventType: z.enum([
      'resumption',
      'holiday',
      'midterm_break',
      'assessment',
      'examination',
      'closing',
      'school_activity',
    ]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD end date'),
    description: z.string().trim().max(500).optional().default(''),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Event end date must be on or after start date',
    path: ['endDate'],
  });

export const enrollStudentSubjectsSchema = z.object({
  academicSessionId: z.string().trim().min(4, 'Academic session is required').max(80),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  classId: z.string().trim().min(4, 'Class is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  studentIds: z.array(z.string().trim().min(4).max(80)).min(1, 'Select at least one student').max(200),
  subjectIds: z.array(z.string().trim().min(4).max(80)).min(1, 'Select at least one subject').max(40),
  isCompulsory: z.boolean().optional().default(true),
  notes: z.string().trim().max(240).optional().default(''),
});

export const updateSubjectEnrollmentStatusSchema = z.object({
  status: z.enum(['active', 'dropped', 'completed']),
  notes: z.string().trim().max(240).optional(),
});

export const createAssessmentCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is required').max(80),
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens, underscores'),
  description: z.string().trim().max(300).optional().default(''),
  isExam: z.boolean().default(false),
  displayOrder: z.number().int().min(1).max(50).default(1),
});

export const createAssessmentComponentSchema = z.object({
  academicSessionId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  classId: z.string().trim().max(80).optional().nullable(),
  subjectId: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().trim().min(4, 'Assessment category is required').max(80),
  name: z.string().trim().min(2, 'Component name is required').max(80),
  maxScore: z.number().positive('Max score must be greater than 0').max(1000),
  weightPercentage: z.number().positive('Weight must be greater than 0').max(100),
  displayOrder: z.number().int().min(1).max(50).default(1),
});

export const updateAssessmentComponentSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  maxScore: z.number().positive().max(1000).optional(),
  weightPercentage: z.number().positive().max(100).optional(),
  displayOrder: z.number().int().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

export const saveAssessmentScoresBatchSchema = z.object({
  academicTermId: z.string().trim().min(4, 'Academic term is required').max(80),
  classId: z.string().trim().min(4, 'Class is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  subjectId: z.string().trim().min(4, 'Subject is required').max(80),
  submitForReview: z.boolean().optional().default(false),
  reason: z.string().trim().max(240).optional().default(''),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(4).max(80),
        componentId: z.string().trim().min(4).max(80),
        score: z.union([z.number().min(0).max(1000), z.null()]),
        status: z.enum(['pending', 'scored', 'absent', 'exempt']),
        comment: z.string().trim().max(240).optional().default(''),
      }),
    )
    .min(1, 'Provide at least one score entry')
    .max(500),
});

export const reviewScoreBatchSchema = z.object({
  decision: z.enum(['under_review', 'approved', 'rejected']),
  reviewNotes: z.string().trim().max(400).optional().default(''),
});

export const createExaminationSchema = z
  .object({
    academicTermId: z.string().trim().min(4, 'Academic term is required').max(80),
    title: z.string().trim().min(3, 'Examination title is required').max(120),
    examType: z.string().trim().min(2).max(80).default('Terminal Examination'),
    description: z.string().trim().max(400).optional().default(''),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD end date'),
    maxScore: z.number().positive().max(1000).default(100),
    status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'under_review', 'published']).default('scheduled'),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export const createExaminationScheduleSchema = z.object({
  classId: z.string().trim().min(4, 'Class is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  subjectId: z.string().trim().min(4, 'Subject is required').max(80),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD exam date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM time format').default('09:00'),
  durationMinutes: z.number().int().min(10).max(600).default(90),
  venue: z.string().trim().max(100).optional().default(''),
  maxScore: z.number().positive().max(1000).default(100),
  invigilatorTeacherId: z.string().trim().max(80).optional().nullable(),
  instructions: z.string().trim().max(400).optional().default(''),
});

export const upsertExaminationScoresSchema = z.object({
  scheduleId: z.string().trim().max(80).optional().nullable(),
  subjectId: z.string().trim().min(4).max(80),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(4).max(80),
        score: z.union([z.number().min(0).max(1000), z.null()]),
        status: z.enum(['pending', 'present', 'absent', 'exempt', 'malpractice_hold']),
      }),
    )
    .min(1)
    .max(300),
});

export const createGradingSystemSchema = z.object({
  name: z.string().trim().min(2, 'Grading system name is required').max(100),
  description: z.string().trim().max(300).optional().default(''),
  sectionScope: z.string().trim().min(2).max(60).default('All Sections'),
  classId: z.string().trim().max(80).optional().nullable(),
  isDefault: z.boolean().default(false),
  requireFullCoverage: z.boolean().default(true),
  bands: z
    .array(
      z.object({
        minScore: z.number().min(0).max(100),
        maxScore: z.number().min(0).max(100),
        grade: z.string().trim().min(1).max(10),
        remark: z.string().trim().min(1).max(60),
        gradePoint: z.number().min(0).max(10).default(0),
        isPassing: z.boolean().default(true),
      }),
    )
    .min(1, 'Define at least one grading band'),
});

export const computeResultsSchema = z.object({
  academicTermId: z.string().trim().min(4, 'Academic term is required').max(80),
  classId: z.string().trim().min(4, 'Class is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  gradingSystemId: z.string().trim().max(80).optional().nullable(),
});

export const publishResultsSchema = z.object({
  academicTermId: z.string().trim().min(4, 'Academic term is required').max(80),
  classId: z.string().trim().min(4, 'Class is required').max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  action: z.enum(['mark_under_review', 'approve', 'publish']).default('publish'),
});

export const amendPublishedResultSchema = z.object({
  computedResultId: z.string().trim().min(4, 'Computed result is required').max(80),
  componentId: z.string().trim().min(4, 'Assessment component is required').max(80),
  newScore: z.union([z.number().min(0).max(1000), z.null()]),
  newStatus: z.enum(['scored', 'absent', 'exempt']),
  reason: z.string().trim().min(8, 'Provide a clear audit reason (minimum 8 characters)').max(400),
});

export const upsertReportCardTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100).default('Standard Institutional Report Card'),
  headerSubtitle: z.string().trim().min(2).max(140),
  showPosition: z.boolean(),
  showClassAverage: z.boolean(),
  showAttendance: z.boolean(),
  showAffectiveTraits: z.boolean(),
  showGradingScale: z.boolean(),
  principalTitle: z.string().trim().min(2).max(80),
  footerNote: z.string().trim().max(300),
});

export const upsertStudentTermReportExtrasSchema = z.object({
  academicTermId: z.string().trim().min(4).max(80),
  studentId: z.string().trim().min(4).max(80),
  attendance: z
    .object({
      daysOpened: z.number().int().min(0).max(365),
      daysPresent: z.number().int().min(0).max(365),
      daysAbsent: z.number().int().min(0).max(365),
      lateCount: z.number().int().min(0).max(365),
    })
    .optional(),
  traits: z
    .array(
      z.object({
        traitCategory: z.enum(['affective', 'psychomotor']).default('affective'),
        traitName: z.string().trim().min(2).max(60),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .max(20)
    .optional(),
  teacherComment: z.string().trim().max(600).optional(),
  principalComment: z.string().trim().max(600).optional(),
});

export const generatePromotionRecommendationsSchema = z.object({
  academicSessionId: z.string().trim().min(4).max(80),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  fromClassId: z.string().trim().min(4).max(80),
  targetToClassId: z.string().trim().max(80).optional().nullable(),
});

export const decidePromotionRecommendationSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  toClassId: z.string().trim().max(80).optional().nullable(),
  toArmId: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(400).optional().default(''),
});


