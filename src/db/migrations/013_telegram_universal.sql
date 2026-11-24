-- Migration 013: Universal Platform Telegram Bot (All Roles, One-Time Magic Login, Guided Chat States)

CREATE TABLE IF NOT EXISTS telegram_links_v2 (
  telegram_chat_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  profile_id TEXT,
  auth_environment TEXT NOT NULL CHECK (auth_environment IN ('school', 'workers')) DEFAULT 'school',
  role TEXT NOT NULL,
  username TEXT,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO telegram_links_v2 (
  telegram_chat_id, user_id, school_id, profile_id, auth_environment, role, username, linked_at
)
SELECT
  tl.telegram_chat_id,
  u.id,
  tl.school_id,
  NULL,
  CASE
    WHEN tl.role IN ('platform_owner', 'workforce_admin', 'workforce_support') THEN 'workers'
    ELSE 'school'
  END,
  tl.role,
  tl.username,
  tl.linked_at
FROM telegram_links tl
INNER JOIN users u ON u.id = tl.user_id;

DROP TABLE IF EXISTS telegram_links;
ALTER TABLE telegram_links_v2 RENAME TO telegram_links;

CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_school ON telegram_links(school_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_role ON telegram_links(role);

CREATE TABLE IF NOT EXISTS telegram_login_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('magic_login', 'connect_link')),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  profile_id TEXT,
  auth_environment TEXT NOT NULL CHECK (auth_environment IN ('school', 'workers')),
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_login_tokens_hash ON telegram_login_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_telegram_login_tokens_user ON telegram_login_tokens(user_id);

CREATE TABLE IF NOT EXISTS telegram_chat_states (
  telegram_chat_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
