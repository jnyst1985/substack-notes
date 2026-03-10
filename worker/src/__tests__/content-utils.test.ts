import { describe, it, expect } from "vitest";
import { extractPlainTextFromProseMirror, truncateForThreads } from "../content-utils.js";

describe("extractPlainTextFromProseMirror", () => {
  it("extracts text from a simple paragraph", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
    expect(extractPlainTextFromProseMirror(doc)).toBe("Hello world");
  });

  it("joins multiple paragraphs with newlines", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });
    expect(extractPlainTextFromProseMirror(doc)).toBe("First\nSecond");
  });

  it("handles blockquote nodes", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quoted" }] },
          ],
        },
      ],
    });
    const result = extractPlainTextFromProseMirror(doc);
    expect(result).toContain("Quoted");
  });

  it("handles codeBlock nodes", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    });
    expect(extractPlainTextFromProseMirror(doc)).toBe("const x = 1;");
  });

  it("handles inline formatting (bold, italic marks)", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "normal " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });
    expect(extractPlainTextFromProseMirror(doc)).toBe("normal bold");
  });

  it("returns plain text as-is when JSON parse fails", () => {
    expect(extractPlainTextFromProseMirror("just plain text")).toBe(
      "just plain text"
    );
  });

  it("handles empty document", () => {
    const doc = JSON.stringify({ type: "doc", content: [] });
    expect(extractPlainTextFromProseMirror(doc)).toBe("");
  });

  it("handles node with no content array", () => {
    const doc = JSON.stringify({ type: "doc" });
    expect(extractPlainTextFromProseMirror(doc)).toBe("");
  });

  it("handles nested paragraphs in blockquote", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Line 1" }] },
            { type: "paragraph", content: [{ type: "text", text: "Line 2" }] },
          ],
        },
      ],
    });
    const result = extractPlainTextFromProseMirror(doc);
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });
});

describe("truncateForThreads", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncateForThreads("short text")).toBe("short text");
  });

  it("returns text unchanged at exactly 500 chars", () => {
    const text = "a".repeat(500);
    expect(truncateForThreads(text)).toBe(text);
    expect(truncateForThreads(text)).toHaveLength(500);
  });

  it("truncates text over 500 chars", () => {
    const text = "a".repeat(600);
    const result = truncateForThreads(text);
    expect(result).toHaveLength(500);
  });

  it("handles empty string", () => {
    expect(truncateForThreads("")).toBe("");
  });
});
