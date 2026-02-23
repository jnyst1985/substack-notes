-- User sessions (encrypted Substack tokens)
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Scheduled notes
CREATE TABLE scheduled_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Index for efficient pending notes query
CREATE INDEX idx_pending_notes ON scheduled_notes(status, scheduled_time)
  WHERE status = 'pending';

-- Index for user's notes
CREATE INDEX idx_user_notes ON scheduled_notes(user_id, created_at DESC);
