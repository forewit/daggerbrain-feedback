ALTER TABLE bugs ADD COLUMN platform TEXT CHECK (platform IN ('WEB', 'IOS', 'ANDROID', 'DESKTOP', 'OTHER'));
ALTER TABLE bugs ADD COLUMN severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE bugs ADD COLUMN screenshot_url TEXT;

ALTER TABLE features ADD COLUMN screenshot_url TEXT;
