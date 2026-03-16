"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SubstackIcon } from "@/components/icons/substack-icon";
import { ThreadsIcon } from "@/components/icons/threads-icon";

interface SessionInfo {
  hasSession: boolean;
  updatedAt?: string;
  lastVerifiedAt?: string | null;
  subdomain?: string | null;
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
  const [subdomain, setSubdomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSubdomain, setIsSavingSubdomain] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [subdomainSuccess, setSubdomainSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const threadsResult = searchParams.get("threads");
  const threadsMessage = searchParams.get("message");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s: SessionInfo) => {
        setSession(s);
        if (s.subdomain) setSubdomain(s.subdomain);
      });

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
      body: JSON.stringify({
        token: token.trim(),
        subdomain: subdomain.trim() || undefined,
      }),
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

  async function handleSaveSubdomain(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingSubdomain(true);
    setSubdomainSuccess(false);

    const res = await fetch("/api/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomain: subdomain.trim() }),
    });

    if (res.ok) {
      setSubdomainSuccess(true);
      const sessionRes = await fetch("/api/session");
      const s = await sessionRes.json();
      setSession(s);
    }
    setIsSavingSubdomain(false);
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
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your connected platforms and preferences"
      />

      <div className="px-8 pb-8 max-w-2xl">
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

        <div className="flex flex-col gap-6">
          {/* Substack Session Card */}
          <div className="bg-card rounded-[20px] border border-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <SubstackIcon />
              <h2 className="text-base font-semibold">Substack Session</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Paste your Substack session cookie so the scheduler can post notes
              on your behalf.
            </p>

            {session && (
              <div className="flex items-center gap-2 mb-4">
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

            <div className="bg-secondary rounded-xl p-4 mb-4">
              <p className="text-sm font-medium mb-2">How to get your session cookie</p>
              <ol className="list-decimal list-inside text-sm space-y-1 text-muted-foreground">
                <li>
                  Open{" "}
                  <a
                    href="https://substack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium text-foreground"
                  >
                    substack.com
                  </a>{" "}
                  and make sure you&apos;re logged in
                </li>
                <li>Open DevTools (F12 or Cmd+Option+I)</li>
                <li>Go to Application tab &rarr; Cookies &rarr; substack.com</li>
                <li>
                  Find the cookie named <code className="font-mono bg-muted px-1 rounded text-foreground">substack.sid</code> and copy its value
                </li>
                <li>Paste it below and click Save</li>
              </ol>
            </div>

            <form onSubmit={handleSaveToken} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="token">Session cookie value</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your substack.sid cookie here"
                  className="bg-secondary rounded-xl"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {saveSuccess && (
                <p className="text-sm text-green-600">
                  Session saved successfully. It will be verified on the next
                  posting cycle.
                </p>
              )}

              <Button
                type="submit"
                disabled={!token.trim() || isSaving}
                className="w-fit"
              >
                {isSaving ? "Saving..." : "Save Session"}
              </Button>
            </form>
          </div>

          {/* Substack Publication Card */}
          <div className="bg-card rounded-[20px] border border-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <SubstackIcon />
              <h2 className="text-base font-semibold">Substack Publication</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Enter your Substack subdomain to enable post analytics.
            </p>

            <form onSubmit={handleSaveSubdomain} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    value={subdomain}
                    onChange={(e) => {
                      setSubdomain(e.target.value);
                      setSubdomainSuccess(false);
                    }}
                    placeholder="e.g. beforeai"
                    className="bg-secondary rounded-xl"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    .substack.com
                  </span>
                </div>
              </div>
              {subdomainSuccess && (
                <p className="text-sm text-green-600">
                  Subdomain saved. Analytics will be fetched on the next cron cycle.
                </p>
              )}
              <Button
                type="submit"
                variant="outline"
                disabled={isSavingSubdomain}
                className="w-fit"
              >
                {isSavingSubdomain ? "Saving..." : "Save subdomain"}
              </Button>
            </form>
          </div>

          {/* Threads Connection Card */}
          <div className="bg-card rounded-[20px] border border-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <ThreadsIcon />
              <h2 className="text-base font-semibold">Threads</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Threads account to schedule and cross-post notes.
            </p>

            {threadsStatus === null ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : threadsStatus.connected ? (
              <div className="flex flex-col gap-3">
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
                  className="w-fit"
                >
                  {isDisconnecting ? "Disconnecting..." : "Disconnect Threads"}
                </Button>
              </div>
            ) : (
              <Button asChild className="w-fit">
                <a href="/api/auth/threads">Connect Threads Account</a>
              </Button>
            )}
          </div>
        </div>
      </div>
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
