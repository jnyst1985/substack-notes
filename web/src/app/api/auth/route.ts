import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { encrypt } from "@/lib/crypto";

export async function POST(request: NextRequest) {
  try {
    const { userId, sessionToken } = await request.json();

    if (!userId || !sessionToken) {
      return NextResponse.json(
        { error: "userId and sessionToken are required" },
        { status: 400 }
      );
    }

    const encryptedToken = encrypt(sessionToken);

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error } = await supabase.from("user_sessions").upsert(
      {
        user_id: userId,
        encrypted_token: encryptedToken,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to store session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
