import type { ScheduledNote } from "./types";

const API_BASE = "https://substack-notes-xvxq.vercel.app";

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
