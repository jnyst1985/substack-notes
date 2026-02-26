# Substack Notes Scheduler — Web App Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the Substack Notes Scheduler as a standalone Next.js web app on Railway with Puppeteer-based cron posting.

**Architecture:** Two Railway services (Next.js web app + Puppeteer cron worker) sharing a Supabase database. Supabase Auth for login. AES-256-GCM encrypted Substack session cookie stored in DB. Hourly cron posts due notes via headless Chrome with stealth plugin to bypass Cloudflare.

**Tech Stack:** Next.js 14+ (App Router), Tailwind CSS, shadcn/ui, Supabase (Auth + PostgreSQL), Puppeteer + puppeteer-extra-plugin-stealth, Railway (Docker), TypeScript

**Design Doc:** `docs/plans/2026-02-26-web-app-rebuild-design.md`

---

## Project Structure (Target)

```
substack-scheduler/
├── web/                          # Next.js app (Railway web service)
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/
│   │   │   │   └── page.tsx      # Login page
│   │   │   ├── settings/
│   │   │   │   └── page.tsx      # Settings (cookie paste, timezone)
│   │   │   ├── api/
│   │   │   │   ├── notes/
│   │   │   │   │   └── route.ts  # Notes CRUD
│   │   │   │   └── session/
│   │   │   │       └── route.ts  # Save/check Substack cookie
│   │   │   ├── layout.tsx        # Root layout
│   │   │   └── page.tsx          # Dashboard (main page)
│   │   ├── components/
│   │   │   ├── ui/               # shadcn components
│   │   │   ├── compose-form.tsx
│   │   │   ├── notes-list.tsx
│   │   │   ├── calendar-view.tsx
│   │   │   └── session-status.tsx
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts     # Browser Supabase client
│   │   │   │   ├── server.ts     # Server Supabase client
│   │   │   │   └── middleware.ts # Auth middleware helper
│   │   │   ├── crypto.ts         # AES-256-GCM (reused from current)
│   │   │   └── types.ts          # Shared types
│   │   └── middleware.ts         # Next.js middleware (auth redirect)
│   ├── Dockerfile
│   ├── package.json
│   └── ...
│
├── worker/                       # Cron worker (Railway cron service)
│   ├── src/
│   │   ├── cron.ts              # Main cron entry point
│   │   ├── poster.ts            # Puppeteer posting logic
│   │   └── supabase.ts          # Supabase client for worker
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql       # Original schema (keep for history)
│       └── 002_auth_rebuild.sql  # New auth-compatible schema
│
└── docs/plans/
```

---

## Task 1: Project Setup & Dependencies

**Files:**
- Modify: `web/package.json`
- Create: `web/src/lib/types.ts`
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`

### Step 1: Install web app dependencies

```bash
cd web
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init
```

When `shadcn init` prompts:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

### Step 2: Install shadcn components we'll need

```bash
cd web
npx shadcn@latest add button input textarea card label badge calendar tabs dialog alert
```

### Step 3: Create shared types file

Create `web/src/lib/types.ts`:

```typescript
export type NoteStatus = "pending" | "posting" | "delivered" | "failed";

export interface ScheduledNote {
  id: string;
  user_id: string;
  content: string;
  scheduled_time: string;
  status: NoteStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
}

export interface SubstackSession {
  id: string;
  user_id: string;
  encrypted_token: string;
  updated_at: string;
  last_verified_at: string | null;
}
```

### Step 4: Create worker project

```bash
mkdir -p worker/src
cd worker
npm init -y
npm install @supabase/supabase-js puppeteer-extra puppeteer-extra-plugin-stealth puppeteer typescript tsx
npm install -D @types/node
```

Create `worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Step 5: Set up environment variables template

Create `web/.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ENCRYPTION_KEY=<64-char hex string for AES-256>
```

Create `worker/.env.example`:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ENCRYPTION_KEY=<64-char hex string for AES-256>
```

### Step 6: Commit

```bash
git add web/ worker/
git commit -m "feat: scaffold web app and worker project structure"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/002_auth_rebuild.sql`

### Step 1: Write the migration

Create `supabase/migrations/002_auth_rebuild.sql`:

```sql
-- Migration: Rebuild schema for Supabase Auth integration
-- Old tables (user_sessions, scheduled_notes with TEXT user_id) are replaced
-- with auth.users-compatible schema

-- Drop old tables (they used TEXT user_id, incompatible with Supabase Auth)
DROP TABLE IF EXISTS scheduled_notes;
DROP TABLE IF EXISTS user_sessions;

-- Substack session storage (encrypted cookie)
CREATE TABLE substack_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

-- Scheduled notes
CREATE TABLE scheduled_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'posting', 'delivered', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Index for cron worker: find due pending notes
CREATE INDEX idx_pending_due_notes
  ON scheduled_notes(scheduled_time)
  WHERE status = 'pending';

-- Index for user's notes list
CREATE INDEX idx_user_notes
  ON scheduled_notes(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE scheduled_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE substack_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users can manage own notes" ON scheduled_notes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own session" ON substack_sessions
  FOR ALL USING (auth.uid() = user_id);
```

### Step 2: Run the migration in Supabase

Go to Supabase dashboard → SQL Editor → paste and run the migration.

Alternatively, if using Supabase CLI:
```bash
supabase db push
```

### Step 3: Verify tables exist

In Supabase dashboard → Table Editor, confirm:
- `substack_sessions` table exists with UUID `user_id`
- `scheduled_notes` table exists with UUID `user_id`
- RLS is enabled on both

### Step 4: Commit

```bash
git add supabase/migrations/002_auth_rebuild.sql
git commit -m "feat: add auth-compatible database migration"
```

---

## Task 3: Supabase Auth Setup

**Files:**
- Create: `web/src/lib/supabase/client.ts`
- Create: `web/src/lib/supabase/server.ts`
- Create: `web/src/middleware.ts`
- Create: `web/src/app/login/page.tsx`
- Modify: `web/src/app/layout.tsx`

### Step 1: Create browser Supabase client

Create `web/src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Step 2: Create server Supabase client

Create `web/src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — can be ignored
          }
        },
      },
    }
  );
}
```

### Step 3: Create auth middleware

Create `web/src/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except /login itself)
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
```

### Step 4: Create login page

Create `web/src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Substack Scheduler</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 5: Update root layout

Modify `web/src/app/layout.tsx` to use the app's fonts and metadata:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Substack Scheduler",
  description: "Schedule your Substack Notes ahead of time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

### Step 6: Verify auth flow works locally

```bash
cd web
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/login`.
Create a user in Supabase dashboard (Authentication → Users → Create user).
Log in with those credentials — should redirect to `/`.

### Step 7: Commit

```bash
git add web/src/lib/supabase/ web/src/middleware.ts web/src/app/login/ web/src/app/layout.tsx
git commit -m "feat: add Supabase Auth with login page and middleware"
```

---

## Task 4: Notes CRUD API

**Files:**
- Create: `web/src/app/api/notes/route.ts`
- Reuse: `web/src/lib/crypto.ts` (existing, minor update)

### Step 1: Update crypto.ts

The existing `web/src/lib/crypto.ts` works as-is. Verify it's unchanged:
- `encrypt(text)` → returns `"iv:authTag:encrypted"` hex string
- `decrypt(data)` → reverses the process
- Uses `ENCRYPTION_KEY` env var

No changes needed.

### Step 2: Write the Notes API route

Create `web/src/app/api/notes/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/notes — fetch all notes for authenticated user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: notes, error } = await supabase
    .from("scheduled_notes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes });
}

// POST /api/notes — create a new scheduled note
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { content, scheduledTime } = body;

  if (!content?.trim() || !scheduledTime) {
    return NextResponse.json(
      { error: "Content and scheduledTime are required" },
      { status: 400 }
    );
  }

  const { data: note, error } = await supabase
    .from("scheduled_notes")
    .insert({
      user_id: user.id,
      content: content.trim(),
      scheduled_time: scheduledTime,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note }, { status: 201 });
}

// PUT /api/notes — update a pending note
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, content, scheduledTime } = body;

  if (!id) {
    return NextResponse.json({ error: "Note ID is required" }, { status: 400 });
  }

  // Only allow editing pending notes
  const { data: existing } = await supabase
    .from("scheduled_notes")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: "Can only edit pending notes" },
      { status: 400 }
    );
  }

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (content?.trim()) updates.content = content.trim();
  if (scheduledTime) updates.scheduled_time = scheduledTime;

  const { data: note, error } = await supabase
    .from("scheduled_notes")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note });
}

// DELETE /api/notes?id=xxx — delete a note
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Note ID is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("scheduled_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

### Step 3: Test API manually

```bash
cd web && npm run dev
```

Use curl or browser DevTools to test (must be logged in first):
- `GET /api/notes` → returns `{ notes: [] }`
- `POST /api/notes` with `{ content: "test", scheduledTime: "2026-03-01T10:00:00Z" }`
- `PUT /api/notes` with `{ id: "<uuid>", content: "updated" }`
- `DELETE /api/notes?id=<uuid>`

### Step 4: Commit

```bash
git add web/src/app/api/notes/route.ts
git commit -m "feat: add notes CRUD API with Supabase Auth"
```

---

## Task 5: Session Management API

**Files:**
- Create: `web/src/app/api/session/route.ts`

### Step 1: Write the session API

Create `web/src/app/api/session/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

// GET /api/session — check if Substack session exists and its status
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("substack_sessions")
    .select("updated_at, last_verified_at")
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ hasSession: false });
  }

  return NextResponse.json({
    hasSession: true,
    updatedAt: session.updated_at,
    lastVerifiedAt: session.last_verified_at,
  });
}

// POST /api/session — save (or update) the Substack session cookie
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { token } = body;

  if (!token?.trim()) {
    return NextResponse.json(
      { error: "Session token is required" },
      { status: 400 }
    );
  }

  const encryptedToken = encrypt(token.trim());

  const { error } = await supabase
    .from("substack_sessions")
    .upsert(
      {
        user_id: user.id,
        encrypted_token: encryptedToken,
        updated_at: new Date().toISOString(),
        last_verified_at: null, // Will be set by cron on successful post
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

### Step 2: Test manually

- `GET /api/session` → `{ hasSession: false }`
- `POST /api/session` with `{ token: "test-cookie-value" }` → `{ success: true }`
- `GET /api/session` → `{ hasSession: true, updatedAt: "...", lastVerifiedAt: null }`

### Step 3: Commit

```bash
git add web/src/app/api/session/route.ts
git commit -m "feat: add session management API for Substack cookie"
```

---

## Task 6: Dashboard UI — Compose Form & Notes List

**Files:**
- Create: `web/src/components/compose-form.tsx`
- Create: `web/src/components/notes-list.tsx`
- Create: `web/src/components/session-status.tsx`
- Modify: `web/src/app/page.tsx`

### Step 1: Create session status component

Create `web/src/components/session-status.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface SessionInfo {
  hasSession: boolean;
  updatedAt?: string;
  lastVerifiedAt?: string | null;
}

export function SessionStatus() {
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ hasSession: false }));
  }, []);

  if (!session) return null;

  if (!session.hasSession) {
    return (
      <Link href="/settings">
        <Badge variant="destructive">No Substack session</Badge>
      </Link>
    );
  }

  // If last_verified_at is null and session exists, it hasn't been tested yet
  // If last_verified_at is set, it was verified by the cron worker
  const isVerified = session.lastVerifiedAt !== null;

  return (
    <Link href="/settings">
      <Badge variant={isVerified ? "default" : "secondary"}>
        <span
          className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
            isVerified ? "bg-green-500" : "bg-yellow-500"
          }`}
        />
        {isVerified ? "Session active" : "Session unverified"}
      </Badge>
    </Link>
  );
}
```

### Step 2: Create compose form component

Create `web/src/components/compose-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface ComposeFormProps {
  onNoteCreated: () => void;
  editingNote?: {
    id: string;
    content: string;
    scheduled_time: string;
  } | null;
  onCancelEdit?: () => void;
  onNoteUpdated?: () => void;
}

export function ComposeForm({
  onNoteCreated,
  editingNote,
  onCancelEdit,
  onNoteUpdated,
}: ComposeFormProps) {
  const [content, setContent] = useState(editingNote?.content ?? "");
  const [scheduledTime, setScheduledTime] = useState(() => {
    if (!editingNote?.scheduled_time) return "";
    // Convert ISO to local datetime-local format
    const date = new Date(editingNote.scheduled_time);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editingNote;

  // Reset form when editingNote changes
  // (handled by parent remounting with key prop)

  function getMinDateTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !scheduledTime) return;

    setIsSubmitting(true);
    setError(null);

    const scheduledTimeISO = new Date(scheduledTime).toISOString();

    if (isEditing) {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingNote.id,
          content: content.trim(),
          scheduledTime: scheduledTimeISO,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update note");
        setIsSubmitting(false);
        return;
      }

      onNoteUpdated?.();
    } else {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          scheduledTime: scheduledTimeISO,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to schedule note");
        setIsSubmitting(false);
        return;
      }

      setContent("");
      setScheduledTime("");
      onNoteCreated();
    }

    setIsSubmitting(false);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="content">
              {isEditing ? "Edit note" : "Write your note"}
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduledTime">Schedule for</Label>
            <Input
              id="scheduledTime"
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              min={getMinDateTime()}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            {isEditing && (
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!content.trim() || !scheduledTime || isSubmitting}
              variant={isEditing ? "default" : "default"}
            >
              {isSubmitting
                ? "..."
                : isEditing
                ? "Save changes"
                : "Schedule"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

### Step 3: Create notes list component

Create `web/src/components/notes-list.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ScheduledNote } from "@/lib/types";

interface NotesListProps {
  notes: ScheduledNote[];
  onEdit: (note: ScheduledNote) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  editingNoteId: string | null;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

export function NotesList({
  notes,
  onEdit,
  onDelete,
  onRetry,
  editingNoteId,
}: NotesListProps) {
  const pending = notes.filter((n) => n.status === "pending");
  const delivered = notes.filter((n) => n.status === "delivered");
  const failed = notes.filter((n) => n.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      {/* Upcoming */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="flex flex-col divide-y">
            {pending.map((note) => (
              <div
                key={note.id}
                className={`flex items-center gap-3 py-3 ${
                  editingNoteId === note.id
                    ? "bg-muted rounded-lg px-3 -mx-3 ring-1 ring-ring"
                    : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {truncate(note.content.split("\n")[0], 60)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(note.scheduled_time)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(note)}
                  disabled={editingNoteId !== null}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(note.id)}
                  disabled={editingNoteId !== null}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-destructive mb-3">
            Failed
          </h2>
          <div className="flex flex-col divide-y">
            {failed.map((note) => (
              <div key={note.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {truncate(note.content.split("\n")[0], 50)}
                  </p>
                  <p className="text-xs text-destructive">{note.error}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(note.id)}
                >
                  Retry
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Posted */}
      {delivered.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            Recently Posted
          </h2>
          <div className="flex flex-col gap-1">
            {delivered.slice(0, 5).map((note) => (
              <p key={note.id} className="text-xs text-muted-foreground">
                {truncate(note.content.split("\n")[0], 50)} —{" "}
                {formatDate(note.delivered_at!)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 4: Build the dashboard page

Modify `web/src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ComposeForm } from "@/components/compose-form";
import { NotesList } from "@/components/notes-list";
import { SessionStatus } from "@/components/session-status";
import { Button } from "@/components/ui/button";
import type { ScheduledNote } from "@/lib/types";

export default function DashboardPage() {
  const [notes, setNotes] = useState<ScheduledNote[]>([]);
  const [editingNote, setEditingNote] = useState<ScheduledNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const loadNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    if (res.ok) {
      const data = await res.json();
      setNotes(data.notes);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    if (res.ok) loadNotes();
  }

  async function handleRetry(id: string) {
    // Reset failed note back to pending
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "pending" }),
    });
    loadNotes();
  }

  function handleEdit(note: ScheduledNote) {
    setEditingNote(note);
  }

  function handleCancelEdit() {
    setEditingNote(null);
  }

  function handleNoteCreatedOrUpdated() {
    setEditingNote(null);
    loadNotes();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Substack Scheduler</h1>
        <div className="flex items-center gap-3">
          <SessionStatus />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Compose Form */}
      <div className="mb-8">
        <ComposeForm
          key={editingNote?.id ?? "new"}
          onNoteCreated={handleNoteCreatedOrUpdated}
          onNoteUpdated={handleNoteCreatedOrUpdated}
          editingNote={editingNote}
          onCancelEdit={handleCancelEdit}
        />
      </div>

      {/* Notes List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center">
          Loading notes...
        </p>
      ) : (
        <NotesList
          notes={notes}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRetry={handleRetry}
          editingNoteId={editingNote?.id ?? null}
        />
      )}
    </div>
  );
}
```

### Step 5: Verify UI works locally

```bash
cd web && npm run dev
```

- Log in → see empty dashboard with compose form
- Create a note → appears in "Upcoming" list
- Edit a note → form populates, save updates it
- Delete a note → removed from list

### Step 6: Commit

```bash
git add web/src/components/ web/src/app/page.tsx
git commit -m "feat: add dashboard UI with compose form and notes list"
```

---

## Task 7: Calendar View

**Files:**
- Create: `web/src/components/calendar-view.tsx`
- Modify: `web/src/app/page.tsx` (add calendar tab)

### Step 1: Create calendar view component

Create `web/src/components/calendar-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import type { ScheduledNote } from "@/lib/types";

interface CalendarViewProps {
  notes: ScheduledNote[];
  onEdit: (note: ScheduledNote) => void;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CalendarView({ notes, onEdit }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );

  // Get dates that have pending notes (for dot indicators)
  const pendingNotes = notes.filter((n) => n.status === "pending");
  const datesWithNotes = new Set(
    pendingNotes.map((n) =>
      new Date(n.scheduled_time).toLocaleDateString()
    )
  );

  // Notes for the selected day
  const selectedDateStr = selectedDate?.toLocaleDateString();
  const notesForDay = notes.filter(
    (n) => new Date(n.scheduled_time).toLocaleDateString() === selectedDateStr
  );

  return (
    <div className="flex flex-col gap-4">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        modifiers={{
          hasNotes: (date) => datesWithNotes.has(date.toLocaleDateString()),
        }}
        modifiersStyles={{
          hasNotes: {
            fontWeight: "bold",
            textDecoration: "underline",
            textDecorationColor: "hsl(var(--primary))",
            textUnderlineOffset: "4px",
          },
        }}
        className="rounded-md border"
      />

      {/* Notes for selected day */}
      {selectedDate && notesForDay.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          <div className="flex flex-col gap-2">
            {notesForDay.map((note) => (
              <button
                key={note.id}
                onClick={() => note.status === "pending" && onEdit(note)}
                className="flex items-center gap-2 p-2 rounded-md border text-left hover:bg-muted transition-colors"
              >
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(note.scheduled_time)}
                </span>
                <span className="text-sm flex-1 truncate">
                  {note.content.split("\n")[0]}
                </span>
                <Badge
                  variant={
                    note.status === "delivered"
                      ? "default"
                      : note.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {note.status}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDate && notesForDay.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          No notes scheduled for this day
        </p>
      )}
    </div>
  );
}
```

### Step 2: Add calendar tab to dashboard

Update `web/src/app/page.tsx` — add Tabs around the notes list and calendar:

Import `Tabs` from shadcn and `CalendarView`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarView } from "@/components/calendar-view";
```

Replace the `{/* Notes List */}` section with:

```tsx
{/* Notes Tabs */}
{isLoading ? (
  <p className="text-sm text-muted-foreground text-center">
    Loading notes...
  </p>
) : (
  <Tabs defaultValue="list">
    <TabsList className="mb-4">
      <TabsTrigger value="list">List</TabsTrigger>
      <TabsTrigger value="calendar">Calendar</TabsTrigger>
    </TabsList>
    <TabsContent value="list">
      <NotesList
        notes={notes}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRetry={handleRetry}
        editingNoteId={editingNote?.id ?? null}
      />
    </TabsContent>
    <TabsContent value="calendar">
      <CalendarView notes={notes} onEdit={handleEdit} />
    </TabsContent>
  </Tabs>
)}
```

### Step 3: Verify calendar works

- Schedule a few notes on different days
- Switch to Calendar tab
- Days with notes should be underlined/bold
- Click a day to see notes for that day
- Click a pending note to edit it

### Step 4: Commit

```bash
git add web/src/components/calendar-view.tsx web/src/app/page.tsx
git commit -m "feat: add calendar view for scheduled notes"
```

---

## Task 8: Settings Page

**Files:**
- Create: `web/src/app/settings/page.tsx`

### Step 1: Create settings page

Create `web/src/app/settings/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface SessionInfo {
  hasSession: boolean;
  updatedAt?: string;
  lastVerifiedAt?: string | null;
}

export default function SettingsPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [token, setToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession);
  }, []);

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });

    if (res.ok) {
      setToken("");
      setSaveSuccess(true);
      // Refresh session info
      const sessionRes = await fetch("/api/session");
      setSession(await sessionRes.json());
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save session");
    }

    setIsSaving(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          Back to Dashboard
        </Button>
      </div>

      {/* Substack Session */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Substack Session</CardTitle>
          <CardDescription>
            Paste your Substack session cookie so the scheduler can post notes
            on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Status */}
          {session && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {session.hasSession ? (
                <Badge
                  variant={
                    session.lastVerifiedAt !== null ? "default" : "secondary"
                  }
                >
                  {session.lastVerifiedAt !== null
                    ? `Verified ${new Date(session.lastVerifiedAt).toLocaleDateString()}`
                    : `Saved ${new Date(session.updatedAt!).toLocaleDateString()} (unverified)`}
                </Badge>
              ) : (
                <Badge variant="destructive">Not configured</Badge>
              )}
            </div>
          )}

          {/* Instructions */}
          <Alert>
            <AlertDescription>
              <ol className="list-decimal list-inside text-sm space-y-1">
                <li>
                  Open{" "}
                  <a
                    href="https://substack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    substack.com
                  </a>{" "}
                  and make sure you&apos;re logged in
                </li>
                <li>Open DevTools (F12 or Cmd+Option+I)</li>
                <li>Go to Application tab → Cookies → substack.com</li>
                <li>
                  Find the cookie named <code className="font-mono bg-muted px-1 rounded">substack.sid</code> and copy its value
                </li>
                <li>Paste it below and click Save</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Token input */}
          <form onSubmit={handleSaveToken} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="token">Session cookie value</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your substack.sid cookie here"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saveSuccess && (
              <p className="text-sm text-green-600">
                Session saved successfully. It will be verified on the next
                posting cycle.
              </p>
            )}

            <Button type="submit" disabled={!token.trim() || isSaving}>
              {isSaving ? "Saving..." : "Save session"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 2: Verify settings page

- Navigate to `/settings`
- See instructions for cookie paste
- Paste a test value → saves successfully
- Status badge updates

### Step 3: Commit

```bash
git add web/src/app/settings/page.tsx
git commit -m "feat: add settings page with guided cookie paste"
```

---

## Task 9: Cron Worker — Puppeteer Posting

**Files:**
- Create: `worker/src/supabase.ts`
- Create: `worker/src/crypto.ts`
- Create: `worker/src/poster.ts`
- Create: `worker/src/cron.ts`

### Step 1: Create worker Supabase client

Create `worker/src/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

// Uses service role key to bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface DueNote {
  id: string;
  user_id: string;
  content: string;
  scheduled_time: string;
}

export async function getDueNotes(): Promise<DueNote[]> {
  const { data, error } = await supabase
    .from("scheduled_notes")
    .select("id, user_id, content, scheduled_time")
    .eq("status", "pending")
    .lte("scheduled_time", new Date().toISOString())
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Failed to query due notes:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getEncryptedToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("substack_sessions")
    .select("encrypted_token")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.error("Failed to get session token:", error?.message);
    return null;
  }

  return data.encrypted_token;
}

export async function markNoteDelivered(noteId: string): Promise<void> {
  const { error } = await supabase
    .from("scheduled_notes")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    console.error(`Failed to mark note ${noteId} as delivered:`, error.message);
  }
}

export async function markNoteFailed(
  noteId: string,
  errorMsg: string
): Promise<void> {
  const { error } = await supabase
    .from("scheduled_notes")
    .update({
      status: "failed",
      error: errorMsg,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    console.error(`Failed to mark note ${noteId} as failed:`, error.message);
  }
}

export async function updateSessionVerified(userId: string): Promise<void> {
  await supabase
    .from("substack_sessions")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function clearSessionVerified(userId: string): Promise<void> {
  await supabase
    .from("substack_sessions")
    .update({ last_verified_at: null })
    .eq("user_id", userId);
}
```

### Step 2: Create worker crypto module

Create `worker/src/crypto.ts` (copy from web, adapted for ESM):

```typescript
import { createDecipheriv } from "node:crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, "hex");

export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}
```

### Step 3: Create Puppeteer poster

Create `worker/src/poster.ts`:

```typescript
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

    // Set the Substack session cookie
    await page.setCookie({
      name: "substack.sid",
      value: sessionToken,
      domain: ".substack.com",
      path: "/",
      httpOnly: true,
      secure: true,
    });

    // Navigate to Substack to pass Cloudflare challenge
    console.log("Navigating to substack.com to pass Cloudflare...");
    const response = await page.goto("https://substack.com", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response || response.status() >= 400) {
      const status = response?.status() ?? "no response";
      console.error(`Failed to load Substack: HTTP ${status}`);

      // All notes fail with same error
      for (const note of notes) {
        results.set(note.id, {
          success: false,
          error: `Cloudflare/Substack unreachable (HTTP ${status})`,
        });
      }
      return results;
    }

    console.log("Substack loaded successfully. Posting notes...");

    // Post each note from within the browser context
    for (const note of notes) {
      console.log(`Posting note ${note.id}...`);

      const bodyJson = textToProseMirrorJson(note.content);

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

    // Mark any unprocessed notes as failed
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
```

### Step 4: Create main cron entry point

Create `worker/src/cron.ts`:

```typescript
import {
  getDueNotes,
  getEncryptedToken,
  markNoteDelivered,
  markNoteFailed,
  updateSessionVerified,
  clearSessionVerified,
} from "./supabase.js";
import { decrypt } from "./crypto.js";
import { postNotesWithPuppeteer } from "./poster.js";

async function main() {
  console.log(`[${new Date().toISOString()}] Cron worker starting...`);

  // 1. Check for due notes
  const dueNotes = await getDueNotes();

  if (dueNotes.length === 0) {
    console.log("No due notes. Exiting.");
    process.exit(0);
  }

  console.log(`Found ${dueNotes.length} due note(s).`);

  // 2. Group notes by user (in case of multi-user future)
  const notesByUser = new Map<string, typeof dueNotes>();
  for (const note of dueNotes) {
    const userNotes = notesByUser.get(note.user_id) ?? [];
    userNotes.push(note);
    notesByUser.set(note.user_id, userNotes);
  }

  // 3. Process each user's notes
  for (const [userId, userNotes] of notesByUser) {
    console.log(`Processing ${userNotes.length} note(s) for user ${userId}`);

    // Get and decrypt session token
    const encryptedToken = await getEncryptedToken(userId);
    if (!encryptedToken) {
      console.error(`No session token for user ${userId}. Marking notes as failed.`);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "No Substack session configured");
      }
      continue;
    }

    let sessionToken: string;
    try {
      sessionToken = decrypt(encryptedToken);
    } catch (err) {
      console.error(`Failed to decrypt token for user ${userId}:`, err);
      for (const note of userNotes) {
        await markNoteFailed(note.id, "Session token decryption failed");
      }
      continue;
    }

    // Post notes via Puppeteer
    const results = await postNotesWithPuppeteer(sessionToken, userNotes);

    // Update note statuses
    let anySuccess = false;
    let sessionExpired = false;

    for (const [noteId, result] of results) {
      if (result.success) {
        await markNoteDelivered(noteId);
        anySuccess = true;
      } else {
        await markNoteFailed(noteId, result.error ?? "Unknown error");
        // Check if the error indicates session expiry
        if (result.error?.includes("401") || result.error?.includes("403")) {
          sessionExpired = true;
        }
      }
    }

    // Update session verification status
    if (anySuccess) {
      await updateSessionVerified(userId);
    }
    if (sessionExpired) {
      await clearSessionVerified(userId);
    }
  }

  console.log("Cron worker finished.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cron worker crashed:", err);
  process.exit(1);
});
```

### Step 5: Add run script to worker package.json

Update `worker/package.json` scripts:

```json
{
  "scripts": {
    "start": "tsx src/cron.ts"
  }
}
```

### Step 6: Test locally (manual)

```bash
cd worker
# Set env vars
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export ENCRYPTION_KEY=<your-key>

# Run the cron manually
npm start
```

Expected: "No due notes. Exiting." (if no pending notes exist)

### Step 7: Commit

```bash
git add worker/
git commit -m "feat: add Puppeteer cron worker for posting notes"
```

---

## Task 10: Docker & Railway Deployment

**Files:**
- Create: `web/Dockerfile`
- Create: `worker/Dockerfile`
- Create: `railway.json` (optional, Railway can auto-detect)
- Modify: `web/next.config.ts` (standalone output for Docker)

### Step 1: Configure Next.js for standalone Docker output

Modify `web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

### Step 2: Create web Dockerfile

Create `web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Step 3: Create worker Dockerfile

Create `worker/Dockerfile`:

```dockerfile
FROM node:20-slim

# Install Chromium for Puppeteer
RUN apt-get update && \
    apt-get install -y chromium --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY . .

CMD ["npx", "tsx", "src/cron.ts"]
```

### Step 4: Deploy to Railway

1. Create a new Railway project
2. Connect your GitHub repo
3. Add two services:
   - **Web**: Root directory = `web/`, Dockerfile = `web/Dockerfile`
   - **Worker**: Root directory = `worker/`, Dockerfile = `worker/Dockerfile`, set as Cron service with schedule `0 * * * *` (every hour)
4. Add environment variables to both services:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (web only)
   - `SUPABASE_URL` (worker)
   - `SUPABASE_SERVICE_ROLE_KEY` (both)
   - `ENCRYPTION_KEY` (both — must match)
5. Deploy

### Step 5: Verify deployment

- Visit the Railway-provided URL for the web service
- Log in → create a note scheduled a few minutes from now
- Wait for the next hourly cron run (or trigger manually via Railway dashboard)
- Check that the note gets posted to Substack

### Step 6: Commit

```bash
git add web/Dockerfile web/next.config.ts worker/Dockerfile
git commit -m "feat: add Docker configs for Railway deployment"
```

---

## Task 11: End-to-End Verification

### Step 1: Full flow test

1. Log into the web app
2. Go to Settings → paste your real `substack.sid` cookie
3. Create 2 notes:
   - One scheduled for the past (should be picked up immediately by next cron)
   - One scheduled for tomorrow
4. Verify "Upcoming" shows both notes
5. Switch to Calendar view — verify dots on the correct days
6. Wait for cron to run (or trigger manually)
7. Verify:
   - Past note moves to "Recently Posted"
   - Tomorrow note stays in "Upcoming"
   - Session status shows "Verified"
8. Check Substack — the note actually appeared

### Step 2: Test error handling

1. Save an invalid cookie in Settings
2. Schedule a note in the past
3. Wait for cron → should fail with session error
4. Session status should change to "unverified"
5. Fix the cookie → retry the failed note → should post

### Step 3: Final commit

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

| Task | Description | Est. Steps |
|------|-------------|-----------|
| 1 | Project setup & dependencies | 6 |
| 2 | Database migration | 4 |
| 3 | Supabase Auth (login, middleware) | 7 |
| 4 | Notes CRUD API | 4 |
| 5 | Session management API | 3 |
| 6 | Dashboard UI (compose + notes list) | 6 |
| 7 | Calendar view | 4 |
| 8 | Settings page | 3 |
| 9 | Cron worker (Puppeteer) | 7 |
| 10 | Docker & Railway deployment | 6 |
| 11 | End-to-end verification | 3 |

**Critical path**: Tasks 1→2→3 must be sequential (setup before auth before anything else). Tasks 4-8 (API + UI) can be done in parallel with Task 9 (worker). Task 10 (deployment) depends on all prior tasks. Task 11 verifies everything works.
