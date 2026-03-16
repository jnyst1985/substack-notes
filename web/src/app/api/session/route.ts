import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

async function parseJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// GET /api/session — check if Substack session exists and its status
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("substack_sessions")
    .select("updated_at, last_verified_at, subdomain")
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ hasSession: false });
  }

  return NextResponse.json({
    hasSession: true,
    updatedAt: session.updated_at,
    lastVerifiedAt: session.last_verified_at,
    subdomain: session.subdomain,
  });
}

// POST /api/session — save (or update) the Substack session cookie
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token, subdomain } = body;

  if (!token?.trim()) {
    return NextResponse.json(
      { error: "Session token is required" },
      { status: 400 }
    );
  }

  const encryptedToken = encrypt(token.trim());

  // Sanitize subdomain: lowercase, alphanumeric + hyphens only
  const cleanSubdomain = subdomain?.trim()
    ? subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    : undefined;

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    encrypted_token: encryptedToken,
    updated_at: new Date().toISOString(),
    last_verified_at: null,
  };
  if (cleanSubdomain !== undefined) {
    upsertData.subdomain = cleanSubdomain || null;
  }

  const { error } = await supabase
    .from("substack_sessions")
    .upsert(upsertData, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/session — update subdomain only (no token required)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  if (!body || !("subdomain" in body)) {
    return NextResponse.json(
      { error: "subdomain field is required" },
      { status: 400 }
    );
  }

  const cleanSubdomain = body.subdomain?.trim()
    ? body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    : null;

  const { error } = await supabase
    .from("substack_sessions")
    .update({ subdomain: cleanSubdomain })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
