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
