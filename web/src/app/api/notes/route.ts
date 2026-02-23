import { NextRequest, NextResponse } from "next/server";
import { supabase, ScheduledNote } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("scheduled_notes")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_time", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to fetch notes" },
        { status: 500 }
      );
    }

    return NextResponse.json({ notes: data as ScheduledNote[] });
  } catch (error) {
    console.error("Get notes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400 }
      );
    }

    const { content, scheduledTime } = await request.json();

    if (!content || !scheduledTime) {
      return NextResponse.json(
        { error: "content and scheduledTime are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("scheduled_notes")
      .insert({
        user_id: userId,
        content,
        scheduled_time: scheduledTime,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to create note" },
        { status: 500 }
      );
    }

    return NextResponse.json({ note: data as ScheduledNote });
  } catch (error) {
    console.error("Create note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400 }
      );
    }

    if (!noteId) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("scheduled_notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", userId);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to delete note" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
