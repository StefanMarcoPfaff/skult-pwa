import "server-only";

import type Stripe from "stripe";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { shouldMaterializeServicePeriodForCourse } from "@/lib/payments/subscriptions/lifecycle-materialization";

const TRANSFER_IDEMPOTENCY_VERSION = "v1";
const MAX_TRANSFER_GROUPS = 10;
const MAX_CANDIDATE_ROWS = 500;
const TRANSFER_CUTOFF_HOURS = 24;

type StripeMode = "test" | "live" | "unknown";

type SubscriptionChargeTransferStatus =
  | "pending"
  | "payout_scheduled"
  | "transfer_created"
  | "transfer_failed";

type SubscriptionChargeRow = {
  id: string;
  subscription_contract_id: string;
  subscription_period_id: string | null;
  payment_transaction_id: string | null;
  ledger_entry_id: string | null;
  provider_payout_profile_id: string | null;
  payout_batch_id: string | null;
  provider: string;
  provider_charge_id: string | null;
  provider_invoice_id: string | null;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_net_cents: number;
  currency: string;
  status: string;
  charged_at: string | null;
  stripe_invoice_id: string | null;
  stripe_charge_id: string | null;
  transfer_status: SubscriptionChargeTransferStatus;
  stripe_transfer_id: string | null;
};

type SubscriptionPeriodRow = {
  id: string;
  subscription_contract_id: string;
  period_start: string;
  period_end: string;
  service_month: string;
  status: string;
};

type SubscriptionContractRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  status: string;
};

type PaymentTransactionRow = {
  id: string;
  provider: string | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  failed_at: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
};

type ProviderPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  provider_account_id: string | null;
  stripe_account_type: string | null;
};

type CourseRow = {
  id: string;
  kind: string | null;
  ends_at: string | null;
};

type PayoutBatchRow = {
  id: string;
  batch_key: string | null;
  status: string;
  stripe_transfer_id: string | null;
};

type TransferGroup = {
  providerId: string;
  providerPayoutProfile: ProviderPayoutProfileRow;
  serviceMonth: string;
  currency: string;
  charges: EligibleCharge[];
};

type EligibleCharge = {
  charge: SubscriptionChargeRow;
  period: SubscriptionPeriodRow;
  contract: SubscriptionContractRow;
  paymentTransaction: PaymentTransactionRow;
};

export type SubscriptionProviderTransferSkipReason =
  | "missing_period"
  | "period_not_transferable"
  | "missing_contract"
  | "not_running_offer"
  | "missing_payment_transaction"
  | "payment_not_paid"
  | "payment_has_refund_or_failure_state"
  | "missing_custom_profile"
  | "missing_provider_account_id"
  | "missing_stripe_reference"
  | "invalid_amount"
  | "future_or_uncleared_charge"
  | "after_course_end"
  | "already_transferred"
  | "not_claimed"
  | "stripe_error"
  | "finalize_failed";

export type SubscriptionProviderTransferResult = {
  batchKey: string | null;
  payoutBatchId: string | null;
  providerId: string | null;
  providerPayoutProfileId: string | null;
  serviceMonth: string | null;
  chargeIds: string[];
  chargeCount: number;
  grossTotalCents: number;
  platformFeeTotalCents: number;
  providerNetTotalCents: number;
  currency: string;
  status: "created" | "skipped";
  stripeTransferId: string | null;
  idempotencyKey: string | null;
  skipReason: SubscriptionProviderTransferSkipReason | null;
  message: string | null;
};

export type ProcessSubscriptionProviderTransfersResult = {
  consideredCount: number;
  eligibleChargeCount: number;
  createdCount: number;
  skippedCount: number;
  results: SubscriptionProviderTransferResult[];
};

export type SubscriptionProviderTransferJobResult = {
  stripeMode: StripeMode;
  cutoffHours: number;
  transfers: ProcessSubscriptionProviderTransfersResult;
};

function getStripeMode(): StripeMode {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

function assertStripeModeAllowed(): StripeMode {
  const stripeMode = getStripeMode();
  const liveTransfersEnabled = process.env.STRIPE_PROVIDER_TRANSFERS_ALLOW_LIVE === "true";

  if (stripeMode === "live" && !liveTransfersEnabled) {
    throw new Error("Stripe Live-Transfers sind nicht aktiviert. Setze STRIPE_PROVIDER_TRANSFERS_ALLOW_LIVE=true bewusst.");
  }

  return stripeMode;
}

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function getCurrentBerlinServiceMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}

function buildBatchKey(input: { providerId: string; serviceMonth: string; currency: string }): string {
  return `reser-subscription-transfer-${input.providerId}-${input.serviceMonth}-${normalizeCurrency(input.currency).toLowerCase()}-${TRANSFER_IDEMPOTENCY_VERSION}`;
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

function hasStripeReference(charge: SubscriptionChargeRow, paymentTransaction: PaymentTransactionRow): boolean {
  return Boolean(
      charge.stripe_charge_id ||
      charge.provider_charge_id ||
      charge.stripe_invoice_id ||
      charge.provider_invoice_id ||
      paymentTransaction.stripe_charge_id
  );
}

function isChargeCleared(input: { charge: SubscriptionChargeRow; paymentTransaction: PaymentTransactionRow }): boolean {
  const effectivePaidAt = input.charge.charged_at ?? input.paymentTransaction.paid_at;
  if (!effectivePaidAt) return false;
  const paidAt = Date.parse(effectivePaidAt);
  if (!Number.isFinite(paidAt)) return false;
  return paidAt <= Date.now() - TRANSFER_CUTOFF_HOURS * 60 * 60 * 1000;
}

function buildSkippedResult(input: {
  charge?: SubscriptionChargeRow;
  group?: TransferGroup;
  payoutBatchId?: string | null;
  skipReason: SubscriptionProviderTransferSkipReason;
  message: string;
}): SubscriptionProviderTransferResult {
  const charges = input.group?.charges.map((entry) => entry.charge) ?? (input.charge ? [input.charge] : []);
  const providerNetTotalCents = charges.reduce((sum, charge) => sum + Math.max(0, charge.provider_net_cents), 0);
  return {
    batchKey: input.group
      ? buildBatchKey({
          providerId: input.group.providerId,
          serviceMonth: input.group.serviceMonth,
          currency: input.group.currency,
        })
      : null,
    payoutBatchId: input.payoutBatchId ?? null,
    providerId: input.group?.providerId ?? null,
    providerPayoutProfileId: input.group?.providerPayoutProfile.id ?? input.charge?.provider_payout_profile_id ?? null,
    serviceMonth: input.group?.serviceMonth ?? null,
    chargeIds: charges.map((charge) => charge.id),
    chargeCount: charges.length,
    grossTotalCents: charges.reduce((sum, charge) => sum + Math.max(0, charge.gross_amount_cents), 0),
    platformFeeTotalCents: charges.reduce((sum, charge) => sum + Math.max(0, charge.platform_fee_cents), 0),
    providerNetTotalCents,
    currency: normalizeCurrency(input.group?.currency ?? input.charge?.currency),
    status: "skipped",
    stripeTransferId: null,
    idempotencyKey: input.group
      ? buildBatchKey({
          providerId: input.group.providerId,
          serviceMonth: input.group.serviceMonth,
          currency: input.group.currency,
        })
      : null,
    skipReason: input.skipReason,
    message: input.message,
  };
}

async function loadCandidateRows(limit: number): Promise<SubscriptionChargeRow[]> {
  const { data, error } = await createSupabaseAdmin()
    .from("subscription_charges")
    .select(
      [
        "id",
        "subscription_contract_id",
        "subscription_period_id",
        "payment_transaction_id",
        "ledger_entry_id",
        "provider_payout_profile_id",
        "payout_batch_id",
        "provider",
        "provider_charge_id",
        "provider_invoice_id",
        "gross_amount_cents",
        "platform_fee_cents",
        "provider_net_cents",
        "currency",
        "status",
        "charged_at",
        "stripe_invoice_id",
        "stripe_charge_id",
        "transfer_status",
        "stripe_transfer_id",
      ].join(",")
    )
    .eq("status", "paid")
    .in("transfer_status", ["pending", "transfer_failed"])
    .is("stripe_transfer_id", null)
    .gt("gross_amount_cents", 0)
    .gt("provider_net_cents", 0)
    .order("charged_at", { ascending: true, nullsFirst: false })
    .limit(limit)
    .returns<SubscriptionChargeRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function loadRowsByIds<T extends { id: string }>(
  table: string,
  select: string,
  ids: string[]
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await createSupabaseAdmin().from(table).select(select).in("id", ids).returns<T[]>();
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row] as const));
}

async function loadCustomProfilesByProviderId(providerIds: string[]): Promise<Map<string, ProviderPayoutProfileRow>> {
  if (providerIds.length === 0) return new Map();
  const { data, error } = await createSupabaseAdmin()
    .from("provider_payout_profiles")
    .select("id,teacher_id,provider,provider_account_id,stripe_account_type,created_at")
    .in("teacher_id", providerIds)
    .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
    .eq("stripe_account_type", "custom")
    .not("provider_account_id", "is", null)
    .order("created_at", { ascending: false })
    .returns<Array<ProviderPayoutProfileRow & { created_at: string }>>();

  if (error) throw error;

  const byProviderId = new Map<string, ProviderPayoutProfileRow>();
  for (const row of data ?? []) {
    if (!row.teacher_id || byProviderId.has(row.teacher_id)) continue;
    byProviderId.set(row.teacher_id, row);
  }
  return byProviderId;
}

function groupEligibleCharges(charges: EligibleCharge[], profiles: Map<string, ProviderPayoutProfileRow>): TransferGroup[] {
  const groups = new Map<string, TransferGroup>();
  for (const entry of charges) {
    const profile = profiles.get(entry.contract.teacher_id);
    if (!profile?.provider_account_id?.trim()) continue;
    const currency = normalizeCurrency(entry.charge.currency);
    const key = `${entry.contract.teacher_id}:${entry.period.service_month}:${currency}`;
    const group =
      groups.get(key) ??
      ({
        providerId: entry.contract.teacher_id,
        providerPayoutProfile: profile,
        serviceMonth: entry.period.service_month,
        currency,
        charges: [],
      } satisfies TransferGroup);
    group.charges.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((left, right) =>
    `${left.serviceMonth}:${left.providerId}:${left.currency}`.localeCompare(
      `${right.serviceMonth}:${right.providerId}:${right.currency}`
    )
  );
}

async function resolveEligibleGroups(input: { limit: number }): Promise<{
  consideredCount: number;
  eligibleChargeCount: number;
  groups: TransferGroup[];
  skippedResults: SubscriptionProviderTransferResult[];
}> {
  const candidateRows = await loadCandidateRows(input.limit);
  const periodIds = Array.from(
    new Set(candidateRows.map((charge) => charge.subscription_period_id).filter((id): id is string => Boolean(id)))
  );
  const contractIds = Array.from(new Set(candidateRows.map((charge) => charge.subscription_contract_id)));
  const paymentTransactionIds = Array.from(
    new Set(candidateRows.map((charge) => charge.payment_transaction_id).filter((id): id is string => Boolean(id)))
  );

  const [periodById, contractById, paymentById] = await Promise.all([
    loadRowsByIds<SubscriptionPeriodRow>(
      "subscription_periods",
      "id,subscription_contract_id,period_start,period_end,service_month,status",
      periodIds
    ),
    loadRowsByIds<SubscriptionContractRow>("subscription_contracts", "id,course_id,teacher_id,status", contractIds),
    loadRowsByIds<PaymentTransactionRow>(
      "payment_transactions",
      "id,provider,status,paid_at,refunded_at,failed_at,stripe_charge_id,stripe_transfer_id",
      paymentTransactionIds
    ),
  ]);
  const courseIds = Array.from(
    new Set(Array.from(contractById.values()).map((contract) => contract.course_id).filter(Boolean))
  );
  const courseById = await loadRowsByIds<CourseRow>("courses", "id,kind,ends_at", courseIds);
  const profilesByProviderId = await loadCustomProfilesByProviderId(
    Array.from(new Set(Array.from(contractById.values()).map((contract) => contract.teacher_id)))
  );
  const currentServiceMonth = getCurrentBerlinServiceMonth();
  const skippedResults: SubscriptionProviderTransferResult[] = [];
  const eligibleCharges: EligibleCharge[] = [];

  for (const charge of candidateRows) {
    if (charge.stripe_transfer_id || charge.transfer_status === "transfer_created") {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "already_transferred", message: "Charge ist bereits transferiert." }));
      continue;
    }

    if (charge.gross_amount_cents <= 0 || charge.provider_net_cents <= 0 || charge.platform_fee_cents < 0) {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "invalid_amount", message: "Betragsfelder sind nicht transferierbar." }));
      continue;
    }

    const period = charge.subscription_period_id ? periodById.get(charge.subscription_period_id) : null;
    if (!period) {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "missing_period", message: "Subscription-Periode fehlt." }));
      continue;
    }

    if (period.status !== "charged" || period.service_month > currentServiceMonth) {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "period_not_transferable",
          message: `Periodenstatus ${period.status} oder Service-Monat ${period.service_month} ist nicht transferierbar.`,
        })
      );
      continue;
    }

    const contract = contractById.get(charge.subscription_contract_id);
    if (!contract) {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "missing_contract", message: "Subscription-Vertrag fehlt." }));
      continue;
    }

    const course = courseById.get(contract.course_id);
    if (course?.kind !== "course") {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "not_running_offer", message: "Charge gehoert nicht zu einem laufenden Angebot." }));
      continue;
    }

    if (
      !shouldMaterializeServicePeriodForCourse({
        courseEndsAt: course.ends_at,
        periodStart: period.period_start,
      })
    ) {
      skippedResults.push(buildSkippedResult({ charge, skipReason: "after_course_end", message: "Periode liegt nach dem Kurs-Enddatum." }));
      continue;
    }

    const paymentTransaction = charge.payment_transaction_id ? paymentById.get(charge.payment_transaction_id) : null;
    if (!paymentTransaction) {
      skippedResults.push(
        buildSkippedResult({ charge, skipReason: "missing_payment_transaction", message: "Zugehoerige payment_transaction fehlt." })
      );
      continue;
    }

    if (paymentTransaction.provider !== "stripe" || paymentTransaction.status !== "paid") {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "payment_not_paid",
          message: `Zahlungsstatus ist ${paymentTransaction.status}, nicht paid.`,
        })
      );
      continue;
    }

    if (
      ["failed", "refunded", "refunded_partial", "refunded_full", "disputed", "chargeback_lost"].includes(
        paymentTransaction.status
      ) ||
      paymentTransaction.refunded_at ||
      paymentTransaction.failed_at
    ) {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "payment_has_refund_or_failure_state",
          message: `Zahlungsstatus ${paymentTransaction.status} ist nicht transferierbar.`,
        })
      );
      continue;
    }

    if (!isChargeCleared({ charge, paymentTransaction })) {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "future_or_uncleared_charge",
          message: `Charge ist noch nicht ${TRANSFER_CUTOFF_HOURS} Stunden bezahlt.`,
        })
      );
      continue;
    }

    const providerProfile = profilesByProviderId.get(contract.teacher_id);
    if (providerProfile?.provider !== PROVIDER_PAYOUT_PROFILE_PROVIDER || providerProfile.stripe_account_type !== "custom") {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "missing_custom_profile",
          message: "Kein Custom-v2 Provider-Payout-Profil vorhanden.",
        })
      );
      continue;
    }

    if (!providerProfile.provider_account_id?.trim()) {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "missing_provider_account_id",
          message: "Custom-v2 Provider-Payout-Profil hat keine provider_account_id.",
        })
      );
      continue;
    }

    if (!hasStripeReference(charge, paymentTransaction)) {
      skippedResults.push(
        buildSkippedResult({
          charge,
          skipReason: "missing_stripe_reference",
          message: "Keine Stripe Charge-/Invoice-Referenz fuer den Transfernachweis vorhanden.",
        })
      );
      continue;
    }

    eligibleCharges.push({ charge, period, contract, paymentTransaction });
  }

  return {
    consideredCount: candidateRows.length,
    eligibleChargeCount: eligibleCharges.length,
    groups: groupEligibleCharges(eligibleCharges, profilesByProviderId),
    skippedResults,
  };
}

async function findOrCreatePayoutBatch(input: {
  group: TransferGroup;
  batchKey: string;
  grossTotalCents: number;
  platformFeeTotalCents: number;
  providerNetTotalCents: number;
}): Promise<PayoutBatchRow> {
  const admin = createSupabaseAdmin();
  const { data: existing, error: existingError } = await admin
    .from("payout_batches")
    .select("id,batch_key,status,stripe_transfer_id")
    .eq("batch_key", input.batchKey)
    .maybeSingle<PayoutBatchRow>();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await admin
    .from("payout_batches")
    .insert({
      batch_key: input.batchKey,
      transfer_type: "subscription_monthly_provider_transfer",
      provider_payout_profile_id: input.group.providerPayoutProfile.id,
      provider_id: input.group.providerId,
      payout_provider: "stripe",
      payout_method: "stripe",
      total_amount_cents: input.providerNetTotalCents,
      gross_amount_cents: input.grossTotalCents,
      platform_fee_cents: input.platformFeeTotalCents,
      provider_net_amount_cents: input.providerNetTotalCents,
      charge_count: input.group.charges.length,
      currency: input.group.currency,
      status: "scheduled",
      service_month: input.group.serviceMonth,
      metadata: {
        transfer_type: "subscription_monthly_provider_transfer",
        provider_id: input.group.providerId,
        provider_payout_profile_id: input.group.providerPayoutProfile.id,
        service_month: input.group.serviceMonth,
        charge_ids: input.group.charges.map((entry) => entry.charge.id),
      },
    })
    .select("id,batch_key,status,stripe_transfer_id")
    .single<PayoutBatchRow>();

  if (error) throw error;
  return data;
}

async function markBatchProcessing(input: {
  payoutBatchId: string;
  group: TransferGroup;
  grossTotalCents: number;
  platformFeeTotalCents: number;
  providerNetTotalCents: number;
}): Promise<void> {
  const { error } = await createSupabaseAdmin()
    .from("payout_batches")
    .update({
      status: "processing",
      total_amount_cents: input.providerNetTotalCents,
      gross_amount_cents: input.grossTotalCents,
      platform_fee_cents: input.platformFeeTotalCents,
      provider_net_amount_cents: input.providerNetTotalCents,
      charge_count: input.group.charges.length,
      error_message: null,
      metadata: {
        transfer_type: "subscription_monthly_provider_transfer",
        provider_id: input.group.providerId,
        provider_payout_profile_id: input.group.providerPayoutProfile.id,
        service_month: input.group.serviceMonth,
        charge_ids: input.group.charges.map((entry) => entry.charge.id),
      },
    })
    .eq("id", input.payoutBatchId);

  if (error) throw error;
}

async function claimGroupCharges(input: { group: TransferGroup; payoutBatchId: string }): Promise<EligibleCharge[]> {
  const chargeIds = input.group.charges.map((entry) => entry.charge.id);
  const { data, error } = await createSupabaseAdmin()
    .from("subscription_charges")
    .update({
      transfer_status: "payout_scheduled",
      payout_batch_id: input.payoutBatchId,
      provider_payout_profile_id: input.group.providerPayoutProfile.id,
      transfer_attempted_at: new Date().toISOString(),
      transfer_error: null,
    })
    .in("id", chargeIds)
    .in("transfer_status", ["pending", "transfer_failed"])
    .is("stripe_transfer_id", null)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) throw error;

  const claimedIds = new Set((data ?? []).map((row) => row.id));
  return input.group.charges.filter((entry) => claimedIds.has(entry.charge.id));
}

async function finalizeTransfer(input: {
  group: TransferGroup;
  claimedCharges: EligibleCharge[];
  payoutBatchId: string;
  transfer: Stripe.Transfer;
  grossTotalCents: number;
  platformFeeTotalCents: number;
  providerNetTotalCents: number;
}): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const stripeTransferId = input.transfer.id;
  const stripeBalanceTransactionId = getStripeObjectId(input.transfer.balance_transaction);
  const chargeIds = input.claimedCharges.map((entry) => entry.charge.id);
  const paymentTransactionIds = input.claimedCharges.map((entry) => entry.paymentTransaction.id);
  const ledgerEntryIds = input.claimedCharges
    .map((entry) => entry.charge.ledger_entry_id)
    .filter((id): id is string => Boolean(id));
  const nowIso = new Date().toISOString();

  const { data: updatedCharges, error: chargeError } = await admin
    .from("subscription_charges")
    .update({
      transfer_status: "transfer_created",
      stripe_transfer_id: stripeTransferId,
      transferred_at: nowIso,
      transfer_error: null,
    })
    .in("id", chargeIds)
    .eq("transfer_status", "payout_scheduled")
    .eq("payout_batch_id", input.payoutBatchId)
    .is("stripe_transfer_id", null)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (chargeError || (updatedCharges?.length ?? 0) !== chargeIds.length) {
    return false;
  }

  const { error: batchError } = await admin
    .from("payout_batches")
    .update({
      status: "paid",
      stripe_transfer_id: stripeTransferId,
      stripe_balance_transaction_id: stripeBalanceTransactionId ?? undefined,
      executed_at: nowIso,
      failed_at: null,
      error_message: null,
      total_amount_cents: input.providerNetTotalCents,
      gross_amount_cents: input.grossTotalCents,
      platform_fee_cents: input.platformFeeTotalCents,
      provider_net_amount_cents: input.providerNetTotalCents,
      charge_count: input.claimedCharges.length,
    })
    .eq("id", input.payoutBatchId);

  if (batchError) return false;

  await admin
    .from("payment_transactions")
    .update({
      stripe_transfer_id: stripeTransferId,
      stripe_balance_transaction_id: stripeBalanceTransactionId ?? undefined,
    })
    .in("id", paymentTransactionIds);

  if (ledgerEntryIds.length > 0) {
    await admin
      .from("ledger_entries")
      .update({
        payout_status: "transfer_created",
        payout_batch_id: input.payoutBatchId,
        stripe_transfer_id: stripeTransferId,
        stripe_balance_transaction_id: stripeBalanceTransactionId ?? undefined,
      })
      .in("id", ledgerEntryIds)
      .is("stripe_transfer_id", null);
  }

  return true;
}

async function markGroupFailed(input: {
  group: TransferGroup;
  claimedCharges: EligibleCharge[];
  payoutBatchId: string;
  message: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const chargeIds = input.claimedCharges.map((entry) => entry.charge.id);
  const admin = createSupabaseAdmin();
  await admin
    .from("subscription_charges")
    .update({
      transfer_status: "transfer_failed",
      transfer_attempted_at: nowIso,
      transfer_error: input.message,
    })
    .in("id", chargeIds)
    .eq("transfer_status", "payout_scheduled")
    .is("stripe_transfer_id", null);

  await admin
    .from("payout_batches")
    .update({
      status: "failed",
      failed_at: nowIso,
      error_message: input.message,
    })
    .eq("id", input.payoutBatchId)
    .is("stripe_transfer_id", null);
}

async function processGroupTransfer(group: TransferGroup): Promise<SubscriptionProviderTransferResult> {
  const grossTotalCents = group.charges.reduce((sum, entry) => sum + Math.max(0, entry.charge.gross_amount_cents), 0);
  const platformFeeTotalCents = group.charges.reduce((sum, entry) => sum + Math.max(0, entry.charge.platform_fee_cents), 0);
  const providerNetTotalCents = group.charges.reduce((sum, entry) => sum + Math.max(0, entry.charge.provider_net_cents), 0);
  const batchKey = buildBatchKey({ providerId: group.providerId, serviceMonth: group.serviceMonth, currency: group.currency });

  if (providerNetTotalCents <= 0) {
    return buildSkippedResult({ group, skipReason: "invalid_amount", message: "Anbieter-Netto-Summe ist 0 oder negativ." });
  }

  const payoutBatch = await findOrCreatePayoutBatch({
    group,
    batchKey,
    grossTotalCents,
    platformFeeTotalCents,
    providerNetTotalCents,
  });

  if (payoutBatch.stripe_transfer_id) {
    return buildSkippedResult({
      group,
      payoutBatchId: payoutBatch.id,
      skipReason: "already_transferred",
      message: `Batch wurde bereits mit Stripe-Transfer ${payoutBatch.stripe_transfer_id} abgeschlossen.`,
    });
  }

  await markBatchProcessing({
    payoutBatchId: payoutBatch.id,
    group,
    grossTotalCents,
    platformFeeTotalCents,
    providerNetTotalCents,
  });

  const claimedCharges = await claimGroupCharges({ group, payoutBatchId: payoutBatch.id });
  if (claimedCharges.length === 0) {
    return buildSkippedResult({
      group,
      payoutBatchId: payoutBatch.id,
      skipReason: "not_claimed",
      message: "Keine Charge konnte fuer diesen Batch geclaimt werden.",
    });
  }

  const claimedGrossTotalCents = claimedCharges.reduce((sum, entry) => sum + Math.max(0, entry.charge.gross_amount_cents), 0);
  const claimedPlatformFeeTotalCents = claimedCharges.reduce(
    (sum, entry) => sum + Math.max(0, entry.charge.platform_fee_cents),
    0
  );
  const claimedProviderNetTotalCents = claimedCharges.reduce(
    (sum, entry) => sum + Math.max(0, entry.charge.provider_net_cents),
    0
  );

  try {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create(
      {
        amount: claimedProviderNetTotalCents,
        currency: group.currency.toLowerCase(),
        destination: group.providerPayoutProfile.provider_account_id as string,
        description: `RESER subscription transfer ${group.providerId} ${group.serviceMonth}`,
        metadata: {
          transfer_type: "subscription_monthly_provider_transfer",
          provider_id: group.providerId,
          provider_payout_profile_id: group.providerPayoutProfile.id,
          service_month: group.serviceMonth,
          charge_count: String(claimedCharges.length),
          gross_total_cents: String(claimedGrossTotalCents),
          platform_fee_total_cents: String(claimedPlatformFeeTotalCents),
          provider_net_total_cents: String(claimedProviderNetTotalCents),
          payout_batch_id: payoutBatch.id,
        },
      },
      { idempotencyKey: batchKey }
    );

    const finalized = await finalizeTransfer({
      group,
      claimedCharges,
      payoutBatchId: payoutBatch.id,
      transfer,
      grossTotalCents: claimedGrossTotalCents,
      platformFeeTotalCents: claimedPlatformFeeTotalCents,
      providerNetTotalCents: claimedProviderNetTotalCents,
    });

    if (!finalized) {
      return buildSkippedResult({
        group,
        payoutBatchId: payoutBatch.id,
        skipReason: "finalize_failed",
        message: `Stripe-Transfer ${transfer.id} wurde erstellt, konnte aber lokal nicht finalisiert werden.`,
      });
    }

    return {
      batchKey,
      payoutBatchId: payoutBatch.id,
      providerId: group.providerId,
      providerPayoutProfileId: group.providerPayoutProfile.id,
      serviceMonth: group.serviceMonth,
      chargeIds: claimedCharges.map((entry) => entry.charge.id),
      chargeCount: claimedCharges.length,
      grossTotalCents: claimedGrossTotalCents,
      platformFeeTotalCents: claimedPlatformFeeTotalCents,
      providerNetTotalCents: claimedProviderNetTotalCents,
      currency: group.currency,
      status: "created",
      stripeTransferId: transfer.id,
      idempotencyKey: batchKey,
      skipReason: null,
      message: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markGroupFailed({ group, claimedCharges, payoutBatchId: payoutBatch.id, message });
    return buildSkippedResult({
      group,
      payoutBatchId: payoutBatch.id,
      skipReason: "stripe_error",
      message,
    });
  }
}

export async function processPayableSubscriptionProviderTransfers(input?: {
  limit?: number;
}): Promise<ProcessSubscriptionProviderTransfersResult> {
  const limit = Math.min(Math.max(1, input?.limit ?? MAX_TRANSFER_GROUPS), MAX_TRANSFER_GROUPS);
  const { consideredCount, eligibleChargeCount, groups, skippedResults } = await resolveEligibleGroups({
    limit: MAX_CANDIDATE_ROWS,
  });
  const results: SubscriptionProviderTransferResult[] = [...skippedResults];

  for (const group of groups.slice(0, limit)) {
    results.push(await processGroupTransfer(group));
  }

  const createdCount = results.filter((result) => result.status === "created").length;
  return {
    consideredCount,
    eligibleChargeCount,
    createdCount,
    skippedCount: results.length - createdCount,
    results,
  };
}

export async function runSubscriptionProviderTransferJob(input?: {
  limit?: number;
}): Promise<SubscriptionProviderTransferJobResult> {
  const stripeMode = assertStripeModeAllowed();
  const transfers = await processPayableSubscriptionProviderTransfers({ limit: input?.limit });

  console.info("[subscription-provider-transfer-job] completed", {
    stripeMode,
    cutoffHours: TRANSFER_CUTOFF_HOURS,
    transfers: {
      consideredCount: transfers.consideredCount,
      eligibleChargeCount: transfers.eligibleChargeCount,
      createdCount: transfers.createdCount,
      skippedCount: transfers.skippedCount,
    },
  });

  return {
    stripeMode,
    cutoffHours: TRANSFER_CUTOFF_HOURS,
    transfers,
  };
}
