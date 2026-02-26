# Substack Notes Scheduler — Web App Rebuild

**Date**: 2026-02-26
**Status**: Approved

## Goal

Rebuild the Substack Notes Scheduler as a standalone web app (personal SaaS). Replace the Chrome extension with a full web UI. Use Puppeteer with stealth plugin to bypass Cloudflare and post notes automatically via hourly cron.

## Architecture

**Platform**: Railway (single platform, free $5/mo credit)
**Database**: Supabase (free tier, PostgreSQL + Auth)

```
┌─────────────────────────────────────────────────────┐
│                    Railway Project                    │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  Next.js App     │    │  Cron Worker (hourly)     │ │
│  │  (Web Service)   │    │  (Cron Service)           │ │
│  │                  │    │                           │ │
│  │  - Dashboard UI  │    │  1. Query Supabase for    │ │
│  │  - Calendar view │    │     due notes             │ │
│  │  - Note CRUD API │    │  2. Launch Puppeteer      │ │
│  │  - Auth (login)  │    │     + stealth plugin      │ │
│  │  - Session mgmt  │    │  3. Set substack.sid      │ │
│  │                  │    │     cookie                │ │
│  └────────┬─────────┘    │  4. Navigate to substack  │ │
│           │              │     (bypass Cloudflare)   │ │
│           │              │  5. POST note via         │ │
│           │              │     page.evaluate()       │ │
│           │              │  6. Update status in      │ │
│           │              │     Supabase              │ │
│           │              └────────────┬──────────────┘ │
│           │                           │                │
└───────────┼───────────────────────────┼────────────────┘
            │                           │
            ▼                           ▼
     ┌──────────────────────────────────────┐
     │         Supabase (Free Tier)         │
     │  - scheduled_notes table             │
     │  - substack_sessions table           │
     │  - Supabase Auth (single user)       │
     └──────────────────────────────────────┘
```

Two Railway services share the same Supabase database:
- **Web app**: Next.js handles UI and API routes
- **Cron worker**: Standalone Node.js script with Puppeteer, runs hourly

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **Auth**: Supabase Auth (email/password, single user)
- **Database**: Supabase (PostgreSQL)
- **Posting**: Puppeteer + puppeteer-extra-plugin-stealth
- **Encryption**: AES-256-GCM for session cookie storage
- **Deployment**: Railway (Docker)

## Web App Pages

### `/login`
- Email + password form
- Redirects to dashboard on success
- Single user — sign up once

### `/` (Dashboard)
- **Header**: Title + session status indicator (green = active, red = expired)
- **Compose area**: Textarea + datetime picker + "Schedule" button
- **Upcoming notes**: Pending notes sorted by scheduled time, with edit/delete
- **Calendar view**: Monthly calendar with dots on days with scheduled notes. Click day to see notes.
- **Recently posted**: Last 5 delivered notes (collapsed by default)
- **Failed notes**: Shown with error + "Retry" button

### `/settings`
- **Substack Session**: Guided cookie paste flow
  1. Step-by-step instructions for copying `substack.sid` from browser DevTools
  2. Paste input + "Save" button (encrypts and stores)
  3. Status: last verified time, expiry warning
- **Timezone**: Auto-detected, manually overridable

## Database Schema

```sql
-- Supabase Auth handles user management (auth.users table)

CREATE TABLE substack_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

CREATE TABLE scheduled_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'posting', 'delivered', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_due_notes
  ON scheduled_notes(scheduled_time)
  WHERE status = 'pending';

-- Row Level Security
ALTER TABLE scheduled_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE substack_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notes" ON scheduled_notes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own session" ON substack_sessions
  FOR ALL USING (auth.uid() = user_id);
```

The cron worker uses the Supabase service role key to bypass RLS.

## Cron Worker Design

Runs hourly on Railway as a cron service.

**Flow**:
1. Query Supabase for notes where `status = 'pending'` AND `scheduled_time <= NOW()`
2. If no due notes, exit immediately (no browser launch)
3. Decrypt the `substack.sid` cookie from Supabase
4. Launch Puppeteer with stealth plugin
5. Set the cookie on `substack.com` domain
6. Navigate to `https://substack.com` (Cloudflare challenge passes via stealth)
7. For each due note:
   - `page.evaluate()` to POST to `/api/v1/comment/feed`
   - On success: mark as `delivered`
   - On failure: mark as `failed` with error
   - 2-second delay between posts
8. Close browser, exit

**Puppeteer Docker setup**:
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "worker/cron.js"]
```

## Session Management

- Session cookie stored encrypted (AES-256-GCM) in Supabase
- The cron worker verifies the cookie on each run by checking the HTTP response
- If Substack returns 401/403, `last_verified_at` is set to null
- Dashboard shows a warning banner when session is expired
- User refreshes by pasting a new cookie in Settings

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Cookie expired | Notes marked "failed" with "Session expired". Dashboard shows warning. Notes auto-retry after cookie refresh. |
| Substack API error | Note marked "failed" with error. "Retry" button in dashboard resets to "pending". |
| Network error | Cron retries once after 5s. If still fails, marks as "failed". |
| No due notes | Cron exits immediately, no Chrome launched. |
| Puppeteer crash | Logs error, remaining notes marked "failed" with "Internal error". |

## Scheduling Precision

Cron runs hourly. A note scheduled for 9:30 AM posts at the 10:00 AM run (up to ~59 min delay). This was an accepted trade-off for free-tier compatibility.

## Decisions Made

- **Railway over Render/Fly.io**: Docker support, no cold starts, built-in cron, $5/mo credit
- **shadcn/ui**: Pre-built components for faster development
- **Supabase Auth**: Built-in, free, handles JWT + session management
- **Guided cookie paste over automated login**: Substack has no OAuth; manual paste is simplest
- **Puppeteer stealth over residential proxy**: Free, runs on Railway, should bypass Cloudflare
- **Single user**: No multi-tenancy, no billing, simplified auth

## Risk

**Puppeteer stealth may not bypass Cloudflare**. This is the primary technical risk. Mitigation: test early in implementation. Fallback options if it fails:
1. Navigate to full Substack page and interact via DOM (slower but more browser-like)
2. Use `puppeteer-real-browser` package which uses a real Chrome profile
3. Fall back to the Chrome extension approach as a posting engine
