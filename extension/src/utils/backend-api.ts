import type { ScheduledNote, ProseMirrorDoc } from "./types";

const API_BASE = "https://substack-notes-xvxq.vercel.app";

// Convert text to ProseMirror format for Substack API
function textToProseMirror(text: string): ProseMirrorDoc {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return {
    type: "doc",
    attrs: { schemaVersion: "v1" },
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.trim() }],
    })),
  };
}

// Get or create a persistent user ID
async function getUserId(): Promise<string> {
  const result = await chrome.storage.local.get("userId");
  if (result.userId) {
    return result.userId;
  }
  const userId = crypto.randomUUID();
  await chrome.storage.local.set({ userId });
  return userId;
}

export async function syncSessionToken(): Promise<boolean> {
  try {
    // Get the session cookie
    const substackSid = await chrome.cookies.get({
      url: "https://substack.com",
      name: "substack.sid",
    });

    const token = substackSid?.value;
    if (!token) {
      return false;
    }

    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionToken: token }),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to sync session token:", error);
    return false;
  }
}

export async function getNotesFromBackend(): Promise<ScheduledNote[]> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes`, {
      headers: { "x-user-id": userId },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch notes");
    }

    const data = await response.json();

    // Map backend format to extension format
    return data.notes.map(
      (note: {
        id: string;
        content: string;
        scheduled_time: string;
        created_at: string;
        status: string;
        error: string | null;
        delivered_at: string | null;
      }) => ({
        id: note.id,
        content: note.content,
        scheduledTime: note.scheduled_time,
        createdAt: note.created_at,
        status: note.status,
        error: note.error,
        deliveredAt: note.delivered_at,
      })
    );
  } catch (error) {
    console.error("Failed to fetch notes from backend:", error);
    return [];
  }
}

export async function createNoteInBackend(
  content: string,
  scheduledTime: string
): Promise<ScheduledNote | null> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({ content, scheduledTime }),
    });

    if (!response.ok) {
      throw new Error("Failed to create note");
    }

    const data = await response.json();
    const note = data.note;

    return {
      id: note.id,
      content: note.content,
      scheduledTime: note.scheduled_time,
      createdAt: note.created_at,
      status: note.status,
      error: note.error,
      deliveredAt: note.delivered_at,
    };
  } catch (error) {
    console.error("Failed to create note in backend:", error);
    return null;
  }
}

export async function updateNoteInBackend(
  noteId: string,
  content: string,
  scheduledTime: string
): Promise<{ note: ScheduledNote | null; error?: string; nextCronTime?: string }> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({ id: noteId, content, scheduledTime }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        note: null,
        error: data.error || "Failed to update note",
        nextCronTime: data.nextCronTime,
      };
    }

    const note = data.note;
    return {
      note: {
        id: note.id,
        content: note.content,
        scheduledTime: note.scheduled_time,
        createdAt: note.created_at,
        status: note.status,
        error: note.error,
        deliveredAt: note.delivered_at,
      },
    };
  } catch (error) {
    console.error("Failed to update note in backend:", error);
    return { note: null, error: "Network error" };
  }
}

export async function deleteNoteFromBackend(noteId: string): Promise<boolean> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes?id=${noteId}`, {
      method: "DELETE",
      headers: { "x-user-id": userId },
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to delete note from backend:", error);
    return false;
  }
}

export async function isBackendSynced(): Promise<boolean> {
  const result = await chrome.storage.local.get("backendSynced");
  return result.backendSynced === true;
}

export async function setBackendSynced(synced: boolean): Promise<void> {
  await chrome.storage.local.set({ backendSynced: synced });
}

// Mark a note as delivered in the backend (after posting from extension)
export async function markNoteDeliveredInBackend(
  noteId: string
): Promise<boolean> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({ id: noteId }),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to mark note delivered:", error);
    return false;
  }
}

// Mark a note as failed in the backend
export async function markNoteFailedInBackend(
  noteId: string,
  error: string
): Promise<boolean> {
  try {
    const userId = await getUserId();

    const response = await fetch(`${API_BASE}/api/notes/fail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({ id: noteId, error }),
    });

    return response.ok;
  } catch (err) {
    console.error("Failed to mark note failed:", err);
    return false;
  }
}

// Post a note directly to Substack from the extension
async function postNoteToSubstack(
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://substack.com/api/v1/comment/feed", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bodyJson: textToProseMirror(content),
        tabId: "for-you",
        surface: "feed",
        replyMinimumRole: "everyone",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check for due notes and post them from the extension
// Returns the number of notes posted
export async function processDueNotes(): Promise<{
  posted: number;
  failed: number;
  errors: string[];
}> {
  const result = { posted: 0, failed: 0, errors: [] as string[] };

  try {
    const notes = await getNotesFromBackend();
    const now = new Date();

    // Find pending notes that are due (scheduled time is in the past)
    const dueNotes = notes.filter(
      (note) =>
        note.status === "pending" && new Date(note.scheduledTime) <= now
    );

    for (const note of dueNotes) {
      console.log(`Posting due note: ${note.id}`);

      const postResult = await postNoteToSubstack(note.content);

      if (postResult.success) {
        await markNoteDeliveredInBackend(note.id);
        result.posted++;
        console.log(`Successfully posted note: ${note.id}`);
      } else {
        const errorMsg = postResult.error || "Unknown error";
        await markNoteFailedInBackend(note.id, errorMsg);
        result.failed++;
        result.errors.push(`Note ${note.id}: ${errorMsg}`);
        console.error(`Failed to post note ${note.id}:`, errorMsg);
      }

      // Small delay between posts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error("Error processing due notes:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  return result;
}
