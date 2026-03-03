import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
  "threads_read_replies",
];

// GET /api/auth/threads — redirect to Meta OAuth
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.THREADS_APP_ID;
  const redirectUri = process.env.THREADS_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: "Threads OAuth not configured" },
      { status: 500 }
    );
  }

  // Build URL manually — URLSearchParams encodes commas in scope which
  // breaks Meta's OAuth parser
  const query = [
    `client_id=${encodeURIComponent(appId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${SCOPES.join(",")}`,
    `response_type=code`,
    `state=${encodeURIComponent(user.id)}`,
  ].join("&");

  return NextResponse.redirect(`${THREADS_AUTH_URL}?${query}`);
}
