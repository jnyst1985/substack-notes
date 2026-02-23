import { NextRequest, NextResponse } from "next/server";
import { supabase, ScheduledNote } from "@/lib/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-user-id",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400, headers: corsHeaders }
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
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ notes: data as ScheduledNote[] }, { headers: corsHeaders });
  } catch (error) {
    console.error("Get notes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { content, scheduledTime } = await request.json();

    if (!content || !scheduledTime) {
      return NextResponse.json(
        { error: "content and scheduledTime are required" },
        { status: 400, headers: corsHeaders }
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
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ note: data as ScheduledNote }, { headers: corsHeaders });
  } catch (error) {
    console.error("Create note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
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
        { status: 400, headers: corsHeaders }
      );
    }

    if (!noteId) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400, headers: corsHeaders }
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
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("Delete note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
