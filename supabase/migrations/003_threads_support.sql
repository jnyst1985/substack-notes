-- 003_threads_support.sql
-- Adds multi-platform support (Threads) to scheduled_notes,
-- Threads OAuth token storage, and analytics snapshots.

-- Add platform column (defaults to 'substack' for existing rows)
ALTER TABLE scheduled_notes
  ADD COLUMN platform TEXT NOT NULL DEFAULT 'substack'
  CHECK (platform IN ('substack', 'threads'));

-- Track external post ID (Threads media_id, needed for analytics)
ALTER TABLE scheduled_notes
  ADD COLUMN platform_post_id TEXT;

-- Link cross-posted notes together
ALTER TABLE scheduled_notes
  ADD COLUMN group_id UUID;

-- Threads OAuth token storage
CREATE TABLE threads_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  threads_user_id TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  username TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE threads_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own threads session" ON threads_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Threads analytics snapshots
CREATE TABLE threads_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES scheduled_notes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  reposts INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_threads_insights_note ON threads_insights(note_id, fetched_at DESC);
CREATE INDEX idx_threads_insights_user ON threads_insights(user_id, fetched_at DESC);

-- Update pending notes index to include platform
DROP INDEX IF EXISTS idx_pending_due_notes;
CREATE INDEX idx_pending_due_notes ON scheduled_notes(scheduled_time, platform) WHERE status = 'pending';
CREATE INDEX idx_group_notes ON scheduled_notes(group_id) WHERE group_id IS NOT NULL;
