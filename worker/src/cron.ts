import {
  getDueNotes,
  getEncryptedToken,
  markNoteDelivered,
  markNoteFailed,
  updateSessionVerified,
  clearSessionVerified,
} from "./supabase.js";
import { decrypt } from "./crypto.js";
import { postNotesWithPuppeteer } from "./poster.js";

async function main() {
  console.log(`[${new Date().toISOString()}] Cron worker starting...`);

  const dueNotes = await getDueNotes();

  if (dueNotes.length === 0) {
    console.log("No due notes. Exiting.");
    process.exit(0);
  }

  console.log(`Found ${dueNotes.length} due note(s).`);

  // Group notes by user so we can reuse one browser session per user
  const notesByUser = new Map<string, typeof dueNotes>();
  for (const note of dueNotes) {
    const userNotes = notesByUser.get(note.user_id) ?? [];
    userNotes.push(note);
    notesByUser.set(note.user_id, userNotes);
  }

  for (const [userId, userNotes] of notesByUser) {
    console.log(`Processing ${userNotes.length} note(s) for user ${userId}`);

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
        // Detect expired sessions from HTTP 401/403 responses
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

  console.log("Cron worker finished.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cron worker crashed:", err);
  process.exit(1);
});
