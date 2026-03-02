"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import CodeBlock from "@tiptap/extension-code-block";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bold,
  Italic,
  Code,
  Quote,
  FileCode,
  Link as LinkIcon,
  Unlink,
} from "lucide-react";

interface RichEditorProps {
  content?: JSONContent;
  onChange?: (json: JSONContent) => void;
  placeholder?: string;
  className?: string;
}

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function RichEditor({
  content,
  onChange,
  placeholder = "What's on your mind?",
  className,
}: RichEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Use dedicated CodeBlock extension for more control
        codeBlock: false,
      }),
      CodeBlock,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2",
        },
      }),
    ],
    content: content ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class: "tiptap min-h-[120px] w-full px-3 py-2 text-base md:text-sm",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    // Suppress SSR hydration warnings
    immediatelyRender: false,
  });

  // Sync external content changes (e.g. when switching to edit mode)
  useEffect(() => {
    if (!editor || !content) return;
    // Only reset if content is structurally different to avoid cursor jumps
    const currentJson = JSON.stringify(editor.getJSON());
    const newJson = JSON.stringify(content);
    if (currentJson !== newJson) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  const setLink = useCallback(() => {
    if (!editor || !linkUrl) return;

    if (linkUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50",
        "rounded-md border bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:ring-[3px]",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b px-1 py-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          title="Inline code"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code block"
        >
          <FileCode className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-0.5 h-4 w-px bg-border" />

        {editor.isActive("link") ? (
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
            active={false}
            title="Remove link"
          >
            <Unlink className="h-4 w-4" />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            onClick={() => {
              setShowLinkInput(!showLinkInput);
              // Pre-fill with existing link if selected text has one
              const existing = editor.getAttributes("link").href;
              if (existing) setLinkUrl(existing);
            }}
            active={showLinkInput}
            title="Add link"
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
        )}
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <Input
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setLink();
              }
              if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkUrl("");
              }
            }}
            className="h-7 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={setLink}
            className="h-7 px-2 text-xs"
          >
            Apply
          </Button>
        </div>
      )}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        data-placeholder={placeholder}
      />
    </div>
  );
}

/** Small toggle button for the formatting toolbar */
function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-sm p-1.5",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "transition-colors",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Check if a ProseMirror JSON doc has actual text content */
export function isEditorEmpty(json: JSONContent): boolean {
  if (!json.content) return true;
  return json.content.every((node) => {
    if (node.type === "paragraph") {
      return !node.content || node.content.length === 0;
    }
    return false;
  });
}

/** Extract plain text from ProseMirror JSON (for previews / truncation) */
export function extractPlainText(content: string): string {
  try {
    const json = JSON.parse(content) as JSONContent;
    return extractTextFromJson(json);
  } catch {
    // Content is plain text (old notes), return as-is
    return content;
  }
}

function extractTextFromJson(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";

  return node.content
    .map((child) => {
      const text = extractTextFromJson(child);
      // Add newlines between block-level nodes
      if (
        child.type === "paragraph" ||
        child.type === "blockquote" ||
        child.type === "codeBlock"
      ) {
        return text + "\n";
      }
      return text;
    })
    .join("")
    .trim();
}
