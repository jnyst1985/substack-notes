export type NoteStatus = "pending" | "posting" | "delivered" | "failed";

export type Platform = "substack" | "threads";

export interface ScheduledNote {
  id: string;
  user_id: string;
  content: string;
  scheduled_time: string;
  status: NoteStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  platform: Platform;
  platform_post_id: string | null;
  group_id: string | null;
}

export interface SubstackSession {
  id: string;
  user_id: string;
  encrypted_token: string;
  updated_at: string;
  last_verified_at: string | null;
}

export interface ThreadsSession {
  id: string;
  user_id: string;
  threads_user_id: string;
  encrypted_access_token: string;
  token_expires_at: string;
  username: string | null;
  updated_at: string;
  created_at: string;
}

export interface ThreadsInsight {
  id: string;
  note_id: string;
  user_id: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  fetched_at: string;
}

export interface SubstackPostInsight {
  id: string;
  user_id: string;
  post_id: string;
  title: string | null;
  slug: string | null;
  post_date: string | null;
  type: string | null;
  reaction_count: number;
  comment_count: number;
  restacks: number;
  views: number | null;
  fetched_at: string;
}

export interface SubstackSubscriberStats {
  id: string;
  user_id: string;
  total_subscribers: number;
  free_subscribers: number | null;
  paid_subscribers: number | null;
  fetched_at: string;
}
