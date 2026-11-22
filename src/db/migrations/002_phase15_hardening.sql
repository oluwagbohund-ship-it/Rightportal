-- Dave Timi EdTech Systems — Phase 1.5 Production Hardening
-- Migration 002: Session Rotation, Rate Limiting, Password Recovery, File Governance, Notifications, Database Backups

PRAGMA foreign_keys = ON;

ALTER TABLE schema_migrations ADD COLUMN checksum TEXT NOT NULL DEFAULT '';
ALTER TABLE auth_sessions ADD COLUMN rotated_at TEXT;
ALTER TABLE auth_sessions ADD COLUMN last_seen_at TEXT;

CREATE TABLE IF NOT EXISTS login_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  auth_environment TEXT NOT NULL CHECK (auth_environment IN ('workers', 'school')),
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  requested_ip TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'school_logo',
      'teacher_profile_picture',
      'student_profile_picture',
      'student_document',
      'staff_document',
      'school_document'
    )
  ),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  storage_rel_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('private_tenant', 'private_owner')) DEFAULT 'private_tenant',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'school', 'teacher', 'student', 'parent', 'direct')),
  target_role_code TEXT,
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'notice', 'urgent')) DEFAULT 'info',
  fcm_delivery_state TEXT NOT NULL CHECK (fcm_delivery_state IN ('in_app_only', 'fcm_not_configured')) DEFAULT 'fcm_not_configured',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_device_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  device_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('registered_inactive', 'revoked')) DEFAULT 'registered_inactive',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS database_backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);
CREATE INDEX IF NOT EXISTS idx_schools_name_ci ON schools(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_users_email_ci ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_stored_files_school_cat ON stored_files(school_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_files_subject ON stored_files(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_school_scope ON notifications(school_id, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(target_user_id, created_at DESC);
