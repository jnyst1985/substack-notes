"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RichEditor, isEditorEmpty, extractPlainText } from "@/components/rich-editor";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";
import type { JSONContent } from "@tiptap/react";
import type { Platform } from "@/lib/types";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const THREADS_CHAR_LIMIT = 500;

interface ComposeFormProps {
  onNoteCreated: () => void;
  editingNote?: {
    id: string;
    content: string;
    scheduled_time: string;
    platform?: Platform;
  } | null;
  onCancelEdit?: () => void;
  onNoteUpdated?: () => void;
  connectedPlatforms: Platform[];
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
  connectedPlatforms,
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
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(() => {
    if (editingNote?.platform) return [editingNote.platform];
    // Default to all connected platforms
    return connectedPlatforms.length > 0 ? [...connectedPlatforms] : ["substack"];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editingNote;
  const isEmpty = isEditorEmpty(content);

  // Plain text preview for Threads
  const plainText = useMemo(() => {
    if (!content) return "";
    return extractPlainText(JSON.stringify(content));
  }, [content]);
  const threadsCharCount = plainText.length;
  const isOverThreadsLimit = threadsCharCount > THREADS_CHAR_LIMIT;
  const showThreadsPreview = selectedPlatforms.includes("threads") && selectedPlatforms.includes("substack");
  const showTruncationWarning = selectedPlatforms.includes("threads") && isOverThreadsLimit;

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform)) {
        // Don't allow deselecting the last platform
        if (prev.length === 1) return prev;
        return prev.filter((p) => p !== platform);
      }
      return [...prev, platform];
    });
  }

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEmpty || !scheduledTime || selectedPlatforms.length === 0) return;

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
          platforms: selectedPlatforms,
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

  const substackConnected = connectedPlatforms.includes("substack");
  const threadsConnected = connectedPlatforms.includes("threads");

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

          {/* Platform picker - only show when not editing */}
          {!isEditing && (
            <div className="flex flex-col gap-2">
              <Label>Post to</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes("substack")}
                    onCheckedChange={() => togglePlatform("substack")}
                    disabled={!substackConnected}
                    aria-label="Post to Substack"
                  />
                  <SubstackIcon className={!substackConnected ? "opacity-40" : ""} />
                  <span className={`text-sm ${!substackConnected ? "text-muted-foreground" : ""}`}>
                    Substack
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes("threads")}
                    onCheckedChange={() => togglePlatform("threads")}
                    disabled={!threadsConnected}
                    aria-label="Post to Threads"
                  />
                  <ThreadsIcon className={!threadsConnected ? "opacity-40" : ""} />
                  <span className={`text-sm ${!threadsConnected ? "text-muted-foreground" : ""}`}>
                    Threads
                    {!threadsConnected && (
                      <span className="text-xs ml-1">(not connected)</span>
                    )}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Split preview for cross-posting */}
          {showThreadsPreview && !isEmpty && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <SubstackIcon className="h-3 w-3" />
                  <span className="text-xs font-medium text-muted-foreground">Substack</span>
                </div>
                <p className="text-xs text-muted-foreground">Rich text (as written)</p>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThreadsIcon className="h-3 w-3" />
                  <span className="text-xs font-medium text-muted-foreground">Threads</span>
                </div>
                <p className="text-xs whitespace-pre-wrap break-words line-clamp-4">
                  {plainText.slice(0, THREADS_CHAR_LIMIT)}
                  {isOverThreadsLimit && "..."}
                </p>
                <p className={`text-xs mt-1 ${isOverThreadsLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {threadsCharCount}/{THREADS_CHAR_LIMIT}
                </p>
              </div>
            </div>
          )}

          {/* Threads-only char counter */}
          {selectedPlatforms.includes("threads") && !showThreadsPreview && !isEmpty && (
            <p className={`text-xs ${isOverThreadsLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Threads: {threadsCharCount}/{THREADS_CHAR_LIMIT} characters
            </p>
          )}

          {/* Truncation warning */}
          {showTruncationWarning && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                Content exceeds {THREADS_CHAR_LIMIT} characters. The Threads post will be truncated.
              </AlertDescription>
            </Alert>
          )}

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
              disabled={isEmpty || !scheduledTime || isSubmitting || selectedPlatforms.length === 0}
            >
              {isSubmitting
                ? "..."
                : isEditing
                ? "Save changes"
                : selectedPlatforms.length > 1
                ? "Cross-post"
                : "Schedule"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
