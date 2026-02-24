import { useState, useEffect } from "react";
import { isAuthenticated } from "../utils/substack-api";
import {
  syncSessionToken,
  getNotesFromBackend,
  createNoteInBackend,
  updateNoteInBackend,
  deleteNoteFromBackend,
  isBackendSynced,
  setBackendSynced,
  processDueNotes,
} from "../utils/backend-api";
import type { ScheduledNote } from "../utils/types";

// Calendar icon SVG component
function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#737373"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// Pencil/Edit icon SVG component
function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// X/Delete icon SVG component
function DeleteIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function App() {
  const [content, setContent] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

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
        // Process any due notes first (post them from extension)
        const result = await processDueNotes();
        if (result.posted > 0) {
          console.log(`Posted ${result.posted} due note(s) from extension`);
        }
        if (result.failed > 0) {
          console.error(`Failed to post ${result.failed} note(s):`, result.errors);
        }

        // Then load all notes to display
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

  function handleEdit(note: ScheduledNote) {
    setEditingNoteId(note.id);
    setContent(note.content);
    const date = new Date(note.scheduledTime);
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledTime(localDateTime);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingNoteId(null);
    setContent("");
    setScheduledTime("");
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingNoteId || !content.trim() || !scheduledTime) return;

    setIsSubmitting(true);
    setEditError(null);

    const result = await updateNoteInBackend(
      editingNoteId,
      content.trim(),
      new Date(scheduledTime).toISOString()
    );

    if (result.note) {
      setEditingNoteId(null);
      setContent("");
      setScheduledTime("");
      await loadNotes();
    } else if (result.nextCronTime) {
      const nextCron = new Date(result.nextCronTime);
      setEditError(
        `Please schedule after ${nextCron.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      );
    } else {
      setEditError(result.error || "Failed to update note");
    }

    setIsSubmitting(false);
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncate(text: string, length: number): string {
    if (text.length <= length) return text;
    return text.slice(0, length) + "...";
  }

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  }

  if (isLoggedIn === null) {
    return (
      <div className="bg-[#fafafa] rounded-xl border border-[#e5e5e5] p-6 text-center text-[#737373]">
        Loading...
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="bg-[#fafafa] rounded-xl border border-[#e5e5e5] p-6 text-center">
        <p className="text-red-600 mb-2 font-medium">Not logged into Substack</p>
        <p className="text-sm text-[#737373]">
          Please log into{" "}
          <a
            href="https://substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#171717] underline"
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
      <div className="bg-[#fafafa] rounded-xl border border-[#e5e5e5] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#0a0a0a] mb-4">
          Enable Cloud Sync
        </h1>
        <p className="text-sm text-[#737373] mb-4">
          Cloud sync allows your notes to be posted even when your computer is
          off. Your Substack session will be securely stored.
        </p>
        <button
          onClick={handleEnableCloudSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-[#171717] text-white rounded-md text-sm font-medium hover:bg-[#262626] disabled:opacity-50"
        >
          {isSyncing ? "Syncing..." : "Enable Cloud Sync"}
        </button>
      </div>
    );
  }

  const pendingNotes = notes.filter((n) => n.status === "pending");

  return (
    <div className="bg-[#fafafa] rounded-xl border border-[#e5e5e5] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4">
        <h1 className="text-lg font-semibold text-[#0a0a0a]">
          {editingNoteId ? "Edit Note" : "Schedule a Note"}
        </h1>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#22c55e] rounded-full"></span>
          <span className="text-[13px] font-medium text-[#22c55e]">Cloud</span>
        </div>
      </div>

      {/* Form Area */}
      <div className="px-6 pb-5 flex flex-col gap-4">
        {/* Textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note..."
          className="w-full h-[120px] p-3 bg-[#fafafa] border border-[#e5e5e5] rounded-md resize-none text-sm text-[#0a0a0a] placeholder:text-[#737373] focus:outline-none focus:ring-2 focus:ring-[#171717] focus:border-transparent"
        />

        {/* Date Input Row */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon />
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              min={getMinDateTime()}
              className="flex-1 p-2 bg-transparent border border-[#e5e5e5] rounded-md text-sm text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#171717] focus:border-transparent"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2">
            {editingNoteId ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-transparent border border-[#e5e5e5] text-[#171717] rounded-md text-sm font-medium hover:bg-[#f5f5f5] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!content.trim() || !scheduledTime || isSubmitting}
                  className="px-4 py-2 bg-[#22c55e] text-white rounded-md text-sm font-medium hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={handleSchedule}
                disabled={!content.trim() || !scheduledTime || isSubmitting}
                className="px-4 py-2 bg-[#171717] text-white rounded-md text-sm font-medium hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "..." : "Schedule"}
              </button>
            )}
          </div>
        </div>

        {editError && (
          <p className="text-sm text-red-600">{editError}</p>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#e5e5e5]" />

      {/* Upcoming Section */}
      {pendingNotes.length > 0 && (
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-[#0a0a0a]">Upcoming</h2>
            <span className="px-2 py-0.5 border border-[#e5e5e5] rounded-full text-[11px] font-semibold text-[#0a0a0a]">
              {pendingNotes.length}
            </span>
          </div>
          <ul className="flex flex-col">
            {pendingNotes.map((note, index) => (
              <li
                key={note.id}
                className={`flex items-center gap-2 py-3 ${
                  editingNoteId === note.id
                    ? "bg-[#f5f5f5] rounded-lg px-3 -mx-3 border border-[#171717]"
                    : index < pendingNotes.length - 1
                    ? "border-b border-[#e5e5e5]"
                    : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0a0a0a] truncate">
                    {truncate(note.content.split("\n")[0], 35)}
                  </p>
                  <p className="text-xs text-[#737373]">
                    {formatDate(note.scheduledTime)}
                  </p>
                </div>
                <button
                  onClick={() => handleEdit(note)}
                  disabled={editingNoteId !== null}
                  className="p-1 text-[#a3a3a3] hover:text-[#171717] disabled:opacity-30 transition-colors"
                  title="Edit"
                >
                  <EditIcon />
                </button>
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={editingNoteId !== null}
                  className="p-1 text-[#a3a3a3] hover:text-red-500 disabled:opacity-30 transition-colors"
                  title="Delete"
                >
                  <DeleteIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recently Posted Section */}
      {notes.some((n) => n.status === "delivered") && (
        <>
          <div className="h-px bg-[#e5e5e5]" />
          <div className="px-6 py-4">
            <h2 className="text-sm font-semibold text-[#0a0a0a] mb-2">
              Recently Posted
            </h2>
            <ul className="flex flex-col gap-1">
              {notes
                .filter((n) => n.status === "delivered")
                .slice(0, 3)
                .map((note) => (
                  <li key={note.id} className="text-xs text-[#737373]">
                    {truncate(note.content.split("\n")[0], 30)} -{" "}
                    {formatDate(note.deliveredAt!)}
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}

      {/* Failed Section */}
      {notes.some((n) => n.status === "failed") && (
        <>
          <div className="h-px bg-[#e5e5e5]" />
          <div className="px-6 py-4">
            <h2 className="text-sm font-semibold text-red-600 mb-2">Failed</h2>
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
        </>
      )}
    </div>
  );
}

export default App;
