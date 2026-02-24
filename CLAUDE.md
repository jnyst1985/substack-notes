# Substack Notes Scheduler

## Purpose

Cloud-based scheduler for Substack Notes. Write notes in a Chrome extension, pick a time, and they get posted automatically - even when your laptop is closed.

## Architecture

```
Chrome Extension                    Backend (Vercel)
      |                                   |
  Write note                       Next.js API routes
  Pick datetime                          |
  Capture session cookie           Supabase (storage)
      |                                   |
  Send to backend -----------------> Store notes
      |
  On popup open:                   Cron job (backup only - blocked by Cloudflare)
  Check for due notes                    |
      |                            Query pending notes
  POST directly to Substack        (Usually fails due to Cloudflare)
  (using real browser session)
      |
  Mark as delivered in backend
```

**Note**: Server-side posting via Vercel cron is blocked by Cloudflare (see Bug #6).
The extension now handles posting directly using the user's real browser session.

## Tech Stack

- **Extension**: Chrome Manifest V3, React, Vite, TypeScript, Tailwind
- **Backend**: Next.js (App Router) on Vercel
- **Database**: Supabase (PostgreSQL)
- **Scheduling**: Vercel Cron (daily at 14:10 UTC / 10:10 PM MYT)
- **Auth**: Encrypted session cookie storage (AES-256-GCM)

## Project Structure

```
substack-scheduler/
├── extension/                 # Chrome extension
│   ├── src/
│   │   ├── popup/App.tsx      # Main UI
│   │   ├── background/        # Service worker
│   │   └── utils/
│   │       ├── backend-api.ts # API client (talks to Vercel)
│   │       ├── substack-api.ts # Auth check via cookies
│   │       └── types.ts
│   ├── manifest.json
│   └── package.json
│
├── web/                       # Next.js backend
│   ├── src/
│   │   ├── app/api/
│   │   │   ├── auth/route.ts  # Receives session token from extension
│   │   │   ├── notes/route.ts # CRUD for scheduled notes
│   │   │   └── cron/post/route.ts # Posts due notes to Substack
│   │   └── lib/
│   │       ├── crypto.ts      # AES-256-GCM encryption
│   │       ├── supabase.ts    # DB client (lazy init for build)
│   │       └── substack.ts    # Posts to Substack API
│   ├── vercel.json            # Cron config
│   └── package.json
│
└── supabase/
    └── migrations/
        └── 001_initial.sql    # DB schema
```

## Key Files

| File | Purpose |
|------|---------|
| `extension/src/utils/backend-api.ts` | API client, `processDueNotes()` for extension posting |
| `extension/src/popup/App.tsx` | Main UI, calls `processDueNotes()` on load |
| `web/src/app/api/auth/route.ts` | Receives + encrypts session token |
| `web/src/app/api/notes/route.ts` | CRUD endpoints with CORS headers |
| `web/src/app/api/notes/deliver/route.ts` | Mark note as delivered (called by extension) |
| `web/src/app/api/notes/fail/route.ts` | Mark note as failed (called by extension) |
| `web/src/app/api/cron/post/route.ts` | Cron job (backup, usually blocked by Cloudflare) |
| `web/src/lib/crypto.ts` | Encryption/decryption helpers |
| `web/vercel.json` | Cron schedule (`10 14 * * *` = 10:10 PM MYT daily) |

## Database Schema (Supabase)

```sql
-- User sessions (encrypted tokens)
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Scheduled notes
CREATE TABLE scheduled_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, posting, delivered, failed
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_notes ON scheduled_notes(status, scheduled_time)
  WHERE status = 'pending';
```

## Environment Variables (Vercel)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ENCRYPTION_KEY=<32-byte hex string>
CRON_SECRET=<random string>
```

## Deployment

- **Backend**: Auto-deploys to Vercel from GitHub (`jnyst1985/substack-notes`)
- **Extension**: Build with `cd extension && npm run build`, load `extension/dist` in Chrome

## Bugs Encountered & Fixes

### 1. "Not logged into Substack" error
**Problem**: Extension couldn't check auth using fetch from popup context.
**Fix**: Added `cookies` permission to manifest, use `chrome.cookies.get()` instead of fetching profile API.

### 2. Supabase build error (`supabaseUrl is required`)
**Problem**: Supabase client initialized at module load, but env vars not available during Next.js build.
**Fix**: Made Supabase client lazy with `getSupabase()` function.

### 3. Vercel cron limitation
**Problem**: Hobby tier only allows daily cron jobs, not every 5 minutes.
**Fix**: Changed schedule from `*/5 * * * *` to `10 14 * * *` (daily at 10:10 PM MYT).

### 4. CORS error from Chrome extension
**Problem**: Extension blocked by CORS when calling `/api/auth`.
**Fix**: Added CORS headers to all API routes:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-user-id",
};
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
```

### 5. Git commit rejected by Vercel
**Problem**: Commits used local machine email, Vercel didn't recognize committer.
**Fix**: Set git config to GitHub email and amended commit:
```bash
git config user.email "jonathan.nyst@gmail.com"
git commit --amend --reset-author --no-edit
git push --force
```

### 6. Cloudflare blocking Vercel cron requests (Feb 2026)
**Problem**: Substack added Cloudflare protection that blocks POST requests from Vercel serverless functions. The cron job returns HTTP 403 with a Cloudflare challenge page instead of posting notes.

**Root cause**: Cloudflare detects datacenter IPs (like Vercel's) and blocks automated requests. Adding browser-like headers (User-Agent, Sec-* headers, etc.) did not bypass the protection - Cloudflare uses deeper fingerprinting (TLS fingerprint, IP reputation).

**Fix**: Extension-based posting. The extension now:
1. Checks for due notes (pending + scheduled_time in past) when popup opens
2. Posts directly to Substack using `credentials: "include"` (real browser session)
3. Calls `/api/notes/deliver` or `/api/notes/fail` to update backend status

**New endpoints added**:
- `POST /api/notes/deliver` - Mark note as delivered
- `POST /api/notes/fail` - Mark note as failed with error message

**New extension function**: `processDueNotes()` in `backend-api.ts`

**Limitation**: Notes only post when extension popup is opened. Browser must be running.

**Alternatives considered but not implemented**:
- Proxy service (Bright Data, etc.) - monthly cost, reliable
- Chrome alarms API - service workers killed after 30s, unreliable

## Substack API Details

**Endpoint**: `POST https://substack.com/api/v1/comment/feed`

**Headers**:
```
Cookie: substack.sid=<decrypted_token>
Content-Type: application/json
```

**Body** (ProseMirror JSON format):
```json
{
  "bodyJson": {
    "type": "doc",
    "attrs": { "schemaVersion": "v1" },
    "content": [
      { "type": "paragraph", "content": [{ "type": "text", "text": "Your note" }] }
    ]
  },
  "tabId": "for-you",
  "surface": "feed",
  "replyMinimumRole": "everyone"
}
```

## Current State

- Extension deployed and working
- Backend deployed at `https://substack-notes-xvxq.vercel.app`
- Cron job runs daily at 14:10 UTC (10:10 PM MYT) but **blocked by Cloudflare**
- Session tokens encrypted and stored in Supabase
- **Extension-based posting**: Notes post when extension popup is opened (bypasses Cloudflare)
- **Edit functionality**: Users can edit pending notes (content + scheduled time)
- **UI**: Redesigned with shadcn-style components (Feb 2026)

### How Posting Works Now
1. User schedules a note via extension → stored in Supabase with status `pending`
2. When user opens extension popup → `processDueNotes()` runs
3. Checks for notes where `scheduled_time <= now` and `status = 'pending'`
4. Posts each due note directly to Substack API using browser session
5. Updates backend: `delivered` on success, `failed` on error

## Edit Notes Feature

Added in Feb 2026. Key implementation details:

### API Endpoint
`PUT /api/notes` - Updates a pending note's content and/or scheduled time.

### Cron Timing Validation
Because the cron only runs once daily at 10:10 PM MYT (14:10 UTC), edits must account for timing:
- `getNextCronTime()` helper calculates when the next cron will run
- Backend rejects edits where `scheduledTime <= nextCronTime`
- Frontend shows error: "Please schedule after [next cron time]"

This prevents users from editing a note to a time that's already passed for today's cron window.

### Files Modified
- `web/src/app/api/notes/route.ts` - Added PUT handler with validation
- `extension/src/utils/backend-api.ts` - Added `updateNoteInBackend()`
- `extension/src/popup/App.tsx` - Added edit mode UI

## UI Design

The extension UI uses a shadcn-inspired design created in Pencil (`.pen` file).

**Design file**: `/Users/jonathanjulien/Documents/Substack Notes Scheduler.pen`

**Key screens**:
- "Schedule a Note" - Main view with textarea, date picker, note list
- "Edit Note" - Same layout but with Cancel/Save buttons, active note highlighted

**Color palette**:
- Background: `#fafafa`
- Borders: `#e5e5e5`
- Primary text: `#0a0a0a`
- Secondary text: `#737373`
- Primary button: `#171717` (black)
- Success/Save: `#22c55e` (green)
- Cloud status: `#22c55e` (green)

## Future Improvements

- **Background posting**: Use Chrome alarms + persistent background to post without popup open
- **Proxy service**: Route server requests through residential IPs to bypass Cloudflare
- **Mobile app**: React Native app that can post in background
- Image/media attachments
- Multiple Substack accounts
