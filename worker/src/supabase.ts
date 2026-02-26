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

export async function getDueNotes(): Promise<DueNote[]> {
  const { data, error } = await supabase
    .from("scheduled_notes")
    .select("id, user_id, content, scheduled_time")
    .eq("status", "pending")
    .lte("scheduled_time", new Date().toISOString())
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Failed to query due notes:", error.message);
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
