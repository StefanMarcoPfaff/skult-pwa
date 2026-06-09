import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import DashboardPageHeader from "../_components/DashboardPageHeader";
import { ParticipantOverviewList, type ParticipantStatusFilter } from "./ParticipantOverviewList";
import { loadParticipantOverviewItems } from "./participant-overview-data";

function resolveSavedState(searchParams: Record<string, string | string[] | undefined>): string | null {
  const savedParam = Array.isArray(searchParams.saved) ? searchParams.saved[0] : searchParams.saved;
  if (savedParam) return savedParam;

  const approvedParam = Array.isArray(searchParams.approved) ? searchParams.approved[0] : searchParams.approved;
  const rejectedParam = Array.isArray(searchParams.rejected) ? searchParams.rejected[0] : searchParams.rejected;
  const attendanceRequiredParam = Array.isArray(searchParams.attendanceRequired)
    ? searchParams.attendanceRequired[0]
    : searchParams.attendanceRequired;
  const cancelledParam = Array.isArray(searchParams.cancelled) ? searchParams.cancelled[0] : searchParams.cancelled;

  if (approvedParam === "1") return "approved";
  if (rejectedParam === "1") return "rejected";
  if (attendanceRequiredParam === "1") return "attendance_required";
  if (cancelledParam === "1") return "cancelled";
  return null;
}

function FlashMessages(props: { saved: string | null }) {
  return (
    <>
      {props.saved === "approved" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Person wurde für die Anmeldung freigegeben.
        </p>
      ) : null}
      {props.saved === "rejected" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Die Person wurde freundlich abgesagt.
        </p>
      ) : null}
      {props.saved === "attendance_required" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Eine Entscheidung ist erst möglich, nachdem das Probetraining eingecheckt wurde.
        </p>
      ) : null}
      {props.saved === "cancelled" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diese Probeteilnahme wurde bereits storniert und kann nicht mehr freigegeben werden.
        </p>
      ) : null}
      {props.saved === "trial_cancelled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Probeteilnahme wurde storniert und die Benachrichtigungen wurden versendet.
        </p>
      ) : null}
      {props.saved === "trial_cancel_invalid" || props.saved === "trial_cancel_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Probeteilnahme konnte nicht storniert werden.
        </p>
      ) : null}
      {props.saved === "participant_pause_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde pausiert bzw. zur Pause vorgemerkt.
        </p>
      ) : null}
      {props.saved === "participant_cancel_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Kündigung wurde gespeichert.
        </p>
      ) : null}
      {props.saved === "participant_archived" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde archiviert.
        </p>
      ) : null}
      {props.saved === "workshop_participant_cancelled_free" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die kostenlose Reservierung wurde storniert. Es wurde keine Rückzahlung ausgelöst.
        </p>
      ) : null}
      {props.saved === "workshop_participant_refunded" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde storniert und die Rückerstattung wurde ausgelöst.
        </p>
      ) : null}
      {props.saved === "workshop_participant_refund_pending" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Die Teilnahme wurde storniert. Die Rückerstattung muss noch geprüft oder nachbearbeitet werden.
        </p>
      ) : null}
      {props.saved === "workshop_participant_already_cancelled" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diese Teilnahme ist bereits storniert.
        </p>
      ) : null}
      {props.saved === "workshop_participant_cancel_invalid" || props.saved === "workshop_participant_cancel_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Teilnahme konnte nicht storniert werden.
        </p>
      ) : null}
    </>
  );
}

function getParticipantStatusFilter(value: string | string[] | undefined): ParticipantStatusFilter {
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === "active" || selected === "trial" || selected === "paused" || selected === "ended") {
    return selected;
  }
  return "all";
}

export default async function DashboardParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const saved = resolveSavedState(sp);
  const statusFilter = getParticipantStatusFilter(sp.status);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const items = await loadParticipantOverviewItems({ teacherId: user.id });

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <DashboardPageHeader
        title="Teilnehmende"
        description="Hier siehst du Probeteilnahmen, verbindliche Anmeldungen, Buchungen und Check-ins für deine Angebote."
      />
      <FlashMessages saved={saved} />

      {items.length === 0 ? (
        <DashboardEmptyState
          title="Keine passenden Teilnehmenden gefunden."
          description="Bisher liegen noch keine Teilnehmenden oder Probeteilnahmen vor."
        />
      ) : (
        <ParticipantOverviewList items={items} statusFilter={statusFilter} />
      )}
    </main>
  );
}
