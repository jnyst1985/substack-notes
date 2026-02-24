interface ProseMirrorDoc {
  type: "doc";
  attrs: { schemaVersion: string };
  content: Array<{
    type: "paragraph";
    content?: Array<{ type: "text"; text: string }>;
  }>;
}

function textToProseMirror(text: string): ProseMirrorDoc {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  return {
    type: "doc",
    attrs: { schemaVersion: "v1" },
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.trim() }],
    })),
  };
}

export async function postNoteToSubstack(
  content: string,
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://substack.com/api/v1/comment/feed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `substack.sid=${sessionToken}`,
        // Browser-like headers to help bypass Cloudflare detection
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://substack.com/",
        Origin: "https://substack.com",
        "Sec-Ch-Ua":
          '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({
        bodyJson: textToProseMirror(content),
        tabId: "for-you",
        surface: "feed",
        replyMinimumRole: "everyone",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
