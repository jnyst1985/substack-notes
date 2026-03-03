import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/auth/threads/status — check Threads connection status
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("threads_sessions")
    .select("username, token_expires_at")
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    username: session.username,
    tokenExpiresAt: session.token_expires_at,
  });
}
