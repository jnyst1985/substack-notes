"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { extractPlainText } from "@/components/rich-editor";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";
import type { ScheduledNote, Platform, ThreadsInsight } from "@/lib/types";

interface NotesListProps {
  notes: ScheduledNote[];
  onEdit: (note: ScheduledNote) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  editingNoteId: string | null;
  threadsInsights?: Record<string, ThreadsInsight>;
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

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {platform === "substack" ? (
        <SubstackIcon className="h-3 w-3" />
      ) : (
        <ThreadsIcon className="h-3 w-3" />
      )}
      {platform === "substack" ? "Substack" : "Threads"}
    </span>
  );
}

/** Group notes by group_id for cross-post display */
function groupNotes(notes: ScheduledNote[]): (ScheduledNote | ScheduledNote[])[] {
  const grouped: (ScheduledNote | ScheduledNote[])[] = [];
  const seenGroupIds = new Set<string>();

  for (const note of notes) {
    if (note.group_id) {
      if (seenGroupIds.has(note.group_id)) continue;
      seenGroupIds.add(note.group_id);
      const groupNotes = notes.filter((n) => n.group_id === note.group_id);
      grouped.push(groupNotes);
    } else {
      grouped.push(note);
    }
  }
  return grouped;
}

function NoteCard({
  note,
  onEdit,
  onDelete,
  onRetry,
  editingNoteId,
  insight,
  isGrouped,
}: {
  note: ScheduledNote;
  onEdit: (note: ScheduledNote) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  editingNoteId: string | null;
  insight?: ThreadsInsight;
  isGrouped?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-3 ${
        editingNoteId === note.id
          ? "bg-muted rounded-lg px-3 -mx-3 ring-1 ring-ring"
          : ""
      } ${isGrouped ? "pl-4 border-l-2 border-muted" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <PlatformBadge platform={note.platform} />
        </div>
        <p className="text-sm truncate">
          {truncate(extractPlainText(note.content).split("\n")[0], 60)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(note.scheduled_time)}
        </p>
        {/* Inline Threads stats for delivered notes */}
        {insight && note.status === "delivered" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {insight.views} views · {insight.likes} likes
          </p>
        )}
      </div>
      {note.status === "pending" && (
        <>
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
        </>
      )}
      {note.status === "failed" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRetry(note.id)}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

export function NotesList({
  notes,
  onEdit,
  onDelete,
  onRetry,
  editingNoteId,
  threadsInsights = {},
}: NotesListProps) {
  const pending = useMemo(() => notes.filter((n) => n.status === "pending"), [notes]);
  const delivered = useMemo(() => notes.filter((n) => n.status === "delivered"), [notes]);
  const failed = useMemo(() => notes.filter((n) => n.status === "failed"), [notes]);

  const groupedPending = useMemo(() => groupNotes(pending), [pending]);
  const groupedDelivered = useMemo(() => groupNotes(delivered), [delivered]);

  return (
    <div className="flex flex-col gap-6">
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="flex flex-col divide-y">
            {groupedPending.map((item) => {
              if (Array.isArray(item)) {
                // Cross-post group
                return (
                  <div key={item[0].group_id} className="py-1">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Cross-post</p>
                    {item.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onRetry={onRetry}
                        editingNoteId={editingNoteId}
                        isGrouped
                      />
                    ))}
                  </div>
                );
              }
              return (
                <NoteCard
                  key={item.id}
                  note={item}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onRetry={onRetry}
                  editingNoteId={editingNoteId}
                />
              );
            })}
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
                  <div className="flex items-center gap-2 mb-0.5">
                    <PlatformBadge platform={note.platform} />
                  </div>
                  <p className="text-sm truncate">
                    {truncate(extractPlainText(note.content).split("\n")[0], 50)}
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
          <div className="flex flex-col divide-y">
            {groupedDelivered.slice(0, 5).map((item) => {
              if (Array.isArray(item)) {
                return (
                  <div key={item[0].group_id} className="py-1">
                    {item.map((note) => (
                      <div key={note.id} className="flex items-center gap-2 py-1 pl-4 border-l-2 border-muted">
                        <PlatformBadge platform={note.platform} />
                        <p className="text-xs text-muted-foreground flex-1 truncate">
                          {truncate(extractPlainText(note.content).split("\n")[0], 40)}
                        </p>
                        {threadsInsights[note.id] && (
                          <span className="text-xs text-muted-foreground">
                            {threadsInsights[note.id].views} views · {threadsInsights[note.id].likes} likes
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(note.delivered_at!)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div key={item.id} className="flex items-center gap-2 py-2">
                  <PlatformBadge platform={item.platform} />
                  <p className="text-xs text-muted-foreground flex-1 truncate">
                    {truncate(extractPlainText(item.content).split("\n")[0], 40)}
                  </p>
                  {threadsInsights[item.id] && (
                    <span className="text-xs text-muted-foreground">
                      {threadsInsights[item.id].views} views · {threadsInsights[item.id].likes} likes
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(item.delivered_at!)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
