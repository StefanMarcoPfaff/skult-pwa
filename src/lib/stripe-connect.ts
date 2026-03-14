import type Stripe from "stripe";

export const STRIPE_PLATFORM_FEE_PERCENT = 10;
export function getRequestedStripeConnectCapabilities():
  | Stripe.AccountCreateParams.Capabilities
  | Stripe.AccountUpdateParams.Capabilities {
  return {
    card_payments: {
      requested: true,
    },
    transfers: {
      requested: true,
    },
  };
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSiteUrl(requestUrl?: string): string {
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through to env/default handling
    }
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && isAbsoluteHttpUrl(configured)) {
    return configured;
  }

  return "http://localhost:3000";
}

export function calculateApplicationFeeAmount(amountCents: number): number {
  return Math.round(amountCents * (STRIPE_PLATFORM_FEE_PERCENT / 100));
}

export function buildDestinationPaymentIntentData(
  amountCents: number,
  stripeAccountId: string
): Stripe.Checkout.SessionCreateParams.PaymentIntentData {
  return {
    application_fee_amount: calculateApplicationFeeAmount(amountCents),
    transfer_data: {
      destination: stripeAccountId,
    },
  };
}

export function buildDestinationSubscriptionData(
  stripeAccountId: string
): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  return {
    application_fee_percent: STRIPE_PLATFORM_FEE_PERCENT,
    transfer_data: {
      destination: stripeAccountId,
    },
  };
}

export function getStripeConnectAccountParams(input: {
  email: string | null | undefined;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  teacherId: string;
}): Stripe.AccountCreateParams {
  return {
    country: process.env.STRIPE_CONNECT_COUNTRY || "DE",
    email: input.email ?? undefined,
    business_type: "individual",
    capabilities: getRequestedStripeConnectCapabilities(),
    controller: {
      fees: {
        payer: "application",
      },
      losses: {
        payments: "application",
      },
      requirement_collection: "stripe",
      stripe_dashboard: {
        type: "express",
      },
    },
    metadata: {
      teacherId: input.teacherId,
    },
    individual: {
      email: input.email ?? undefined,
      first_name: input.firstName ?? undefined,
      last_name: input.lastName ?? undefined,
    },
  };
}

export function getStripeConnectAccountUpdateParams(): Stripe.AccountUpdateParams {
  return {
    capabilities: getRequestedStripeConnectCapabilities(),
  };
}

export function summarizeStripeAccount(account: Stripe.Account) {
  return {
    id: account.id,
    type: account.type,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    capabilities: account.capabilities ?? null,
    controller: account.controller
      ? {
          fees: account.controller.fees ?? null,
          losses: account.controller.losses ?? null,
          requirement_collection: account.controller.requirement_collection ?? null,
          stripe_dashboard: account.controller.stripe_dashboard ?? null,
        }
      : null,
    requirements: account.requirements
      ? {
          currently_due: account.requirements.currently_due,
          eventually_due: account.requirements.eventually_due,
          past_due: account.requirements.past_due,
          pending_verification: account.requirements.pending_verification,
          disabled_reason: account.requirements.disabled_reason,
        }
      : null,
    future_requirements: account.future_requirements
      ? {
          currently_due: account.future_requirements.currently_due,
          eventually_due: account.future_requirements.eventually_due,
          past_due: account.future_requirements.past_due,
          pending_verification: account.future_requirements.pending_verification,
          disabled_reason: account.future_requirements.disabled_reason,
        }
      : null,
  };
}

export function summarizeDestinationChargeStatus(account: Stripe.Account) {
  const cardPayments = account.capabilities?.card_payments ?? null;
  const transfers = account.capabilities?.transfers ?? null;

  return {
    capabilities: {
      card_payments: cardPayments,
      transfers,
    },
    destinationChargeReady: cardPayments === "active" && transfers === "active",
  };
}

export function isStripeDestinationChargeReady(account: Stripe.Account): boolean {
  return summarizeDestinationChargeStatus(account).destinationChargeReady;
}
