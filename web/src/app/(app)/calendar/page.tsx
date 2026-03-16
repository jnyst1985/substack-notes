"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { extractPlainText } from "@/components/rich-editor";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ScheduledNote } from "@/lib/types";

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const loadNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    if (res.ok) {
      const data = await res.json();
      setNotes(data.notes);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  // Build a map of date -> notes for quick lookup
  const notesByDate = useMemo(() => {
    const map = new Map<string, ScheduledNote[]>();
    for (const note of notes) {
      const d = new Date(note.scheduled_time);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(note);
    }
    return map;
  }, [notes]);

  function getNotesForDate(date: Date): ScheduledNote[] {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return notesByDate.get(key) ?? [];
  }

  function hasNotes(day: number): boolean {
    const key = `${year}-${month}-${day}`;
    return notesByDate.has(key);
  }

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  const notesForSelected = getNotesForDate(selectedDate);

  const monthLabel = currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Build grid cells: empty cells for padding + day numbers
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="View your scheduled posts by date"
      />

      <div className="px-8 pb-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center">
            Loading...
          </p>
        ) : (
          <>
            {/* Month grid */}
            <div className="bg-card rounded-[20px] border border-border p-6 mb-6">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-semibold">{monthLabel}</h2>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) {
                    return <div key={`empty-${i}`} className="aspect-square" />;
                  }

                  const date = new Date(year, month, day);
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, new Date());
                  const dayHasNotes = hasNotes(day);

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(date)}
                      className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors relative ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                          ? "bg-secondary font-medium"
                          : "hover:bg-secondary"
                      }`}
                    >
                      {day}
                      {dayHasNotes && (
                        <span
                          className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                            isSelected ? "bg-primary-foreground" : "bg-primary"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected day detail */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h3>

              {notesForSelected.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No posts scheduled for this day
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {notesForSelected.map((note) => (
                    <div
                      key={note.id}
                      className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border"
                    >
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {formatTime(note.scheduled_time)}
                      </span>
                      {note.platform === "substack" ? (
                        <SubstackIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ThreadsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
