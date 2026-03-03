"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ComposeForm } from "@/components/compose-form";
import { NotesList } from "@/components/notes-list";
import { CalendarView } from "@/components/calendar-view";
import { SessionStatus } from "@/components/session-status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScheduledNote, Platform, ThreadsInsight } from "@/lib/types";

export default function DashboardPage() {
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [editingNote, setEditingNote] = useState<ScheduledNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Platform[]>([]);
  const [threadsInsights, setThreadsInsights] = useState<Record<string, ThreadsInsight>>({});
  const router = useRouter();
  const supabase = createClient();

  const loadNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    if (res.ok) {
      const data = await res.json();
      setNotes(data.notes);
    }
    setIsLoading(false);
  }, []);

  // Load platform connection statuses
  const loadPlatformStatus = useCallback(async () => {
    const platforms: Platform[] = [];

    const [sessionRes, threadsRes] = await Promise.all([
      fetch("/api/session"),
      fetch("/api/auth/threads/status"),
    ]);

    if (sessionRes.ok) {
      const data = await sessionRes.json();
      if (data.hasSession) platforms.push("substack");
    }

    if (threadsRes.ok) {
      const data = await threadsRes.json();
      if (data.connected) platforms.push("threads");
    }

    setConnectedPlatforms(platforms);
  }, []);

  useEffect(() => {
    loadNotes();
    loadPlatformStatus();
  }, [loadNotes, loadPlatformStatus]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    if (res.ok) loadNotes();
  }

  async function handleRetry(id: string) {
    const res = await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadNotes();
  }

  function handleEdit(note: ScheduledNote) {
    setEditingNote(note);
  }

  function handleCancelEdit() {
    setEditingNote(null);
  }

  function handleNoteCreatedOrUpdated() {
    setEditingNote(null);
    loadNotes();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">PostQueue</h1>
        <div className="flex items-center gap-3">
          <SessionStatus />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/analytics")}
          >
            Analytics
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <ComposeForm
          key={editingNote?.id ?? "new"}
          onNoteCreated={handleNoteCreatedOrUpdated}
          onNoteUpdated={handleNoteCreatedOrUpdated}
          editingNote={editingNote}
          onCancelEdit={handleCancelEdit}
          connectedPlatforms={connectedPlatforms}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center">
          Loading notes...
        </p>
      ) : (
        <Tabs defaultValue="list">
          <TabsList className="mb-4">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            <NotesList
              notes={notes}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRetry={handleRetry}
              editingNoteId={editingNote?.id ?? null}
              threadsInsights={threadsInsights}
            />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarView notes={notes} onEdit={handleEdit} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
