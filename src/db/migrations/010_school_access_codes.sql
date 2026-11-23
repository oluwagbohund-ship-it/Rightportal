-- Dave Timi EdTech Systems — Platform Owner School Access Codes
-- Migration 010: Unique onboarding codes issued by Platform Owner required to create and access schools

CREATE TABLE IF NOT EXISTS school_access_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  intended_school_name TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('available', 'used', 'revoked')) DEFAULT 'available',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_by_school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_school_access_codes_code ON school_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_school_access_codes_status ON school_access_codes(status, created_at DESC);
