"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ComposeForm } from "@/components/compose-form";
import { NotesList } from "@/components/notes-list";
import { SessionStatus } from "@/components/session-status";
import { Button } from "@/components/ui/button";
import type { ScheduledNote } from "@/lib/types";

export default function DashboardPage() {
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [editingNote, setEditingNote] = useState<ScheduledNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    if (res.ok) loadNotes();
  }

  async function handleRetry(id: string) {
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "pending" }),
    });
    loadNotes();
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
        <h1 className="text-xl font-semibold">Substack Scheduler</h1>
        <div className="flex items-center gap-3">
          <SessionStatus />
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
        />
      </div>

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
        />
      )}
    </div>
  );
}
