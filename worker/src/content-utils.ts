interface ProseMirrorNode {
  type: string;
  text?: string;
  content?: ProseMirrorNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Extract plain text from ProseMirror JSON content string.
 * Mirrors the logic in web/src/components/rich-editor.tsx extractPlainText()
 * but works in the worker without TipTap dependencies.
 */
export function extractPlainTextFromProseMirror(content: string): string {
  try {
    const json = JSON.parse(content) as ProseMirrorNode;
    return extractTextFromNode(json);
  } catch {
    // Content is already plain text (old notes)
    return content;
  }
}

function extractTextFromNode(node: ProseMirrorNode): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";

  return node.content
    .map((child) => {
      const text = extractTextFromNode(child);
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

import { THREADS } from "./constants.js";
const THREADS_CHAR_LIMIT = THREADS.CHAR_LIMIT;

/** Truncate text to Threads character limit */
export function truncateForThreads(text: string): string {
  if (text.length <= THREADS_CHAR_LIMIT) return text;
  return text.slice(0, THREADS_CHAR_LIMIT);
}
