import "server-only";

import type Stripe from "stripe";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const TRANSFER_IDEMPOTENCY_VERSION = "v1";
const MAX_TRANSFER_BATCH_SIZE = 25;

type PayableLedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
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
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
};

type PaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  course_registration_intent_id: string | null;
  provider: string | null;
  status: string;
  refunded_at: string | null;
  failed_at: string | null;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
};

type ProviderPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  provider_account_id: string | null;
  stripe_account_type: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
};

type CourseRow = {
  id: string;
  kind: string | null;
};

type TransferCandidateRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_id: string;
};

export type ProviderTransferSkipReason =
  | "not_claimed"
  | "missing_provider_payout_profile"
  | "missing_payment_transaction"
  | "payment_not_paid"
  | "payment_has_refund_or_failure_state"
  | "not_one_time_offer"
  | "not_custom_v2_profile"
  | "missing_provider_account_id"
  | "missing_stripe_charge_id"
  | "invalid_amount"
  | "would_transfer_full_gross_amount"
  | "stripe_error"
  | "finalize_failed";

export type ProviderTransferResult = {
  ledgerEntryId: string;
  paymentTransactionId: string | null;
  providerPayoutProfileId: string | null;
  providerId: string | null;
  bookingId: string | null;
  courseId: string | null;
  amountCents: number;
  currency: string;
  status: "created" | "skipped";
  stripeTransferId: string | null;
  idempotencyKey: string;
  skipReason: ProviderTransferSkipReason | null;
  message: string | null;
};

export type ProcessProviderTransfersResult = {
  consideredCount: number;
  createdCount: number;
  skippedCount: number;
  results: ProviderTransferResult[];
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function getStripeObjectId(
  value:
    | string
    | Stripe.BalanceTransaction
    | Stripe.Charge
    | Stripe.Transfer
    | null
    | undefined
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function buildIdempotencyKey(ledgerEntryId: string): string {
  // One transfer attempt belongs to one ledger entry. Keeping the key ledger-scoped
  // makes cron retries safe, because Stripe will not create a second transfer for
  // the same ledger entry if the HTTP request is retried after a timeout.
  //
  // Stripe also caches failed idempotent responses. If a connected-account setup
  // problem such as inactive transfers is fixed after a failed request, reusing
  // this same key can replay the cached Stripe error. Do not rotate this key
  // casually: if the original Stripe request succeeded but local finalization
  // failed, changing the key could create a duplicate money movement.
  return `reser-transfer-ledger-entry-${ledgerEntryId}-${TRANSFER_IDEMPOTENCY_VERSION}`;
}

function buildSkippedResult(input: {
  ledgerEntry: Pick<PayableLedgerEntryRow, "id" | "provider_payout_profile_id" | "net_amount_cents" | "currency">;
  paymentTransactionId?: string | null;
  providerId?: string | null;
  bookingId?: string | null;
  courseId?: string | null;
  skipReason: ProviderTransferSkipReason;
  message: string;
}): ProviderTransferResult {
  return {
    ledgerEntryId: input.ledgerEntry.id,
    paymentTransactionId: input.paymentTransactionId ?? null,
    providerPayoutProfileId: input.ledgerEntry.provider_payout_profile_id,
    providerId: input.providerId ?? null,
    bookingId: input.bookingId ?? null,
    courseId: input.courseId ?? null,
    amountCents: Math.max(0, input.ledgerEntry.net_amount_cents),
    currency: normalizeCurrency(input.ledgerEntry.currency),
    status: "skipped",
    stripeTransferId: null,
    idempotencyKey: buildIdempotencyKey(input.ledgerEntry.id),
    skipReason: input.skipReason,
    message: input.message,
  };
}

async function loadPaymentTransaction(paymentTransactionId: string): Promise<PaymentTransactionRow | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("payment_transactions")
    .select(
      "id,booking_id,course_registration_intent_id,provider,status,refunded_at,failed_at,stripe_charge_id,stripe_payment_intent_id,stripe_transfer_id"
    )
    .eq("id", paymentTransactionId)
    .maybeSingle<PaymentTransactionRow>();

  return data ?? null;
}

async function loadProviderPayoutProfile(providerPayoutProfileId: string): Promise<ProviderPayoutProfileRow | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("provider_payout_profiles")
    .select("id,teacher_id,provider,provider_account_id,stripe_account_type")
    .eq("id", providerPayoutProfileId)
    .maybeSingle<ProviderPayoutProfileRow>();

  return data ?? null;
}

async function loadBookingCourseContext(bookingId: string | null): Promise<{
  bookingId: string | null;
  courseId: string | null;
  courseKind: string | null;
}> {
  if (!bookingId) {
    return {
      bookingId: null,
      courseId: null,
      courseKind: null,
    };
  }

  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select("id,course_id")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();
  const courseId = booking?.course_id ?? null;

  if (!courseId) {
    return {
      bookingId,
      courseId: null,
      courseKind: null,
    };
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,kind")
    .eq("id", courseId)
    .maybeSingle<CourseRow>();

  return {
    bookingId,
    courseId,
    courseKind: course?.kind ?? null,
  };
}

async function claimLedgerEntry(ledgerEntryId: string): Promise<PayableLedgerEntryRow | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("ledger_entries")
    .update({
      payout_status: "scheduled",
    })
    .eq("id", ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "payable")
    .is("payout_batch_id", null)
    .is("stripe_transfer_id", null)
    .select(
      [
        "id",
        "provider_payout_profile_id",
        "source_type",
        "source_id",
        "entry_type",
        "gross_amount_cents",
        "platform_fee_cents",
        "provider_fee_cents",
        "net_amount_cents",
        "currency",
        "payout_status",
        "available_at",
        "payout_batch_id",
        "stripe_charge_id",
        "stripe_payment_intent_id",
        "stripe_transfer_id",
      ].join(",")
    )
    .maybeSingle<PayableLedgerEntryRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function releaseClaimAsPayable(ledgerEntryId: string): Promise<void> {
  await createSupabaseAdmin()
    .from("ledger_entries")
    .update({
      payout_status: "payable",
    })
    .eq("id", ledgerEntryId)
    .eq("payout_status", "scheduled")
    .is("stripe_transfer_id", null);
}

async function markTransferCreated(input: {
  ledgerEntry: PayableLedgerEntryRow;
  paymentTransaction: PaymentTransactionRow;
  transfer: Stripe.Transfer;
}): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const stripeTransferId = input.transfer.id;
  const stripeBalanceTransactionId = getStripeObjectId(input.transfer.balance_transaction);

  const { data: ledgerRows, error: ledgerError } = await admin
    .from("ledger_entries")
    .update({
      stripe_transfer_id: stripeTransferId,
      stripe_balance_transaction_id: stripeBalanceTransactionId ?? undefined,
      payout_status: "transfer_created",
    })
    .eq("id", input.ledgerEntry.id)
    .eq("payout_status", "scheduled")
    .is("payout_batch_id", null)
    .is("stripe_transfer_id", null)
    .select("id")
    .limit(1);

  if (ledgerError || !ledgerRows || ledgerRows.length === 0) {
    return false;
  }

  await admin
    .from("payment_transactions")
    .update({
      stripe_transfer_id: stripeTransferId,
      stripe_balance_transaction_id: stripeBalanceTransactionId ?? undefined,
    })
    .eq("id", input.paymentTransaction.id);

  return true;
}

async function processLedgerEntryTransfer(ledgerEntryId: string): Promise<ProviderTransferResult> {
  const claimedEntry = await claimLedgerEntry(ledgerEntryId);
  const idempotencyKey = buildIdempotencyKey(ledgerEntryId);

  if (!claimedEntry) {
    return {
      ledgerEntryId,
      paymentTransactionId: null,
      providerPayoutProfileId: null,
      providerId: null,
      bookingId: null,
      courseId: null,
      amountCents: 0,
      currency: "EUR",
      status: "skipped",
      stripeTransferId: null,
      idempotencyKey,
      skipReason: "not_claimed",
      message: "Ledger-Eintrag ist nicht payable, bereits geclaimt oder hat bereits einen Transfer.",
    };
  }

  let shouldReleaseClaim = true;

  try {
    if (!claimedEntry.provider_payout_profile_id) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        skipReason: "missing_provider_payout_profile",
        message: "Kein Provider-Payout-Profil am Ledger-Eintrag vorhanden.",
      });
    }

    const [paymentTransaction, providerProfile] = await Promise.all([
      loadPaymentTransaction(claimedEntry.source_id),
      loadProviderPayoutProfile(claimedEntry.provider_payout_profile_id),
    ]);
    const context = await loadBookingCourseContext(paymentTransaction?.booking_id ?? null);

    if (!paymentTransaction?.id) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        providerId: providerProfile?.teacher_id ?? null,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "missing_payment_transaction",
        message: "Zugehoerige payment_transaction wurde nicht gefunden.",
      });
    }

    if (paymentTransaction.status !== "paid") {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile?.teacher_id ?? null,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "payment_not_paid",
        message: `Zahlungsstatus ist ${paymentTransaction.status}, nicht paid.`,
      });
    }

    if (
      ["failed", "refunded", "refunded_partial", "refunded_full", "disputed", "chargeback_lost"].includes(
        paymentTransaction.status
      ) ||
      paymentTransaction.refunded_at ||
      paymentTransaction.failed_at
    ) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile?.teacher_id ?? null,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "payment_has_refund_or_failure_state",
        message: `Zahlungsstatus ${paymentTransaction.status} ist nicht transferierbar.`,
      });
    }

    if (context.courseKind !== "workshop" && context.courseKind !== "exclusive_offer") {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile?.teacher_id ?? null,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "not_one_time_offer",
        message: "Der Eintrag gehoert nicht zu einem einmaligen Angebot.",
      });
    }

    if (
      providerProfile?.provider !== PROVIDER_PAYOUT_PROFILE_PROVIDER ||
      providerProfile.stripe_account_type !== "custom"
    ) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile?.teacher_id ?? null,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "not_custom_v2_profile",
        message: "Provider-Payout-Profil ist kein Custom-v2-Profil.",
      });
    }

    if (!providerProfile.provider_account_id?.trim()) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile.teacher_id,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "missing_provider_account_id",
        message: "Custom-v2-Profil hat keine Stripe provider_account_id.",
      });
    }

    const amountCents = Math.max(0, Math.round(claimedEntry.net_amount_cents));
    if (amountCents <= 0) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile.teacher_id,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "invalid_amount",
        message: "Anbieteranteil ist 0 oder negativ.",
      });
    }

    if (amountCents >= Math.max(0, claimedEntry.gross_amount_cents)) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile.teacher_id,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "would_transfer_full_gross_amount",
        message: "Anbieteranteil entspricht 100% oder mehr des Bruttobetrags.",
      });
    }

    const stripeChargeId = claimedEntry.stripe_charge_id ?? paymentTransaction.stripe_charge_id;
    if (!stripeChargeId) {
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile.teacher_id,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "missing_stripe_charge_id",
        message: "Kein stripe_charge_id fuer source_transaction vorhanden.",
      });
    }

    const stripe = getStripe();
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: normalizeCurrency(claimedEntry.currency).toLowerCase(),
        destination: providerProfile.provider_account_id,
        source_transaction: stripeChargeId,
        description: `RESER provider share for ledger entry ${claimedEntry.id}`,
        metadata: {
          ledger_entry_id: claimedEntry.id,
          payment_transaction_id: paymentTransaction.id,
          source_id: claimedEntry.source_id,
          provider_id: providerProfile.teacher_id ?? "",
          provider_payout_profile_id: providerProfile.id,
          booking_id: context.bookingId ?? "",
          course_id: context.courseId ?? "",
          transfer_type: "provider_share",
          payment_model: "separate_charges_and_transfers",
        },
      },
      {
        idempotencyKey,
      }
    );

    const finalized = await markTransferCreated({
      ledgerEntry: claimedEntry,
      paymentTransaction,
      transfer,
    });

    if (!finalized) {
      shouldReleaseClaim = false;
      return buildSkippedResult({
        ledgerEntry: claimedEntry,
        paymentTransactionId: paymentTransaction.id,
        providerId: providerProfile.teacher_id,
        bookingId: context.bookingId,
        courseId: context.courseId,
        skipReason: "finalize_failed",
        message: `Stripe-Transfer ${transfer.id} wurde erstellt, konnte aber nicht am Ledger finalisiert werden.`,
      });
    }

    shouldReleaseClaim = false;
    return {
      ledgerEntryId: claimedEntry.id,
      paymentTransactionId: paymentTransaction.id,
      providerPayoutProfileId: providerProfile.id,
      providerId: providerProfile.teacher_id,
      bookingId: context.bookingId,
      courseId: context.courseId,
      amountCents,
      currency: normalizeCurrency(claimedEntry.currency),
      status: "created",
      stripeTransferId: transfer.id,
      idempotencyKey,
      skipReason: null,
      message: null,
    };
  } catch (error) {
    // Stripe-side failures, for example inactive/restricted connected accounts,
    // are reported as skipped results. The finally block releases the claim back
    // to payable, but no transfer id is persisted and payout_status is not moved
    // to transfer_created. There is intentionally no new failed payout status here;
    // retries stay operator-visible without changing the existing status model.
    return buildSkippedResult({
      ledgerEntry: claimedEntry,
      paymentTransactionId: claimedEntry.source_id,
      skipReason: "stripe_error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (shouldReleaseClaim) {
      await releaseClaimAsPayable(claimedEntry.id);
    }
  }
}

export async function processPayableOneTimeProviderTransfers(input?: {
  limit?: number;
}): Promise<ProcessProviderTransfersResult> {
  const limit = Math.min(Math.max(1, input?.limit ?? MAX_TRANSFER_BATCH_SIZE), MAX_TRANSFER_BATCH_SIZE);
  const admin = createSupabaseAdmin();
  const { data: candidates, error } = await admin
    .from("ledger_entries")
    .select("id,provider_payout_profile_id,source_id")
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "payable")
    .is("payout_batch_id", null)
    .is("stripe_transfer_id", null)
    .not("provider_payout_profile_id", "is", null)
    .gt("net_amount_cents", 0)
    .order("available_at", { ascending: true, nullsFirst: false })
    .limit(limit * 4)
    .returns<TransferCandidateRow[]>();

  if (error) {
    throw error;
  }

  const candidateRows = candidates ?? [];
  const paymentTransactionIds = Array.from(new Set(candidateRows.map((candidate) => candidate.source_id)));
  const providerPayoutProfileIds = Array.from(
    new Set(candidateRows.map((candidate) => candidate.provider_payout_profile_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: paymentTransactions }, { data: providerProfiles }] = await Promise.all([
    paymentTransactionIds.length > 0
      ? admin
          .from("payment_transactions")
          .select(
            "id,booking_id,course_registration_intent_id,provider,status,refunded_at,failed_at,stripe_charge_id,stripe_payment_intent_id,stripe_transfer_id"
          )
          .in("id", paymentTransactionIds)
          .returns<PaymentTransactionRow[]>()
      : Promise.resolve({ data: [] as PaymentTransactionRow[] }),
    providerPayoutProfileIds.length > 0
      ? admin
          .from("provider_payout_profiles")
          .select("id,teacher_id,provider,provider_account_id,stripe_account_type")
          .in("id", providerPayoutProfileIds)
          .returns<ProviderPayoutProfileRow[]>()
      : Promise.resolve({ data: [] as ProviderPayoutProfileRow[] }),
  ]);

  const paymentTransactionById = new Map((paymentTransactions ?? []).map((row) => [row.id, row] as const));
  const providerProfileById = new Map((providerProfiles ?? []).map((row) => [row.id, row] as const));
  const bookingIds = Array.from(
    new Set(
      (paymentTransactions ?? [])
        .map((transaction) => transaction.booking_id)
        .filter((bookingId): bookingId is string => Boolean(bookingId))
    )
  );
  const { data: bookings } =
    bookingIds.length > 0
      ? await admin.from("bookings").select("id,course_id").in("id", bookingIds).returns<BookingRow[]>()
      : { data: [] as BookingRow[] };
  const bookingById = new Map((bookings ?? []).map((row) => [row.id, row] as const));
  const courseIds = Array.from(
    new Set((bookings ?? []).map((booking) => booking.course_id).filter((courseId): courseId is string => Boolean(courseId)))
  );
  const { data: courses } =
    courseIds.length > 0
      ? await admin.from("courses").select("id,kind").in("id", courseIds).returns<CourseRow[]>()
      : { data: [] as CourseRow[] };
  const courseById = new Map((courses ?? []).map((row) => [row.id, row] as const));

  const eligibleCandidates = candidateRows
    .filter((candidate) => {
      const paymentTransaction = paymentTransactionById.get(candidate.source_id);
      const providerProfile = candidate.provider_payout_profile_id
        ? providerProfileById.get(candidate.provider_payout_profile_id)
        : null;
      const booking = paymentTransaction?.booking_id ? bookingById.get(paymentTransaction.booking_id) : null;
      const course = booking?.course_id ? courseById.get(booking.course_id) : null;

      return (
        paymentTransaction?.provider === "stripe" &&
        paymentTransaction.status === "paid" &&
        !paymentTransaction.refunded_at &&
        !paymentTransaction.failed_at &&
        !paymentTransaction.stripe_transfer_id &&
        Boolean(paymentTransaction.stripe_charge_id) &&
        (course?.kind === "workshop" || course?.kind === "exclusive_offer") &&
        providerProfile?.provider === PROVIDER_PAYOUT_PROFILE_PROVIDER &&
        providerProfile.stripe_account_type === "custom" &&
        Boolean(providerProfile.provider_account_id?.trim())
      );
    })
    .slice(0, limit);

  const results: ProviderTransferResult[] = [];
  for (const candidate of eligibleCandidates) {
    const result = await processLedgerEntryTransfer(candidate.id);
    results.push(result);

    if (result.status === "skipped") {
      console.warn("[provider-transfer-processor] skipped", result);
    }
  }

  return {
    consideredCount: candidateRows.length,
    createdCount: results.filter((result) => result.status === "created").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    results,
  };
}
