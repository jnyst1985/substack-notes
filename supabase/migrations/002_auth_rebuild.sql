-- Migration: Rebuild schema for Supabase Auth integration
-- Old tables (user_sessions, scheduled_notes with TEXT user_id) are replaced
-- with auth.users-compatible schema

-- Drop old tables (they used TEXT user_id, incompatible with Supabase Auth)
DROP TABLE IF EXISTS scheduled_notes;
DROP TABLE IF EXISTS user_sessions;

-- Substack session storage (encrypted cookie)
CREATE TABLE substack_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

-- Scheduled notes
CREATE TABLE scheduled_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'posting', 'delivered', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Index for cron worker: find due pending notes
CREATE INDEX idx_pending_due_notes
  ON scheduled_notes(scheduled_time)
  WHERE status = 'pending';

-- Index for user's notes list
CREATE INDEX idx_user_notes
  ON scheduled_notes(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE scheduled_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE substack_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users can manage own notes" ON scheduled_notes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own session" ON substack_sessions
  FOR ALL USING (auth.uid() = user_id);
