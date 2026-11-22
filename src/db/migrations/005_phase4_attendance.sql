-- Dave Timi EdTech Systems — Phase 4 Attendance Management & QR Attendance
-- Migration 005: Attendance Settings, Daily Sessions, Records, Correction Requests, Audit Logs, and QR Attendance

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS attendance_settings (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  mark_late_after_time TEXT NOT NULL DEFAULT '08:15',
  allow_teacher_edit_hours INTEGER NOT NULL DEFAULT 24 CHECK (allow_teacher_edit_hours BETWEEN 1 AND 720),
  qr_default_ttl_minutes INTEGER NOT NULL DEFAULT 15 CHECK (qr_default_ttl_minutes BETWEEN 1 AND 240),
  qr_require_enrolled_class INTEGER NOT NULL DEFAULT 1 CHECK (qr_require_enrolled_class IN (0, 1)),
  auto_sync_term_summary INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync_term_summary IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  arm_scope_key TEXT NOT NULL DEFAULT '__ALL__',
  attendance_date TEXT NOT NULL,
  session_label TEXT NOT NULL DEFAULT 'Morning Roll Call',
  marked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'finalized', 'amended')) DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, class_id, arm_scope_key, attendance_date, session_label)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  remarks TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual', 'qr')) DEFAULT 'manual',
  marked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  marked_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attendance_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_status TEXT NOT NULL,
  requested_status TEXT NOT NULL CHECK (requested_status IN ('present', 'absent', 'late', 'excused')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL DEFAULT '',
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qr_attendance_sessions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_code TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'closed')) DEFAULT 'active',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qr_attendance_scans (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  qr_session_id TEXT NOT NULL REFERENCES qr_attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
  ip_address TEXT NOT NULL DEFAULT '',
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (qr_session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_att_sessions_lookup ON attendance_sessions(school_id, attendance_date DESC, class_id);
CREATE INDEX IF NOT EXISTS idx_att_records_student ON attendance_records(school_id, student_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_att_records_term ON attendance_records(school_id, academic_term_id, student_id);
CREATE INDEX IF NOT EXISTS idx_att_corrections_school ON attendance_correction_requests(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_att_school ON qr_attendance_sessions(school_id, attendance_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_qr_scans_session ON qr_attendance_scans(school_id, qr_session_id);
