import type { ScheduledNote } from "./types";

const STORAGE_KEY = "scheduledNotes";

export async function getNotes(): Promise<ScheduledNote[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function addNote(note: ScheduledNote): Promise<void> {
  const notes = await getNotes();
  notes.push(note);
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
}

export async function updateNote(
  id: string,
  updates: Partial<ScheduledNote>
): Promise<void> {
  const notes = await getNotes();
  const index = notes.findIndex((n) => n.id === id);
  if (index >= 0) {
    notes[index] = { ...notes[index], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEY]: notes });
  }
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getNotes();
  await chrome.storage.local.set({
    [STORAGE_KEY]: notes.filter((n) => n.id !== id),
  });
}

export async function getPendingNotes(): Promise<ScheduledNote[]> {
  const notes = await getNotes();
  return notes.filter((n) => n.status === "pending");
}
