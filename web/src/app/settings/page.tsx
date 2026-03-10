"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  tokenExpiresAt?: string;
}

function SettingsContent() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [threadsStatus, setThreadsStatus] = useState<ThreadsStatus | null>(null);
  const [token, setToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Show Threads OAuth result from redirect
  const threadsResult = searchParams.get("threads");
  const threadsMessage = searchParams.get("message");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession);

    fetch("/api/auth/threads/status")
      .then((r) => r.json())
      .then(setThreadsStatus);
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
      const sessionRes = await fetch("/api/session");
      setSession(await sessionRes.json());
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save session");
    }

    setIsSaving(false);
  }

  async function handleDisconnectThreads() {
    setIsDisconnecting(true);
    const res = await fetch("/api/auth/threads/disconnect", { method: "POST" });
    if (res.ok) {
      setThreadsStatus({ connected: false });
    }
    setIsDisconnecting(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          Back to Dashboard
        </Button>
      </div>

      {/* Threads OAuth result banner */}
      {threadsResult === "connected" && (
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800">
          <AlertDescription>
            Threads account connected successfully.
          </AlertDescription>
        </Alert>
      )}
      {threadsResult === "error" && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>
            Failed to connect Threads: {threadsMessage || "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {/* Substack Session Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SubstackIcon />
            Substack Session
          </CardTitle>
          <CardDescription>
            Paste your Substack session cookie so the scheduler can post notes
            on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {session && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {session.hasSession ? (
                <Badge
                  variant={
                    session.lastVerifiedAt !== null ? "default" : "secondary"
                  }
                >
                  {session.lastVerifiedAt !== null && session.lastVerifiedAt !== undefined
                    ? `Verified ${new Date(session.lastVerifiedAt).toLocaleDateString()}`
                    : `Saved ${new Date(session.updatedAt!).toLocaleDateString()} (unverified)`}
                </Badge>
              ) : (
                <Badge variant="destructive">Not configured</Badge>
              )}
            </div>
          )}

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">How to get your session cookie</CardTitle>
            </CardHeader>
            <CardContent>
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
                <li>Go to Application tab &rarr; Cookies &rarr; substack.com</li>
                <li>
                  Find the cookie named <code className="font-mono bg-muted px-1 rounded">substack.sid</code> and copy its value
                </li>
                <li>Paste it below and click Save</li>
              </ol>
            </CardContent>
          </Card>

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

      {/* Threads Connection Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ThreadsIcon />
            Threads
          </CardTitle>
          <CardDescription>
            Connect your Threads account to schedule and cross-post notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {threadsStatus === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : threadsStatus.connected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Account:</span>
                <Badge variant="default">@{threadsStatus.username}</Badge>
              </div>
              {threadsStatus.tokenExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  Token expires{" "}
                  {new Date(threadsStatus.tokenExpiresAt).toLocaleDateString()}
                  {" "}(auto-refreshed)
                </p>
              )}
              <Button
                variant="outline"
                onClick={handleDisconnectThreads}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect Threads"}
              </Button>
            </>
          ) : (
            <Button asChild>
              <a href="/api/auth/threads">Connect Threads Account</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
