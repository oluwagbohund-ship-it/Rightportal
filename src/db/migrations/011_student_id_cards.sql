-- Dave Timi EdTech Systems — Digital Student ID Cards with QR Authentication & Attendance
-- Migration 011: Student Digital ID Cards table & indexes

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS student_id_cards (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL,
  qr_token_hash TEXT NOT NULL UNIQUE,
  qr_token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')) DEFAULT 'active',
  issued_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  last_used_login_at TEXT,
  last_used_attendance_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_student_id_cards_school_student
  ON student_id_cards(school_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_student_id_cards_token_hash
  ON student_id_cards(qr_token_hash);
