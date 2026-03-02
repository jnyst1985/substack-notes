"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RichEditor, isEditorEmpty } from "@/components/rich-editor";
import type { JSONContent } from "@tiptap/react";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

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

/** Try to parse stored content as ProseMirror JSON, fall back to plain text conversion */
function parseStoredContent(raw: string): JSONContent {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === "doc") return parsed;
  } catch {
    // plain text — convert to minimal ProseMirror doc
  }
  const paragraphs = raw.split(/\n\n+/).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.length > 0
      ? paragraphs.map((p) => ({
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: p.trim() }],
        }))
      : [{ type: "paragraph" as const }],
  };
}

export function ComposeForm({
  onNoteCreated,
  editingNote,
  onCancelEdit,
  onNoteUpdated,
}: ComposeFormProps) {
  // Parse initial content for the editor
  const initialContent = useMemo(
    () => (editingNote ? parseStoredContent(editingNote.content) : EMPTY_DOC),
    [editingNote]
  );

  const [content, setContent] = useState<JSONContent>(initialContent);
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
  const isEmpty = isEditorEmpty(content);

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEmpty || !scheduledTime) return;

    setIsSubmitting(true);
    setError(null);

    // Store ProseMirror JSON as a string in the content field
    const contentStr = JSON.stringify(content);
    const scheduledTimeISO = new Date(scheduledTime).toISOString();

    if (isEditing) {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingNote.id,
          content: contentStr,
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
          content: contentStr,
          scheduledTime: scheduledTimeISO,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to schedule note");
        setIsSubmitting(false);
        return;
      }

      setContent(EMPTY_DOC);
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
            <Label>
              {isEditing ? "Edit note" : "Write your note"}
            </Label>
            <RichEditor
              content={initialContent}
              onChange={setContent}
              placeholder="What's on your mind?"
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
              disabled={isEmpty || !scheduledTime || isSubmitting}
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
