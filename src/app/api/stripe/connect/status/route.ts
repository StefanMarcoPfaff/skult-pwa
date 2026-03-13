import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { isStripeDestinationChargeReady, summarizeStripeAccount } from "@/lib/stripe-connect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProfileRow = {
  stripe_account_id: string | null;
};

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const requestedAccountId = url.searchParams.get("account_id");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.stripe_account_id && !requestedAccountId) {
    return NextResponse.json({ error: "No stripe_account_id stored" }, { status: 404 });
  }

  const stripe = getStripe();
  const stripeAccountId = requestedAccountId || profile?.stripe_account_id;
  if (!stripeAccountId) {
    return NextResponse.json({ error: "No stripe_account_id available" }, { status: 404 });
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);

  return NextResponse.json({
    stripeAccountId,
    destinationChargeReady: isStripeDestinationChargeReady(account),
    ...summarizeStripeAccount(account),
  });
}
