export const THREADS = {
  CHAR_LIMIT: 500,
  POST_DELAY_MS: 2000,
  SCOPES: [
    "threads_basic",
    "threads_content_publish",
    "threads_manage_insights",
    "threads_read_replies",
  ],
} as const;

export const NOTE_LIMITS = {
  MAX_CONTENT_LENGTH: 50000,
} as const;
