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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Substack Session</CardTitle>
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
                <li>Go to Application tab &rarr; Cookies &rarr; substack.com</li>
                <li>
                  Find the cookie named <code className="font-mono bg-muted px-1 rounded">substack.sid</code> and copy its value
                </li>
                <li>Paste it below and click Save</li>
              </ol>
            </AlertDescription>
          </Alert>

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
