import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function parseJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

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

  const body = await parseJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
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

  const body = await parseJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, content, scheduledTime } = body;

  if (!id) {
    return NextResponse.json({ error: "Note ID is required" }, { status: 400 });
  }

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

// PATCH /api/notes — retry a failed note (reset to pending)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Note ID is required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("scheduled_notes")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (existing.status !== "failed") {
    return NextResponse.json(
      { error: "Can only retry failed notes" },
      { status: 400 }
    );
  }

  const { data: note, error } = await supabase
    .from("scheduled_notes")
    .update({
      status: "pending",
      error: null,
      updated_at: new Date().toISOString(),
    })
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
