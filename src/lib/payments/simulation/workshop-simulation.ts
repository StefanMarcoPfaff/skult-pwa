import "server-only";

import { calculatePlatformFeeAmount, calculateProviderPayoutAmount } from "@/lib/platform-fees";
import { calculatePayoutAvailableAt } from "@/lib/payments/payout-eligibility";
import {
  assertSimulationNotDuplicate,
  assertSimulationTargetId,
  buildSimulationMetadata,
  createSimulatedPaymentId,
  createSimulatedRefundId,
} from "@/lib/payments/simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";
const INTERNAL_SIMULATION_PAYMENT_METHOD = "internal_simulation";

type BookingSimulationRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  payment_status: string | null;
  payment_provider: string | null;
  payment_session_id: string | null;
  refunded_at: string | null;
  refund_amount_cents: number | null;
};

type WorkshopCourseRow = {
  id: string;
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
};

type WorkshopSessionRow = {
  ends_at: string | null;
};

type ProfileFeeRow = {
  provider_type: "independent_teacher" | "studio_provider" | null;
};

type ProviderPayoutProfileRow = {
  id: string;
};

type PaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  refunded_at: string | null;
  failed_at: string | null;
  paid_at: string | null;
};

type LedgerEntryRow = {
  id: string;
  payout_status: string;
};

type RefundRecordRow = {
  id: string;
  payment_transaction_id: string;
  amount_cents: number;
  reason: string | null;
  status: string;
};

type WorkshopSimulationResult = {
  bookingId: string;
  paymentTransactionId: string | null;
  refundRecordId?: string | null;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeOptionalAmount(amountCents: number | null | undefined, fallbackAmountCents: number): number {
  if (typeof amountCents === "number" && Number.isFinite(amountCents)) {
    return Math.max(0, Math.round(amountCents));
  }

  return Math.max(0, Math.round(fallbackAmountCents));
}

function buildSimulationNote(input: {
  scenario: string;
  scenarioNote?: string | null;
  metadata: ReturnType<typeof buildSimulationMetadata>;
}): string {
  const parts = [
    `scenario=${input.scenario}`,
    `source_admin_ui=${input.metadata.source_admin_ui}`,
    `triggered_by_admin_user_id=${input.metadata.triggered_by_admin_user_id}`,
  ];

  const trimmedScenarioNote = input.scenarioNote?.trim();
  if (trimmedScenarioNote) {
    parts.push(`note=${trimmedScenarioNote}`);
  }

  return parts.join(" | ");
}

async function loadBookingContext(bookingId: string): Promise<{
  booking: BookingSimulationRow;
  course: WorkshopCourseRow | null;
  providerType: "independent_teacher" | "studio_provider" | null;
  providerPayoutProfileId: string | null;
  availableAt: string | null;
}> {
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select("id,course_id,status,payment_status,payment_provider,payment_session_id,refunded_at,refund_amount_cents")
    .eq("id", bookingId)
    .maybeSingle<BookingSimulationRow>();

  if (!booking) {
    throw new Error("Booking not found");
  }

  let course: WorkshopCourseRow | null = null;
  let providerType: "independent_teacher" | "studio_provider" | null = null;
  let providerPayoutProfileId: string | null = null;
  let availableAt: string | null = null;

  if (booking.course_id) {
    const [{ data: loadedCourse }, { data: lastSession }, { data: payoutProfile }] = await Promise.all([
      admin
        .from("courses")
        .select("id,teacher_id,price_cents,currency")
        .eq("id", booking.course_id)
        .maybeSingle<WorkshopCourseRow>(),
      admin
        .from("course_sessions")
        .select("ends_at")
        .eq("course_id", booking.course_id)
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle<WorkshopSessionRow>(),
      (async () => {
        const { data: loadedCourseForProfile } = await admin
          .from("courses")
          .select("teacher_id")
          .eq("id", booking.course_id)
          .maybeSingle<{ teacher_id: string | null }>();

        if (!loadedCourseForProfile?.teacher_id) {
          return { data: null as ProviderPayoutProfileRow | null };
        }

        return admin
          .from("provider_payout_profiles")
          .select("id")
          .eq("teacher_id", loadedCourseForProfile.teacher_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle<ProviderPayoutProfileRow>();
      })(),
    ]);

    course = loadedCourse ?? null;
    providerPayoutProfileId = payoutProfile?.id ?? null;
    availableAt = calculatePayoutAvailableAt({
      eventEndsAt: lastSession?.ends_at ?? null,
    });

    if (course?.teacher_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("provider_type")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileFeeRow>();

      providerType = profile?.provider_type ?? null;
    }
  }

  return {
    booking,
    course,
    providerType,
    providerPayoutProfileId,
    availableAt,
  };
}

async function findInternalSimulatedPaymentByBooking(input: {
  bookingId: string;
  statuses?: string[];
}): Promise<PaymentTransactionRow | null> {
  const admin = createSupabaseAdmin();
  let query = admin
    .from("payment_transactions")
    .select(
      "id,booking_id,provider,provider_payment_id,amount_cents,currency,status,refunded_at,failed_at,paid_at"
    )
    .eq("booking_id", input.bookingId)
    .eq("provider", INTERNAL_SIMULATION_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.statuses && input.statuses.length > 0) {
    query = query.in("status", input.statuses);
  }

  const { data } = await query.maybeSingle<PaymentTransactionRow>();
  return data ?? null;
}

async function findPaymentTransactionForRefund(input: {
  bookingId?: string | null;
  paymentTransactionId?: string | null;
}): Promise<PaymentTransactionRow | null> {
  const admin = createSupabaseAdmin();

  if (input.paymentTransactionId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(
        "id,booking_id,provider,provider_payment_id,amount_cents,currency,status,refunded_at,failed_at,paid_at"
      )
      .eq("id", input.paymentTransactionId)
      .eq("provider", INTERNAL_SIMULATION_PROVIDER)
      .maybeSingle<PaymentTransactionRow>();

    if (data) {
      return data;
    }
  }

  if (input.bookingId) {
    return findInternalSimulatedPaymentByBooking({
      bookingId: input.bookingId,
      statuses: ["paid", "refunded"],
    });
  }

  return null;
}

async function findPositiveLedgerEntryByPaymentTransactionId(paymentTransactionId: string): Promise<LedgerEntryRow | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("ledger_entries")
    .select("id,payout_status")
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransactionId)
    .eq("entry_type", "payment")
    .maybeSingle<LedgerEntryRow>();

  return data ?? null;
}

async function markRefundablePositiveLedgerAsCancelled(paymentTransactionId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin
    .from("ledger_entries")
    .update({
      payout_status: "cancelled",
    })
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransactionId)
    .eq("entry_type", "payment")
    .in("payout_status", ["pending_event_completion", "payable", "pending", "available", "held"]);
}

export async function simulateWorkshopPaymentSuccess(input: {
  bookingId: string;
  adminUserId: string;
  amountCents?: number | null;
  currency?: string | null;
  scenarioNote?: string | null;
}): Promise<WorkshopSimulationResult> {
  const bookingId = assertSimulationTargetId(input.bookingId);
  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: "workshop_payment_success",
    sourceAdminUi: "/dashboard/admin/payments-v2",
  });

  const existingPaid = await findInternalSimulatedPaymentByBooking({
    bookingId,
    statuses: ["paid"],
  });
  assertSimulationNotDuplicate(Boolean(existingPaid));

  const { booking, course, providerType, providerPayoutProfileId, availableAt } = await loadBookingContext(bookingId);
  const amountCents = normalizeOptionalAmount(input.amountCents, course?.price_cents ?? 0);
  const currency = normalizeCurrency(input.currency ?? course?.currency);
  const providerPaymentId = createSimulatedPaymentId();
  const paidAt = new Date().toISOString();
  const payoutStatus = availableAt ? "pending_event_completion" : "payable";
  const platformFeeCents = calculatePlatformFeeAmount(amountCents, providerType);
  const netAmountCents = calculateProviderPayoutAmount(amountCents, providerType);

  const admin = createSupabaseAdmin();
  const { data: insertedPayment } = await admin
    .from("payment_transactions")
    .insert({
      booking_id: booking.id,
      course_registration_intent_id: null,
      provider: INTERNAL_SIMULATION_PROVIDER,
      provider_payment_id: providerPaymentId,
      provider_checkout_id: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      amount_cents: amountCents,
      currency,
      payment_method: `${INTERNAL_SIMULATION_PAYMENT_METHOD}:${buildSimulationNote({
        scenario: "workshop_payment_success",
        scenarioNote: input.scenarioNote,
        metadata: simulationMetadata,
      })}`.slice(0, 255),
      status: "paid",
      paid_at: paidAt,
      failed_at: null,
      refunded_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  const paymentTransactionId = insertedPayment?.id ?? null;
  if (!paymentTransactionId) {
    throw new Error("Failed to create simulated payment transaction");
  }

  await admin.from("ledger_entries").insert({
    provider_payout_profile_id: providerPayoutProfileId,
    source_type: "payment_transaction",
    source_id: paymentTransactionId,
    entry_type: "payment",
    gross_amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    provider_fee_cents: 0,
    net_amount_cents: netAmountCents,
    currency,
    payout_status: payoutStatus,
    available_at: availableAt,
  });

  await admin
    .from("bookings")
    .update({
      status: "paid",
      payment_status: "paid",
      payment_provider: INTERNAL_SIMULATION_PROVIDER,
      payment_session_id: providerPaymentId,
    })
    .eq("id", booking.id);

  return {
    bookingId: booking.id,
    paymentTransactionId,
    simulationMetadata,
  };
}

export async function simulateWorkshopPaymentFailed(input: {
  bookingId: string;
  adminUserId: string;
  amountCents?: number | null;
  currency?: string | null;
  scenarioNote?: string | null;
}): Promise<WorkshopSimulationResult> {
  const bookingId = assertSimulationTargetId(input.bookingId);
  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: "workshop_payment_failed",
    sourceAdminUi: "/dashboard/admin/payments-v2",
  });

  const existingSimulation = await findInternalSimulatedPaymentByBooking({
    bookingId,
    statuses: ["paid", "failed"],
  });
  assertSimulationNotDuplicate(Boolean(existingSimulation));

  const { booking, course } = await loadBookingContext(bookingId);
  const amountCents = normalizeOptionalAmount(input.amountCents, course?.price_cents ?? 0);
  const currency = normalizeCurrency(input.currency ?? course?.currency);
  const providerPaymentId = createSimulatedPaymentId();
  const failedAt = new Date().toISOString();

  const admin = createSupabaseAdmin();
  const { data: insertedPayment } = await admin
    .from("payment_transactions")
    .insert({
      booking_id: booking.id,
      course_registration_intent_id: null,
      provider: INTERNAL_SIMULATION_PROVIDER,
      provider_payment_id: providerPaymentId,
      provider_checkout_id: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      amount_cents: amountCents,
      currency,
      payment_method: `${INTERNAL_SIMULATION_PAYMENT_METHOD}:${buildSimulationNote({
        scenario: "workshop_payment_failed",
        scenarioNote: input.scenarioNote,
        metadata: simulationMetadata,
      })}`.slice(0, 255),
      status: "failed",
      paid_at: null,
      failed_at: failedAt,
      refunded_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  const paymentTransactionId = insertedPayment?.id ?? null;
  if (!paymentTransactionId) {
    throw new Error("Failed to create simulated failed payment transaction");
  }

  await admin
    .from("bookings")
    .update({
      payment_provider: INTERNAL_SIMULATION_PROVIDER,
      payment_session_id: providerPaymentId,
    })
    .eq("id", booking.id);

  return {
    bookingId: booking.id,
    paymentTransactionId,
    simulationMetadata,
  };
}

export async function simulateWorkshopRefund(input: {
  paymentTransactionId?: string | null;
  bookingId?: string | null;
  adminUserId: string;
  refundAmountCents?: number | null;
  reason?: string | null;
}): Promise<WorkshopSimulationResult> {
  const paymentTransactionId = input.paymentTransactionId?.trim() ?? "";
  const bookingId = input.bookingId?.trim() ?? "";

  if (!paymentTransactionId && !bookingId) {
    assertSimulationTargetId(null);
  }

  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: "workshop_refund",
    sourceAdminUi: "/dashboard/admin/payments-v2",
  });

  const paymentTransaction = await findPaymentTransactionForRefund({
    bookingId: bookingId || null,
    paymentTransactionId: paymentTransactionId || null,
  });

  if (!paymentTransaction?.id || !paymentTransaction.booking_id) {
    throw new Error("Refund target payment transaction not found");
  }

  if (paymentTransaction.status !== "paid" && paymentTransaction.status !== "refunded") {
    throw new Error("Refund requires a paid simulated payment transaction");
  }

  const refundAmountCents = normalizeOptionalAmount(input.refundAmountCents, paymentTransaction.amount_cents);
  const normalizedReason = buildSimulationNote({
    scenario: "workshop_refund",
    scenarioNote: input.reason,
    metadata: simulationMetadata,
  }).slice(0, 255);

  const admin = createSupabaseAdmin();
  const { data: duplicateRefund } = await admin
    .from("refund_records")
    .select("id,payment_transaction_id,amount_cents,reason,status")
    .eq("payment_transaction_id", paymentTransaction.id)
    .eq("amount_cents", refundAmountCents)
    .eq("status", "succeeded")
    .eq("reason", normalizedReason)
    .maybeSingle<RefundRecordRow>();

  assertSimulationNotDuplicate(Boolean(duplicateRefund));

  const refundedAt = new Date().toISOString();
  await admin
    .from("payment_transactions")
    .update({
      status: "refunded",
      refunded_at: refundedAt,
    })
    .eq("id", paymentTransaction.id);

  const { data: insertedRefund } = await admin
    .from("refund_records")
    .insert({
      payment_transaction_id: paymentTransaction.id,
      provider_refund_id: createSimulatedRefundId(),
      amount_cents: refundAmountCents,
      reason: normalizedReason,
      status: "succeeded",
    })
    .select("id")
    .single<{ id: string }>();

  const refundRecordId = insertedRefund?.id ?? null;
  if (!refundRecordId) {
    throw new Error("Failed to create simulated refund record");
  }

  const positiveLedgerEntry = await findPositiveLedgerEntryByPaymentTransactionId(paymentTransaction.id);
  if (
    positiveLedgerEntry?.payout_status &&
    ["pending_event_completion", "payable", "pending", "available", "held"].includes(positiveLedgerEntry.payout_status)
  ) {
    await markRefundablePositiveLedgerAsCancelled(paymentTransaction.id);
  }

  await admin.from("ledger_entries").insert({
    source_type: "refund_record",
    source_id: refundRecordId,
    entry_type: "refund",
    gross_amount_cents: refundAmountCents,
    platform_fee_cents: 0,
    provider_fee_cents: 0,
    net_amount_cents: 0,
    currency: paymentTransaction.currency,
    payout_status: "cancelled",
    available_at: null,
  });

  await admin
    .from("bookings")
    .update({
      status: "refunded",
      payment_status: "refunded",
      payment_provider: INTERNAL_SIMULATION_PROVIDER,
      refunded_at: refundedAt,
      refund_amount_cents: refundAmountCents,
    })
    .eq("id", paymentTransaction.booking_id);

  return {
    bookingId: paymentTransaction.booking_id,
    paymentTransactionId: paymentTransaction.id,
    refundRecordId,
    simulationMetadata,
  };
}

export async function simulateWorkshopCancellation(input: {
  bookingId: string;
  adminUserId: string;
  refundAmountCents?: number | null;
  reason?: string | null;
}): Promise<WorkshopSimulationResult> {
  const bookingId = assertSimulationTargetId(input.bookingId);
  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: "workshop_cancellation",
    sourceAdminUi: "/dashboard/admin/payments-v2",
  });

  const paidSimulation = await findInternalSimulatedPaymentByBooking({
    bookingId,
    statuses: ["paid", "refunded"],
  });

  if (paidSimulation?.id) {
    const refundResult = await simulateWorkshopRefund({
      paymentTransactionId: paidSimulation.id,
      adminUserId: input.adminUserId,
      refundAmountCents: input.refundAmountCents,
      reason: input.reason ?? "Workshop cancellation",
    });

    return {
      ...refundResult,
      simulationMetadata,
    };
  }

  const existingCancelledSimulation = await findInternalSimulatedPaymentByBooking({
    bookingId,
    statuses: ["cancelled"],
  });
  assertSimulationNotDuplicate(Boolean(existingCancelledSimulation));

  const { booking, course } = await loadBookingContext(bookingId);
  const providerPaymentId = createSimulatedPaymentId();
  const amountCents = normalizeOptionalAmount(input.refundAmountCents, course?.price_cents ?? 0);
  const currency = normalizeCurrency(course?.currency);

  const admin = createSupabaseAdmin();
  const { data: insertedPayment } = await admin
    .from("payment_transactions")
    .insert({
      booking_id: booking.id,
      course_registration_intent_id: null,
      provider: INTERNAL_SIMULATION_PROVIDER,
      provider_payment_id: providerPaymentId,
      provider_checkout_id: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      amount_cents: amountCents,
      currency,
      payment_method: `${INTERNAL_SIMULATION_PAYMENT_METHOD}:${buildSimulationNote({
        scenario: "workshop_cancellation",
        scenarioNote: input.reason,
        metadata: simulationMetadata,
      })}`.slice(0, 255),
      status: "cancelled",
      paid_at: null,
      failed_at: null,
      refunded_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  const paymentTransactionId = insertedPayment?.id ?? null;
  if (!paymentTransactionId) {
    throw new Error("Failed to create simulated cancellation transaction");
  }

  await admin
    .from("bookings")
    .update({
      status: "cancelled",
      payment_status: "cancelled",
      payment_provider: INTERNAL_SIMULATION_PROVIDER,
      payment_session_id: providerPaymentId,
    })
    .eq("id", booking.id);

  return {
    bookingId: booking.id,
    paymentTransactionId,
    simulationMetadata,
  };
}
