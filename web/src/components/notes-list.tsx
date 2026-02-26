"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ScheduledNote } from "@/lib/types";

interface NotesListProps {
  notes: ScheduledNote[];
  onEdit: (note: ScheduledNote) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  editingNoteId: string | null;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

export function NotesList({
  notes,
  onEdit,
  onDelete,
  onRetry,
  editingNoteId,
}: NotesListProps) {
  const pending = notes.filter((n) => n.status === "pending");
  const delivered = notes.filter((n) => n.status === "delivered");
  const failed = notes.filter((n) => n.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="flex flex-col divide-y">
            {pending.map((note) => (
              <div
                key={note.id}
                className={`flex items-center gap-3 py-3 ${
                  editingNoteId === note.id
                    ? "bg-muted rounded-lg px-3 -mx-3 ring-1 ring-ring"
                    : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {truncate(note.content.split("\n")[0], 60)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(note.scheduled_time)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(note)}
                  disabled={editingNoteId !== null}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(note.id)}
                  disabled={editingNoteId !== null}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-destructive mb-3">
            Failed
          </h2>
          <div className="flex flex-col divide-y">
            {failed.map((note) => (
              <div key={note.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {truncate(note.content.split("\n")[0], 50)}
                  </p>
                  <p className="text-xs text-destructive">{note.error}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(note.id)}
                >
                  Retry
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {delivered.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            Recently Posted
          </h2>
          <div className="flex flex-col gap-1">
            {delivered.slice(0, 5).map((note) => (
              <p key={note.id} className="text-xs text-muted-foreground">
                {truncate(note.content.split("\n")[0], 50)} —{" "}
                {formatDate(note.delivered_at!)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
