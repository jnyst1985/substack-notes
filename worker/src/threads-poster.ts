import { extractPlainTextFromProseMirror, truncateForThreads } from "./content-utils.js";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const POST_DELAY_MS = 2000;

interface ThreadsPostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Post a single note to Threads via the official API.
 * Two-step process: create media container → publish it.
 */
async function postToThreads(
  threadsUserId: string,
  accessToken: string,
  text: string
): Promise<ThreadsPostResult> {
  try {
    // Step 1: Create media container
    const createRes = await fetch(
      `${THREADS_API_BASE}/${threadsUserId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          media_type: "TEXT",
          access_token: accessToken,
        }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      return {
        success: false,
        error: `Create container failed: HTTP ${createRes.status} - ${errText}`,
      };
    }

    const { id: creationId } = await createRes.json();

    // Step 2: Publish the container
    const publishRes = await fetch(
      `${THREADS_API_BASE}/${threadsUserId}/threads_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      return {
        success: false,
        error: `Publish failed: HTTP ${publishRes.status} - ${errText}`,
      };
    }

    const { id: postId } = await publishRes.json();
    return { success: true, postId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Post multiple notes to Threads for a single user.
 * Extracts plain text from ProseMirror JSON and truncates to 500 chars.
 */
export async function postThreadsNotes(
  threadsUserId: string,
  accessToken: string,
  notes: { id: string; content: string }[]
): Promise<Map<string, ThreadsPostResult>> {
  const results = new Map<string, ThreadsPostResult>();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    console.log(`Posting Threads note ${note.id}...`);

    const plainText = extractPlainTextFromProseMirror(note.content);
    const truncatedText = truncateForThreads(plainText);

    if (!truncatedText.trim()) {
      results.set(note.id, { success: false, error: "Empty content after text extraction" });
      continue;
    }

    const result = await postToThreads(threadsUserId, accessToken, truncatedText);
    results.set(note.id, result);

    if (result.success) {
      console.log(`Threads note ${note.id} posted: ${result.postId}`);
    } else {
      console.error(`Threads note ${note.id} failed: ${result.error}`);
    }

    // Delay between posts to avoid rate limiting
    if (i < notes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, POST_DELAY_MS));
    }
  }

  return results;
}
