import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getSiteUrl,
  getStripeConnectAccountParams,
  getStripeConnectAccountUpdateParams,
  isStripeDestinationChargeReady,
  summarizeStripeAccount,
} from "@/lib/stripe-connect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  stripe_account_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logConnectError(context: string, error: unknown, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;

  const stripeError = error as Stripe.StripeRawError & {
    raw?: Record<string, unknown>;
    statusCode?: number;
    requestId?: string;
  };
  const supabaseError = error as SupabaseLikeError;

  console.error("[stripe-connect]", {
    context,
    message: stripeError?.message ?? supabaseError?.message ?? String(error),
    type: stripeError?.type,
    code: stripeError?.code ?? supabaseError?.code,
    raw: stripeError?.raw ?? null,
    statusCode: stripeError?.statusCode ?? null,
    requestId: stripeError?.requestId ?? null,
    details: supabaseError?.details,
    hint: supabaseError?.hint,
    ...meta,
  });
}

function logStripeAccountState(context: string, account: Stripe.Account) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[stripe-connect-account]", {
    context,
    ...summarizeStripeAccount(account),
  });
}

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
      logConnectError("auth.getUser", userError, { siteUrl });
      return buildErrorRedirect(siteUrl, userError.message ?? "auth.getUser failed");
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login", siteUrl));
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,stripe_account_id,first_name,last_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      logConnectError("profiles.select", profileError, { userId: user.id, siteUrl });
      return buildErrorRedirect(siteUrl, profileError.message ?? "profiles.select failed");
    }

    const stripe = getStripe();
    let stripeAccountId = profile?.stripe_account_id ?? null;
    let account: Stripe.Account;

    if (!stripeAccountId) {
      account = await stripe.accounts.create(
        getStripeConnectAccountParams({
          email: user.email,
          firstName: profile?.first_name,
          lastName: profile?.last_name,
          teacherId: user.id,
        })
      );
      logStripeAccountState("accounts.create", account);

      stripeAccountId = account.id;

      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          stripe_account_id: stripeAccountId,
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        logConnectError("profiles.upsert", upsertError, {
          userId: user.id,
          stripeAccountId,
          siteUrl,
        });
        return buildErrorRedirect(siteUrl, upsertError.message ?? "profiles.upsert failed");
      }
    } else {
      const existingAccount = await stripe.accounts.retrieve(stripeAccountId);
      logStripeAccountState("accounts.retrieve", existingAccount);

      account = await stripe.accounts.update(stripeAccountId, getStripeConnectAccountUpdateParams());
      logStripeAccountState("accounts.update", account);
    }

    if (!isStripeDestinationChargeReady(account)) {
      logConnectError("account.not-ready", new Error("Connected account is not transfer-enabled yet"), {
        stripeAccountId: account.id,
        account: summarizeStripeAccount(account),
      });
    }

    const returnUrl = new URL("/dashboard/profile?stripe_connected=1", siteUrl).toString();
    const refreshUrl = new URL("/api/stripe/connect", siteUrl).toString();

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return NextResponse.redirect(accountLink.url);
  } catch (error: unknown) {
    logConnectError("route", error, {
      siteUrl,
      configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    });

    const message =
      error instanceof Error ? error.message : "Stripe Connect onboarding konnte nicht gestartet werden.";
    return buildErrorRedirect(siteUrl, message);
  }
}
