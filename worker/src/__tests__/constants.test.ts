import { describe, it, expect } from "vitest";
import { THREADS, SUBSTACK } from "../constants.js";

describe("worker constants", () => {
  it("THREADS.CHAR_LIMIT is 500", () => {
    expect(THREADS.CHAR_LIMIT).toBe(500);
  });

  it("THREADS.POST_DELAY_MS is 2000", () => {
    expect(THREADS.POST_DELAY_MS).toBe(2000);
  });

  it("THREADS.REFRESH_WINDOW_DAYS is 7", () => {
    expect(THREADS.REFRESH_WINDOW_DAYS).toBe(7);
  });

  it("THREADS.TOKEN_LIFETIME_MS is 60 days in ms", () => {
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    expect(THREADS.TOKEN_LIFETIME_MS).toBe(sixtyDaysMs);
  });

  it("THREADS.INSIGHTS_LOOKBACK_DAYS is 30", () => {
    expect(THREADS.INSIGHTS_LOOKBACK_DAYS).toBe(30);
  });

  it("SUBSTACK.POST_DELAY_MS is 2000", () => {
    expect(SUBSTACK.POST_DELAY_MS).toBe(2000);
  });
});
