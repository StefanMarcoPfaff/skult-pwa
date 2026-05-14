import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { isCourseClosedForNewRegistrations } from "@/lib/course-ending";
import { type CourseStatus, isCourseOpenForNewRegistrations } from "@/lib/course-lifecycle-shared";
import {
  getCourseSubscriptionBillingCycleAnchor,
  getCourseSubscriptionCheckoutCurrency,
  getCourseSubscriptionCheckoutCurrencyError,
  isCourseSubscriptionCheckoutCurrencySupported,
} from "@/lib/course-subscription-checkout";
import { isPaymentsV2SubscriptionsDualWriteEnabled } from "@/lib/payments/config";
import { paymentService } from "@/lib/payments/payment-service";
import {
  findSubscriptionContractById,
  findSubscriptionContractByIntentId,
} from "@/lib/payments/subscriptions/contracts-repo";
import { createPendingInitialPaymentContract } from "@/lib/payments/subscriptions/contracts-service";
import { buildOfferAvailability, loadOccupiedCourseSeats } from "@/lib/public-offer-availability";
import { getStripe } from "@/lib/stripe";
import { getSiteUrl, isStripeDestinationChargeReady } from "@/lib/stripe-connect";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type IntentRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
  subscription_contract_id: string | null;
  registration_token: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
};

type ReservationRow = {
  id: string;
  status: string | null;
  registration_expires_at: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  price_cents: number | null;
  currency: string | null;
  teacher_id: string | null;
  capacity: number | null;
  ends_at: string | null;
  status: CourseStatus;
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
}

async function ensureDraftSubscriptionContractForCheckout(input: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  intent: IntentRow;
  course: CourseRow;
}): Promise<string | null> {
  if (!isPaymentsV2SubscriptionsDualWriteEnabled()) {
    return null;
  }

  const existingContractId = input.intent.subscription_contract_id?.trim() || null;
  if (existingContractId) {
    const existingById = await findSubscriptionContractById(existingContractId);
    if (existingById) {
      return existingById.id;
    }
  }

  const existingByIntent = await findSubscriptionContractByIntentId(input.intent.id);
  if (existingByIntent) {
    if (!existingContractId) {
      await input.admin
        .from("course_registration_intents")
        .update({ subscription_contract_id: existingByIntent.id })
        .eq("id", input.intent.id)
        .is("subscription_contract_id", null);
    }
    return existingByIntent.id;
  }

  try {
    const createdContract = await createPendingInitialPaymentContract({
      courseRegistrationIntentId: input.intent.id,
      courseId: input.course.id,
      teacherId: input.course.teacher_id!,
      customerEmail: input.intent.email,
      provider: "stripe",
      baseAmountCents: input.course.price_cents!,
      currency: getCourseSubscriptionCheckoutCurrency(),
      billingAnchorDay: 1,
      metadata: {
        checkoutFlow: "course_registration",
        trialReservationId: input.intent.trial_reservation_id,
      },
    });

    await input.admin
      .from("course_registration_intents")
      .update({ subscription_contract_id: createdContract.id })
      .eq("id", input.intent.id)
      .is("subscription_contract_id", null);

    return createdContract.id;
  } catch (error) {
    const existingAfterConflict = await findSubscriptionContractByIntentId(input.intent.id);
    if (existingAfterConflict) {
      await input.admin
        .from("course_registration_intents")
        .update({ subscription_contract_id: existingAfterConflict.id })
        .eq("id", input.intent.id)
        .is("subscription_contract_id", null);

      return existingAfterConflict.id;
    }

    throw error;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const intentId = url.searchParams.get("intentId");
  const token = url.searchParams.get("token");

  if (!intentId || !token) {
    return NextResponse.redirect(new URL("/courses", url));
  }

  const admin = createSupabaseAdmin();

  const { data: intent } = await admin
    .from("course_registration_intents")
    .select("id,trial_reservation_id,course_id,subscription_contract_id,registration_token,email,first_name,last_name,status")
    .eq("id", intentId)
    .maybeSingle<IntentRow>();

  if (!intent || intent.registration_token !== token) {
    return NextResponse.redirect(new URL(`/trial/register/${token}`, url));
  }

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,status,registration_expires_at")
    .eq("id", intent.trial_reservation_id)
    .maybeSingle<ReservationRow>();

  if (!reservation || reservation.status !== "approved" || isExpired(reservation.registration_expires_at)) {
    return NextResponse.redirect(new URL(`/trial/register/${token}`, url));
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title,price_cents,currency,teacher_id,capacity,ends_at,status")
    .eq("id", intent.course_id)
    .maybeSingle<CourseRow>();

  if (!course?.teacher_id || !course.price_cents || course.price_cents <= 0) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=course_unavailable`, url));
  }

  if (!isCourseSubscriptionCheckoutCurrencySupported(course.currency)) {
    return NextResponse.redirect(
      new URL(
        `/trial/register/${token}?error=${encodeURIComponent(
          getCourseSubscriptionCheckoutCurrencyError(course.currency)
        )}`,
        url
      )
    );
  }

  if (!isCourseOpenForNewRegistrations(course.status, course.ends_at) || isCourseClosedForNewRegistrations(course.ends_at)) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=course_ending`, url));
  }

  const availability = buildOfferAvailability(course.capacity, await loadOccupiedCourseSeats(intent.course_id));
  if (availability.isSoldOut) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=course_unavailable`, url));
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id,provider_type")
    .eq("id", course.teacher_id)
    .maybeSingle<{ stripe_account_id: string | null; provider_type: ProviderType | null }>();

  if (!profile?.stripe_account_id) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=provider_payment_missing`, url));
  }

  const stripe = getStripe();
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(profile.stripe_account_id);
  } catch (error: unknown) {
    console.error("[stripe-course-registration-connect]", {
      context: "account.retrieve.failed",
      stripeAccountId: profile.stripe_account_id,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=provider_payment_missing`, url));
  }
  if (!isStripeDestinationChargeReady(account)) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=provider_payment_incomplete`, url));
  }

  const siteUrl = getSiteUrl(req.url);
  const sessionCurrency = getCourseSubscriptionCheckoutCurrency().toLowerCase();
  const billingCycleAnchor = getCourseSubscriptionBillingCycleAnchor();
  const subscriptionContractId = await ensureDraftSubscriptionContractForCheckout({
    admin,
    intent,
    course,
  });

  let sessionId: string;
  let sessionUrl: string | null;
  try {
    const session = await paymentService.createRecurringPayment({
      provider: "stripe",
      mode: "subscription",
      customer: {
        email: intent.email,
      },
      lineItems: [
        {
          quantity: 1,
          priceData: {
            currency: sessionCurrency,
            unitAmount: course.price_cents,
            recurringInterval: "month",
            productName: course.title || "Kurs",
          },
        },
      ],
      successUrl: `${siteUrl}/trial/register/${token}/success?session_id={CHECKOUT_SESSION_ID}&intentId=${intent.id}`,
      cancelUrl: `${siteUrl}/trial/register/${token}/cancel?intentId=${intent.id}`,
      providerContext: {
        connectedAccountId: profile.stripe_account_id,
        providerType: profile.provider_type,
      },
      billingCycleAnchorUnix: billingCycleAnchor,
      metadata: {
        registrationIntentId: intent.id,
        trialReservationId: intent.trial_reservation_id,
        courseId: intent.course_id,
        registrationToken: token,
        teacherStripeAccountId: profile.stripe_account_id,
        checkoutFlow: "course_registration",
        ...(subscriptionContractId ? { subscriptionContractId } : {}),
      },
      clientReferenceId: intent.id,
    });
    sessionId = session.sessionId;
    sessionUrl = session.url;
  } catch (error: unknown) {
    console.error("[stripe-course-registration-checkout]", {
      context: "checkout.session.create.failed",
      intentId: intent.id,
      courseId: intent.course_id,
      billingCycleAnchor,
      currency: sessionCurrency,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=subscription_creation_failed`, url));
  }

  await admin
    .from("course_registration_intents")
    .update({
      stripe_checkout_session_id: sessionId,
      status: "checkout_started",
    })
    .eq("id", intent.id);

  return NextResponse.redirect(sessionUrl!);
}
