import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  buildDestinationSubscriptionData,
  getSiteUrl,
  isStripeDestinationChargeReady,
} from "@/lib/stripe-connect";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type IntentRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
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
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
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
    .select("id,trial_reservation_id,course_id,registration_token,email,first_name,last_name,status")
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
    .select("id,title,price_cents,currency,teacher_id")
    .eq("id", intent.course_id)
    .maybeSingle<CourseRow>();

  if (!course?.teacher_id || !course.price_cents || course.price_cents <= 0) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=course_unavailable`, url));
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", course.teacher_id)
    .maybeSingle<{ stripe_account_id: string | null }>();

  if (!profile?.stripe_account_id) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=provider_payment_missing`, url));
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(profile.stripe_account_id);
  if (!isStripeDestinationChargeReady(account)) {
    return NextResponse.redirect(new URL(`/trial/register/${token}?error=provider_payment_incomplete`, url));
  }

  const siteUrl = getSiteUrl(req.url);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: intent.email,
    line_items: [
      {
        price_data: {
          currency: (course.currency || "EUR").toLowerCase(),
          unit_amount: course.price_cents,
          recurring: {
            interval: "month",
          },
          product_data: {
            name: course.title || "Kurs",
          },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      ...buildDestinationSubscriptionData(profile.stripe_account_id),
      metadata: {
        registrationIntentId: intent.id,
        trialReservationId: intent.trial_reservation_id,
        courseId: intent.course_id,
        registrationToken: token,
      },
    },
    success_url: `${siteUrl}/trial/register/${token}/success?session_id={CHECKOUT_SESSION_ID}&intentId=${intent.id}`,
    cancel_url: `${siteUrl}/trial/register/${token}/cancel?intentId=${intent.id}`,
    metadata: {
      registrationIntentId: intent.id,
      trialReservationId: intent.trial_reservation_id,
      courseId: intent.course_id,
      registrationToken: token,
      teacherStripeAccountId: profile.stripe_account_id,
    },
    client_reference_id: intent.id,
  });

  await admin
    .from("course_registration_intents")
    .update({
      stripe_checkout_session_id: session.id,
      status: "checkout_started",
    })
    .eq("id", intent.id);

  return NextResponse.redirect(session.url!);
}
