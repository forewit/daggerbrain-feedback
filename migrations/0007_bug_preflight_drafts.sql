ALTER TABLE bug_preflight_sessions ADD COLUMN platform TEXT CHECK (platform IN ('WEB', 'IOS', 'ANDROID', 'DESKTOP', 'OTHER'));
ALTER TABLE bug_preflight_sessions ADD COLUMN severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE bug_preflight_sessions ADD COLUMN screenshot_url TEXT;
