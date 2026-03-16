import {
  getSubstackSessions,
  upsertSubstackPostInsight,
} from "./supabase.js";
import { SUBSTACK } from "./constants.js";

interface SubstackArchivePost {
  id: number;
  title: string;
  slug: string;
  post_date: string;
  type: string;
  reaction_count: number;
  comment_count: number;
  restacks: number;
}

/** Fetch public archive data for a Substack publication */
async function fetchPublicArchive(
  subdomain: string,
  limit: number
): Promise<SubstackArchivePost[]> {
  const url = `https://${subdomain}.substack.com/api/v1/archive?sort=new&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      // Identify as a standard browser request
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Archive fetch failed for ${subdomain}: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected archive response for ${subdomain}: not an array`);
  }

  return data.map((post: Record<string, unknown>) => ({
    id: post.id as number,
    title: (post.title as string) ?? "",
    slug: (post.slug as string) ?? "",
    post_date: post.post_date as string,
    type: (post.type as string) ?? "newsletter",
    reaction_count: (post.reaction_count as number) ?? 0,
    comment_count: (post.comment_count as number) ?? 0,
    restacks: (post.restacks as number) ?? 0,
  }));
}

/** Step 5: Fetch Substack insights for all configured users */
export async function fetchSubstackInsights(): Promise<void> {
  const sessions = await getSubstackSessions();

  if (sessions.length === 0) {
    console.log("No Substack sessions with subdomain configured.");
    return;
  }

  console.log(
    `Fetching Substack insights for ${sessions.length} user(s)...`
  );

  for (const session of sessions) {
    try {
      const posts = await fetchPublicArchive(
        session.subdomain,
        SUBSTACK.INSIGHTS_POST_LIMIT
      );

      console.log(
        `Fetched ${posts.length} posts for ${session.subdomain} (user ${session.user_id})`
      );

      for (const post of posts) {
        await upsertSubstackPostInsight(session.user_id, {
          post_id: String(post.id),
          title: post.title,
          slug: post.slug,
          post_date: post.post_date,
          type: post.type,
          reaction_count: post.reaction_count,
          comment_count: post.comment_count,
          restacks: post.restacks,
        });
      }
    } catch (err) {
      console.error(
        `Error fetching Substack insights for user ${session.user_id}:`,
        err
      );
    }
  }
}
