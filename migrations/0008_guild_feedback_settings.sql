CREATE TABLE IF NOT EXISTS guild_feedback_settings (
  guild_id TEXT PRIMARY KEY,
  bug_report_channel_id TEXT,
  feature_channel_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
