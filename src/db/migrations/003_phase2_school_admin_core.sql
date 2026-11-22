-- Dave Timi EdTech Systems — Phase 2 School Administration Core
-- Migration 003: School Profiles, Classes/Arms, Students, Teachers, Parents/Guardians, Subjects, and Admissions

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS school_profiles (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  physical_address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  motto TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  school_type TEXT NOT NULL DEFAULT 'K-12 Combined',
  school_ownership TEXT NOT NULL DEFAULT 'Private',
  established_year INTEGER,
  logo_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  admission_number_prefix TEXT NOT NULL DEFAULT 'ADM',
  admission_number_format TEXT NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQ}',
  admission_next_seq INTEGER NOT NULL DEFAULT 1 CHECK (admission_next_seq >= 1),
  application_ref_prefix TEXT NOT NULL DEFAULT 'APP',
  application_next_seq INTEGER NOT NULL DEFAULT 1 CHECK (application_next_seq >= 1),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  level_order INTEGER NOT NULL DEFAULT 1,
  section TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 40 CHECK (capacity > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS class_arms (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 40 CHECK (capacity > 0),
  room TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, class_id, name)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  admission_number TEXT NOT NULL,
  admission_date TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  student_email TEXT NOT NULL DEFAULT '',
  student_phone TEXT NOT NULL DEFAULT '',
  residential_address TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  state_of_origin TEXT NOT NULL DEFAULT '',
  previous_school TEXT NOT NULL DEFAULT '',
  current_class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  current_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  photo_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  emergency_contact_relationship TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'graduated', 'withdrawn')) DEFAULT 'active',
  admission_application_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, admission_number)
);

CREATE TABLE IF NOT EXISTS student_documents (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL UNIQUE REFERENCES stored_files(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'Academic Record',
  title TEXT NOT NULL,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_class_history (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  from_class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  from_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  to_class_id TEXT NOT NULL REFERENCES school_classes(id),
  to_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('initial_placement', 'promotion', 'transfer', 'reassignment', 'demotion')),
  effective_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'transferred', 'withdrawn')) DEFAULT 'active',
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  staff_id_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  date_of_birth TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  residential_address TEXT NOT NULL DEFAULT '',
  employment_date TEXT NOT NULL,
  qualifications TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  photo_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  employment_status TEXT NOT NULL CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, staff_id_number),
  UNIQUE (school_id, email)
);

CREATE TABLE IF NOT EXISTS teacher_documents (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL UNIQUE REFERENCES stored_files(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'Credential',
  title TEXT NOT NULL,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_teacher_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  role_label TEXT NOT NULL DEFAULT 'Class Teacher',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Core',
  description TEXT NOT NULL DEFAULT '',
  is_compulsory_default INTEGER NOT NULL DEFAULT 1 CHECK (is_compulsory_default IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_compulsory INTEGER NOT NULL DEFAULT 1 CHECK (is_compulsory IN (0, 1)),
  weekly_periods INTEGER NOT NULL DEFAULT 3 CHECK (weekly_periods >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  residential_address TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  is_primary_guardian INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_guardian IN (0, 1)),
  is_emergency_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_emergency_contact IN (0, 1)),
  can_pickup INTEGER NOT NULL DEFAULT 1 CHECK (can_pickup IN (0, 1)),
  can_view_academic_records INTEGER NOT NULL DEFAULT 1 CHECK (can_view_academic_records IN (0, 1)),
  can_receive_notifications INTEGER NOT NULL DEFAULT 1 CHECK (can_receive_notifications IN (0, 1)),
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, student_id, parent_id)
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  application_reference TEXT NOT NULL,
  applicant_first_name TEXT NOT NULL,
  applicant_middle_name TEXT NOT NULL DEFAULT '',
  applicant_last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  applicant_email TEXT NOT NULL DEFAULT '',
  applicant_phone TEXT NOT NULL DEFAULT '',
  residential_address TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  state_of_origin TEXT NOT NULL DEFAULT '',
  previous_school TEXT NOT NULL DEFAULT '',
  desired_class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  desired_arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  guardian_name TEXT NOT NULL,
  guardian_email TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL DEFAULT 'Parent',
  guardian_occupation TEXT NOT NULL DEFAULT '',
  guardian_address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'more_info_requested', 'approved', 'rejected', 'converted')) DEFAULT 'pending_review',
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  converted_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  converted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, application_reference)
);

CREATE TABLE IF NOT EXISTS admission_documents (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL UNIQUE REFERENCES stored_files(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'Supporting Document',
  title TEXT NOT NULL,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admission_history (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_school_classes_school ON school_classes(school_id, status, level_order);
CREATE INDEX IF NOT EXISTS idx_class_arms_school_class ON class_arms(school_id, class_id, status);
CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_school_class ON students(school_id, current_class_id, current_arm_id);
CREATE INDEX IF NOT EXISTS idx_students_school_adm ON students(school_id, admission_number);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_student_class_history_student ON student_class_history(school_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student ON class_enrollments(school_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class ON class_enrollments(school_id, class_id, status);
CREATE INDEX IF NOT EXISTS idx_teachers_school_status ON teachers(school_id, employment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_class_teacher_assign_school ON class_teacher_assignments(school_id, class_id, is_active);
CREATE INDEX IF NOT EXISTS idx_class_teacher_assign_teacher ON class_teacher_assignments(school_id, teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subjects_school_status ON subjects(school_id, status, name);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON class_subjects(school_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subject_assign ON teacher_subject_assignments(school_id, teacher_id, subject_id, is_active);
CREATE INDEX IF NOT EXISTS idx_parents_school ON parents(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parents_user ON parents(user_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_parent ON student_guardians(school_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_admissions_school_status ON admission_applications(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_history_app ON admission_history(school_id, application_id, created_at DESC);
