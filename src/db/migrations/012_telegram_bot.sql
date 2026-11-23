-- Migration 012: Telegram Bot Integration Links
CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_chat_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  role TEXT NOT NULL,
  username TEXT,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(user_id);
