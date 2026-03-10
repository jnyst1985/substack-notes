export const THREADS = {
  CHAR_LIMIT: 500,
  POST_DELAY_MS: 2000,
  REFRESH_WINDOW_DAYS: 7,
  TOKEN_LIFETIME_MS: 60 * 24 * 60 * 60 * 1000, // 60 days
  INSIGHTS_LOOKBACK_DAYS: 30,
} as const;

export const SUBSTACK = {
  POST_DELAY_MS: 2000,
} as const;
