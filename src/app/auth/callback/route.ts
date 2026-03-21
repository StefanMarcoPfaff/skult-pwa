// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { resolvePostAuthRedirectPath, sanitizeRedirectPath } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = sanitizeRedirectPath(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      return NextResponse.redirect(new URL("/login?error=otp_failed", url.origin));
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  if (next) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const redirectPath = await resolvePostAuthRedirectPath(supabase, user);

  return NextResponse.redirect(new URL(redirectPath, url.origin));
}
