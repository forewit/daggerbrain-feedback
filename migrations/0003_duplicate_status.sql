CREATE TABLE bugs_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'DUPLICATE')),
  reporter_id TEXT NOT NULL,
  votes_count INTEGER NOT NULL DEFAULT 0,
  duplicate_flags_count INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
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
  status,
  reporter_id,
  votes_count,
  duplicate_flags_count,
  channel_id,
  message_id,
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
  CASE
    WHEN relationship_type = 'DUPLICATE_OF' OR closed_reason = 'DUPLICATE' THEN 'DUPLICATE'
    ELSE status
  END,
  reporter_id,
  votes_count,
  duplicate_flags_count,
  channel_id,
  message_id,
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
