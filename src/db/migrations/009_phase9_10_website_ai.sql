-- Dave Timi EdTech Systems — Phase 9 School Public Websites & Phase 10 DT AI CORE
-- Migration 009: School Website Builder, Public News/Gallery/Pages, AI Core Logs & Insights

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS school_website_settings (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  custom_domain TEXT NOT NULL DEFAULT '',
  theme_preset TEXT NOT NULL CHECK (theme_preset IN ('classic_navy', 'royal_academic', 'modern_minimal')) DEFAULT 'classic_navy',
  primary_color TEXT NOT NULL DEFAULT '#1E3A8A',
  accent_color TEXT NOT NULL DEFAULT '#2563EB',
  hero_title TEXT NOT NULL DEFAULT '',
  hero_subtitle TEXT NOT NULL DEFAULT '',
  about_content TEXT NOT NULL DEFAULT '',
  principal_name TEXT NOT NULL DEFAULT '',
  principal_title TEXT NOT NULL DEFAULT 'Principal / Head of School',
  principal_message TEXT NOT NULL DEFAULT '',
  academics_summary TEXT NOT NULL DEFAULT '',
  admissions_intro TEXT NOT NULL DEFAULT '',
  admissions_open INTEGER NOT NULL DEFAULT 1 CHECK (admissions_open IN (0, 1)),
  contact_hours TEXT NOT NULL DEFAULT 'Monday - Friday, 8:00 AM - 4:00 PM',
  hero_image_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  principal_photo_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_website_pages (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  section_type TEXT NOT NULL CHECK (section_type IN ('about', 'academics', 'admissions', 'calendar', 'contact', 'custom')) DEFAULT 'custom',
  content TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, slug)
);

CREATE TABLE IF NOT EXISTS school_website_announcements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'School News',
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_website_gallery (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  file_id TEXT NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'Campus Life',
  display_order INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_core_query_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  module_domain TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('active_gemini', 'inactive_no_key', 'error')),
  model_name TEXT NOT NULL DEFAULT '',
  data_grounded INTEGER NOT NULL DEFAULT 1 CHECK (data_grounded IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_generated_insights (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  data_summary TEXT NOT NULL,
  ai_narrative TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('sql_analytics', 'gemini_enriched')),
  generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_web_pages_school ON school_website_pages(school_id, is_published, display_order);
CREATE INDEX IF NOT EXISTS idx_web_news_school ON school_website_announcements(school_id, is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_gallery_school ON school_website_gallery(school_id, is_published, display_order);
CREATE INDEX IF NOT EXISTS idx_ai_logs_school ON ai_core_query_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_school ON ai_generated_insights(school_id, created_at DESC);
