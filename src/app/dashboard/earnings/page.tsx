import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EarningsTableClient, { type EarningsTableRow } from "./EarningsTableClient";

type SearchParams = {
  offerType?: string;
  status?: string;
  period?: string;
  offer?: string;
};

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
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
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

type PayoutItemRow = {
  ledger_entry_id: string;
  status: string;
};

type EarningsStatusKey =
  | "vorgemerkt"
  | "auszahlbar"
  | "vorbereitet"
  | "in_auszahlung"
  | "ausgezahlt"
  | "erstattet";

type EarningsRow = {
  id: string;
  offerTitle: string;
  offerTypeKey: "one_time" | "recurring" | "unknown";
  offerTypeLabel: string;
  date: string;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  statusKey: EarningsStatusKey;
  statusLabel: string;
  statusDetail: string | null;
  includeInSummary: boolean;
  statusToneClass: string;
};

const LEDGER_ENTRY_LIMIT = 80;

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

function getOfferTypeMeta(kind: string | null | undefined): {
  key: "one_time" | "recurring" | "unknown";
  label: string;
} {
  if (kind === "course") {
    return {
      key: "recurring",
      label: "Laufendes Angebot",
    };
  }

  if (kind === "workshop" || kind === "exclusive_offer") {
    return {
      key: "one_time",
      label: "Einmaliges Angebot",
    };
  }

  return {
    key: "unknown",
    label: "Angebot",
  };
}

function getDisplayStatus(input: {
  payoutStatus: string;
  paymentStatus: string | null | undefined;
  payoutItemStatus: string | null | undefined;
  availableAt: string | null;
}): Pick<EarningsRow, "statusKey" | "statusLabel" | "statusDetail" | "includeInSummary"> {
  if (input.paymentStatus === "refunded" || input.payoutStatus === "cancelled") {
    return {
      statusKey: "erstattet",
      statusLabel: "Erstattet/Storniert",
      statusDetail: "Dieser Betrag wurde storniert oder erstattet.",
      includeInSummary: false,
    };
  }

  if (input.payoutItemStatus === "paid" || input.payoutStatus === "paid") {
    return {
      statusKey: "ausgezahlt",
      statusLabel: "Ausgezahlt",
      statusDetail: "Dieser Betrag wurde bereits ausgezahlt.",
      includeInSummary: true,
    };
  }

  if (input.payoutItemStatus === "simulated_pending") {
    return {
      statusKey: "in_auszahlung",
      statusLabel: "In Auszahlung",
      statusDetail: "Dieser Betrag befindet sich aktuell im Auszahlungslauf.",
      includeInSummary: true,
    };
  }

  if (input.payoutStatus === "batched") {
    return {
      statusKey: "vorbereitet",
      statusLabel: "Zur Auszahlung vorbereitet",
      statusDetail: "Dieser Betrag ist fuer den naechsten Auszahlungslauf vorbereitet.",
      includeInSummary: true,
    };
  }

  if (input.payoutStatus === "payable" || input.payoutStatus === "available") {
    return {
      statusKey: "auszahlbar",
      statusLabel: "Auszahlbar",
      statusDetail: "Dieser Betrag kann fuer eine Auszahlung beruecksichtigt werden.",
      includeInSummary: true,
    };
  }

  if (input.payoutStatus === "pending_event_completion") {
    return {
      statusKey: "vorgemerkt",
      statusLabel: "Vorgemerkt - Auszahlung nach Durchfuehrung",
      statusDetail: input.availableAt
        ? `Voraussichtlich auszahlbar ab ${formatDateTime(input.availableAt)}`
        : "Die Auszahlung wird nach Durchfuehrung des Angebots vorgemerkt.",
      includeInSummary: true,
    };
  }

  return {
    statusKey: "vorgemerkt",
    statusLabel: "Vorgemerkt",
    statusDetail: input.availableAt
      ? `Voraussichtlich auszahlbar ab ${formatDateTime(input.availableAt)}`
      : "Dieser Betrag ist vorgemerkt und noch nicht auszahlbar.",
    includeInSummary: true,
  };
}

function toneForStatus(statusKey: EarningsStatusKey): string {
  switch (statusKey) {
    case "ausgezahlt":
    case "auszahlbar":
      return "bg-green-100 text-green-800";
    case "vorbereitet":
    case "in_auszahlung":
      return "bg-sky-100 text-sky-800";
    case "erstattet":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function getMonthBounds(offsetMonths: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function matchesPeriod(dateIso: string, period: string): boolean {
  if (period === "all") return true;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  if (period === "this_month") {
    const { start, end } = getMonthBounds(0);
    return date >= start && date < end;
  }

  if (period === "last_month") {
    const { start, end } = getMonthBounds(-1);
    return date >= start && date < end;
  }

  return true;
}

function matchesStatus(statusKey: EarningsStatusKey, selectedStatus: string): boolean {
  if (selectedStatus === "all") return true;
  if (selectedStatus === "pending") return statusKey === "vorgemerkt";
  if (selectedStatus === "payable") {
    return statusKey === "auszahlbar" || statusKey === "vorbereitet" || statusKey === "in_auszahlung";
  }
  if (selectedStatus === "paid") return statusKey === "ausgezahlt";
  return true;
}

function buildFilterHref(input: {
  offerType: string;
  status: string;
  period: string;
  offer: string;
}) {
  const params = new URLSearchParams();
  if (input.offerType !== "all") params.set("offerType", input.offerType);
  if (input.status !== "all") params.set("status", input.status);
  if (input.period !== "all") params.set("period", input.period);
  if (input.offer.trim()) params.set("offer", input.offer.trim());
  const query = params.toString();
  return query ? `/dashboard/earnings?${query}` : "/dashboard/earnings";
}

function FilterLink(props: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={props.href}
      className={`inline-flex rounded-full border px-4 py-2 text-sm font-medium transition ${
        props.active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {props.label}
    </Link>
  );
}

function SummaryCard(props: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{props.value}</p>
      <p className="mt-2 text-sm text-slate-500">{props.description}</p>
    </article>
  );
}

export default async function DashboardEarningsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const selectedOfferType = sp.offerType === "one_time" || sp.offerType === "recurring" ? sp.offerType : "all";
  const selectedStatus = sp.status === "pending" || sp.status === "payable" || sp.status === "paid" ? sp.status : "all";
  const selectedPeriod = sp.period === "this_month" || sp.period === "last_month" ? sp.period : "all";
  const offerQuery = String(sp.offer ?? "").trim().toLowerCase();

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
          .eq("entry_type", "payment")
          .order("created_at", { ascending: false })
          .limit(LEDGER_ENTRY_LIMIT)
          .returns<LedgerEntryRow[]>()
      : { data: [] as LedgerEntryRow[] };

  const baseRows = ledgerEntries ?? [];
  const paymentTransactionIds = baseRows
    .filter((row) => row.source_type === "payment_transaction")
    .map((row) => row.source_id);

  const { data: paymentTransactions } =
    paymentTransactionIds.length > 0
      ? await admin
          .from("payment_transactions")
          .select("id,booking_id,course_registration_intent_id,status,paid_at,refunded_at")
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

  const [bookingsResult, intentsResult, payoutItemsResult] = await Promise.all([
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
    baseRows.length > 0
      ? admin
          .from("payout_items")
          .select("ledger_entry_id,status")
          .in("ledger_entry_id", baseRows.map((row) => row.id))
          .returns<PayoutItemRow[]>()
      : Promise.resolve({ data: [] as PayoutItemRow[] }),
  ]);

  const bookingsById = new Map((bookingsResult.data ?? []).map((row) => [row.id, row] as const));
  const intentsById = new Map((intentsResult.data ?? []).map((row) => [row.id, row] as const));
  const payoutItemByLedgerEntryId = new Map((payoutItemsResult.data ?? []).map((row) => [row.ledger_entry_id, row] as const));
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

  const allRows: EarningsRow[] = baseRows.map((row) => {
    const transaction = row.source_type === "payment_transaction" ? transactionsById.get(row.source_id) : undefined;
    const booking = transaction?.booking_id ? bookingsById.get(transaction.booking_id) : undefined;
    const courseIntent = transaction?.course_registration_intent_id
      ? intentsById.get(transaction.course_registration_intent_id)
      : undefined;
    const course =
      (booking?.course_id ? coursesById.get(booking.course_id) : undefined) ??
      (courseIntent?.course_id ? coursesById.get(courseIntent.course_id) : undefined);
    const offerMeta = getOfferTypeMeta(course?.kind);
    const displayStatus = getDisplayStatus({
      payoutStatus: row.payout_status,
      paymentStatus: transaction?.status,
      payoutItemStatus: payoutItemByLedgerEntryId.get(row.id)?.status,
      availableAt: row.available_at,
    });

    return {
      id: row.id,
      offerTitle: course?.title?.trim() || "Angebot",
      offerTypeKey: offerMeta.key,
      offerTypeLabel: offerMeta.label,
      date: transaction?.paid_at ?? row.created_at,
      grossCents: row.gross_amount_cents,
      platformFeeCents: row.platform_fee_cents,
      netCents: row.net_amount_cents,
      statusKey: displayStatus.statusKey,
      statusLabel: displayStatus.statusLabel,
      statusDetail: displayStatus.statusDetail,
      includeInSummary: displayStatus.includeInSummary,
      statusToneClass: toneForStatus(displayStatus.statusKey),
    };
  });

  const filteredRows = allRows.filter((row) => {
    if (selectedOfferType !== "all" && row.offerTypeKey !== selectedOfferType) {
      return false;
    }

    if (!matchesStatus(row.statusKey, selectedStatus)) {
      return false;
    }

    if (!matchesPeriod(row.date, selectedPeriod)) {
      return false;
    }

    if (offerQuery && !row.offerTitle.toLowerCase().includes(offerQuery)) {
      return false;
    }

    return true;
  });

  const summaryRows = filteredRows.filter((row) => row.includeInSummary);
  const tableRows: EarningsTableRow[] = filteredRows.map((row) => ({
    id: row.id,
    offerTitle: row.offerTitle,
    offerTypeLabel: row.offerTypeLabel,
    date: row.date,
    grossCents: row.grossCents,
    platformFeeCents: row.platformFeeCents,
    netCents: row.netCents,
    statusLabel: row.statusLabel,
    statusDetail: row.statusDetail,
    statusToneClass: row.statusToneClass,
  }));
  const totals = summaryRows.reduce(
    (acc, row) => {
      acc.grossCents += row.grossCents;
      acc.platformFeeCents += row.platformFeeCents;
      acc.netCents += row.netCents;

      if (
        row.statusKey === "auszahlbar" ||
        row.statusKey === "vorbereitet" ||
        row.statusKey === "in_auszahlung" ||
        row.statusKey === "ausgezahlt"
      ) {
        acc.readyOrPaidCents += row.netCents;
      }

      if (row.statusKey === "vorgemerkt") {
        acc.pendingCents += row.netCents;
      }

      return acc;
    },
    {
      grossCents: 0,
      platformFeeCents: 0,
      netCents: 0,
      readyOrPaidCents: 0,
      pendingCents: 0,
    }
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Einnahmen & Auszahlungen</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Hier siehst du, was gebucht wurde, was RESER abzieht und welche Betraege fuer dich bereits auszahlbar sind
          oder noch vorgemerkt bleiben.
        </p>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Hinweis: Auszahlungen befinden sich aktuell noch im Testmodus. Es werden keine echten Auszahlungen ausgeloest.
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Gesamteinnahmen brutto"
          value={formatMoney(totals.grossCents, "EUR")}
          description="Alle aktuell beruecksichtigten Buchungen vor Abzuegen."
        />
        <SummaryCard
          title="RESER-Provision"
          value={formatMoney(totals.platformFeeCents, "EUR")}
          description="Dieser Anteil wird von RESER einbehalten."
        />
        <SummaryCard
          title="Netto fuer dich"
          value={formatMoney(totals.netCents, "EUR")}
          description="Das bleibt nach dem RESER-Abzug fuer dich uebrig."
        />
        <SummaryCard
          title="Bereits auszahlbar/ausgezahlt"
          value={formatMoney(totals.readyOrPaidCents, "EUR")}
          description="Bereits auszahlbar, vorbereitet, in Auszahlung oder ausgezahlt."
        />
        <SummaryCard
          title="Noch vorgemerkt"
          value={formatMoney(totals.pendingCents, "EUR")}
          description="Noch nicht auszahlbar, zum Beispiel vor der Durchfuehrung."
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Filter</h2>
            <p className="mt-1 text-sm text-slate-600">
              Du kannst nach Angebotsart, Status, Zeitraum und Angebotstitel filtern.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <FilterLink
                href={buildFilterHref({ offerType: "all", status: selectedStatus, period: selectedPeriod, offer: offerQuery })}
                active={selectedOfferType === "all"}
                label="Alle Angebote"
              />
              <FilterLink
                href={buildFilterHref({
                  offerType: "one_time",
                  status: selectedStatus,
                  period: selectedPeriod,
                  offer: offerQuery,
                })}
                active={selectedOfferType === "one_time"}
                label="Einmalige Angebote"
              />
              <FilterLink
                href={buildFilterHref({
                  offerType: "recurring",
                  status: selectedStatus,
                  period: selectedPeriod,
                  offer: offerQuery,
                })}
                active={selectedOfferType === "recurring"}
                label="Laufende Angebote"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterLink
                href={buildFilterHref({ offerType: selectedOfferType, status: "all", period: selectedPeriod, offer: offerQuery })}
                active={selectedStatus === "all"}
                label="Alle Status"
              />
              <FilterLink
                href={buildFilterHref({
                  offerType: selectedOfferType,
                  status: "pending",
                  period: selectedPeriod,
                  offer: offerQuery,
                })}
                active={selectedStatus === "pending"}
                label="Vorgemerkt"
              />
              <FilterLink
                href={buildFilterHref({
                  offerType: selectedOfferType,
                  status: "payable",
                  period: selectedPeriod,
                  offer: offerQuery,
                })}
                active={selectedStatus === "payable"}
                label="Auszahlbar"
              />
              <FilterLink
                href={buildFilterHref({
                  offerType: selectedOfferType,
                  status: "paid",
                  period: selectedPeriod,
                  offer: offerQuery,
                })}
                active={selectedStatus === "paid"}
                label="Ausgezahlt"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterLink
                href={buildFilterHref({ offerType: selectedOfferType, status: selectedStatus, period: "this_month", offer: offerQuery })}
                active={selectedPeriod === "this_month"}
                label="Dieser Monat"
              />
              <FilterLink
                href={buildFilterHref({ offerType: selectedOfferType, status: selectedStatus, period: "last_month", offer: offerQuery })}
                active={selectedPeriod === "last_month"}
                label="Letzter Monat"
              />
              <FilterLink
                href={buildFilterHref({ offerType: selectedOfferType, status: selectedStatus, period: "all", offer: offerQuery })}
                active={selectedPeriod === "all"}
                label="Alle"
              />
            </div>

            <form action="/dashboard/earnings" className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="offerType" value={selectedOfferType} />
              <input type="hidden" name="status" value={selectedStatus} />
              <input type="hidden" name="period" value={selectedPeriod} />
              <input
                type="search"
                name="offer"
                defaultValue={offerQuery}
                placeholder="Nach Angebotstitel filtern"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
              >
                Filtern
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Uebersicht</h2>
          <p className="mt-1 text-sm text-slate-600">
            Angezeigt werden nur deine eigenen Daten ohne Bankdaten und ohne interne Verwaltungsdaten.
          </p>
        </div>

        <EarningsTableClient rows={tableRows} />
      </section>
    </main>
  );
}
