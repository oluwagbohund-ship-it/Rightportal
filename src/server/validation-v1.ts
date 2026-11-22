import { z } from 'zod';

// Phase 4 — Attendance Management Schemas
export const updateAttendanceSettingsSchema = z.object({
  markLateAfterTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  allowTeacherEditHours: z.number().int().min(1).max(720),
  qrDefaultTtlMinutes: z.number().int().min(1).max(240),
  qrRequireEnrolledClass: z.boolean(),
  autoSyncTermSummary: z.boolean(),
});

export const markAttendanceRegisterSchema = z.object({
  classId: z.string().trim().min(4).max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date'),
  sessionLabel: z.string().trim().min(2).max(60).default('Morning Roll Call'),
  notes: z.string().trim().max(300).optional().default(''),
  finalize: z.boolean().optional().default(false),
  reason: z.string().trim().max(240).optional().default(''),
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(4).max(80),
        status: z.enum(['present', 'absent', 'late', 'excused']),
        remarks: z.string().trim().max(200).optional().default(''),
      }),
    )
    .min(1, 'Mark at least one student')
    .max(300),
});

export const createAttendanceCorrectionSchema = z.object({
  attendanceRecordId: z.string().trim().min(4).max(80),
  requestedStatus: z.enum(['present', 'absent', 'late', 'excused']),
  reason: z.string().trim().min(5, 'Provide a clear reason for correction').max(300),
});

export const reviewAttendanceCorrectionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().trim().max(300).optional().default(''),
});

export const generateQrAttendanceSchema = z.object({
  classId: z.string().trim().min(4).max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  title: z.string().trim().min(3).max(120).default('Class Attendance Check-In'),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ttlMinutes: z.number().int().min(1).max(240).optional(),
});

export const scanQrAttendanceSchema = z.object({
  token: z.string().trim().min(10, 'Invalid QR attendance code').max(256),
});

// Phase 5 — School Finance Schemas
export const updateFinancialSettingsSchema = z.object({
  currencyCode: z.string().trim().min(3).max(8).toUpperCase(),
  currencySymbol: z.string().trim().min(1).max(12),
  receiptPrefix: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/, 'Receipt prefix must be alphanumeric/hyphen/underscore'),
  allowPartialPayments: z.boolean(),
  requireAdminVerification: z.boolean(),
  bankPaymentInstructions: z.string().trim().max(600).optional().default(''),
});

export const createFeeCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Category code must be alphanumeric'),
  description: z.string().trim().max(300).optional().default(''),
});

export const createFeeStructureSchema = z.object({
  feeCategoryId: z.string().trim().min(4).max(80),
  academicSessionId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  classId: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  amount: z.number().min(0).max(100_000_000),
  dueDate: z.string().trim().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD').optional().default(''),
  isMandatory: z.boolean().default(true),
});

export const assignStudentFeesSchema = z.object({
  feeStructureId: z.string().trim().min(4).max(80),
  classId: z.string().trim().max(80).optional().nullable(),
  studentIds: z.array(z.string().trim().min(4).max(80)).max(500).optional(),
  dueDate: z.string().trim().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD').optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

export const applyScholarshipDiscountSchema = z.object({
  studentId: z.string().trim().min(4).max(80),
  feeAssignmentId: z.string().trim().min(4).max(80),
  title: z.string().trim().min(2).max(120),
  discountType: z.enum(['fixed', 'percentage']),
  value: z.number().positive().max(100_000_000),
  reason: z.string().trim().min(3).max(300),
});

export const recordFeePaymentSchema = z.object({
  studentId: z.string().trim().min(4).max(80),
  feeAssignmentId: z.string().trim().min(4).max(80),
  amountPaid: z.number().positive('Amount must be greater than zero').max(100_000_000),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'pos', 'custom']),
  customMethodLabel: z.string().trim().max(60).optional().default(''),
  referenceCode: z.string().trim().max(80).optional().default(''),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD payment date'),
  notes: z.string().trim().max(300).optional().default(''),
  verifyImmediately: z.boolean().optional().default(true),
  proofFile: z
    .object({
      fileName: z.string().trim().min(1).max(160),
      mimeType: z.string().trim().min(3).max(120),
      contentBase64: z.string().min(4).max(8_000_000),
    })
    .optional(),
});

export const verifyOrRejectPaymentSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  notes: z.string().trim().max(300).optional().default(''),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(5, 'Provide a clear audit reason for payment reversal').max(300),
});

export const createExpenseSchema = z.object({
  academicTermId: z.string().trim().max(80).optional().nullable(),
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(140),
  vendor: z.string().trim().max(120).optional().default(''),
  amount: z.number().positive().max(100_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'pos', 'custom']).default('bank_transfer'),
  referenceCode: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

// Phase 6 — CBT Schemas
export const createCbtQuestionSchema = z.object({
  subjectId: z.string().trim().min(4).max(80),
  classId: z.string().trim().max(80).optional().nullable(),
  questionType: z.enum(['mcq', 'true_false', 'short_answer', 'essay']),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().trim().max(100).optional().default(''),
  questionText: z.string().trim().min(3, 'Question text is required').max(3000),
  options: z.array(z.string().trim().min(1).max(500)).max(8).optional().default([]),
  correctAnswer: z.string().trim().max(1000).optional().default(''),
  marks: z.number().positive().max(100).default(1),
  negativeMarks: z.number().min(0).max(50).default(0),
  explanation: z.string().trim().max(1000).optional().default(''),
});

export const createCbtExamSchema = z.object({
  academicSessionId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  classId: z.string().trim().min(4).max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  subjectId: z.string().trim().min(4).max(80),
  linkedExaminationId: z.string().trim().max(80).optional().nullable(),
  linkedComponentId: z.string().trim().max(80).optional().nullable(),
  title: z.string().trim().min(3).max(140),
  instructions: z.string().trim().max(2000).optional().default(''),
  durationMinutes: z.number().int().min(1).max(360).default(45),
  passMarkPercent: z.number().min(0).max(100).default(50),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  showResultImmediately: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(5).default(1),
  startsAt: z.string().trim().max(40).optional().nullable(),
  endsAt: z.string().trim().max(40).optional().nullable(),
});

export const updateCbtExamSettingsSchema = createCbtExamSchema.partial().extend({
  status: z.enum(['draft', 'published', 'active', 'closed', 'archived']).optional(),
});

export const assignCbtQuestionsSchema = z.object({
  questionIds: z.array(z.string().trim().min(4).max(80)).min(1).max(200),
});

export const assignCbtCandidatesSchema = z.object({
  studentIds: z.array(z.string().trim().min(4).max(80)).max(500),
});

export const saveCbtAnswerSchema = z.object({
  questionId: z.string().trim().min(4).max(80),
  answer: z.string().max(10000),
  isFlagged: z.boolean().optional(),
});

export const gradeCbtEssaySchema = z.object({
  attemptId: z.string().trim().min(4).max(80),
  questionId: z.string().trim().min(4).max(80),
  marksAwarded: z.number().min(0).max(100),
  feedback: z.string().trim().max(500).optional().default(''),
});

// Phase 7 — Communication Schemas
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(5).max(5000),
  audienceScope: z.enum(['school', 'teachers', 'students', 'parents', 'class']),
  targetClassId: z.string().trim().max(80).optional().nullable(),
  priority: z.enum(['normal', 'important', 'emergency']).default('normal'),
  status: z.enum(['draft', 'scheduled', 'published']).default('published'),
  scheduledFor: z.string().trim().max(40).optional().nullable(),
});

export const sendDirectMessageSchema = z.object({
  recipientUserId: z.string().trim().min(4).max(80),
  subject: z.string().trim().max(140).optional().default('Direct Message'),
  body: z.string().trim().min(1).max(4000),
});

export const updateNotificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  emergencyOverride: z.boolean(),
});

// Phase 8 — Timetable Schemas
export const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
  building: z.string().trim().max(80).default('Main Block'),
  roomType: z.enum(['classroom', 'laboratory', 'hall', 'computer_lab', 'studio']).default('classroom'),
  capacity: z.number().int().min(1).max(2000).default(40),
});

export const updateTimetableSettingsSchema = z.object({
  schoolDays: z.array(z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])).min(1),
  dayStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  dayEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  defaultPeriodMinutes: z.number().int().min(15).max(180),
});

export const createTimetablePeriodSchema = z.object({
  label: z.string().trim().min(2).max(60),
  periodOrder: z.number().int().min(1).max(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isBreak: z.boolean().default(false),
});

export const createTimetableSchema = z.object({
  academicSessionId: z.string().trim().max(80).optional().nullable(),
  academicTermId: z.string().trim().max(80).optional().nullable(),
  classId: z.string().trim().min(4).max(80),
  armId: z.string().trim().max(80).optional().nullable(),
  title: z.string().trim().min(3).max(140),
});

export const upsertTimetableSlotSchema = z.object({
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
  periodId: z.string().trim().min(4).max(80),
  subjectId: z.string().trim().min(4).max(80),
  teacherId: z.string().trim().max(80).optional().nullable(),
  roomId: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(200).optional().default(''),
});

// Phase 9 — School Public Website Schemas
export const updateSchoolWebsiteSettingsSchema = z.object({
  isPublished: z.boolean(),
  customDomain: z.string().trim().max(160).optional().default(''),
  themePreset: z.enum(['classic_navy', 'royal_academic', 'modern_minimal']).default('classic_navy'),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1E3A8A'),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#2563EB'),
  heroTitle: z.string().trim().max(160).default(''),
  heroSubtitle: z.string().trim().max(400).default(''),
  aboutContent: z.string().trim().max(4000).default(''),
  principalName: z.string().trim().max(120).default(''),
  principalTitle: z.string().trim().max(80).default('Principal / Head of School'),
  principalMessage: z.string().trim().max(3000).default(''),
  academicsSummary: z.string().trim().max(3000).default(''),
  admissionsIntro: z.string().trim().max(2000).default(''),
  admissionsOpen: z.boolean().default(true),
  contactHours: z.string().trim().max(160).default('Monday - Friday, 8:00 AM - 4:00 PM'),
});

export const upsertWebsitePageSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(120),
  sectionType: z.enum(['about', 'academics', 'admissions', 'calendar', 'contact', 'custom']).default('custom'),
  content: z.string().trim().min(5).max(8000),
  displayOrder: z.number().int().min(1).max(50).default(1),
  isPublished: z.boolean().default(true),
});

export const createWebsiteAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(400).optional().default(''),
  body: z.string().trim().min(5).max(5000),
  category: z.string().trim().min(2).max(60).default('School News'),
  isPublished: z.boolean().default(true),
});

// Phase 10 — DT AI CORE Schemas
export const aiAssistantQuerySchema = z.object({
  prompt: z.string().trim().min(3, 'Enter a question or instruction').max(1500),
  moduleDomain: z.enum(['academic_insights', 'school_analytics', 'administrative_assistant']).default('administrative_assistant'),
  academicTermId: z.string().trim().max(80).optional().nullable(),
});
