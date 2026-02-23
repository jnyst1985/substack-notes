import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseInstance;
}

// For backwards compatibility
export const supabase = {
  from: (table: string) => getSupabase().from(table),
};

export interface UserSession {
  id: string;
  user_id: string;
  encrypted_token: string;
  created_at: string;
  expires_at: string | null;
}

export interface ScheduledNote {
  id: string;
  user_id: string;
  content: string;
  scheduled_time: string;
  status: "pending" | "posting" | "delivered" | "failed";
  error: string | null;
  created_at: string;
  delivered_at: string | null;
}
