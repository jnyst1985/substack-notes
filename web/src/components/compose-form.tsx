"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface ComposeFormProps {
  onNoteCreated: () => void;
  editingNote?: {
    id: string;
    content: string;
    scheduled_time: string;
  } | null;
  onCancelEdit?: () => void;
  onNoteUpdated?: () => void;
}

export function ComposeForm({
  onNoteCreated,
  editingNote,
  onCancelEdit,
  onNoteUpdated,
}: ComposeFormProps) {
  const [content, setContent] = useState(editingNote?.content ?? "");
  const [scheduledTime, setScheduledTime] = useState(() => {
    if (!editingNote?.scheduled_time) return "";
    const date = new Date(editingNote.scheduled_time);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editingNote;

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !scheduledTime) return;

    setIsSubmitting(true);
    setError(null);

    const scheduledTimeISO = new Date(scheduledTime).toISOString();

    if (isEditing) {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingNote.id,
          content: content.trim(),
          scheduledTime: scheduledTimeISO,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update note");
        setIsSubmitting(false);
        return;
      }

      onNoteUpdated?.();
    } else {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          scheduledTime: scheduledTimeISO,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to schedule note");
        setIsSubmitting(false);
        return;
      }

      setContent("");
      setScheduledTime("");
      onNoteCreated();
    }

    setIsSubmitting(false);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="content">
              {isEditing ? "Edit note" : "Write your note"}
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduledTime">Schedule for</Label>
            <Input
              id="scheduledTime"
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              min={getMinDateTime()}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            {isEditing && (
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!content.trim() || !scheduledTime || isSubmitting}
            >
              {isSubmitting
                ? "..."
                : isEditing
                ? "Save changes"
                : "Schedule"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
