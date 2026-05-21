import "server-only";

import { getProviderDisplayName } from "@/lib/provider-profiles";
import {
  createSimulationKey,
  createTestBookingSimulationMetadata,
  ensureSimulationEmail,
  type TestBookingSimulationScenario,
} from "@/lib/payments/simulation/test-booking-metadata";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const DIRECT_COURSE_SCENARIO: TestBookingSimulationScenario = "direct_course_test_registration";

type DirectCourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  status: string | null;
  archived_at: string | null;
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

type ExistingIntentRow = {
  id: string;
};

type InsertedIntentRow = {
  id: string;
};

type DirectCourseIntentValidationRow = {
  id: string;
  course_id: string;
  status: string | null;
  is_simulation: boolean | null;
  stripe_subscription_id: string | null;
  subscription_contract_id: string | null;
};

type DirectCourseSimulationErrorCode =
  | "missing_course_id"
  | "missing_first_name"
  | "missing_last_name"
  | "invalid_email"
  | "missing_intent_id"
  | "course_not_found"
  | "course_archived"
  | "course_not_supported"
  | "duplicate_open_simulation"
  | "intent_not_found"
  | "intent_not_simulation"
  | "intent_status_invalid"
  | "intent_has_external_subscription"
  | "intent_insert_failed";

type DirectCourseSimulationStep = "course_lookup" | "intent_insert";

export class DirectCourseSimulationError extends Error {
  code: DirectCourseSimulationErrorCode;
  step: DirectCourseSimulationStep;
  duplicateIntentId: string | null;
  supabaseMessage: string | null;
  supabaseCode: string | null;

  constructor(input: {
    code: DirectCourseSimulationErrorCode;
    step: DirectCourseSimulationStep;
    message: string;
    duplicateIntentId?: string | null;
    supabaseMessage?: string | null;
    supabaseCode?: string | null;
  }) {
    super(input.message);
    this.name = "DirectCourseSimulationError";
    this.code = input.code;
    this.step = input.step;
    this.duplicateIntentId = input.duplicateIntentId ?? null;
    this.supabaseMessage = input.supabaseMessage ?? null;
    this.supabaseCode = input.supabaseCode ?? null;
  }
}

export type CreateDirectCourseTestRegistrationInput = {
  courseId: string;
  firstName: string;
  lastName: string;
  email: string;
  startDate?: string | null;
  amountCents?: number | null;
  adminUserId: string;
};

export type CreateDirectCourseTestRegistrationResult = {
  courseRegistrationIntentId: string;
  courseId: string;
  customerName: string;
  storedSimulationEmail: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function markSimulationName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "[TEST]";
  return trimmed.startsWith("[TEST]") ? trimmed : `[TEST] ${trimmed}`;
}

function normalizeAmountCents(inputAmount: number | null | undefined, fallbackAmount: number | null | undefined): number {
  if (typeof inputAmount === "number" && Number.isFinite(inputAmount)) {
    return Math.max(0, Math.round(inputAmount));
  }

  if (typeof fallbackAmount === "number" && Number.isFinite(fallbackAmount)) {
    return Math.max(0, Math.round(fallbackAmount));
  }

  return 0;
}

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeOptionalStartDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const timestamp = new Date(`${trimmed}T00:00:00`).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return trimmed;
}

async function loadCourse(courseId: string): Promise<DirectCourseRow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("courses")
    .select("id,title,kind,status,archived_at,teacher_id,price_cents,currency")
    .eq("id", courseId)
    .maybeSingle<DirectCourseRow>();

  if (error || !data) {
    throw new DirectCourseSimulationError({
      code: "course_not_found",
      step: "course_lookup",
      message: "Laufendes Angebot fuer die direkte Kurs-Testanmeldung nicht gefunden.",
      supabaseMessage: error?.message ?? null,
      supabaseCode: error?.code ?? null,
    });
  }

  if (data.archived_at) {
    throw new DirectCourseSimulationError({
      code: "course_archived",
      step: "course_lookup",
      message: "Archivierte laufende Angebote koennen nicht fuer direkte Kurs-Testanmeldungen verwendet werden.",
    });
  }

  if (data.kind !== "course") {
    throw new DirectCourseSimulationError({
      code: "course_not_supported",
      step: "course_lookup",
      message: "Direkte Kurs-Testanmeldungen sind nur fuer laufende Angebote verfuegbar.",
    });
  }

  return data;
}

async function loadProviderLabel(teacherId: string | null): Promise<string | null> {
  if (!teacherId) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
    .eq("id", teacherId)
    .maybeSingle<ProfileRow>();

  if (!data?.provider_type) {
    const fallbackName = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
    return fallbackName || null;
  }

  return getProviderDisplayName(data.provider_type, data);
}

async function assertNoOpenSimulationDuplicate(simulationKey: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("course_registration_intents")
    .select("id")
    .eq("is_simulation", true)
    .eq("simulation_key", simulationKey)
    .is("trial_reservation_id", null)
    .neq("status", "checkout_completed")
    .limit(1)
    .maybeSingle<ExistingIntentRow>();

  if (error) {
    throw new DirectCourseSimulationError({
      code: "intent_insert_failed",
      step: "intent_insert",
      message: "Bestehende direkte Kurs-Testanmeldungen konnten nicht geprueft werden.",
      supabaseMessage: error.message ?? null,
      supabaseCode: error.code ?? null,
    });
  }

  if (data?.id) {
    throw new DirectCourseSimulationError({
      code: "duplicate_open_simulation",
      step: "intent_insert",
      message:
        "Fuer dieses laufende Angebot existiert bereits eine offene direkte Kurs-Testanmeldung mit derselben Test-E-Mail.",
      duplicateIntentId: data.id,
    });
  }
}

export async function loadSimulatableDirectCourseIntent(
  courseRegistrationIntentId: string
): Promise<DirectCourseIntentValidationRow> {
  const normalizedId = courseRegistrationIntentId.trim();
  if (!normalizedId) {
    throw new DirectCourseSimulationError({
      code: "missing_intent_id",
      step: "intent_insert",
      message: "Bitte gib eine gueltige course_registration_intent_id an.",
    });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("course_registration_intents")
    .select("id,course_id,status,is_simulation,stripe_subscription_id,subscription_contract_id")
    .eq("id", normalizedId)
    .maybeSingle<DirectCourseIntentValidationRow>();

  if (error || !data) {
    throw new DirectCourseSimulationError({
      code: "intent_not_found",
      step: "intent_insert",
      message: "Der angegebene course_registration_intent wurde nicht gefunden.",
      supabaseMessage: error?.message ?? null,
      supabaseCode: error?.code ?? null,
    });
  }

  if (!data.is_simulation) {
    throw new DirectCourseSimulationError({
      code: "intent_not_simulation",
      step: "intent_insert",
      message: "Nur Simulations-Intents duerfen intern weiterverarbeitet werden.",
    });
  }

  if (data.stripe_subscription_id) {
    throw new DirectCourseSimulationError({
      code: "intent_has_external_subscription",
      step: "intent_insert",
      message: "Dieser Intent hat bereits eine echte externe Subscription-Referenz und ist kein reiner Testfall mehr.",
    });
  }

  if (!["pending_checkout", "checkout_completed"].includes(data.status ?? "")) {
    throw new DirectCourseSimulationError({
      code: "intent_status_invalid",
      step: "intent_insert",
      message: "Dieser Simulations-Intent ist nicht in einem fuer die Erstzahlungs-Simulation zulaessigen Status.",
    });
  }

  return data;
}

export async function createDirectCourseTestRegistration(
  input: CreateDirectCourseTestRegistrationInput
): Promise<CreateDirectCourseTestRegistrationResult> {
  const courseId = input.courseId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rawEmail = input.email.trim().toLowerCase();

  if (!courseId) {
    throw new DirectCourseSimulationError({
      code: "missing_course_id",
      step: "course_lookup",
      message: "Bitte waehle ein laufendes Angebot aus.",
    });
  }

  if (!firstName) {
    throw new DirectCourseSimulationError({
      code: "missing_first_name",
      step: "intent_insert",
      message: "Bitte gib den Vornamen fuer die direkte Kurs-Testanmeldung an.",
    });
  }

  if (!lastName) {
    throw new DirectCourseSimulationError({
      code: "missing_last_name",
      step: "intent_insert",
      message: "Bitte gib den Nachnamen fuer die direkte Kurs-Testanmeldung an.",
    });
  }

  if (!rawEmail || !isValidEmail(rawEmail)) {
    throw new DirectCourseSimulationError({
      code: "invalid_email",
      step: "intent_insert",
      message: "Bitte gib eine gueltige E-Mail-Adresse fuer die direkte Kurs-Testanmeldung an.",
    });
  }

  const storedSimulationEmail = ensureSimulationEmail(rawEmail);
  const course = await loadCourse(courseId);
  const providerLabel = await loadProviderLabel(course.teacher_id);
  const amountCents = normalizeAmountCents(input.amountCents, course.price_cents);
  const currency = normalizeCurrency(course.currency);
  const normalizedStartDate = normalizeOptionalStartDate(input.startDate);
  const simulationKey = createSimulationKey({
    scenario: DIRECT_COURSE_SCENARIO,
    courseId,
    email: storedSimulationEmail,
    qualifier: "direct",
  });

  await assertNoOpenSimulationDuplicate(simulationKey);

  const customerFirstName = markSimulationName(firstName);
  const customerLastName = lastName;
  const customerName = `${customerFirstName} ${customerLastName}`.trim();
  const simulationMetadata = {
    ...createTestBookingSimulationMetadata({
      scenario: DIRECT_COURSE_SCENARIO,
      triggeredByAdminUserId: input.adminUserId,
    }),
    course_id: courseId,
    offer_title: course.title?.trim() || "Laufendes Angebot",
    provider_label: providerLabel,
    requested_start_date: normalizedStartDate,
    requested_amount_cents: input.amountCents ?? null,
    effective_amount_cents: amountCents,
    currency,
    stored_customer_email: storedSimulationEmail,
    pending_payment: true,
    pending_ticket: true,
    pending_ledger: true,
  };

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("course_registration_intents")
    .insert({
      trial_reservation_id: null,
      course_id: courseId,
      registration_token: null,
      first_name: customerFirstName,
      last_name: customerLastName,
      email: storedSimulationEmail,
      phone: null,
      street_and_number: null,
      postal_code: null,
      city: null,
      country: null,
      notes: null,
      status: "pending_checkout",
      subscription_status: null,
      completed_at: null,
      stripe_checkout_session_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_contract_id: null,
      is_simulation: true,
      simulation_key: simulationKey,
      simulation_metadata: simulationMetadata,
    })
    .select("id")
    .single<InsertedIntentRow>();

  if (error || !data?.id) {
    throw new DirectCourseSimulationError({
      code: "intent_insert_failed",
      step: "intent_insert",
      message: "Die direkte Kurs-Testanmeldung konnte nicht gespeichert werden.",
      supabaseMessage: error?.message ?? null,
      supabaseCode: error?.code ?? null,
    });
  }

  return {
    courseRegistrationIntentId: data.id,
    courseId,
    customerName,
    storedSimulationEmail,
  };
}
