import "server-only";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_ONE_TIME_OFFER_PAYOUT_HOLD_HOURS = 24;

type EligibleLedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_id: string;
  source_type: string;
  gross_amount_cents: number;
  net_amount_cents: number;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
  stripe_transfer_id: string | null;
};

type RelatedPaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  provider: string | null;
  status: string;
  refunded_at: string | null;
  failed_at: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
};

type RelatedBookingRow = {
  id: string;
  course_id: string | null;
};

type RelatedCourseRow = {
  id: string;
  kind: string | null;
};

type RelatedProviderPayoutProfileRow = {
  id: string;
  provider: string | null;
  provider_account_id: string | null;
  stripe_account_type: string | null;
};

type SelectedLedgerEntryContextRow = {
  id: string;
  source_id: string;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
};

export function calculatePayoutAvailableAt(input: {
  eventEndsAt?: string | null;
  holdHours?: number;
}): string | null {
  if (!input.eventEndsAt) {
    return null;
  }

  const eventEnd = new Date(input.eventEndsAt);
  if (Number.isNaN(eventEnd.getTime())) {
    return null;
  }

  const holdHours = input.holdHours ?? DEFAULT_ONE_TIME_OFFER_PAYOUT_HOLD_HOURS;
  return new Date(eventEnd.getTime() + holdHours * 60 * 60 * 1000).toISOString();
}

export async function markEligibleLedgerEntriesAsPayable(input?: {
  scope?: "all" | "one_time_stripe_custom_v2";
}): Promise<{
  checkedCount: number;
  markedCount: number;
  markedLedgerEntryIds: string[];
}> {
  const scope = input?.scope ?? "all";
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: candidateEntries } = await admin
    .from("ledger_entries")
    .select(
      "id,provider_payout_profile_id,source_id,source_type,gross_amount_cents,net_amount_cents,payout_status,available_at,payout_batch_id,stripe_transfer_id"
    )
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "pending_event_completion")
    .is("payout_batch_id", null)
    .not("available_at", "is", null)
    .lte("available_at", nowIso)
    .returns<EligibleLedgerEntryRow[]>();

  const checkedEntries = candidateEntries ?? [];
  const paymentTransactionIds = checkedEntries.map((entry) => entry.source_id);

  if (paymentTransactionIds.length === 0) {
    return {
      checkedCount: 0,
      markedCount: 0,
      markedLedgerEntryIds: [],
    };
  }

  const { data: relatedTransactions } = await admin
    .from("payment_transactions")
    .select("id,booking_id,provider,status,refunded_at,failed_at,stripe_charge_id,stripe_transfer_id")
    .in("id", paymentTransactionIds)
    .returns<RelatedPaymentTransactionRow[]>();

  const transactionsById = new Map((relatedTransactions ?? []).map((row) => [row.id, row] as const));
  const bookingIds = Array.from(
    new Set(
      (relatedTransactions ?? [])
        .map((transaction) => transaction.booking_id)
        .filter((bookingId): bookingId is string => Boolean(bookingId))
    )
  );
  const providerPayoutProfileIds = Array.from(
    new Set(
      checkedEntries
        .map((entry) => entry.provider_payout_profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )
  );
  const [{ data: relatedBookings }, { data: relatedProviderProfiles }] = await Promise.all([
    scope === "one_time_stripe_custom_v2" && bookingIds.length > 0
      ? admin.from("bookings").select("id,course_id").in("id", bookingIds).returns<RelatedBookingRow[]>()
      : Promise.resolve({ data: [] as RelatedBookingRow[] }),
    scope === "one_time_stripe_custom_v2" && providerPayoutProfileIds.length > 0
      ? admin
          .from("provider_payout_profiles")
          .select("id,provider,provider_account_id,stripe_account_type")
          .in("id", providerPayoutProfileIds)
          .returns<RelatedProviderPayoutProfileRow[]>()
      : Promise.resolve({ data: [] as RelatedProviderPayoutProfileRow[] }),
  ]);
  const bookingsById = new Map((relatedBookings ?? []).map((row) => [row.id, row] as const));
  const courseIds = Array.from(
    new Set((relatedBookings ?? []).map((booking) => booking.course_id).filter((courseId): courseId is string => Boolean(courseId)))
  );
  const { data: relatedCourses } =
    scope === "one_time_stripe_custom_v2" && courseIds.length > 0
      ? await admin.from("courses").select("id,kind").in("id", courseIds).returns<RelatedCourseRow[]>()
      : { data: [] as RelatedCourseRow[] };
  const coursesById = new Map((relatedCourses ?? []).map((row) => [row.id, row] as const));
  const providerProfilesById = new Map((relatedProviderProfiles ?? []).map((row) => [row.id, row] as const));

  const eligibleLedgerEntryIds = checkedEntries
    .filter((entry) => {
      const transaction = transactionsById.get(entry.source_id);
      if (!transaction?.booking_id) {
        return false;
      }

      if (
        transaction.status === "refunded" ||
        transaction.status === "failed" ||
        transaction.status === "disputed" ||
        transaction.refunded_at ||
        transaction.failed_at
      ) {
        return false;
      }

      if (scope === "one_time_stripe_custom_v2") {
        const booking = bookingsById.get(transaction.booking_id);
        const course = booking?.course_id ? coursesById.get(booking.course_id) : null;
        const providerProfile = entry.provider_payout_profile_id
          ? providerProfilesById.get(entry.provider_payout_profile_id)
          : null;

        if (
          transaction.provider !== "stripe" ||
          transaction.stripe_transfer_id ||
          !transaction.stripe_charge_id ||
          entry.stripe_transfer_id ||
          entry.net_amount_cents <= 0 ||
          entry.net_amount_cents >= Math.max(0, entry.gross_amount_cents) ||
          (course?.kind !== "workshop" && course?.kind !== "exclusive_offer") ||
          providerProfile?.provider !== PROVIDER_PAYOUT_PROFILE_PROVIDER ||
          providerProfile.stripe_account_type !== "custom" ||
          !providerProfile.provider_account_id?.trim()
        ) {
          return false;
        }
      }

      return true;
    })
    .map((entry) => entry.id);

  if (eligibleLedgerEntryIds.length === 0) {
    return {
      checkedCount: checkedEntries.length,
      markedCount: 0,
      markedLedgerEntryIds: [],
    };
  }

  const { error } = await admin
    .from("ledger_entries")
    .update({
      payout_status: "payable",
    })
    .in("id", eligibleLedgerEntryIds)
    .eq("payout_status", "pending_event_completion")
    .is("payout_batch_id", null)
    .lte("available_at", nowIso);

  if (error) {
    throw error;
  }

  return {
    checkedCount: checkedEntries.length,
    markedCount: eligibleLedgerEntryIds.length,
    markedLedgerEntryIds: eligibleLedgerEntryIds,
  };
}

export async function forceLedgerEntryPayableForTest(ledgerEntryId: string): Promise<boolean> {
  const normalizedLedgerEntryId = ledgerEntryId.trim();
  if (!normalizedLedgerEntryId) {
    return false;
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("ledger_entries")
    .update({
      payout_status: "payable",
      available_at: new Date().toISOString(),
    })
    .eq("id", normalizedLedgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "pending_event_completion")
    .is("payout_batch_id", null)
    .select("id")
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data && data.length > 0);
}

export async function simulateLedgerEntryPayableForSelectedBooking(input: {
  ledgerEntryId: string;
}): Promise<{
  updated: boolean;
  availableAt: string | null;
  payoutStatus: string | null;
}> {
  const ledgerEntryId = input.ledgerEntryId.trim();
  if (!ledgerEntryId) {
    throw new Error("Kein Ledger-Eintrag vorhanden");
  }

  const admin = createSupabaseAdmin();
  const { data: current } = await admin
    .from("ledger_entries")
    .select("id,source_id,payout_status,available_at,payout_batch_id")
    .eq("id", ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .maybeSingle<SelectedLedgerEntryContextRow>();

  if (!current?.id) {
    throw new Error("Kein Ledger-Eintrag vorhanden");
  }

  if (current.payout_batch_id) {
    throw new Error("Bereits in Auszahlung oder ausgezahlt");
  }

  if (current.payout_status === "paid") {
    throw new Error("Bereits ausgezahlt");
  }

  if (current.payout_status === "cancelled" || current.payout_status === "held") {
    throw new Error("Bereits storniert oder gesperrt");
  }

  const { data: paymentTransaction } = await admin
    .from("payment_transactions")
    .select("id,status,refunded_at")
    .eq("id", current.source_id)
    .maybeSingle<{ id: string; status: string | null; refunded_at: string | null }>();

  if (!paymentTransaction?.id) {
    throw new Error("Keine Zahlung vorhanden");
  }

  if (paymentTransaction.status === "refunded" || paymentTransaction.refunded_at) {
    throw new Error("Bereits erstattet");
  }

  if (paymentTransaction.status !== "paid") {
    throw new Error("Keine bezahlte Simulation vorhanden");
  }

  const availableAt = new Date().toISOString();
  const { data, error } = await admin
    .from("ledger_entries")
    .update({
      payout_status: "payable",
      available_at: availableAt,
    })
    .eq("id", ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .in("payout_status", ["pending", "pending_event_completion", "payable"])
    .is("payout_batch_id", null)
    .select("id,payout_status,available_at")
    .limit(1);

  if (error) {
    throw error;
  }

  const updatedRow = data?.[0] ?? null;
  return {
    updated: Boolean(updatedRow),
    availableAt: updatedRow?.available_at ?? availableAt,
    payoutStatus: updatedRow?.payout_status ?? null,
  };
}
