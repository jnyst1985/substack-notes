import { createClient } from "@/lib/supabase/server";
import { Platform } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const VALID_PLATFORMS: Platform[] = ["substack", "threads"];

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

// POST /api/notes — create scheduled note(s) for one or more platforms
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
  const { content, scheduledTime, platforms } = body;

  if (!content?.trim() || !scheduledTime) {
    return NextResponse.json(
      { error: "Content and scheduledTime are required" },
      { status: 400 }
    );
  }

  const scheduledDate = new Date(scheduledTime);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return NextResponse.json(
      { error: "Scheduled time must be a valid future date" },
      { status: 400 }
    );
  }

  // Default to substack-only for backward compatibility
  const targetPlatforms: Platform[] = platforms && Array.isArray(platforms)
    ? platforms.filter((p: string) => VALID_PLATFORMS.includes(p as Platform))
    : ["substack"];

  if (targetPlatforms.length === 0) {
    return NextResponse.json(
      { error: "At least one valid platform is required" },
      { status: 400 }
    );
  }

  // When posting to multiple platforms, link them with a shared group_id
  const groupId = targetPlatforms.length > 1 ? randomUUID() : null;

  const rows = targetPlatforms.map((platform: Platform) => ({
    user_id: user.id,
    content: content.trim(),
    scheduled_time: scheduledTime,
    platform,
    group_id: groupId,
  }));

  const { data: notes, error } = await supabase
    .from("scheduled_notes")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return single note for backward compat, full array for multi-platform
  if (notes.length === 1) {
    return NextResponse.json({ note: notes[0] }, { status: 201 });
  }
  return NextResponse.json({ notes }, { status: 201 });
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

// DELETE /api/notes?id=xxx&deleteGroup=true — delete a note (or its entire cross-post group)
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

  const deleteGroup = request.nextUrl.searchParams.get("deleteGroup") === "true";

  if (deleteGroup) {
    // Look up the note's group_id, then delete all notes in the group
    const { data: note } = await supabase
      .from("scheduled_notes")
      .select("group_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (note?.group_id) {
      const { error } = await supabase
        .from("scheduled_notes")
        .delete()
        .eq("group_id", note.group_id)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, deletedGroup: true });
    }
  }

  // Single note delete (default behavior)
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
