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
};

function logConnectError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const stripeError = error as Stripe.StripeRawError & {
    statusCode?: number;
    requestId?: string;
  };
  const supabaseError = error as SupabaseLikeError;

  console.error("[stripe-connect]", {
    context,
    message: stripeError?.message ?? supabaseError?.message ?? String(error),
    type: stripeError?.type,
    code: stripeError?.code ?? supabaseError?.code,
    statusCode: stripeError?.statusCode ?? null,
    requestId: stripeError?.requestId ?? null,
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
  url.searchParams.set("stripe_error_detail", message.slice(0, 240));
  return NextResponse.redirect(url);
}

function getUserFacingConnectErrorMessage(error: unknown): string {
  const stripeError = error as Stripe.StripeRawError & {
    statusCode?: number;
  };
  const message = stripeError?.message ?? (error instanceof Error ? error.message : "");

  if (
    stripeError?.code === "resource_missing" ||
    /no such account/i.test(message) ||
    /account.*not found/i.test(message)
  ) {
    return "Das hinterlegte Stripe-Konto war nicht mehr gÃ¼ltig. Bitte starte das Stripe-Onboarding erneut.";
  }

  if (/return_url|refresh_url|url/i.test(message)) {
    return "Stripe-Onboarding konnte wegen einer ungÃ¼ltigen RÃ¼ckleitungs-URL nicht gestartet werden.";
  }

  return "Stripe-Onboarding konnte derzeit nicht gestartet werden. Bitte versuche es erneut.";
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
    let account: Stripe.Account | null = null;
    let shouldPersistStripeAccountId = false;

    if (stripeAccountId) {
      try {
        const existingAccount = await stripe.accounts.retrieve(stripeAccountId);
        logStripeAccountState("accounts.retrieve", existingAccount);

        account = await stripe.accounts.update(stripeAccountId, getStripeConnectAccountUpdateParams());
        logStripeAccountState("accounts.update", account);
      } catch (error: unknown) {
        logConnectError("accounts.retrieve-or-update", error, {
          userId: user.id,
          stripeAccountId,
          siteUrl,
        });
        stripeAccountId = null;
      }
    }

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
      shouldPersistStripeAccountId = true;
    }

    if (!account) {
      throw new Error("Stripe account could not be prepared for onboarding.");
    }

    if (!isStripeDestinationChargeReady(account)) {
      logConnectError(
        "account.not-ready",
        new Error("Connected account is not fully enabled for destination charges yet"),
        {
          stripeAccountId: account.id,
          account: summarizeStripeAccount(account),
        }
      );
    }

    const returnUrl = new URL("/dashboard/profile?stripe_connected=1", siteUrl).toString();
    const refreshUrl = new URL("/api/stripe/connect", siteUrl).toString();

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    if (shouldPersistStripeAccountId) {
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
        return buildErrorRedirect(
          siteUrl,
          "Stripe-Onboarding wurde erstellt, aber das Konto konnte lokal nicht gespeichert werden."
        );
      }
    }

    return NextResponse.redirect(accountLink.url);
  } catch (error: unknown) {
    logConnectError("route", error, {
      siteUrl,
      configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    });

    const message = getUserFacingConnectErrorMessage(error);
    return buildErrorRedirect(siteUrl, message);
  }
}
