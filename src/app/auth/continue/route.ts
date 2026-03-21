import { NextResponse } from "next/server";
import { resolvePostAuthRedirectPath } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectPath = await resolvePostAuthRedirectPath(supabase, user);
  return NextResponse.redirect(new URL(redirectPath, url.origin));
}
