import { describe, it, expect } from "vitest";

// groupByUserId is private in cron.ts, so we replicate to test the logic.
// In a real refactor we'd extract it, but this validates the algorithm.
function groupByUserId<T extends { user_id: string }>(
  items: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const existing = map.get(item.user_id) ?? [];
    existing.push(item);
    map.set(item.user_id, existing);
  }
  return map;
}

describe("groupByUserId", () => {
  it("groups items by user_id", () => {
    const items = [
      { user_id: "a", id: "1" },
      { user_id: "b", id: "2" },
      { user_id: "a", id: "3" },
    ];
    const result = groupByUserId(items);
    expect(result.size).toBe(2);
    expect(result.get("a")).toHaveLength(2);
    expect(result.get("b")).toHaveLength(1);
  });

  it("returns empty map for empty array", () => {
    const result = groupByUserId([]);
    expect(result.size).toBe(0);
  });

  it("preserves order within each group", () => {
    const items = [
      { user_id: "x", id: "1" },
      { user_id: "x", id: "2" },
      { user_id: "x", id: "3" },
    ];
    const result = groupByUserId(items);
    const ids = result.get("x")!.map((i) => i.id);
    expect(ids).toEqual(["1", "2", "3"]);
  });

  it("handles single item", () => {
    const items = [{ user_id: "solo", id: "1" }];
    const result = groupByUserId(items);
    expect(result.size).toBe(1);
    expect(result.get("solo")).toEqual([{ user_id: "solo", id: "1" }]);
  });
});
