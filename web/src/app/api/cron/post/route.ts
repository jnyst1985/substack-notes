import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { decrypt } from "@/lib/crypto";
import { postNoteToSubstack } from "@/lib/substack";

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all pending notes that are due
    const now = new Date().toISOString();
    const { data: pendingNotes, error: fetchError } = await supabase
      .from("scheduled_notes")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_time", now);

    if (fetchError) {
      console.error("Failed to fetch pending notes:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch pending notes" },
        { status: 500 }
      );
    }

    if (!pendingNotes || pendingNotes.length === 0) {
      return NextResponse.json({ message: "No pending notes", processed: 0 });
    }

    const results = [];

    for (const note of pendingNotes) {
      // Mark as posting
      await supabase
        .from("scheduled_notes")
        .update({ status: "posting" })
        .eq("id", note.id);

      // Get user's session token
      const { data: session, error: sessionError } = await supabase
        .from("user_sessions")
        .select("encrypted_token, expires_at")
        .eq("user_id", note.user_id)
        .single();

      if (sessionError || !session) {
        await supabase
          .from("scheduled_notes")
          .update({
            status: "failed",
            error: "No session token found. Please re-authenticate.",
          })
          .eq("id", note.id);

        results.push({ id: note.id, success: false, error: "No session" });
        continue;
      }

      // Check if token is expired
      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        await supabase
          .from("scheduled_notes")
          .update({
            status: "failed",
            error: "Session expired. Please re-authenticate.",
          })
          .eq("id", note.id);

        results.push({ id: note.id, success: false, error: "Session expired" });
        continue;
      }

      // Decrypt token and post
      const token = decrypt(session.encrypted_token);
      const postResult = await postNoteToSubstack(note.content, token);

      if (postResult.success) {
        await supabase
          .from("scheduled_notes")
          .update({
            status: "delivered",
            delivered_at: new Date().toISOString(),
          })
          .eq("id", note.id);

        results.push({ id: note.id, success: true });
      } else {
        await supabase
          .from("scheduled_notes")
          .update({
            status: "failed",
            error: postResult.error,
          })
          .eq("id", note.id);

        results.push({ id: note.id, success: false, error: postResult.error });
      }

      // Small delay between posts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      message: "Processed pending notes",
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
