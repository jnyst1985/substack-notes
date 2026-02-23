import { getNotes, getPendingNotes } from "../utils/storage";
import { postNote } from "../utils/substack-api";
import type { ScheduledNote } from "../utils/types";

// Schedule an alarm for a note
export async function scheduleAlarm(note: ScheduledNote): Promise<void> {
  const when = new Date(note.scheduledTime).getTime();
  if (when > Date.now()) {
    await chrome.alarms.create(note.id, { when });
  }
}

// Cancel an alarm for a note
export async function cancelAlarm(noteId: string): Promise<void> {
  await chrome.alarms.clear(noteId);
}

// Handle alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const notes = await getNotes();
  const note = notes.find((n) => n.id === alarm.name);

  if (note && note.status === "pending") {
    await postNote(note);
  }
});

// Re-register alarms when service worker starts (after browser restart)
async function registerPendingAlarms(): Promise<void> {
  const pendingNotes = await getPendingNotes();

  for (const note of pendingNotes) {
    const scheduledTime = new Date(note.scheduledTime).getTime();

    if (scheduledTime <= Date.now()) {
      // Past due - post immediately
      await postNote(note);
    } else {
      // Future - schedule alarm
      await scheduleAlarm(note);
    }
  }
}

// Run on service worker startup
chrome.runtime.onStartup.addListener(registerPendingAlarms);

// Also run when extension is installed/updated
chrome.runtime.onInstalled.addListener(registerPendingAlarms);

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCHEDULE_NOTE") {
    scheduleAlarm(message.note).then(() => sendResponse({ success: true }));
    return true; // Will respond asynchronously
  }

  if (message.type === "CANCEL_ALARM") {
    cancelAlarm(message.noteId).then(() => sendResponse({ success: true }));
    return true;
  }
});
