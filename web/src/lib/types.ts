export type NoteStatus = "pending" | "posting" | "delivered" | "failed";

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
}

export interface SubstackSession {
  id: string;
  user_id: string;
  encrypted_token: string;
  updated_at: string;
  last_verified_at: string | null;
}
