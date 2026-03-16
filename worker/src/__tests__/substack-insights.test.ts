import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the module under test
vi.mock("../supabase.js", () => ({
  getSubstackSessions: vi.fn(),
  upsertSubstackPostInsight: vi.fn(),
}));

import { fetchSubstackInsights } from "../substack-insights.js";
import {
  getSubstackSessions,
  upsertSubstackPostInsight,
} from "../supabase.js";

const mockGetSubstackSessions = vi.mocked(getSubstackSessions);
const mockUpsertSubstackPostInsight = vi.mocked(upsertSubstackPostInsight);

// Sample Substack archive API response
const MOCK_ARCHIVE_RESPONSE = [
  {
    id: 12345,
    title: "My First Post",
    slug: "my-first-post",
    post_date: "2026-03-01T10:00:00.000Z",
    type: "newsletter",
    reaction_count: 15,
    comment_count: 3,
    restacks: 2,
    // Extra fields that should be ignored
    subtitle: "A subtitle",
    cover_image: "https://example.com/image.jpg",
    wordcount: 500,
  },
  {
    id: 12346,
    title: "My Second Post",
    slug: "my-second-post",
    post_date: "2026-03-10T10:00:00.000Z",
    type: "newsletter",
    reaction_count: 8,
    comment_count: 1,
    restacks: 0,
  },
];

describe("fetchSubstackInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global fetch mock
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does nothing when no sessions have subdomain configured", async () => {
    mockGetSubstackSessions.mockResolvedValue([]);

    await fetchSubstackInsights();

    expect(mockUpsertSubstackPostInsight).not.toHaveBeenCalled();
  });

  it("fetches archive and upserts post insights for each user", async () => {
    mockGetSubstackSessions.mockResolvedValue([
      { user_id: "user-1", subdomain: "beforeai" },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_ARCHIVE_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchSubstackInsights();

    // Should have fetched the archive
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("beforeai.substack.com/api/v1/archive"),
      expect.any(Object)
    );

    // Should have upserted 2 post insights
    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledTimes(2);

    // Check first post
    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledWith("user-1", {
      post_id: "12345",
      title: "My First Post",
      slug: "my-first-post",
      post_date: "2026-03-01T10:00:00.000Z",
      type: "newsletter",
      reaction_count: 15,
      comment_count: 3,
      restacks: 2,
    });

    // Check second post
    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledWith("user-1", {
      post_id: "12346",
      title: "My Second Post",
      slug: "my-second-post",
      post_date: "2026-03-10T10:00:00.000Z",
      type: "newsletter",
      reaction_count: 8,
      comment_count: 1,
      restacks: 0,
    });
  });

  it("handles fetch errors gracefully without crashing", async () => {
    mockGetSubstackSessions.mockResolvedValue([
      { user_id: "user-1", subdomain: "badsubdomain" },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw
    await fetchSubstackInsights();

    expect(mockUpsertSubstackPostInsight).not.toHaveBeenCalled();
  });

  it("handles non-array response gracefully", async () => {
    mockGetSubstackSessions.mockResolvedValue([
      { user_id: "user-1", subdomain: "badformat" },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "not found" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw
    await fetchSubstackInsights();

    expect(mockUpsertSubstackPostInsight).not.toHaveBeenCalled();
  });

  it("handles missing fields with defaults", async () => {
    mockGetSubstackSessions.mockResolvedValue([
      { user_id: "user-1", subdomain: "test" },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 99,
            post_date: "2026-01-01T00:00:00.000Z",
            // Missing title, slug, type, reaction_count, comment_count, restacks
          },
        ]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchSubstackInsights();

    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledWith("user-1", {
      post_id: "99",
      title: "",
      slug: "",
      post_date: "2026-01-01T00:00:00.000Z",
      type: "newsletter",
      reaction_count: 0,
      comment_count: 0,
      restacks: 0,
    });
  });

  it("processes multiple users independently", async () => {
    mockGetSubstackSessions.mockResolvedValue([
      { user_id: "user-1", subdomain: "blog1" },
      { user_id: "user-2", subdomain: "blog2" },
    ]);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 1,
              title: "Post A",
              slug: "a",
              post_date: "2026-01-01T00:00:00.000Z",
              type: "newsletter",
              reaction_count: 5,
              comment_count: 1,
              restacks: 0,
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
    vi.stubGlobal("fetch", mockFetch);

    await fetchSubstackInsights();

    // Only user-1's post should have been upserted (user-2 failed)
    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledTimes(1);
    expect(mockUpsertSubstackPostInsight).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ post_id: "1" })
    );
  });
});
