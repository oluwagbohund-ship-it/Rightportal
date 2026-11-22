-- Dave Timi EdTech Systems — Phase 7 Communication & Phase 8 Timetable & School Resource Management
-- Migration 008: Announcements, Direct Messaging, Delivery Logs, Read Receipts, Rooms, Periods, Timetables, Slots

PRAGMA foreign_keys = ON;

-- Phase 7: Communication & Notifications
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_scope TEXT NOT NULL CHECK (audience_scope IN ('school', 'teachers', 'students', 'parents', 'class')),
  target_class_id TEXT REFERENCES school_classes(id) ON DELETE SET NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'important', 'emergency')) DEFAULT 'normal',
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'archived')) DEFAULT 'published',
  scheduled_for TEXT,
  published_at TEXT,
  attachment_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcement_read_receipts (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  attachment_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_delivery_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('announcement', 'direct_message', 'notification')),
  source_id TEXT NOT NULL,
  recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'fcm', 'browser')),
  status TEXT NOT NULL CHECK (status IN ('delivered', 'pending', 'failed', 'not_configured')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK (in_app_enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
  push_enabled INTEGER NOT NULL DEFAULT 1 CHECK (push_enabled IN (0, 1)),
  emergency_override INTEGER NOT NULL DEFAULT 1 CHECK (emergency_override IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phase 8: Timetable & Resource Management
CREATE TABLE IF NOT EXISTS school_rooms (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  building TEXT NOT NULL DEFAULT 'Main Block',
  room_type TEXT NOT NULL CHECK (room_type IN ('classroom', 'laboratory', 'hall', 'computer_lab', 'studio')) DEFAULT 'classroom',
  capacity INTEGER NOT NULL DEFAULT 40 CHECK (capacity >= 1),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS timetable_settings (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  school_days_json TEXT NOT NULL DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
  day_start_time TEXT NOT NULL DEFAULT '08:00',
  day_end_time TEXT NOT NULL DEFAULT '15:00',
  default_period_minutes INTEGER NOT NULL DEFAULT 45 CHECK (default_period_minutes BETWEEN 15 AND 180),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  period_order INTEGER NOT NULL CHECK (period_order >= 1),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_break INTEGER NOT NULL DEFAULT 0 CHECK (is_break IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, period_order)
);

CREATE TABLE IF NOT EXISTS timetables (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  revision_number INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id TEXT NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES class_arms(id) ON DELETE SET NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  period_id TEXT NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES school_rooms(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (timetable_id, day_of_week, period_id)
);

CREATE TABLE IF NOT EXISTS teacher_availability (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (school_id, teacher_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_school_users ON direct_messages(school_id, recipient_user_id, sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_school ON message_delivery_logs(school_id, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tt_slots_lookup ON timetable_slots(school_id, timetable_id, day_of_week, period_id);
CREATE INDEX IF NOT EXISTS idx_tt_slots_teacher ON timetable_slots(school_id, teacher_id, day_of_week, period_id);
CREATE INDEX IF NOT EXISTS idx_tt_slots_room ON timetable_slots(school_id, room_id, day_of_week, period_id);
