import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DashboardFilterPanel from "../_components/DashboardFilterPanel";
import DashboardPageHeader from "../_components/DashboardPageHeader";
import { ParticipantOverviewList } from "./ParticipantOverviewList";
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
    </>
  );
}

export default async function DashboardParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const saved = resolveSavedState(sp);

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

      <DashboardFilterPanel>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Filter</h2>
          <p className="text-sm text-slate-600">
            Die fachlichen Filter und die Sortierung werden im nächsten Schritt vereinheitlicht.
          </p>
        </div>
      </DashboardFilterPanel>

      <FlashMessages saved={saved} />

      {items.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">
            Bisher liegen noch keine Teilnehmenden oder Probeteilnahmen vor.
          </p>
        </section>
      ) : (
        <ParticipantOverviewList items={items} />
      )}
    </main>
  );
}
