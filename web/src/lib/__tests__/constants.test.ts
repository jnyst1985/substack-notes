import { describe, it, expect } from "vitest";
import { THREADS, NOTE_LIMITS } from "../constants";

describe("web constants", () => {
  it("THREADS.CHAR_LIMIT is 500", () => {
    expect(THREADS.CHAR_LIMIT).toBe(500);
  });

  it("THREADS.POST_DELAY_MS is 2000", () => {
    expect(THREADS.POST_DELAY_MS).toBe(2000);
  });

  it("THREADS.SCOPES contains required OAuth scopes", () => {
    expect(THREADS.SCOPES).toContain("threads_basic");
    expect(THREADS.SCOPES).toContain("threads_content_publish");
    expect(THREADS.SCOPES).toContain("threads_manage_insights");
    expect(THREADS.SCOPES).toContain("threads_read_replies");
    expect(THREADS.SCOPES).toHaveLength(4);
  });

  it("NOTE_LIMITS.MAX_CONTENT_LENGTH is 50000", () => {
    expect(NOTE_LIMITS.MAX_CONTENT_LENGTH).toBe(50000);
  });
});
