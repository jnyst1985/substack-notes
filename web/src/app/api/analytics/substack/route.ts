import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/analytics/substack — aggregated Substack post insights
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all post insights, most recent per post
  const { data: insights, error: insightsError } = await supabase
    .from("substack_post_insights")
    .select(
      "post_id, title, slug, post_date, type, reaction_count, comment_count, restacks, views, fetched_at"
    )
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false });

  if (insightsError) {
    return NextResponse.json(
      { error: insightsError.message },
      { status: 500 }
    );
  }

  // Deduplicate: keep only the most recent insight per post
  const latestByPost = new Map<string, (typeof insights)[0]>();
  for (const row of insights ?? []) {
    if (!latestByPost.has(row.post_id)) {
      latestByPost.set(row.post_id, row);
    }
  }
  const latestInsights = Array.from(latestByPost.values());

  // Summary totals
  const summary = {
    totalReactions: 0,
    totalComments: 0,
    totalRestacks: 0,
    postCount: latestInsights.length,
  };

  for (const row of latestInsights) {
    summary.totalReactions += row.reaction_count ?? 0;
    summary.totalComments += row.comment_count ?? 0;
    summary.totalRestacks += row.restacks ?? 0;
  }

  // Build per-post breakdown sorted by post_date desc
  const posts = latestInsights
    .map((row) => ({
      postId: row.post_id,
      title: row.title,
      slug: row.slug,
      postDate: row.post_date,
      type: row.type,
      reactions: row.reaction_count ?? 0,
      comments: row.comment_count ?? 0,
      restacks: row.restacks ?? 0,
      views: row.views,
    }))
    .sort(
      (a, b) =>
        new Date(b.postDate ?? 0).getTime() -
        new Date(a.postDate ?? 0).getTime()
    );

  // Get latest subscriber stats
  const { data: subStats } = await supabase
    .from("substack_subscriber_stats")
    .select("total_subscribers, free_subscribers, paid_subscribers, fetched_at")
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  const subscriber = subStats
    ? {
        total: subStats.total_subscribers,
        free: subStats.free_subscribers,
        paid: subStats.paid_subscribers,
        lastUpdated: subStats.fetched_at,
      }
    : null;

  return NextResponse.json({
    subscriber,
    summary,
    posts,
  });
}
