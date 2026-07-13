import { NextResponse } from "next/server";
import {
  ACTIVE_BOOKING_DUPLICATE_MESSAGE,
  hasActiveCourseParticipationForEmail,
} from "@/lib/booking-duplicate-guard";
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
import { getBerlinTodayDate } from "@/lib/payments/subscriptions/dates";
import { calculateProratedFirstSubscriptionAmount } from "@/lib/payments/subscriptions/proration";
import {
  findSubscriptionContractById,
  findSubscriptionContractByIntentId,
} from "@/lib/payments/subscriptions/contracts-repo";
import { createPendingInitialPaymentContract } from "@/lib/payments/subscriptions/contracts-service";
import {
  type ProviderBillingProfile,
  getProviderBillingProfile,
  isProviderCustomConnectPaymentProcessingConfigured,
} from "@/lib/provider-billing-profile";
import { buildOfferAvailability, loadOccupiedCourseSeats } from "@/lib/public-offer-availability";
import { getSiteUrl } from "@/lib/stripe-connect";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { assertPaidOffersAllowed } from "@/lib/pilot-mode";

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

type ReadySubscriptionProviderProfile = ProviderBillingProfile & {
  providerPayoutProfileId: string;
  providerAccountId: string;
  stripeAccountType: "custom";
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
}

function isReadySubscriptionProviderProfile(
  profile: ProviderBillingProfile | null
): profile is ReadySubscriptionProviderProfile {
  return Boolean(
    profile?.providerPayoutProfileId &&
      profile.providerAccountId &&
      profile.stripeAccountType === "custom" &&
      isProviderCustomConnectPaymentProcessingConfigured(profile)
  );
}

function getProviderSubscriptionCheckoutError(
  profile: ProviderBillingProfile | null
):
  | "provider_custom_profile_missing"
  | "provider_custom_profile_legacy"
  | "provider_custom_profile_incomplete"
  | null {
  if (!profile?.providerPayoutProfileId) {
    return "provider_custom_profile_missing";
  }

  if (!profile.providerAccountId) {
    return "provider_custom_profile_missing";
  }

  if (profile.stripeAccountType !== "custom") {
    return "provider_custom_profile_legacy";
  }

  if (!isReadySubscriptionProviderProfile(profile)) {
    return "provider_custom_profile_incomplete";
  }

  return null;
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

  try {
    assertPaidOffersAllowed(course.price_cents);
  } catch {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=paid_offers_pilot`, url));
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

  const hasDuplicateParticipation = await hasActiveCourseParticipationForEmail({
    admin,
    courseId: intent.course_id,
    email: intent.email,
    excludeReservationId: intent.trial_reservation_id,
    excludeIntentId: intent.id,
  });

  if (hasDuplicateParticipation) {
    return NextResponse.redirect(
      new URL(`/trial/register/${token}?error=${encodeURIComponent(ACTIVE_BOOKING_DUPLICATE_MESSAGE)}`, url)
    );
  }

  const providerBillingProfile = await getProviderBillingProfile(admin, course.teacher_id);
  const readyProviderProfile = isReadySubscriptionProviderProfile(providerBillingProfile)
    ? providerBillingProfile
    : null;
  const providerCheckoutError = readyProviderProfile
    ? null
    : getProviderSubscriptionCheckoutError(providerBillingProfile);

  if (providerCheckoutError) {
    console.warn("[stripe-course-registration-checkout]", {
      context: "provider_custom_connect_not_ready",
      intentId: intent.id,
      courseId: intent.course_id,
      teacherId: course.teacher_id,
      providerPayoutProfileId: providerBillingProfile?.providerPayoutProfileId ?? null,
      providerAccountIdPresent: Boolean(providerBillingProfile?.providerAccountId),
      stripeAccountType: providerBillingProfile?.stripeAccountType ?? null,
      stripeChargesEnabled: providerBillingProfile?.stripeChargesEnabled ?? null,
      stripePayoutsEnabled: providerBillingProfile?.stripePayoutsEnabled ?? null,
      stripeDetailsSubmitted: providerBillingProfile?.stripeDetailsSubmitted ?? null,
      stripeRequirementsCurrentlyDue: providerBillingProfile?.stripeRequirementsCurrentlyDue ?? [],
      error: providerCheckoutError,
    });
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=${providerCheckoutError}`, url));
  }

  if (!readyProviderProfile) {
    return NextResponse.redirect(
      new URL(`/trial/register/${token}?error=provider_custom_profile_incomplete`, url)
    );
  }

  const siteUrl = getSiteUrl(req.url);
  const sessionCurrency = getCourseSubscriptionCheckoutCurrency().toLowerCase();
  const billingCycleAnchor = getCourseSubscriptionBillingCycleAnchor();
  const firstPaymentProration = calculateProratedFirstSubscriptionAmount({
    monthlyAmountCents: course.price_cents,
    contractStartDate: getBerlinTodayDate(),
  });
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
      billingCycleAnchorUnix: billingCycleAnchor,
      metadata: {
        payment_model: "platform_charge",
        ledger_mode: "separate_charges_and_transfers",
        connect_path: "custom_v2",
        provider_id: course.teacher_id,
        provider_payout_profile_id: readyProviderProfile.providerPayoutProfileId,
        course_id: intent.course_id,
        course_registration_intent_id: intent.id,
        registrationIntentId: intent.id,
        trialReservationId: intent.trial_reservation_id,
        courseId: intent.course_id,
        registrationToken: token,
        providerStripeAccountId: readyProviderProfile.providerAccountId,
        checkoutFlow: "course_registration",
        first_payment_full_month_amount_cents: String(firstPaymentProration.full_month_amount_cents),
        first_payment_prorated_amount_cents: String(firstPaymentProration.prorated_amount_cents),
        first_payment_period_start: firstPaymentProration.period_start,
        first_payment_period_end: firstPaymentProration.period_end,
        first_payment_days_in_month: String(firstPaymentProration.days_in_month),
        first_payment_billable_days: String(firstPaymentProration.billable_days),
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
