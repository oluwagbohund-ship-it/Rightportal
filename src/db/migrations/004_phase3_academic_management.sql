-- Dave Timi EdTech Systems — Phase 3 Academic Management & Results Engine
-- Migration 004: Configurable Sessions/Terms, Calendar, Enrollments, Assessments, Exams, Grading, Results, Amendments, Report Cards, & Promotions

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS school_academic_settings (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  session_naming_convention TEXT NOT NULL DEFAULT '{YYYY}/{YYYY+1} Academic Session',
  term_naming_convention TEXT NOT NULL DEFAULT 'First Term, Second Term, Third Term',
  default_terms_per_session INTEGER NOT NULL DEFAULT 3 CHECK (default_terms_per_session BETWEEN 1 AND 6),
  allow_overlapping_sessions INTEGER NOT NULL DEFAULT 0 CHECK (allow_overlapping_sessions IN (0, 1)),
  allow_overlapping_terms INTEGER NOT NULL DEFAULT 0 CHECK (allow_overlapping_terms IN (0, 1)),
  score_rounding_mode TEXT NOT NULL CHECK (score_rounding_mode IN ('two_decimals', 'one_decimal', 'nearest_whole')) DEFAULT 'two_decimals',
  tie_ranking_mode TEXT NOT NULL CHECK (tie_ranking_mode IN ('standard_competition', 'dense')) DEFAULT 'standard_competition',
  missing_score_policy TEXT NOT NULL CHECK (missing_score_policy IN ('exclude_from_weight', 'treat_pending_as_zero_on_compute')) DEFAULT 'exclude_from_weight',
  promotion_min_average REAL NOT NULL DEFAULT 50 CHECK (promotion_min_average >= 0 AND promotion_min_average <= 100),
  promotion_min_pass_subjects INTEGER NOT NULL DEFAULT 5 CHECK (promotion_min_pass_subjects >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS academic_session_lifecycle (
  session_id TEXT PRIMARY KEY REFERENCES academic_sessions(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed', 'archived')) DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  closed_at TEXT,
  archived_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  term_order INTEGER NOT NULL DEFAULT 1 CHECK (term_order >= 1 AND term_order <= 12),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  exam_start_date TEXT,
  exam_end_date TEXT,
  result_publication_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed', 'archived')) DEFAULT 'draft',
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_session_id, name)
);

CREATE TABLE IF NOT EXISTS academic_events (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('resumption', 'holiday', 'midterm_break', 'assessment', 'examination', 'closing', 'school_activity')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_subject_enrollments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE CASCADE,
  term_scope_key TEXT NOT NULL DEFAULT '__SESSION__',
  is_compulsory INTEGER NOT NULL DEFAULT 1 CHECK (is_compulsory IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('active', 'dropped', 'completed')) DEFAULT 'active',
  enrolled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  dropped_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (school_id, student_id, subject_id, academic_session_id, term_scope_key)
);

CREATE TABLE IF NOT EXISTS assessment_categories (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_exam INTEGER NOT NULL DEFAULT 0 CHECK (is_exam IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS assessment_components (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES assessment_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_score REAL NOT NULL CHECK (max_score > 0),
  weight_percentage REAL NOT NULL CHECK (weight_percentage > 0 AND weight_percentage <= 100),
  display_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS score_submission_batches (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'published')) DEFAULT 'draft',
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_scores (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES score_submission_batches(id) ON DELETE SET NULL,
  score REAL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'scored', 'absent', 'exempt')) DEFAULT 'pending',
  comment TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id, subject_id, component_id)
);

CREATE TABLE IF NOT EXISTS assessment_score_history (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assessment_score_id TEXT NOT NULL REFERENCES assessment_scores(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  old_score REAL,
  new_score REAL,
  old_status TEXT NOT NULL DEFAULT '',
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS examinations (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'Terminal Examination',
  description TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  max_score REAL NOT NULL DEFAULT 100 CHECK (max_score > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'under_review', 'published')) DEFAULT 'draft',
  is_cbt_ready INTEGER NOT NULL DEFAULT 1 CHECK (is_cbt_ready IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, title)
);

CREATE TABLE IF NOT EXISTS examination_schedules (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  examination_id TEXT NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 10 AND 600),
  venue TEXT NOT NULL DEFAULT '',
  max_score REAL NOT NULL DEFAULT 100 CHECK (max_score > 0),
  invigilator_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')) DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS examination_scores (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  examination_id TEXT NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES examination_schedules(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score REAL,
  max_score REAL NOT NULL DEFAULT 100 CHECK (max_score > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'present', 'absent', 'exempt', 'malpractice_hold')) DEFAULT 'pending',
  entered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, examination_id, student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS grading_systems (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  section_scope TEXT NOT NULL DEFAULT 'All Sections',
  class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  require_full_coverage INTEGER NOT NULL DEFAULT 1 CHECK (require_full_coverage IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS grading_bands (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grading_system_id TEXT NOT NULL REFERENCES grading_systems(id) ON DELETE CASCADE,
  min_score REAL NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  max_score REAL NOT NULL CHECK (max_score >= 0 AND max_score <= 100),
  grade TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  grade_point REAL NOT NULL DEFAULT 0,
  is_passing INTEGER NOT NULL DEFAULT 1 CHECK (is_passing IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 1,
  UNIQUE (grading_system_id, grade)
);

CREATE TABLE IF NOT EXISTS computed_results (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grading_system_id TEXT NOT NULL REFERENCES grading_systems(id),
  ca_score REAL NOT NULL DEFAULT 0,
  exam_score REAL NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  max_possible_score REAL NOT NULL DEFAULT 100,
  percentage_score REAL NOT NULL DEFAULT 0,
  grade TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  grade_point REAL NOT NULL DEFAULT 0,
  is_passing INTEGER NOT NULL DEFAULT 1 CHECK (is_passing IN (0, 1)),
  class_average REAL NOT NULL DEFAULT 0,
  subject_position INTEGER,
  subject_student_count INTEGER NOT NULL DEFAULT 0,
  computation_version INTEGER NOT NULL DEFAULT 1,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('computed', 'under_review', 'approved', 'published', 'amended')) DEFAULT 'computed',
  computed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS computed_result_items (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  computed_result_id TEXT NOT NULL REFERENCES computed_results(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES assessment_components(id) ON DELETE SET NULL,
  component_name TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  is_exam INTEGER NOT NULL DEFAULT 0 CHECK (is_exam IN (0, 1)),
  raw_score REAL,
  max_score REAL NOT NULL,
  weight_percentage REAL NOT NULL,
  weighted_contribution REAL NOT NULL DEFAULT 0,
  score_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS result_publications (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grading_system_id TEXT NOT NULL REFERENCES grading_systems(id),
  subjects_count INTEGER NOT NULL DEFAULT 0,
  subjects_passed INTEGER NOT NULL DEFAULT 0,
  total_score_obtained REAL NOT NULL DEFAULT 0,
  total_max_possible REAL NOT NULL DEFAULT 0,
  average_score REAL NOT NULL DEFAULT 0,
  overall_grade TEXT NOT NULL DEFAULT '',
  overall_remark TEXT NOT NULL DEFAULT '',
  class_position INTEGER,
  class_size INTEGER NOT NULL DEFAULT 0,
  highest_class_average REAL NOT NULL DEFAULT 0,
  lowest_class_average REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'under_review', 'published', 'amended')) DEFAULT 'draft',
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id)
);

CREATE TABLE IF NOT EXISTS result_amendments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  computed_result_id TEXT NOT NULL REFERENCES computed_results(id) ON DELETE CASCADE,
  result_publication_id TEXT REFERENCES result_publications(id) ON DELETE SET NULL,
  old_values_json TEXT NOT NULL,
  new_values_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  amended_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_card_templates (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  header_subtitle TEXT NOT NULL DEFAULT 'Official Terminal Academic Report',
  show_position INTEGER NOT NULL DEFAULT 1 CHECK (show_position IN (0, 1)),
  show_class_average INTEGER NOT NULL DEFAULT 1 CHECK (show_class_average IN (0, 1)),
  show_attendance INTEGER NOT NULL DEFAULT 1 CHECK (show_attendance IN (0, 1)),
  show_affective_traits INTEGER NOT NULL DEFAULT 1 CHECK (show_affective_traits IN (0, 1)),
  show_grading_scale INTEGER NOT NULL DEFAULT 1 CHECK (show_grading_scale IN (0, 1)),
  principal_title TEXT NOT NULL DEFAULT 'Principal / Head of School',
  footer_note TEXT NOT NULL DEFAULT 'Issued officially by institutional academic registry.',
  is_default INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS student_attendance_summaries (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  days_opened INTEGER NOT NULL DEFAULT 0 CHECK (days_opened >= 0),
  days_present INTEGER NOT NULL DEFAULT 0 CHECK (days_present >= 0),
  days_absent INTEGER NOT NULL DEFAULT 0 CHECK (days_absent >= 0),
  late_count INTEGER NOT NULL DEFAULT 0 CHECK (late_count >= 0),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id)
);

CREATE TABLE IF NOT EXISTS student_affective_traits (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_category TEXT NOT NULL CHECK (trait_category IN ('affective', 'psychomotor')) DEFAULT 'affective',
  trait_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id, trait_name)
);

CREATE TABLE IF NOT EXISTS teacher_comments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  comment TEXT NOT NULL DEFAULT '',
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id)
);

CREATE TABLE IF NOT EXISTS principal_comments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  comment TEXT NOT NULL DEFAULT '',
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_term_id, student_id)
);

CREATE TABLE IF NOT EXISTS promotion_recommendations (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class_id TEXT NOT NULL REFERENCES school_classes(id),
  from_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  recommended_to_class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  recommended_to_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  average_score REAL NOT NULL DEFAULT 0,
  subjects_passed INTEGER NOT NULL DEFAULT 0,
  subjects_total INTEGER NOT NULL DEFAULT 0,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('recommended_promote', 'recommended_retain', 'requires_review')),
  recommendation_reason TEXT NOT NULL DEFAULT '',
  approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_notes TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, academic_session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_school_session ON academic_terms(school_id, academic_session_id, term_order);
CREATE INDEX IF NOT EXISTS idx_academic_events_school_dates ON academic_events(school_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_student_subj_enroll_lookup ON student_subject_enrollments(school_id, student_id, academic_session_id, status);
CREATE INDEX IF NOT EXISTS idx_student_subj_enroll_class ON student_subject_enrollments(school_id, class_id, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_assess_components_school ON assessment_components(school_id, class_id, subject_id, is_active);
CREATE INDEX IF NOT EXISTS idx_score_batches_scope ON score_submission_batches(school_id, academic_term_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_assess_scores_lookup ON assessment_scores(school_id, academic_term_id, class_id, subject_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assess_score_hist_score ON assessment_score_history(school_id, assessment_score_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_examinations_term ON examinations(school_id, academic_term_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_lookup ON examination_schedules(school_id, examination_id, class_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_scores_lookup ON examination_scores(school_id, examination_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grading_bands_sys ON grading_bands(school_id, grading_system_id, display_order);
CREATE INDEX IF NOT EXISTS idx_computed_results_lookup ON computed_results(school_id, academic_term_id, class_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_result_pub_lookup ON result_publications(school_id, academic_term_id, class_id, status);
CREATE INDEX IF NOT EXISTS idx_result_amendments_lookup ON result_amendments(school_id, academic_term_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_rec_lookup ON promotion_recommendations(school_id, academic_session_id, approval_status);
