-- Dave Timi EdTech Systems — Phase 6 Computer-Based Testing (CBT)
-- Migration 007: Question Bank, CBT Examinations, Candidate Lists, Timed Attempts, Answers, Activity Logs

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cbt_question_bank (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'short_answer', 'essay')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  topic TEXT NOT NULL DEFAULT '',
  question_text TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  correct_answer_json TEXT NOT NULL DEFAULT '""',
  marks REAL NOT NULL DEFAULT 1 CHECK (marks > 0),
  negative_marks REAL NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
  explanation TEXT NOT NULL DEFAULT '',
  image_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cbt_examinations (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  linked_examination_id TEXT REFERENCES examinations(id) ON DELETE SET NULL,
  linked_component_id TEXT REFERENCES assessment_components(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 1 AND 360),
  pass_mark_percent REAL NOT NULL DEFAULT 50 CHECK (pass_mark_percent >= 0 AND pass_mark_percent <= 100),
  total_marks REAL NOT NULL DEFAULT 0 CHECK (total_marks >= 0),
  shuffle_questions INTEGER NOT NULL DEFAULT 1 CHECK (shuffle_questions IN (0, 1)),
  shuffle_options INTEGER NOT NULL DEFAULT 1 CHECK (shuffle_options IN (0, 1)),
  show_result_immediately INTEGER NOT NULL DEFAULT 0 CHECK (show_result_immediately IN (0, 1)),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 5),
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'active', 'closed', 'archived')) DEFAULT 'draft',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cbt_exam_questions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cbt_exam_id TEXT NOT NULL REFERENCES cbt_examinations(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES cbt_question_bank(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL DEFAULT 1,
  marks_override REAL,
  negative_marks_override REAL,
  UNIQUE (cbt_exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS cbt_exam_candidates (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cbt_exam_id TEXT NOT NULL REFERENCES cbt_examinations(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_eligible INTEGER NOT NULL DEFAULT 1 CHECK (is_eligible IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cbt_exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS cbt_exam_attempts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cbt_exam_id TEXT NOT NULL REFERENCES cbt_examinations(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  question_order_json TEXT NOT NULL DEFAULT '[]',
  option_orders_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'graded')) DEFAULT 'in_progress',
  objective_score REAL NOT NULL DEFAULT 0,
  manual_score REAL NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  percentage_score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
  tab_switch_count INTEGER NOT NULL DEFAULT 0,
  graded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  graded_at TEXT,
  synced_to_results_at TEXT,
  UNIQUE (cbt_exam_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS cbt_attempt_answers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES cbt_exam_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES cbt_question_bank(id) ON DELETE CASCADE,
  answer_json TEXT NOT NULL DEFAULT '""',
  is_flagged INTEGER NOT NULL DEFAULT 0 CHECK (is_flagged IN (0, 1)),
  is_correct INTEGER,
  marks_awarded REAL NOT NULL DEFAULT 0,
  grader_feedback TEXT NOT NULL DEFAULT '',
  answered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS cbt_activity_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cbt_exam_id TEXT NOT NULL REFERENCES cbt_examinations(id) ON DELETE CASCADE,
  attempt_id TEXT REFERENCES cbt_exam_attempts(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('exam_started', 'answer_saved', 'tab_hidden', 'focus_lost', 'submitted', 'auto_submitted', 'essay_graded', 'synced_to_results')
  ),
  event_detail TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cbt_qbank_lookup ON cbt_question_bank(school_id, subject_id, class_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_lookup ON cbt_examinations(school_id, class_id, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_lookup ON cbt_exam_attempts(school_id, cbt_exam_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_cbt_activity_lookup ON cbt_activity_logs(school_id, cbt_exam_id, created_at DESC);
