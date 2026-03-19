ALTER TABLE bugs ADD COLUMN duplicate_of_bug_id INTEGER REFERENCES bugs(id);
ALTER TABLE bugs ADD COLUMN duplicate_of_message_id TEXT;
