export type UserType = 'workforce' | 'school_member';
export type AuthEnvironment = 'workers' | 'school';
export type RoleCode =
  | 'platform_owner'
  | 'workforce_admin'
  | 'workforce_support'
  | 'school_admin'
  | 'teacher'
  | 'student'
  | 'parent';

export type SchoolStatus = 'pending_verification' | 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  userType: UserType;
  roleCode: RoleCode;
  roleName: string;
  permissions: string[];
  authEnvironment: AuthEnvironment;
  activeSchoolId: string | null;
  activeSchoolName: string | null;
  activeSchoolCode: string | null;
  activeSchoolStatus: SchoolStatus | null;
}

export interface AiCoreModule {
  id: string;
  name: string;
  domain: string;
  status: 'inactive';
  phaseTarget: string;
  tenantScope: 'platform' | 'school';
  requiredPermission: string;
  summary: string;
  dataDependencies: string[];
}

export interface AiCoreBlueprint {
  engineName: string;
  architecturePhase: string;
  activeInferenceEnabled: false;
  modules: AiCoreModule[];
}

export interface SchoolRecord {
  id: string;
  name: string;
  slug: string;
  code: string;
  country: string;
  city: string;
  contact_email: string;
  phone: string;
  status: SchoolStatus;
  created_at: string;
  member_count?: number;
  session_count?: number;
}

export interface AcademicSessionRecord {
  id: string;
  name: string;
  term: 'First Term' | 'Second Term' | 'Third Term' | 'Annual';
  start_date: string;
  end_date: string;
  is_current: number;
  created_at?: string;
}

export interface SchoolMemberRecord {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role_code: RoleCode;
  role_name: string;
  title: string;
  membership_status: string;
  created_at: string;
}

export interface WorkforceMember {
  id: string;
  email: string;
  full_name: string;
  is_active: number;
  role_code: string;
  role_name: string;
  department: string;
  clearance_level: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_email: string;
  actor_role: string;
  auth_environment?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: 'success' | 'denied' | 'failure';
  ip_address?: string;
  school_name?: string | null;
  created_at: string;
}

export type FileCategory =
  | 'school_logo'
  | 'teacher_profile_picture'
  | 'student_profile_picture'
  | 'student_document'
  | 'staff_document'
  | 'school_document';

export interface StoredFileItem {
  id: string;
  school_id?: string | null;
  school_name?: string | null;
  category: FileCategory;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  visibility?: string;
  subject_user_id?: string | null;
  subject_user_name?: string | null;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
  created_at: string;
}

export type NotificationScope = 'platform' | 'school' | 'teacher' | 'student' | 'parent' | 'direct';
export type NotificationSeverity = 'info' | 'notice' | 'urgent';

export interface NotificationItem {
  id: string;
  school_id: string | null;
  school_name?: string | null;
  scope: NotificationScope;
  target_role_code: string | null;
  target_user_id: string | null;
  created_by_name: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  fcm_delivery_state: string;
  created_at: string;
  is_read: boolean;
}

export interface FcmStatus {
  provider: string;
  configured: boolean;
  pushDispatchActive: false;
  architecturePhase: string;
  reason: string;
}

export interface DatabaseIntegrityReport {
  ok: boolean;
  integrityCheck: string;
  foreignKeyViolations: number;
  journalMode: string;
  foreignKeysEnabled: boolean;
  dbSizeBytes: number;
  migrations: Array<{
    version: string;
    applied_at: string;
    checksum: string;
    checksumMatch: boolean;
  }>;
}

export interface BackupRecord {
  id: string;
  filename: string;
  size_bytes: number;
  sha256_hex: string;
  created_by_email: string;
  notes: string;
  created_at: string;
  fileExists?: boolean;
}

export interface RateLimitLockout {
  rate_key: string;
  attempts: number;
  locked_until: string | null;
  updated_at: string;
}

export interface PasswordResetEvent {
  id: string;
  auth_environment: string;
  requested_ip: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  user_email: string;
  user_name: string;
}

// Phase 2 — School Administration Core Types

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SchoolProfileFull extends SchoolRecord {
  registration_number: string;
  state: string;
  physical_address: string;
  website: string;
  motto: string;
  description: string;
  school_type: string;
  school_ownership: string;
  established_year: number | null;
  logo_file_id: string | null;
  admission_number_prefix: string;
  admission_number_format: string;
  admission_next_seq: number;
  application_ref_prefix: string;
  application_next_seq: number;
  updated_at: string;
}

export interface SchoolSettingsConfig {
  admissionNumberPrefix: string;
  admissionNumberFormat: string;
  admissionNextSeq: number;
  applicationRefPrefix: string;
  applicationNextSeq: number;
  previewAdmissionNumber: string;
}

export interface ClassArmRecord {
  id: string;
  school_id: string;
  class_id: string;
  name: string;
  capacity: number;
  room: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  active_students_count?: number;
}

export interface SchoolClassRecord {
  id: string;
  school_id: string;
  name: string;
  code: string;
  level_order: number;
  section: string;
  description: string;
  capacity: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  active_arms_count?: number;
  active_students_count?: number;
  active_teachers_count?: number;
  subjects_count?: number;
  arms?: ClassArmRecord[];
}

export interface StudentRecord {
  id: string;
  school_id: string;
  user_id: string | null;
  admission_number: string;
  admission_date: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';
  student_email: string;
  student_phone: string;
  residential_address: string;
  nationality: string;
  state_of_origin: string;
  previous_school: string;
  current_class_id: string | null;
  current_arm_id: string | null;
  photo_file_id: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  status: 'active' | 'suspended' | 'graduated' | 'withdrawn';
  admission_application_id: string | null;
  created_at: string;
  updated_at: string;
  class_name?: string | null;
  class_section?: string | null;
  arm_name?: string | null;
  guardians_count?: number;
}

export interface StudentClassHistoryRecord {
  id: string;
  student_id: string;
  first_name?: string;
  last_name?: string;
  admission_number?: string;
  from_class_id: string | null;
  from_arm_id: string | null;
  to_class_id: string;
  to_arm_id: string | null;
  from_class_name: string | null;
  from_arm_name: string | null;
  to_class_name: string;
  to_arm_name: string | null;
  session_name?: string | null;
  recorded_by_name?: string | null;
  action_type: 'initial_placement' | 'promotion' | 'transfer' | 'reassignment' | 'demotion';
  effective_date: string;
  notes: string;
  created_at: string;
}

export interface TeacherRecord {
  id: string;
  school_id: string;
  user_id: string | null;
  staff_id_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: 'Male' | 'Female' | 'Other';
  date_of_birth: string;
  email: string;
  phone: string;
  residential_address: string;
  employment_date: string;
  qualifications: string;
  specialization: string;
  photo_file_id: string | null;
  employment_status: 'active' | 'on_leave' | 'suspended' | 'terminated';
  created_at: string;
  updated_at: string;
  active_classes_count?: number;
  active_subjects_count?: number;
}

export interface ParentRecord {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  residential_address: string;
  occupation: string;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
  wards_count?: number;
}

export interface StudentGuardianRecord {
  guardian_id: string;
  relationship: string;
  is_primary_guardian: number;
  is_emergency_contact: number;
  can_pickup: number;
  can_view_academic_records: number;
  can_receive_notifications: number;
  verified_at: string;
  parent_id?: string;
  student_id?: string;
  full_name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  admission_number?: string;
  email?: string;
  phone?: string;
  occupation?: string;
  residential_address?: string;
  parent_status?: string;
  student_status?: string;
  class_name?: string | null;
  arm_name?: string | null;
  gender?: string;
}

export interface SubjectRecord {
  id: string;
  school_id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  is_compulsory_default: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  assigned_classes_count?: number;
  assigned_teachers_count?: number;
}

export interface TeacherSubjectAssignmentRecord {
  assignment_id: string;
  subject_id: string;
  teacher_id: string;
  class_id: string | null;
  arm_id: string | null;
  is_active: number;
  assigned_at: string;
  ended_at: string | null;
  subject_name?: string;
  subject_code?: string;
  subject_category?: string;
  staff_id_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  employment_status?: string;
  class_name?: string | null;
  arm_name?: string | null;
}

export interface AdmissionApplicationRecord {
  id: string;
  school_id: string;
  application_reference: string;
  applicant_first_name: string;
  applicant_middle_name: string;
  applicant_last_name: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';
  applicant_email: string;
  applicant_phone: string;
  residential_address: string;
  nationality: string;
  state_of_origin: string;
  previous_school: string;
  desired_class_id: string | null;
  desired_arm_id: string | null;
  academic_session_id: string | null;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_relationship: string;
  guardian_occupation: string;
  guardian_address: string;
  notes: string;
  status: 'pending_review' | 'more_info_requested' | 'approved' | 'rejected' | 'converted';
  review_notes: string;
  reviewed_at: string | null;
  converted_student_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  desired_class_name?: string | null;
  desired_arm_name?: string | null;
  academic_session_name?: string | null;
  converted_admission_number?: string | null;
  documents_count?: number;
}

export interface AdmissionHistoryRecord {
  id: string;
  application_id: string;
  from_status: string;
  to_status: string;
  comment: string;
  actor_email: string;
  created_at: string;
}

export interface EntityDocumentRecord {
  id: string;
  document_type: string;
  title: string;
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

// Phase 3 — Academic Management & Results Engine Types

export interface SchoolAcademicSettingsRecord {
  school_id: string;
  session_naming_convention: string;
  term_naming_convention: string;
  default_terms_per_session: number;
  allow_overlapping_sessions: number;
  allow_overlapping_terms: number;
  score_rounding_mode: 'two_decimals' | 'one_decimal' | 'nearest_whole';
  tie_ranking_mode: 'standard_competition' | 'dense';
  missing_score_policy: 'exclude_from_weight' | 'treat_pending_as_zero_on_compute';
  promotion_min_average: number;
  promotion_min_pass_subjects: number;
  updated_at?: string;
}

export interface ExtendedAcademicSessionRecord extends AcademicSessionRecord {
  status: 'draft' | 'active' | 'closed' | 'archived';
  notes?: string;
  closed_at?: string | null;
  archived_at?: string | null;
  terms_count?: number;
  events_count?: number;
}

export interface AcademicTermRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  session_name?: string;
  name: string;
  term_order: number;
  start_date: string;
  end_date: string;
  exam_start_date: string | null;
  exam_end_date: string | null;
  result_publication_date: string | null;
  status: 'draft' | 'active' | 'closed' | 'archived';
  is_current: number;
  created_at?: string;
  updated_at?: string;
}

export type AcademicEventType =
  | 'resumption'
  | 'holiday'
  | 'midterm_break'
  | 'assessment'
  | 'examination'
  | 'closing'
  | 'school_activity';

export interface AcademicEventRecord {
  id: string;
  school_id: string;
  academic_session_id: string | null;
  academic_term_id: string | null;
  session_name?: string | null;
  term_name?: string | null;
  title: string;
  event_type: AcademicEventType;
  start_date: string;
  end_date: string;
  description: string;
  created_at?: string;
}

export interface StudentSubjectEnrollmentRecord {
  id: string;
  student_id: string;
  class_id: string;
  arm_id: string | null;
  subject_id: string;
  academic_session_id: string;
  academic_term_id: string | null;
  is_compulsory: number;
  status: 'active' | 'dropped' | 'completed';
  enrolled_at: string;
  dropped_at: string | null;
  notes: string;
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  subject_name?: string;
  subject_code?: string;
  subject_category?: string;
  class_name?: string;
  arm_name?: string | null;
  session_name?: string;
  term_name?: string | null;
}

export interface AssessmentCategoryRecord {
  id: string;
  school_id: string;
  name: string;
  code: string;
  description: string;
  is_exam: number;
  display_order: number;
  created_at?: string;
}

export interface AssessmentComponentRecord {
  id: string;
  school_id: string;
  academic_session_id: string | null;
  academic_term_id: string | null;
  class_id: string | null;
  subject_id: string | null;
  category_id: string;
  category_name?: string;
  category_code?: string;
  is_exam?: number;
  class_name?: string | null;
  subject_name?: string | null;
  term_name?: string | null;
  name: string;
  max_score: number;
  weight_percentage: number;
  display_order: number;
  is_active: number;
}

export interface ScoreSubmissionBatchRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  academic_term_id: string;
  class_id: string;
  arm_id: string | null;
  subject_id: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'published';
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string;
  updated_at: string;
  class_name?: string;
  arm_name?: string | null;
  subject_name?: string;
  subject_code?: string;
  term_name?: string;
  session_name?: string;
  submitted_by_name?: string | null;
}

export type ScoreEntryStatus = 'pending' | 'scored' | 'absent' | 'exempt';

export interface AssessmentScoreRecord {
  student_id: string;
  component_id: string;
  score: number | null;
  status: ScoreEntryStatus;
  comment: string;
  updated_at?: string;
}

export interface AssessmentScoreHistoryRecord {
  id: string;
  student_id: string;
  subject_id: string;
  component_id: string;
  academic_term_id: string;
  old_score: number | null;
  new_score: number | null;
  old_status: string;
  new_status: string;
  reason: string;
  created_at: string;
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  subject_name?: string;
  subject_code?: string;
  component_name?: string;
  term_name?: string;
  actor_name?: string | null;
}

export interface ExaminationRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  academic_term_id: string;
  term_name?: string;
  session_name?: string;
  title: string;
  exam_type: string;
  description: string;
  start_date: string;
  end_date: string;
  max_score: number;
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'under_review' | 'published';
  is_cbt_ready: number;
  schedules_count?: number;
  created_at?: string;
}

export interface ExaminationScheduleRecord {
  id: string;
  examination_id: string;
  class_id: string;
  arm_id: string | null;
  subject_id: string;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  venue: string;
  max_score: number;
  invigilator_teacher_id: string | null;
  instructions: string;
  class_name?: string;
  arm_name?: string | null;
  subject_name?: string;
  subject_code?: string;
  invigilator_name?: string | null;
}

export interface ExaminationScoreRecord {
  id: string;
  examination_id: string;
  student_id: string;
  subject_id: string;
  score: number | null;
  max_score: number;
  status: 'pending' | 'present' | 'absent' | 'exempt' | 'malpractice_hold';
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  subject_name?: string;
}

export interface GradingBandRecord {
  id?: string;
  min_score: number;
  max_score: number;
  grade: string;
  remark: string;
  grade_point: number;
  is_passing: number;
  display_order?: number;
}

export interface GradingSystemRecord {
  id: string;
  school_id: string;
  name: string;
  description: string;
  section_scope: string;
  class_id: string | null;
  class_name?: string | null;
  is_default: number;
  require_full_coverage: number;
  is_active: number;
  bands: GradingBandRecord[];
  created_at?: string;
}

export interface ComputedResultRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  academic_term_id: string;
  class_id: string;
  arm_id: string | null;
  student_id: string;
  subject_id: string;
  grading_system_id: string;
  ca_score: number;
  exam_score: number;
  total_score: number;
  percentage_score: number;
  grade: string;
  remark: string;
  grade_point: number;
  is_passing: number;
  subject_position: number | null;
  class_average: number;
  highest_score: number;
  lowest_score: number;
  status: 'draft' | 'under_review' | 'approved' | 'published' | 'amended';
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  subject_name?: string;
  subject_code?: string;
  term_name?: string;
}

export interface ResultPublicationRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  academic_term_id: string;
  class_id: string;
  arm_id: string | null;
  student_id: string;
  grading_system_id: string;
  subjects_count: number;
  subjects_passed: number;
  total_score_obtained: number;
  total_max_possible: number;
  average_score: number;
  overall_grade: string;
  overall_remark: string;
  class_position: number | null;
  class_size: number;
  status: 'draft' | 'under_review' | 'published' | 'amended';
  published_at: string | null;
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  class_name?: string;
  arm_name?: string | null;
  grading_system_name?: string | null;
  term_name?: string;
  session_name?: string;
  teacher_comment?: string | null;
  principal_comment?: string | null;
}

export interface ResultAmendmentRecord {
  id: string;
  academic_term_id: string;
  student_id: string;
  subject_id: string;
  computed_result_id: string;
  old_values_json: string;
  new_values_json: string;
  reason: string;
  created_at: string;
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  subject_name?: string;
  subject_code?: string;
  term_name?: string;
  amended_by_name?: string | null;
}

export interface ReportCardTemplateRecord {
  id: string;
  school_id: string;
  name: string;
  header_subtitle: string;
  show_position: number;
  show_class_average: number;
  show_attendance: number;
  show_affective_traits: number;
  show_grading_scale: number;
  principal_title: string;
  footer_note: string;
}

export interface StudentAttendanceSummaryRecord {
  days_opened: number;
  days_present: number;
  days_absent: number;
  late_count: number;
}

export interface StudentAffectiveTraitRecord {
  trait_category: 'affective' | 'psychomotor';
  trait_name: string;
  rating: number;
}

export interface ReportCardPayload {
  school: {
    id: string;
    name: string;
    code: string;
    country: string;
    city: string;
    contact_email: string;
    phone: string;
    motto: string;
    physical_address: string;
    website: string;
    logo_file_id: string | null;
  };
  term: AcademicTermRecord & { session_name: string };
  student: StudentRecord;
  template: ReportCardTemplateRecord | null;
  publication: ResultPublicationRecord & {
    result_class_name: string;
    result_arm_name: string | null;
  };
  subjectResults: ComputedResultRecord[];
  gradingBands: GradingBandRecord[];
  attendance: StudentAttendanceSummaryRecord | null;
  traits: StudentAffectiveTraitRecord[];
  teacherComment: string;
  principalComment: string;
}

export interface PromotionRecommendationRecord {
  id: string;
  school_id: string;
  academic_session_id: string;
  academic_term_id: string | null;
  student_id: string;
  from_class_id: string;
  from_arm_id: string | null;
  recommended_to_class_id: string | null;
  recommended_to_arm_id: string | null;
  average_score: number;
  subjects_passed: number;
  subjects_total: number;
  recommendation: 'recommended_promote' | 'requires_review' | 'recommended_retain';
  recommendation_reason: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  decision_notes: string;
  decided_at: string | null;
  admission_number?: string;
  first_name?: string;
  last_name?: string;
  from_class_name?: string;
  recommended_to_class_name?: string | null;
  session_name?: string;
}

export interface AcademicOverviewPayload {
  activeTerm: (AcademicTermRecord & { session_name: string }) | null;
  stats: {
    sessionsCount: number;
    termsCount: number;
    upcomingEventsCount: number;
    activeEnrollmentsCount: number;
    assessmentComponentsCount: number;
    pendingScoreBatchesCount: number;
    examinationsCount: number;
    gradingSystemsCount: number;
    computedResultsCount: number;
    publishedResultsCount: number;
    pendingPromotionsCount: number;
  };
  classPerformance: Array<{
    class_id: string;
    class_name: string;
    ranked_students: number;
    class_average: number;
    published_count: number;
  }>;
  recentBatches: Array<{
    id: string;
    status: string;
    updated_at: string;
    class_name: string;
    subject_name: string;
    term_name: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    event_type: AcademicEventType;
    start_date: string;
    end_date: string;
  }>;
}

