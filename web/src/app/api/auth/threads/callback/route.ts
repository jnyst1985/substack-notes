import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

const TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const LONG_LIVED_TOKEN_URL = "https://graph.threads.net/access_token";
const PROFILE_URL = "https://graph.threads.net/v1.0/me";

// 60 days in milliseconds (long-lived token lifetime)
const LONG_LIVED_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;

// GET /api/auth/threads/callback — exchange code for token, store in DB
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/settings?threads=error&message=${errorParam}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?threads=error&message=missing_params", request.url)
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verify the state matches the logged-in user
  if (!user || user.id !== state) {
    return NextResponse.redirect(
      new URL("/settings?threads=error&message=auth_mismatch", request.url)
    );
  }

  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/settings?threads=error&message=not_configured", request.url)
    );
  }

  try {
    // Step 1: Exchange code for short-lived token
    const shortTokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!shortTokenRes.ok) {
      const err = await shortTokenRes.text();
      console.error("Threads short token exchange failed:", err);
      return NextResponse.redirect(
        new URL("/settings?threads=error&message=token_exchange_failed", request.url)
      );
    }

    const shortTokenData = await shortTokenRes.json();
    const shortLivedToken = shortTokenData.access_token;

    // Step 2: Exchange short-lived token for long-lived token
    const longTokenParams = new URLSearchParams({
      grant_type: "th_exchange_token",
      client_secret: appSecret,
      access_token: shortLivedToken,
    });

    const longTokenRes = await fetch(
      `${LONG_LIVED_TOKEN_URL}?${longTokenParams.toString()}`
    );

    if (!longTokenRes.ok) {
      const err = await longTokenRes.text();
      console.error("Threads long-lived token exchange failed:", err);
      return NextResponse.redirect(
        new URL("/settings?threads=error&message=long_token_failed", request.url)
      );
    }

    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token;

    // Step 3: Fetch user profile
    const profileRes = await fetch(
      `${PROFILE_URL}?fields=id,username&access_token=${accessToken}`
    );

    if (!profileRes.ok) {
      console.error("Threads profile fetch failed:", await profileRes.text());
      return NextResponse.redirect(
        new URL("/settings?threads=error&message=profile_failed", request.url)
      );
    }

    const profile = await profileRes.json();

    // Step 4: Encrypt token and store in DB
    const encryptedToken = encrypt(accessToken);
    const tokenExpiresAt = new Date(
      Date.now() + LONG_LIVED_TOKEN_LIFETIME_MS
    ).toISOString();

    const { error: dbError } = await supabase
      .from("threads_sessions")
      .upsert(
        {
          user_id: user.id,
          threads_user_id: profile.id,
          encrypted_access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          username: profile.username,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error("Failed to store Threads session:", dbError);
      return NextResponse.redirect(
        new URL("/settings?threads=error&message=db_error", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/settings?threads=connected", request.url)
    );
  } catch (err) {
    console.error("Threads OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/settings?threads=error&message=unexpected", request.url)
    );
  }
}
