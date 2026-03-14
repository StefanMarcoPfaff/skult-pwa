import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/stripe-connect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProfileRow = {
  stripe_account_id: string | null;
};

function buildErrorRedirect(siteUrl: string, message: string) {
  const url = new URL("/dashboard/profile", siteUrl);
  url.searchParams.set("stripe_error", "1");
  if (process.env.NODE_ENV !== "production") {
    url.searchParams.set("stripe_error_detail", message.slice(0, 240));
  }
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const siteUrl = getSiteUrl(req.url);

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return buildErrorRedirect(siteUrl, userError.message ?? "auth.getUser failed");
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", siteUrl));
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      return buildErrorRedirect(siteUrl, profileError.message ?? "profiles.select failed");
    }

    if (!profile?.stripe_account_id) {
      return buildErrorRedirect(siteUrl, "Kein verbundenes Stripe-Konto gefunden.");
    }

    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);

    return NextResponse.redirect(loginLink.url);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Stripe Express Login-Link konnte nicht erstellt werden.";
    return buildErrorRedirect(siteUrl, message);
  }
}
