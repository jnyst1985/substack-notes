"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { extractPlainText } from "@/components/rich-editor";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";
import type { ScheduledNote } from "@/lib/types";

interface CalendarViewProps {
  notes: ScheduledNote[];
  onEdit: (note: ScheduledNote) => void;
}

/** Format an ISO date string to a short time display (e.g. "10:10 PM") */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CalendarView({ notes, onEdit }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );

  // Build a set of date strings that have pending notes for calendar highlighting
  const pendingNotes = notes.filter((n) => n.status === "pending");
  const datesWithNotes = new Set(
    pendingNotes.map((n) =>
      new Date(n.scheduled_time).toLocaleDateString()
    )
  );

  const selectedDateStr = selectedDate?.toLocaleDateString();
  const notesForDay = notes.filter(
    (n) => new Date(n.scheduled_time).toLocaleDateString() === selectedDateStr
  );

  return (
    <div className="flex flex-col gap-4">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        modifiers={{
          hasNotes: (date) => datesWithNotes.has(date.toLocaleDateString()),
        }}
        modifiersStyles={{
          hasNotes: {
            fontWeight: "bold",
            textDecoration: "underline",
            textDecorationColor: "hsl(var(--primary))",
            textUnderlineOffset: "4px",
          },
        }}
        className="rounded-md border"
      />

      {selectedDate && notesForDay.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          <div className="flex flex-col gap-2">
            {notesForDay.map((note) => (
              <button
                key={note.id}
                onClick={() => note.status === "pending" && onEdit(note)}
                disabled={note.status !== "pending"}
                aria-label={`Edit note: ${extractPlainText(note.content).split("\n")[0].slice(0, 30)}`}
                className="flex items-center gap-2 p-2 rounded-md border text-left hover:bg-muted focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors disabled:opacity-60 disabled:cursor-default"
              >
                {note.platform === "substack" ? (
                  <SubstackIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ThreadsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(note.scheduled_time)}
                </span>
                <span className="text-sm flex-1 truncate">
                  {extractPlainText(note.content).split("\n")[0]}
                </span>
                <Badge
                  variant={
                    note.status === "delivered"
                      ? "default"
                      : note.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {note.status}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDate && notesForDay.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          No notes scheduled for this day
        </p>
      )}
    </div>
  );
}
