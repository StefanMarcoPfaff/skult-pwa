import { formatRecurringCoursePrice } from "@/lib/course-display";
import { isPaymentsV2SubscriptionsDualWriteEnabled } from "@/lib/payments/config";
import { mirrorStripePaymentToLedger } from "@/lib/payments/ledger";
import { materializeSuccessfulInitialSubscriptionPayment } from "@/lib/payments/subscriptions/initial-payment-materialization";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendCourseSubscriptionConfirmationEmail,
  sendCourseSubscriptionProviderNotificationEmail,
} from "@/lib/trial-reservation-emails";
import {
  issueCourseParticipantTicketForSubscription,
  type TicketRow,
} from "@/lib/tickets";

type CourseRegistrationIntentRow = {
  id: string;
  trial_reservation_id: string | null;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  completed_at: string | null;
  registration_confirmation_email_sent_at: string | null;
  provider_notification_email_sent_at: string | null;
};

type TrialReservationRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  converted_at: string | null;
  converted_registration_intent_id: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
  price_cents: number | null;
  currency: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  location: string | null;
  location_details: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
  stripe_account_id: string | null;
};

type ProviderContact = {
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  providerEmail: string | null;
  providerContactName: string | null;
  senderImageUrl: string | null;
  providerAccountId: string | null;
};

type SupabaseLikeError = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
};

export type CourseRegistrationFinalizeResult =
  | {
      kind: "completed";
      intentId: string;
      sessionId: string;
      courseTitle: string;
      priceLabel: string | null;
      ticket: TicketRow | null;
    }
  | {
      kind: "pending";
      intentId: string | null;
      sessionId: string;
    }
  | {
      kind: "ignored";
      reason: string;
      sessionId: string;
    };

function logRegistrationSuccessInfo(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[course registration success]", message, payload);
}

function logRegistrationSuccessError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const fallback =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[course registration success]", {
    context,
    name:
      supabaseError.name ??
      (error instanceof Error ? error.name : undefined) ??
      (typeof fallback?.name === "string" ? fallback.name : undefined),
    message:
      supabaseError.message ??
      (error instanceof Error ? error.message : undefined) ??
      (typeof fallback?.message === "string" ? fallback.message : undefined),
    code: supabaseError.code ?? (typeof fallback?.code === "string" ? fallback.code : undefined),
    details:
      supabaseError.details ?? (typeof fallback?.details === "string" ? fallback.details : undefined),
    hint: supabaseError.hint ?? (typeof fallback?.hint === "string" ? fallback.hint : undefined),
    stack:
      supabaseError.stack ??
      (error instanceof Error ? error.stack : undefined) ??
      (typeof fallback?.stack === "string" ? fallback.stack : undefined),
    raw: fallback,
  });
}

async function resolveProviderContact(
  admin: ReturnType<typeof createSupabaseAdmin>,
  course: CourseRow | null
): Promise<ProviderContact> {
  if (!course?.teacher_id) {
    return {
      providerType: null,
      providerName: null,
      providerEmail: null,
      providerContactName: null,
      senderImageUrl: null,
      providerAccountId: null,
    };
  }

  const [{ data: profile }, authResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name,photo_url,stripe_account_id")
      .eq("id", course.teacher_id)
      .maybeSingle<ProfileRow>(),
    admin.auth.admin.getUserById(course.teacher_id),
  ]);

  return {
    providerType: profile?.provider_type ?? null,
    providerName:
      profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null,
    providerEmail: authResult.data.user?.email?.trim() || null,
    providerContactName:
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null,
    senderImageUrl: profile?.photo_url ?? null,
    providerAccountId: profile?.stripe_account_id ?? null,
  };
}

export async function markCourseRegistrationCheckoutFailed(input: {
  sessionId: string;
  expectedIntentId?: string;
}) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  const intentId = session.metadata?.registrationIntentId ?? null;

  if (!intentId || (input.expectedIntentId && intentId !== input.expectedIntentId)) {
    return false;
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("course_registration_intents")
    .update({
      status: "checkout_payment_failed",
      stripe_checkout_session_id: session.id,
    })
    .eq("id", intentId)
    .neq("status", "checkout_completed");

  if (error) {
    logRegistrationSuccessError("mark-checkout-failed", error);
  }

  return !error;
}

export async function finalizeCourseRegistrationCheckoutSession(input: {
  sessionId: string;
  expectedIntentId?: string;
}): Promise<CourseRegistrationFinalizeResult> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ["subscription", "payment_intent"],
  });
  const intentId = session.metadata?.registrationIntentId ?? null;

  if (session.mode !== "subscription" || !intentId) {
    return {
      kind: "ignored",
      reason: "not-course-registration-session",
      sessionId: session.id,
    };
  }

  if (input.expectedIntentId && intentId !== input.expectedIntentId) {
    return {
      kind: "ignored",
      reason: "intent-id-mismatch",
      sessionId: session.id,
    };
  }

  if (session.payment_status !== "paid") {
    return {
      kind: "pending",
      intentId,
      sessionId: session.id,
    };
  }

  const admin = createSupabaseAdmin();
  const completedAt = new Date().toISOString();
  const completionPayload = {
    status: "checkout_completed" as const,
    completed_at: completedAt,
    stripe_checkout_session_id: session.id,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
    stripe_subscription_id:
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null,
  };

  logRegistrationSuccessInfo("checkout completion recognized", {
    intentId,
    sessionId: session.id,
  });

  const { data: updatedIntent, error: finalizeError } = await admin
    .from("course_registration_intents")
    .update(completionPayload)
    .eq("id", intentId)
    .neq("status", "checkout_completed")
    .select(
      "id,trial_reservation_id,course_id,first_name,last_name,email,phone,status,completed_at,registration_confirmation_email_sent_at,provider_notification_email_sent_at"
    )
    .maybeSingle<CourseRegistrationIntentRow>();

  if (finalizeError) {
    logRegistrationSuccessError("finalize-checkout", finalizeError);
  }

  const { data: storedIntent, error: storedIntentError } = await admin
    .from("course_registration_intents")
    .select(
      "id,trial_reservation_id,course_id,first_name,last_name,email,phone,status,completed_at,registration_confirmation_email_sent_at,provider_notification_email_sent_at"
    )
    .eq("id", intentId)
    .maybeSingle<CourseRegistrationIntentRow>();

  if (storedIntentError) {
    logRegistrationSuccessError("load-stored-intent", storedIntentError);
  }

  const finalizedIntent = updatedIntent ?? storedIntent;
  if (finalizedIntent?.status !== "checkout_completed") {
    return {
      kind: "pending",
      intentId,
      sessionId: session.id,
    };
  }

  const [{ data: reservation }, { data: course }] = await Promise.all([
    admin
      .from("trial_reservations")
      .select("id,first_name,last_name,email,converted_at,converted_registration_intent_id")
      .eq("id", finalizedIntent.trial_reservation_id)
      .maybeSingle<TrialReservationRow>(),
    admin
      .from("courses")
      .select("id,title,teacher_id,instructor_name,price_cents,currency,starts_at,duration_minutes,location,location_details")
      .eq("id", finalizedIntent.course_id)
      .maybeSingle<CourseRow>(),
  ]);

  const providerContact = await resolveProviderContact(admin, course ?? null);
  const courseTitle = course?.title ?? "Kurs";
  const priceLabel = formatRecurringCoursePrice(course?.price_cents ?? null, course?.currency ?? null);
  const recipientEmail = finalizedIntent.email?.trim() || reservation?.email?.trim() || null;
  const customerName =
    [finalizedIntent.first_name, finalizedIntent.last_name].filter(Boolean).join(" ").trim() ||
    [reservation?.first_name, reservation?.last_name].filter(Boolean).join(" ").trim() ||
    "dein Kind";
  const providerName = providerContact.providerName;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const isPlatformCharge = session.metadata?.payment_model === "platform_charge";

  let paymentTransactionId: string | null = null;

  try {
    paymentTransactionId = await mirrorStripePaymentToLedger({
      courseRegistrationIntentId: finalizedIntent.id,
      teacherId: course?.teacher_id ?? null,
      providerType: providerContact.providerType,
      providerAccountId: isPlatformCharge ? null : providerContact.providerAccountId,
      accountHolderName: providerContact.providerName ?? providerContact.providerContactName,
      session,
      paidAt: finalizedIntent.completed_at ?? completedAt,
      fallbackAmountCents: course?.price_cents ?? null,
      fallbackCurrency: course?.currency ?? null,
      payoutStatus: isPlatformCharge ? "reserved" : "pending",
    });
  } catch (error) {
    logRegistrationSuccessError("mirror-payment-v2", error);
  }

  if (isPaymentsV2SubscriptionsDualWriteEnabled()) {
    try {
      await materializeSuccessfulInitialSubscriptionPayment({
        courseRegistrationIntentId: finalizedIntent.id,
        stripeSession: session,
        paidAt: finalizedIntent.completed_at ?? completedAt,
        paymentTransactionId,
      });
    } catch (error) {
      logRegistrationSuccessError("materialize-initial-subscription-payment", error);
    }
  }

  let ticketForDisplay: TicketRow | null = null;

  if (subscriptionId && recipientEmail) {
    try {
      const ticketResult = await issueCourseParticipantTicketForSubscription({
        subscriptionId,
        courseId: finalizedIntent.course_id,
        customerName,
        customerEmail: recipientEmail,
      });

      ticketForDisplay = ticketResult.ticket;

      logRegistrationSuccessInfo(
        ticketResult.created ? "course participant ticket created" : "course participant ticket reused",
        {
          intentId: finalizedIntent.id,
          subscriptionId,
          ticketId: ticketResult.ticket.id,
          recipient: recipientEmail,
        }
      );
    } catch (error) {
      logRegistrationSuccessError("issue-course-participant-ticket", error);
    }
  } else {
    logRegistrationSuccessInfo("course participant ticket skipped", {
      intentId: finalizedIntent.id,
      subscriptionId,
      recipient: recipientEmail,
      reason: subscriptionId ? "missing-recipient" : "missing-subscription-id",
    });
  }

  if (recipientEmail && !finalizedIntent.registration_confirmation_email_sent_at) {
    try {
      const result = await sendCourseSubscriptionConfirmationEmail({
        registrationIntentId: finalizedIntent.id,
        courseTitle,
        providerType: providerContact.providerType,
        providerName,
        instructorName: course?.instructor_name ?? null,
        senderDisplayName:
          providerContact.providerType === "studio_provider"
            ? providerName
            : course?.instructor_name ?? providerContact.providerContactName,
        senderImageUrl: providerContact.senderImageUrl,
        customerName,
        customerEmail: recipientEmail,
        priceLabel,
        currency: course?.currency ?? "EUR",
        cancellationLabel: "Monatlich zum Ende des Abrechnungszeitraums moeglich.",
        startsAt: course?.starts_at ?? null,
        endsAt:
          course?.starts_at && course?.duration_minutes
            ? new Date(
                new Date(course.starts_at).getTime() + course.duration_minutes * 60 * 1000
              ).toISOString()
            : null,
        location: course?.location ?? null,
        locationDetails: course?.location_details ?? null,
        qrToken: ticketForDisplay?.qr_token ?? null,
      });

      if (result?.error) {
        throw result.error;
      }

      const sentAt = new Date().toISOString();
      const { error: emailTimestampError } = await admin
        .from("course_registration_intents")
        .update({ registration_confirmation_email_sent_at: sentAt })
        .eq("id", finalizedIntent.id)
        .is("registration_confirmation_email_sent_at", null);

      if (emailTimestampError) {
        logRegistrationSuccessError("update-confirmation-email-timestamp", emailTimestampError);
      }
    } catch (error) {
      logRegistrationSuccessError("send-confirmation-email", error);
    }
  }

  const providerEmail = providerContact.providerEmail;
  if (providerEmail && !finalizedIntent.provider_notification_email_sent_at) {
    const claimedAt = new Date().toISOString();
    const { data: claimedRows, error: claimError } = await admin
      .from("course_registration_intents")
      .update({ provider_notification_email_sent_at: claimedAt })
      .eq("id", finalizedIntent.id)
      .is("provider_notification_email_sent_at", null)
      .select("id");

    if (claimError) {
      logRegistrationSuccessError("claim-provider-notification-email", claimError);
    } else if (claimedRows && claimedRows.length > 0) {
      try {
        const result = await sendCourseSubscriptionProviderNotificationEmail({
          registrationIntentId: finalizedIntent.id,
          teacherEmail: providerEmail,
          participantName: customerName,
          participantEmail: recipientEmail ?? "",
          participantPhone: finalizedIntent.phone?.trim() || null,
          courseTitle,
          providerName,
          instructorName: course?.instructor_name ?? providerContact.providerContactName,
          senderDisplayName:
            providerContact.providerType === "studio_provider"
              ? providerName
              : course?.instructor_name ?? providerContact.providerContactName,
          senderImageUrl: providerContact.senderImageUrl,
          priceLabel,
          cancellationLabel: "Monatlich zum Ende des Abrechnungszeitraums moeglich.",
          qrToken: ticketForDisplay?.qr_token ?? null,
        });

        if (result?.error) {
          throw result.error;
        }
      } catch (error) {
        await admin
          .from("course_registration_intents")
          .update({ provider_notification_email_sent_at: null })
          .eq("id", finalizedIntent.id)
          .eq("provider_notification_email_sent_at", claimedAt);

        logRegistrationSuccessError("send-provider-notification-email", error);
      }
    }
  }

  if (
    reservation &&
    (!reservation.converted_at || reservation.converted_registration_intent_id !== finalizedIntent.id)
  ) {
    const conversionTimestamp = finalizedIntent.completed_at ?? completedAt;
    const { error: conversionError } = await admin
      .from("trial_reservations")
      .update({
        converted_at: conversionTimestamp,
        converted_registration_intent_id: finalizedIntent.id,
      })
      .eq("id", reservation.id);

    if (conversionError) {
      logRegistrationSuccessError("mark-trial-reservation-converted", conversionError);
    }
  }

  return {
    kind: "completed",
    intentId: finalizedIntent.id,
    sessionId: session.id,
    courseTitle,
    priceLabel,
    ticket: ticketForDisplay,
  };
}
