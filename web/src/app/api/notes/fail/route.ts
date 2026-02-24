import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-user-id",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Mark a note as failed (called from extension if posting fails)
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "x-user-id header is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { id, error: errorMessage } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Update note to failed
    const { data, error } = await supabase
      .from("scheduled_notes")
      .update({
        status: "failed",
        error: errorMessage || "Unknown error",
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to mark note failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ note: data }, { headers: corsHeaders });
  } catch (error) {
    console.error("Fail note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
