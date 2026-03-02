import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";

puppeteer.use(StealthPlugin());

const SUBSTACK_API_URL = "https://substack.com/api/v1/comment/feed";
const POST_DELAY_MS = 2000;

interface PostResult {
  success: boolean;
  error?: string;
}

/** Convert plain text to ProseMirror JSON (for backward compat with old notes) */
function textToProseMirrorJson(text: string): string {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const doc = {
    type: "doc",
    attrs: { schemaVersion: "v1" },
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.trim() }],
    })),
  };
  return JSON.stringify(doc);
}

/**
 * Get ProseMirror JSON string ready for Substack API.
 * New notes store ProseMirror JSON directly; old notes store plain text.
 */
function contentToProseMirrorJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "doc") {
      // Already ProseMirror JSON — ensure schemaVersion is set
      if (!parsed.attrs) parsed.attrs = {};
      parsed.attrs.schemaVersion = "v1";
      return JSON.stringify(parsed);
    }
  } catch {
    // Not JSON — treat as plain text
  }
  return textToProseMirrorJson(content);
}

export async function postNotesWithPuppeteer(
  sessionToken: string,
  notes: { id: string; content: string }[]
): Promise<Map<string, PostResult>> {
  const results = new Map<string, PostResult>();
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page: Page = await browser.newPage();

    await page.setCookie({
      name: "substack.sid",
      value: sessionToken,
      domain: ".substack.com",
      path: "/",
      httpOnly: true,
      secure: true,
    });

    console.log("Navigating to substack.com to pass Cloudflare...");
    const response = await page.goto("https://substack.com", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response || response.status() >= 400) {
      const status = response?.status() ?? "no response";
      console.error(`Failed to load Substack: HTTP ${status}`);

      for (const note of notes) {
        results.set(note.id, {
          success: false,
          error: `Cloudflare/Substack unreachable (HTTP ${status})`,
        });
      }
      return results;
    }

    console.log("Substack loaded successfully. Posting notes...");

    for (const note of notes) {
      console.log(`Posting note ${note.id}...`);

      const bodyJson = contentToProseMirrorJson(note.content);

      const postResult = await page.evaluate(
        async (apiUrl: string, bodyJsonStr: string) => {
          try {
            const res = await fetch(apiUrl, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bodyJson: JSON.parse(bodyJsonStr),
                tabId: "for-you",
                surface: "feed",
                replyMinimumRole: "everyone",
              }),
            });

            if (!res.ok) {
              const text = await res.text();
              return { success: false, error: `HTTP ${res.status}: ${text}` };
            }

            return { success: true };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            };
          }
        },
        SUBSTACK_API_URL,
        bodyJson
      );

      results.set(note.id, postResult);

      if (postResult.success) {
        console.log(`Note ${note.id} posted successfully`);
      } else {
        console.error(`Note ${note.id} failed: ${postResult.error}`);
      }

      // Delay between posts to avoid rate limiting
      if (notes.indexOf(note) < notes.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, POST_DELAY_MS));
      }
    }
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Puppeteer crash";
    console.error("Puppeteer error:", errorMsg);

    for (const note of notes) {
      if (!results.has(note.id)) {
        results.set(note.id, { success: false, error: errorMsg });
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}
