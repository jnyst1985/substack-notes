"use client";

import { useEffect, useState, useCallback } from "react";
import { ComposeForm } from "@/components/compose-form";
import { NotesList } from "@/components/notes-list";
import { PageHeader } from "@/components/page-header";
import type { ScheduledNote, Platform, ThreadsInsight } from "@/lib/types";

export default function DashboardPage() {
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [editingNote, setEditingNote] = useState<ScheduledNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Platform[]>([]);
  const [threadsInsights, setThreadsInsights] = useState<Record<string, ThreadsInsight>>({});

  const loadNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    if (res.ok) {
      const data = await res.json();
      setNotes(data.notes);
    }
    setIsLoading(false);
  }, []);

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

  const loadInsights = useCallback(async () => {
    const res = await fetch("/api/analytics/threads");
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, ThreadsInsight> = {};
      for (const post of data.posts ?? []) {
        map[post.noteId] = {
          id: post.noteId,
          note_id: post.noteId,
          user_id: "",
          views: post.views,
          likes: post.likes,
          replies: post.replies,
          reposts: post.reposts,
          quotes: post.quotes,
          fetched_at: "",
        };
      }
      setThreadsInsights(map);
    }
  }, []);

  useEffect(() => {
    loadNotes();
    loadPlatformStatus();
    loadInsights();
  }, [loadNotes, loadPlatformStatus, loadInsights]);

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

  // Stats
  const pendingCount = notes.filter((n) => n.status === "pending").length;
  const deliveredCount = notes.filter((n) => n.status === "delivered").length;
  const platformCount = connectedPlatforms.length;

  return (
    <div>
      <PageHeader
        title="Scheduled Posts"
        subtitle="Create, manage, and track your scheduled social posts"
      />

      <div className="px-8 pb-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-[20px] border border-border p-5">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Scheduled
            </p>
            <p className="font-mono text-2xl font-medium mt-1">{pendingCount}</p>
          </div>
          <div className="bg-card rounded-[20px] border border-border p-5">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Delivered
            </p>
            <p className="font-mono text-2xl font-medium mt-1">{deliveredCount}</p>
          </div>
          <div className="bg-card rounded-[20px] border border-border p-5">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Connected
            </p>
            <p className="font-mono text-2xl font-medium mt-1">{platformCount}</p>
          </div>
        </div>

        {/* Compose form */}
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

        {/* Notes list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center">
            Loading notes...
          </p>
        ) : (
          <NotesList
            notes={notes}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRetry={handleRetry}
            editingNoteId={editingNote?.id ?? null}
            threadsInsights={threadsInsights}
          />
        )}
      </div>
    </div>
  );
}
