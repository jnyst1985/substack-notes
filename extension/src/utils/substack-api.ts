import type { ProseMirrorDoc, ScheduledNote } from "./types";
import { updateNote } from "./storage";

const API_BASE = "https://substack.com/api/v1";

export function textToProseMirror(text: string): ProseMirrorDoc {
  // Split by double newlines for paragraphs
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

export async function isAuthenticated(): Promise<boolean> {
  try {
    // Check for Substack session cookies (try both possible names)
    const substackSid = await chrome.cookies.get({
      url: "https://substack.com",
      name: "substack.sid",
    });
    const connectSid = await chrome.cookies.get({
      url: "https://substack.com",
      name: "connect.sid",
    });
    return substackSid !== null || connectSid !== null;
  } catch {
    return false;
  }
}

export async function postNote(note: ScheduledNote): Promise<void> {
  await updateNote(note.id, { status: "posting" });

  try {
    const response = await fetch(`${API_BASE}/comment/feed`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bodyJson: textToProseMirror(note.content),
        tabId: "for-you",
        surface: "feed",
        replyMinimumRole: "everyone",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    await updateNote(note.id, {
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    });
  } catch (error) {
    await updateNote(note.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
