import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/analytics/threads — aggregated Threads insights
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all insights for this user, most recent per note
  const { data: insights, error: insightsError } = await supabase
    .from("threads_insights")
    .select("note_id, views, likes, replies, reposts, quotes, fetched_at")
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false });

  if (insightsError) {
    return NextResponse.json({ error: insightsError.message }, { status: 500 });
  }

  // Deduplicate: keep only the most recent insight per note
  const latestByNote = new Map<string, typeof insights[0]>();
  for (const row of insights ?? []) {
    if (!latestByNote.has(row.note_id)) {
      latestByNote.set(row.note_id, row);
    }
  }
  const latestInsights = Array.from(latestByNote.values());

  // Summary totals
  const summary = {
    totalViews: 0,
    totalLikes: 0,
    totalReplies: 0,
    totalReposts: 0,
  };

  for (const row of latestInsights) {
    summary.totalViews += row.views;
    summary.totalLikes += row.likes;
    summary.totalReplies += row.replies;
    summary.totalReposts += row.reposts;
  }

  // Get the associated notes for the per-post breakdown
  const noteIds = latestInsights.map((r) => r.note_id);
  const { data: notes } = noteIds.length > 0
    ? await supabase
        .from("scheduled_notes")
        .select("id, content, delivered_at")
        .in("id", noteIds)
        .order("delivered_at", { ascending: false })
    : { data: [] };

  // Build per-post breakdown
  const posts = (notes ?? []).map((note) => {
    const insight = latestByNote.get(note.id);
    return {
      noteId: note.id,
      content: note.content,
      deliveredAt: note.delivered_at,
      views: insight?.views ?? 0,
      likes: insight?.likes ?? 0,
      replies: insight?.replies ?? 0,
      reposts: insight?.reposts ?? 0,
      quotes: insight?.quotes ?? 0,
    };
  });

  // Daily trend data: for each date, use only the latest snapshot per note
  // to show total engagement as of that date (not cumulative sums of snapshots)
  const dailyNoteMap = new Map<string, Map<string, typeof insights[0]>>();
  for (const row of insights ?? []) {
    const dateStr = new Date(row.fetched_at).toISOString().slice(0, 10);
    if (!dailyNoteMap.has(dateStr)) {
      dailyNoteMap.set(dateStr, new Map());
    }
    const noteMap = dailyNoteMap.get(dateStr)!;
    // Keep only the latest entry per note per day (already sorted desc)
    if (!noteMap.has(row.note_id)) {
      noteMap.set(row.note_id, row);
    }
  }
  const dailyMap = new Map<string, { views: number; likes: number; replies: number }>();
  for (const [dateStr, noteMap] of dailyNoteMap) {
    const totals = { views: 0, likes: 0, replies: 0 };
    for (const row of noteMap.values()) {
      totals.views += row.views;
      totals.likes += row.likes;
      totals.replies += row.replies;
    }
    dailyMap.set(dateStr, totals);
  }

  const dailyTrends = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    summary,
    posts,
    dailyTrends,
  });
}
