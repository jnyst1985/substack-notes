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
