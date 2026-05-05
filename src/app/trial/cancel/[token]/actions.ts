"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelTrialReservationById } from "@/lib/trial-reservation-cancellation";

type TrialReservationLookupRow = {
  id: string;
  cancelled_at: string | null;
};

export async function confirmTrialCancellationAction(token: string) {
  const admin = createSupabaseAdmin();

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,cancelled_at")
    .eq("cancel_token", token)
    .maybeSingle<TrialReservationLookupRow>();

  if (!reservation) {
    redirect(`/trial/cancel/${token}?invalid=1`);
  }

  if (reservation.cancelled_at) {
    redirect(`/trial/cancel/${token}?already=1`);
  }

  const result = await cancelTrialReservationById({
    reservationId: reservation.id,
    actorLabel: "public_cancel",
  });

  if (!result.ok) {
    redirect(
      result.reason === "already_cancelled"
        ? `/trial/cancel/${token}?already=1`
        : `/trial/cancel/${token}?error=1`
    );
  }

  redirect(`/trial/cancel/${token}?done=1`);
}
