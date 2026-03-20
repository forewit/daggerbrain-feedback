CREATE TABLE bugs_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('WEB', 'IOS', 'ANDROID', 'DESKTOP', 'OTHER')),
  severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE')),
  reporter_id TEXT NOT NULL,
  votes_count INTEGER NOT NULL DEFAULT 0,
  duplicate_flags_count INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  source_guild_id TEXT,
  source_channel_id TEXT,
  source_message_id TEXT,
  related_bug_id INTEGER,
  relationship_type TEXT CHECK (relationship_type IN ('DUPLICATE_OF', 'REGRESSION_OF')),
  closed_reason TEXT CHECK (closed_reason IN ('DUPLICATE', 'RESOLVED', 'OTHER')),
  status_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bugs_next (
  id,
  title,
  title_normalized,
  description,
  steps,
  expected,
  actual,
  platform,
  severity,
  screenshot_url,
  status,
  reporter_id,
  votes_count,
  duplicate_flags_count,
  channel_id,
  message_id,
  source_guild_id,
  source_channel_id,
  source_message_id,
  related_bug_id,
  relationship_type,
  closed_reason,
  status_note,
  created_at,
  updated_at
)
SELECT
  id,
  title,
  title_normalized,
  description,
  steps,
  expected,
  actual,
  platform,
  severity,
  screenshot_url,
  status,
  reporter_id,
  votes_count,
  duplicate_flags_count,
  channel_id,
  message_id,
  NULL,
  NULL,
  NULL,
  related_bug_id,
  relationship_type,
  closed_reason,
  status_note,
  created_at,
  updated_at
FROM bugs;

DROP TABLE bugs;
ALTER TABLE bugs_next RENAME TO bugs;

CREATE INDEX idx_bugs_status_votes_created
  ON bugs (status, votes_count DESC, created_at DESC);

CREATE INDEX idx_bugs_title_normalized
  ON bugs (title_normalized);

CREATE INDEX idx_bugs_related_bug
  ON bugs (related_bug_id, relationship_type);

CREATE INDEX idx_bugs_source_message
  ON bugs (source_guild_id, source_channel_id, source_message_id);

CREATE TABLE features_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  benefit TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED', 'CLOSED')),
  reporter_id TEXT NOT NULL,
  votes_count INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  source_guild_id TEXT,
  source_channel_id TEXT,
  source_message_id TEXT,
  status_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO features_next (
  id,
  title,
  description,
  benefit,
  screenshot_url,
  status,
  reporter_id,
  votes_count,
  channel_id,
  message_id,
  source_guild_id,
  source_channel_id,
  source_message_id,
  status_note,
  created_at,
  updated_at
)
SELECT
  id,
  title,
  description,
  benefit,
  screenshot_url,
  status,
  reporter_id,
  votes_count,
  channel_id,
  message_id,
  NULL,
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at
FROM features;

DROP TABLE features;
ALTER TABLE features_next RENAME TO features;

CREATE INDEX idx_features_status_votes_created
  ON features (status, votes_count DESC, created_at DESC);

CREATE INDEX idx_features_source_message
  ON features (source_guild_id, source_channel_id, source_message_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  item_kind TEXT NOT NULL CHECK (item_kind IN ('bug', 'feature')),
  item_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_kind, item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON subscriptions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roadmap_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  feature_ids TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_roadmap_polls_created
  ON roadmap_polls (created_at DESC);

ALTER TABLE bug_preflight_sessions ADD COLUMN source_guild_id TEXT;
ALTER TABLE bug_preflight_sessions ADD COLUMN source_channel_id TEXT;
ALTER TABLE bug_preflight_sessions ADD COLUMN source_message_id TEXT;
