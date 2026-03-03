"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";

interface SessionInfo {
  hasSession: boolean;
  updatedAt?: string;
  lastVerifiedAt?: string | null;
}

interface ThreadsStatus {
  connected: boolean;
  username?: string;
}

export function SessionStatus() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [threads, setThreads] = useState<ThreadsStatus | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ hasSession: false }));

    fetch("/api/auth/threads/status")
      .then((r) => r.json())
      .then(setThreads)
      .catch(() => setThreads({ connected: false }));
  }, []);

  return (
    <Link href="/settings" className="flex items-center gap-2">
      {/* Substack status */}
      {session && (
        <Badge variant={session.hasSession ? (session.lastVerifiedAt ? "default" : "secondary") : "destructive"}>
          <SubstackIcon className="mr-1 h-3 w-3" />
          {session.hasSession
            ? session.lastVerifiedAt
              ? "Connected"
              : "Unverified"
            : "Not set"}
        </Badge>
      )}

      {/* Threads status */}
      {threads && (
        <Badge variant={threads.connected ? "default" : "outline"}>
          <ThreadsIcon className="mr-1 h-3 w-3" />
          {threads.connected ? `@${threads.username}` : "Not connected"}
        </Badge>
      )}
    </Link>
  );
}
