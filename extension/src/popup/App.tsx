import { useState, useEffect } from "react";
import { isAuthenticated } from "../utils/substack-api";
import {
  syncSessionToken,
  getNotesFromBackend,
  createNoteInBackend,
  deleteNoteFromBackend,
  isBackendSynced,
  setBackendSynced,
} from "../utils/backend-api";
import type { ScheduledNote } from "../utils/types";

function App() {
  const [content, setContent] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const authenticated = await isAuthenticated();
    setIsLoggedIn(authenticated);

    if (authenticated) {
      const synced = await isBackendSynced();
      setCloudSynced(synced);

      if (synced) {
        await loadNotes();
      }
    }
  }

  async function loadNotes() {
    const backendNotes = await getNotesFromBackend();
    const sorted = backendNotes.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (
        new Date(a.scheduledTime).getTime() -
        new Date(b.scheduledTime).getTime()
      );
    });
    setNotes(sorted);
  }

  async function handleEnableCloudSync() {
    setIsSyncing(true);
    const success = await syncSessionToken();
    if (success) {
      await setBackendSynced(true);
      setCloudSynced(true);
      await loadNotes();
    } else {
      alert("Failed to sync with cloud. Please try again.");
    }
    setIsSyncing(false);
  }

  async function handleSchedule() {
    if (!content.trim() || !scheduledTime) return;

    setIsSubmitting(true);

    const note = await createNoteInBackend(
      content.trim(),
      new Date(scheduledTime).toISOString()
    );

    if (note) {
      setContent("");
      setScheduledTime("");
      await loadNotes();
    } else {
      alert("Failed to schedule note. Please try again.");
    }

    setIsSubmitting(false);
  }

  async function handleDelete(id: string) {
    const success = await deleteNoteFromBackend(id);
    if (success) {
      await loadNotes();
    }
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function truncate(text: string, length: number): string {
    if (text.length <= length) return text;
    return text.slice(0, length) + "...";
  }

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // At least 5 minutes from now (cron interval)
    return now.toISOString().slice(0, 16);
  }

  if (isLoggedIn === null) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-600 mb-2">Not logged into Substack</p>
        <p className="text-sm text-gray-600">
          Please log into{" "}
          <a
            href="https://substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 underline"
          >
            substack.com
          </a>{" "}
          first.
        </p>
      </div>
    );
  }

  if (!cloudSynced) {
    return (
      <div className="p-4 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">
          Enable Cloud Sync
        </h1>
        <p className="text-sm text-gray-600 mb-4">
          Cloud sync allows your notes to be posted even when your computer is
          off. Your Substack session will be securely stored.
        </p>
        <button
          onClick={handleEnableCloudSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
        >
          {isSyncing ? "Syncing..." : "Enable Cloud Sync"}
        </button>
      </div>
    );
  }

  const pendingNotes = notes.filter((n) => n.status === "pending");

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Schedule a Note</h1>
        <span className="text-xs text-green-600 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          Cloud
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your note..."
        className="w-full h-28 p-3 border border-gray-300 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      />

      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          min={getMinDateTime()}
          className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        <button
          onClick={handleSchedule}
          disabled={!content.trim() || !scheduledTime || isSubmitting}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "..." : "Schedule"}
        </button>
      </div>

      {pendingNotes.length > 0 && (
        <div className="border-t pt-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Upcoming ({pendingNotes.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingNotes.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {truncate(note.content.split("\n")[0], 40)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(note.scheduledTime)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  className="text-gray-400 hover:text-red-500 text-sm p-1"
                  title="Delete"
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.some((n) => n.status === "delivered") && (
        <div className="border-t pt-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Recently Posted
          </h2>
          <ul className="flex flex-col gap-1">
            {notes
              .filter((n) => n.status === "delivered")
              .slice(0, 3)
              .map((note) => (
                <li key={note.id} className="text-xs text-gray-500">
                  {truncate(note.content.split("\n")[0], 30)} -{" "}
                  {formatDate(note.deliveredAt!)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {notes.some((n) => n.status === "failed") && (
        <div className="border-t pt-4">
          <h2 className="text-sm font-medium text-red-600 mb-2">Failed</h2>
          <ul className="flex flex-col gap-1">
            {notes
              .filter((n) => n.status === "failed")
              .map((note) => (
                <li key={note.id} className="text-xs text-red-500">
                  {truncate(note.content.split("\n")[0], 30)} - {note.error}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
