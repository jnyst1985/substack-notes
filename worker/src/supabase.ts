import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface DueNote {
  id: string;
  user_id: string;
  content: string;
  scheduled_time: string;
}

/** Get due Substack notes (pending + scheduled_time in past) */
export async function getDueSubstackNotes(): Promise<DueNote[]> {
  const { data, error } = await supabase
    .from("scheduled_notes")
    .select("id, user_id, content, scheduled_time")
    .eq("status", "pending")
    .eq("platform", "substack")
    .lte("scheduled_time", new Date().toISOString())
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Failed to query due Substack notes:", error.message);
    return [];
  }

  return data ?? [];
}

/** Get due Threads notes (pending + scheduled_time in past) */
export async function getDueThreadsNotes(): Promise<DueNote[]> {
  const { data, error } = await supabase
    .from("scheduled_notes")
    .select("id, user_id, content, scheduled_time")
    .eq("status", "pending")
    .eq("platform", "threads")
    .lte("scheduled_time", new Date().toISOString())
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Failed to query due Threads notes:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getEncryptedToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("substack_sessions")
    .select("encrypted_token")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("Failed to get session token:", error?.message);
    return null;
  }

  return data.encrypted_token;
}

export interface ThreadsSessionData {
  threads_user_id: string;
  encrypted_access_token: string;
}

/** Get a user's Threads session (encrypted token + threads_user_id) */
export async function getThreadsSession(
  userId: string
): Promise<ThreadsSessionData | null> {
  const { data, error } = await supabase
    .from("threads_sessions")
    .select("threads_user_id, encrypted_access_token")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function markNoteDelivered(noteId: string): Promise<void> {
  const { error } = await supabase
    .from("scheduled_notes")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    console.error(`Failed to mark note ${noteId} as delivered:`, error.message);
  }
}

export async function markNoteFailed(
  noteId: string,
  errorMsg: string
): Promise<void> {
  const { error } = await supabase
    .from("scheduled_notes")
    .update({
      status: "failed",
      error: errorMsg,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    console.error(`Failed to mark note ${noteId} as failed:`, error.message);
  }
}

/** Store the Threads post ID on the note for analytics fetching */
export async function setNotePlatformPostId(
  noteId: string,
  postId: string
): Promise<void> {
  const { error } = await supabase
    .from("scheduled_notes")
    .update({ platform_post_id: postId })
    .eq("id", noteId);

  if (error) {
    console.error(`Failed to set platform_post_id for ${noteId}:`, error.message);
  }
}

export async function updateSessionVerified(userId: string): Promise<void> {
  await supabase
    .from("substack_sessions")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function clearSessionVerified(userId: string): Promise<void> {
  await supabase
    .from("substack_sessions")
    .update({ last_verified_at: null })
    .eq("user_id", userId);
}

/** Get Threads sessions expiring within N days (for proactive refresh) */
export async function getExpiringThreadsSessions(
  withinDays: number
): Promise<{ user_id: string; encrypted_access_token: string }[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const { data, error } = await supabase
    .from("threads_sessions")
    .select("user_id, encrypted_access_token")
    .lte("token_expires_at", cutoff.toISOString())
    .gt("token_expires_at", new Date().toISOString());

  if (error) {
    console.error("Failed to query expiring Threads sessions:", error.message);
    return [];
  }

  return data ?? [];
}

/** Update a Threads session with a refreshed token */
export async function updateThreadsToken(
  userId: string,
  encryptedToken: string,
  expiresAt: string
): Promise<void> {
  const { error } = await supabase
    .from("threads_sessions")
    .update({
      encrypted_access_token: encryptedToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error(`Failed to update Threads token for ${userId}:`, error.message);
  }
}

// ---------- Threads Insights ----------

interface DeliveredThreadsNote {
  id: string;
  user_id: string;
  platform_post_id: string;
}

/** Get delivered Threads notes from last N days that have a platform_post_id */
export async function getDeliveredThreadsNotes(
  days: number
): Promise<DeliveredThreadsNote[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("scheduled_notes")
    .select("id, user_id, platform_post_id")
    .eq("platform", "threads")
    .eq("status", "delivered")
    .not("platform_post_id", "is", null)
    .gte("delivered_at", since.toISOString());

  if (error) {
    console.error("Failed to query delivered Threads notes:", error.message);
    return [];
  }

  return (data ?? []) as DeliveredThreadsNote[];
}

/** Upsert a threads_insights row */
export async function upsertThreadsInsight(
  noteId: string,
  userId: string,
  metrics: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }
): Promise<void> {
  const { error } = await supabase.from("threads_insights").insert({
    note_id: noteId,
    user_id: userId,
    ...metrics,
    fetched_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`Failed to upsert insights for note ${noteId}:`, error.message);
  }
}
