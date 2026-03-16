-- Add subdomain column to substack_sessions
ALTER TABLE substack_sessions ADD COLUMN subdomain TEXT;

-- Substack post metrics (fetched periodically from public API)
CREATE TABLE substack_post_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  post_id TEXT NOT NULL,
  title TEXT,
  slug TEXT,
  post_date TIMESTAMPTZ,
  type TEXT,
  reaction_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  restacks INTEGER DEFAULT 0,
  views INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- One snapshot per post per day
-- Use AT TIME ZONE 'UTC' to make the expression immutable for timestamptz
CREATE UNIQUE INDEX idx_substack_post_insights_daily
  ON substack_post_insights(user_id, post_id, (date_trunc('day', fetched_at AT TIME ZONE 'UTC')));

-- Subscriber count snapshots
CREATE TABLE substack_subscriber_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  total_subscribers INTEGER DEFAULT 0,
  free_subscribers INTEGER,
  paid_subscribers INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_substack_post_insights_user ON substack_post_insights(user_id, fetched_at DESC);
CREATE INDEX idx_substack_subscriber_stats_user ON substack_subscriber_stats(user_id, fetched_at DESC);

-- RLS
ALTER TABLE substack_post_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE substack_subscriber_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own post insights" ON substack_post_insights
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert post insights" ON substack_post_insights
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read own subscriber stats" ON substack_subscriber_stats
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert subscriber stats" ON substack_subscriber_stats
  FOR INSERT WITH CHECK (true);
