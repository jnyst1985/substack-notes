import {
  getDueSubstackNotes,
  getDueThreadsNotes,
  getEncryptedToken,
  getThreadsSession,
  markNoteDelivered,
  markNoteFailed,
  setNotePlatformPostId,
  updateSessionVerified,
  clearSessionVerified,
  getExpiringThreadsSessions,
  updateThreadsToken,
  getDeliveredThreadsNotes,
  upsertThreadsInsight,
} from "./supabase.js";
import { decrypt } from "./crypto.js";
import { encrypt } from "./crypto-encrypt.js";
import { postNotesWithPuppeteer } from "./poster.js";
import { postThreadsNotes } from "./threads-poster.js";

const THREADS_REFRESH_URL = "https://graph.threads.net/refresh_access_token";
const THREADS_INSIGHTS_URL = "https://graph.threads.net";
// Refresh tokens expiring within 7 days
const TOKEN_REFRESH_WINDOW_DAYS = 7;
// 60 days for new long-lived token
const LONG_LIVED_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;
// Fetch insights for notes delivered in last 30 days
const INSIGHTS_LOOKBACK_DAYS = 30;

/** Step 1: Proactively refresh Threads tokens nearing expiry */
async function refreshExpiringThreadsTokens(): Promise<void> {
  const expiringSessions = await getExpiringThreadsSessions(TOKEN_REFRESH_WINDOW_DAYS);

  if (expiringSessions.length === 0) return;

  console.log(`Refreshing ${expiringSessions.length} expiring Threads token(s)...`);

  for (const session of expiringSessions) {
    try {
      const currentToken = decrypt(session.encrypted_access_token);

      const params = new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: currentToken,
      });

      const res = await fetch(`${THREADS_REFRESH_URL}?${params.toString()}`);

      if (!res.ok) {
        console.error(`Failed to refresh token for user ${session.user_id}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const newEncrypted = encrypt(data.access_token);
      const newExpiry = new Date(Date.now() + LONG_LIVED_TOKEN_LIFETIME_MS).toISOString();

      await updateThreadsToken(session.user_id, newEncrypted, newExpiry);
      console.log(`Refreshed Threads token for user ${session.user_id}`);
    } catch (err) {
      console.error(`Error refreshing token for user ${session.user_id}:`, err);
    }
  }
}

/** Step 2: Process due Substack notes (existing Puppeteer flow) */
async function processSubstackNotes(): Promise<void> {
  const dueNotes = await getDueSubstackNotes();

  if (dueNotes.length === 0) {
    console.log("No due Substack notes.");
    return;
  }

  console.log(`Found ${dueNotes.length} due Substack note(s).`);

  // Group notes by user so we can reuse one browser session per user
  const notesByUser = new Map<string, typeof dueNotes>();
  for (const note of dueNotes) {
    const userNotes = notesByUser.get(note.user_id) ?? [];
    userNotes.push(note);
    notesByUser.set(note.user_id, userNotes);
  }

  for (const [userId, userNotes] of notesByUser) {
    console.log(`Processing ${userNotes.length} Substack note(s) for user ${userId}`);

    const encryptedToken = await getEncryptedToken(userId);
    if (!encryptedToken) {
      console.error(`No session token for user ${userId}. Marking notes as failed.`);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "No Substack session configured");
      }
      continue;
    }

    let sessionToken: string;
    try {
      sessionToken = decrypt(encryptedToken);
    } catch (err) {
      console.error(`Failed to decrypt token for user ${userId}:`, err);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "Session token decryption failed");
      }
      continue;
    }

    const results = await postNotesWithPuppeteer(sessionToken, userNotes);

    let anySuccess = false;
    let sessionExpired = false;

    for (const [noteId, result] of results) {
      if (result.success) {
        await markNoteDelivered(noteId);
        anySuccess = true;
      } else {
        await markNoteFailed(noteId, result.error ?? "Unknown error");
        if (result.error?.includes("401") || result.error?.includes("403")) {
          sessionExpired = true;
        }
      }
    }

    if (anySuccess) {
      await updateSessionVerified(userId);
    }
    if (sessionExpired) {
      await clearSessionVerified(userId);
    }
  }
}

/** Step 3: Process due Threads notes (REST API, no Puppeteer) */
async function processThreadsNotes(): Promise<void> {
  const dueNotes = await getDueThreadsNotes();

  if (dueNotes.length === 0) {
    console.log("No due Threads notes.");
    return;
  }

  console.log(`Found ${dueNotes.length} due Threads note(s).`);

  // Group notes by user
  const notesByUser = new Map<string, typeof dueNotes>();
  for (const note of dueNotes) {
    const userNotes = notesByUser.get(note.user_id) ?? [];
    userNotes.push(note);
    notesByUser.set(note.user_id, userNotes);
  }

  for (const [userId, userNotes] of notesByUser) {
    console.log(`Processing ${userNotes.length} Threads note(s) for user ${userId}`);

    const session = await getThreadsSession(userId);
    if (!session) {
      console.error(`No Threads session for user ${userId}. Marking notes as failed.`);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "No Threads account connected");
      }
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decrypt(session.encrypted_access_token);
    } catch (err) {
      console.error(`Failed to decrypt Threads token for user ${userId}:`, err);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "Threads token decryption failed");
      }
      continue;
    }

    const results = await postThreadsNotes(
      session.threads_user_id,
      accessToken,
      userNotes
    );

    for (const [noteId, result] of results) {
      if (result.success) {
        await markNoteDelivered(noteId);
        if (result.postId) {
          await setNotePlatformPostId(noteId, result.postId);
        }
      } else {
        await markNoteFailed(noteId, result.error ?? "Unknown Threads error");
      }
    }
  }
}

/** Step 4: Fetch Threads insights for recently delivered notes */
async function fetchThreadsInsights(): Promise<void> {
  const deliveredNotes = await getDeliveredThreadsNotes(INSIGHTS_LOOKBACK_DAYS);

  if (deliveredNotes.length === 0) {
    console.log("No delivered Threads notes to fetch insights for.");
    return;
  }

  console.log(`Fetching insights for ${deliveredNotes.length} Threads note(s)...`);

  // Group by user to reuse access tokens
  const notesByUser = new Map<string, typeof deliveredNotes>();
  for (const note of deliveredNotes) {
    const userNotes = notesByUser.get(note.user_id) ?? [];
    userNotes.push(note);
    notesByUser.set(note.user_id, userNotes);
  }

  for (const [userId, userNotes] of notesByUser) {
    const session = await getThreadsSession(userId);
    if (!session) continue;

    let accessToken: string;
    try {
      accessToken = decrypt(session.encrypted_access_token);
    } catch {
      continue;
    }

    for (const note of userNotes) {
      try {
        const res = await fetch(
          `${THREADS_INSIGHTS_URL}/${note.platform_post_id}/insights` +
          `?metric=views,likes,replies,reposts,quotes` +
          `&access_token=${accessToken}`
        );

        if (!res.ok) {
          console.error(`Insights fetch failed for post ${note.platform_post_id}: HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const metrics: Record<string, number> = {
          views: 0,
          likes: 0,
          replies: 0,
          reposts: 0,
          quotes: 0,
        };

        // Parse the Threads insights response format
        if (data.data) {
          for (const item of data.data) {
            const name = item.name as string;
            if (name in metrics) {
              // values is an array with a single object containing "value"
              metrics[name] = item.values?.[0]?.value ?? 0;
            }
          }
        }

        await upsertThreadsInsight(note.id, userId, {
          views: metrics.views,
          likes: metrics.likes,
          replies: metrics.replies,
          reposts: metrics.reposts,
          quotes: metrics.quotes,
        });
      } catch (err) {
        console.error(`Error fetching insights for note ${note.id}:`, err);
      }
    }
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Cron worker starting...`);

  // Step 1: Refresh expiring Threads tokens
  await refreshExpiringThreadsTokens();

  // Step 2: Process Substack notes (Puppeteer)
  await processSubstackNotes();

  // Step 3: Process Threads notes (REST API)
  await processThreadsNotes();

  // Step 4: Fetch analytics for delivered Threads posts
  await fetchThreadsInsights();

  console.log("Cron worker finished.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cron worker crashed:", err);
  process.exit(1);
});
