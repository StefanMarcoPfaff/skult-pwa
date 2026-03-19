import Link from "next/link";
import QRCode from "react-qr-code";
import {
  getCancellationModelLabel,
  getProviderDisplayName,
} from "@/lib/provider-profiles";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";
import {
  issueCourseParticipantTicketForSubscription,
  type TicketRow,
} from "@/lib/tickets";
import { sendCourseSubscriptionConfirmationEmail } from "@/lib/trial-reservation-emails";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type CourseRegistrationIntentRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  completed_at: string | null;
  registration_confirmation_email_sent_at: string | null;
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
  cancellation_model: string | null;
  location: string | null;
  location_details: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

type SupabaseLikeError = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
};

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(priceCents / 100);
}

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

export default async function TrialRegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; intentId?: string }>;
}) {
  const { token } = await params;
  const { session_id, intentId } = await searchParams;
  const admin = createSupabaseAdmin();
  let ticketForDisplay: TicketRow | null = null;
  let courseTitleForDisplay = "Kurs";

  if (session_id && intentId) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    if (
      session.metadata?.registrationIntentId === intentId &&
      (session.status === "complete" || session.payment_status === "paid")
    ) {
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
          "id,trial_reservation_id,course_id,first_name,last_name,email,status,completed_at,registration_confirmation_email_sent_at"
        )
        .maybeSingle<CourseRegistrationIntentRow>();

      if (finalizeError) {
        logRegistrationSuccessError("finalize-checkout", finalizeError);
      }

      const { data: storedIntent, error: storedIntentError } = await admin
        .from("course_registration_intents")
        .select(
          "id,trial_reservation_id,course_id,first_name,last_name,email,status,completed_at,registration_confirmation_email_sent_at"
        )
        .eq("id", intentId)
        .maybeSingle<CourseRegistrationIntentRow>();

      if (storedIntentError) {
        logRegistrationSuccessError("load-stored-intent", storedIntentError);
      }

      const finalizedIntent = updatedIntent ?? storedIntent;

      if (finalizedIntent?.status === "checkout_completed") {
        const [{ data: reservation }, { data: course }] = await Promise.all([
          admin
            .from("trial_reservations")
            .select("id,first_name,last_name,email,converted_at,converted_registration_intent_id")
            .eq("id", finalizedIntent.trial_reservation_id)
            .maybeSingle<TrialReservationRow>(),
          admin
            .from("courses")
            .select(
              "id,title,teacher_id,instructor_name,price_cents,currency,cancellation_model,location,location_details"
            )
            .eq("id", finalizedIntent.course_id)
            .maybeSingle<CourseRow>(),
        ]);

        const { data: profile } =
          course?.teacher_id
            ? await admin
                .from("profiles")
                .select("first_name,last_name,provider_type,organization_name")
                .eq("id", course.teacher_id)
                .maybeSingle<ProfileRow>()
            : { data: null };

        const recipientEmail =
          finalizedIntent.email?.trim() || reservation?.email?.trim() || null;
        const customerName =
          [finalizedIntent.first_name, finalizedIntent.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          [reservation?.first_name, reservation?.last_name].filter(Boolean).join(" ").trim() ||
          "dein Kind";
        const providerName =
          profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        if (subscriptionId && recipientEmail) {
          try {
            const ticketResult = await issueCourseParticipantTicketForSubscription({
              subscriptionId,
              courseId: finalizedIntent.course_id,
              customerName,
              customerEmail: recipientEmail,
            });

            ticketForDisplay = ticketResult.ticket;
            courseTitleForDisplay = course?.title ?? "Kurs";

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
            logRegistrationSuccessInfo("confirmation email attempt", {
              intentId: finalizedIntent.id,
              recipient: recipientEmail,
              sentAtAlreadySet: Boolean(finalizedIntent.registration_confirmation_email_sent_at),
              emailSource: finalizedIntent.email?.trim() ? "registration_intent" : "trial_reservation",
            });

            const result = await sendCourseSubscriptionConfirmationEmail({
              registrationIntentId: finalizedIntent.id,
              courseTitle: course?.title ?? "Kurs",
              providerName,
              instructorName: course?.instructor_name ?? null,
              customerName,
              customerEmail: recipientEmail,
              priceLabel: formatPrice(course?.price_cents ?? null, course?.currency ?? null),
              currency: course?.currency ?? "EUR",
              cancellationLabel: course?.cancellation_model
                ? getCancellationModelLabel(course.cancellation_model)
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

            logRegistrationSuccessInfo("confirmation email sent", {
              intentId: finalizedIntent.id,
              recipient: recipientEmail,
              messageId: result?.data?.id ?? null,
              sentAtAlreadySet: false,
            });
          } catch (error) {
            logRegistrationSuccessInfo("confirmation email failed", {
              intentId: finalizedIntent.id,
              recipient: recipientEmail,
              sentAtAlreadySet: Boolean(finalizedIntent.registration_confirmation_email_sent_at),
            });
            logRegistrationSuccessError("send-confirmation-email", error);
          }
        } else {
          logRegistrationSuccessInfo("confirmation email skipped", {
            intentId: finalizedIntent.id,
            recipient: recipientEmail,
            reason: recipientEmail ? "already-sent" : "missing-recipient",
            sentAtAlreadySet: Boolean(finalizedIntent.registration_confirmation_email_sent_at),
            registrationConfirmationEmailSentAt:
              finalizedIntent.registration_confirmation_email_sent_at,
          });
        }

        if (
          reservation &&
          (!reservation.converted_at ||
            reservation.converted_registration_intent_id !== finalizedIntent.id)
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
          } else {
            logRegistrationSuccessInfo("trial reservation marked converted", {
              reservationId: reservation.id,
              intentId: finalizedIntent.id,
              convertedAt: conversionTimestamp,
            });
          }
        } else {
          logRegistrationSuccessInfo("trial reservation conversion skipped", {
            reservationId: reservation?.id ?? null,
            intentId: finalizedIntent.id,
            reason: reservation ? "already-converted" : "missing-reservation",
          });
        }
      }
    }
  }

  const ticketCheckInUrl = ticketForDisplay?.qr_token
    ? buildTicketCheckInUrl(ticketForDisplay.qr_token)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Deine Anmeldung war erfolgreich.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Alle weiteren Informationen zu deinem Kurs erhaeltst du per E-Mail.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Kursen
          </Link>
          <Link href={`/trial/register/${token}`} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Anmeldedaten ansehen
          </Link>
        </div>
      </section>

      {ticketForDisplay && ticketCheckInUrl ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Dein Kursticket</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Zeige diesen QR-Code kuenftig fuer Anwesenheit und Check-in in {courseTitleForDisplay} vor.
          </p>
          <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
            <QRCode value={ticketCheckInUrl} size={220} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/trial/register/${token}`}
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Ticket in den Anmeldedaten ansehen
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
