import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProviderPayoutProfileRow = {
  id: string;
};

type LedgerEntryRow = {
  id: string;
  source_type: string;
  source_id: string;
  entry_type: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
  created_at: string;
};

type PaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  course_registration_intent_id: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
};

type CourseRegistrationIntentRow = {
  id: string;
  course_id: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
};

const LEDGER_ENTRY_LIMIT = 40;

function formatMoney(amountCents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format((amountCents ?? 0) / 100);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortenId(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function badgeClasses(tone: "green" | "yellow" | "red" | "gray" | "blue"): string {
  switch (tone) {
    case "green":
      return "bg-green-100 text-green-800";
    case "yellow":
      return "bg-amber-100 text-amber-800";
    case "red":
      return "bg-rose-100 text-rose-800";
    case "blue":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function toneForStatus(status: string | null | undefined): "green" | "yellow" | "red" | "gray" | "blue" {
  switch (status) {
    case "paid":
    case "payable":
    case "available":
    case "verified":
      return "green";
    case "pending":
    case "pending_event_completion":
    case "scheduled":
    case "processing":
      return "yellow";
    case "failed":
    case "cancelled":
    case "refunded":
      return "red";
    case "held":
      return "gray";
    default:
      return "blue";
  }
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeClasses(toneForStatus(value))}`}>
      {value ?? "-"}
    </span>
  );
}

export default async function DashboardEarningsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();
  const { data: payoutProfiles } = await admin
    .from("provider_payout_profiles")
    .select("id")
    .eq("teacher_id", user.id)
    .returns<ProviderPayoutProfileRow[]>();

  const payoutProfileIds = (payoutProfiles ?? []).map((row) => row.id);

  const { data: ledgerEntries } =
    payoutProfileIds.length > 0
      ? await admin
          .from("ledger_entries")
          .select(
            "id,source_type,source_id,entry_type,gross_amount_cents,platform_fee_cents,provider_fee_cents,net_amount_cents,currency,payout_status,available_at,payout_batch_id,created_at"
          )
          .in("provider_payout_profile_id", payoutProfileIds)
          .order("created_at", { ascending: false })
          .limit(LEDGER_ENTRY_LIMIT)
          .returns<LedgerEntryRow[]>()
      : { data: [] as LedgerEntryRow[] };

  const rows = ledgerEntries ?? [];
  const paymentTransactionIds = rows
    .filter((row) => row.source_type === "payment_transaction")
    .map((row) => row.source_id);

  const { data: paymentTransactions } =
    paymentTransactionIds.length > 0
      ? await admin
          .from("payment_transactions")
          .select("id,booking_id,course_registration_intent_id")
          .in("id", paymentTransactionIds)
          .returns<PaymentTransactionRow[]>()
      : { data: [] as PaymentTransactionRow[] };

  const transactionsById = new Map((paymentTransactions ?? []).map((row) => [row.id, row] as const));
  const bookingIds = Array.from(
    new Set((paymentTransactions ?? []).map((row) => row.booking_id).filter((value): value is string => Boolean(value)))
  );
  const intentIds = Array.from(
    new Set(
      (paymentTransactions ?? [])
        .map((row) => row.course_registration_intent_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [bookingsResult, intentsResult] = await Promise.all([
    bookingIds.length > 0
      ? admin.from("bookings").select("id,course_id").in("id", bookingIds).returns<BookingRow[]>()
      : Promise.resolve({ data: [] as BookingRow[] }),
    intentIds.length > 0
      ? admin
          .from("course_registration_intents")
          .select("id,course_id")
          .in("id", intentIds)
          .returns<CourseRegistrationIntentRow[]>()
      : Promise.resolve({ data: [] as CourseRegistrationIntentRow[] }),
  ]);

  const bookingsById = new Map((bookingsResult.data ?? []).map((row) => [row.id, row] as const));
  const intentsById = new Map((intentsResult.data ?? []).map((row) => [row.id, row] as const));
  const courseIds = Array.from(
    new Set(
      [
        ...(bookingsResult.data ?? []).map((row) => row.course_id),
        ...(intentsResult.data ?? []).map((row) => row.course_id),
      ].filter((value): value is string => Boolean(value))
    )
  );

  const { data: courses } =
    courseIds.length > 0
      ? await admin.from("courses").select("id,title,kind").in("id", courseIds).returns<CourseRow[]>()
      : { data: [] as CourseRow[] };

  const coursesById = new Map((courses ?? []).map((row) => [row.id, row] as const));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Einnahmen & Auszahlungen</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Lesende Payment-V2-Uebersicht deiner eigenen Ledger-Eintraege. Auszahlungen sind aktuell im Test- und
          Simulationsmodus.
        </p>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Auszahlungen sind aktuell im Test-/Simulationsmodus. Es werden keine echten Auszahlungen ausgeloest.
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Letzte Payment-V2-Ledger-Eintraege</h2>
          <p className="mt-1 text-sm text-slate-600">
            Angezeigt werden nur deine eigenen Eintraege ohne Bankdaten, Webhook-Daten oder Admin-Details.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Eintrag</th>
                <th className="px-3 py-2">Brutto</th>
                <th className="px-3 py-2">RESER-Provision</th>
                <th className="px-3 py-2">Netto</th>
                <th className="px-3 py-2">Payout</th>
                <th className="px-3 py-2">Referenz</th>
                <th className="px-3 py-2">Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-slate-500">
                    Fuer dein Konto sind aktuell noch keine Payment-V2-Ledger-Eintraege vorhanden.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const transaction =
                    row.source_type === "payment_transaction" ? transactionsById.get(row.source_id) : undefined;
                  const booking = transaction?.booking_id ? bookingsById.get(transaction.booking_id) : undefined;
                  const intent = transaction?.course_registration_intent_id
                    ? intentsById.get(transaction.course_registration_intent_id)
                    : undefined;
                  const course =
                    (booking?.course_id ? coursesById.get(booking.course_id) : undefined) ??
                    (intent?.course_id ? coursesById.get(intent.course_id) : undefined);

                  return (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.entry_type} />
                          <div className="text-xs text-slate-500">{row.source_type}</div>
                          <div className="text-xs text-slate-500">id: {shortenId(row.id)}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {formatMoney(row.gross_amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatMoney(row.platform_fee_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {formatMoney(row.net_amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div className="mb-2">
                          <StatusBadge value={row.payout_status} />
                        </div>
                        <div>available at: {formatDateTime(row.available_at)}</div>
                        <div>batch: {shortenId(row.payout_batch_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>offer: {course?.title?.trim() || "-"}</div>
                        <div>kind: {course?.kind ?? "-"}</div>
                        <div>booking: {shortenId(transaction?.booking_id)}</div>
                        <div>intent: {shortenId(transaction?.course_registration_intent_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
