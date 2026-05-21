import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { formatRecurringCoursePrice } from "@/lib/course-display";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import {
  prepareDirectCourseTestRegistrationAction,
  prepareDirectCourseParticipantTicketAction,
  simulateDirectCourseInitialPaymentAction,
  prepareTrialTestBookingAction,
  prepareWorkshopTestBookingAction,
} from "./actions";
import {
  TEST_BOOKINGS_ADMIN_PATH,
  CheckboxInput,
  SelectInput,
  TestBookingSkeletonForm,
  TestBookingsNotice,
  TestBookingsSection,
  TextInput,
} from "./ui";

export const dynamic = "force-dynamic";

type SearchParams = {
  action?: string;
  archivedAt?: string;
  bookingId?: string;
  bookingCreated?: string;
  code?: string;
  courseRegistrationIntentId?: string;
  courseFound?: string;
  courseId?: string;
  customerMailSent?: string;
  duplicateBookingId?: string;
  kind?: string;
  ledgerEntryId?: string;
  mailSent?: string;
  message?: string;
  paymentSimulated?: string;
  paymentTransactionId?: string;
  providerMailSent?: string;
  rawErrorJson?: string;
  rawErrorMessage?: string;
  rawErrorName?: string;
  rawErrorStackFirstLine?: string;
  rawErrorStep?: string;
  reservationId?: string;
  status?: string;
  step?: string;
  subscriptionChargeId?: string;
  subscriptionContractId?: string;
  subscriptionPeriodId?: string;
  supabaseCode?: string;
  supabaseDetails?: string;
  supabaseHint?: string;
  supabaseMessage?: string;
  actionVersion?: string;
  intentCreated?: string;
  initialPaymentCreated?: string;
  ticketId?: string;
  ticketQrToken?: string;
  ticketPrepared?: string;
  ticketCreated?: string;
};

type WorkshopOfferOptionRow = {
  id: string;
  title: string | null;
  kind: string | null;
  status: string | null;
  archived_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  currency: string | null;
};

type WorkshopOfferSessionRow = {
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type DirectCourseOfferRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  status: string | null;
  archived_at: string | null;
  price_cents: number | null;
  currency: string | null;
};

type DirectCourseProviderRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

function formatWorkshopMoney(priceCents: number | null, currency: string | null): string {
  if (priceCents === null || !Number.isFinite(priceCents)) return "Preis offen";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format(priceCents / 100);
}

function formatWorkshopDateTime(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!endsAt) {
    return `${date} | ${startTime}`;
  }

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) {
    return `${date} | ${startTime}`;
  }

  const endTime = end.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

function formatDirectCoursePrice(priceCents: number | null, currency: string | null): string {
  return formatRecurringCoursePrice(priceCents, currency) ?? "Preis offen";
}

export default async function TestBookingsAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await requirePaymentsV2SimulationAccess();
  const admin = createSupabaseAdmin();

  const { data: workshopOffers } = await admin
    .from("courses")
    .select("id,title,kind,status,archived_at,starts_at,ends_at,price_cents,currency")
    .in("kind", ["workshop", "exclusive_offer"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<WorkshopOfferOptionRow[]>();

  const workshopOfferIds = (workshopOffers ?? []).map((offer) => offer.id);
  const { data: workshopSessions } =
    workshopOfferIds.length > 0
      ? await admin
          .from("course_sessions")
          .select("course_id,starts_at,ends_at")
          .in("course_id", workshopOfferIds)
          .order("starts_at", { ascending: true })
          .returns<WorkshopOfferSessionRow[]>()
      : { data: [] as WorkshopOfferSessionRow[] };

  const firstSessionByCourseId = new Map<string, WorkshopOfferSessionRow>();
  for (const session of workshopSessions ?? []) {
    if (!firstSessionByCourseId.has(session.course_id)) {
      firstSessionByCourseId.set(session.course_id, session);
    }
  }

  const { data: directCourseOffers } = await admin
    .from("courses")
    .select("id,title,teacher_id,status,archived_at,price_cents,currency")
    .eq("kind", "course")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<DirectCourseOfferRow[]>();

  const directCourseTeacherIds = Array.from(
    new Set(
      (directCourseOffers ?? [])
        .map((offer) => offer.teacher_id)
        .filter((teacherId): teacherId is string => Boolean(teacherId))
    )
  );
  const { data: directCourseProviders } =
    directCourseTeacherIds.length > 0
      ? await admin
          .from("profiles")
          .select("id,first_name,last_name,provider_type,organization_name")
          .in("id", directCourseTeacherIds)
          .returns<DirectCourseProviderRow[]>()
      : { data: [] as DirectCourseProviderRow[] };

  const directCourseProviderById = new Map(
    (directCourseProviders ?? []).map((provider) => [provider.id, provider] as const)
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <DashboardBackLink />
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-sky-700">Internal Simulation</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Test Bookings</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Admin-only Testbuchungen fuer RESER. Diese Seite ist nur im freigeschalteten Simulationsmodus verfuegbar
            und nutzt bestehende Fachpfade gezielt ohne echte PSP-, Payout- oder Checkout-Calls.
          </p>
          <div className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Simulation only
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Keine echte Zahlung, keine echte Auszahlung, keine Stripe-, Mollie- oder PayPal-Calls und keine
            Kund*innen- oder Anbieter*innenmail ohne ausdrueckliches Opt-in.
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Guard aktiv fuer User {user.email ?? "-"} via <code>requirePaymentsV2SimulationAccess()</code> auf{" "}
            <code>{TEST_BOOKINGS_ADMIN_PATH}</code>.
          </div>
        </header>

        <TestBookingsNotice
          action={sp.action}
          archivedAt={sp.archivedAt}
          bookingId={sp.bookingId}
          bookingCreated={sp.bookingCreated}
          courseRegistrationIntentId={sp.courseRegistrationIntentId}
          courseFound={sp.courseFound}
          courseId={sp.courseId}
          customerMailSent={sp.customerMailSent}
          duplicateBookingId={sp.duplicateBookingId}
          errorCode={sp.code}
          errorStep={sp.step}
          errorType={sp.kind}
          ledgerEntryId={sp.ledgerEntryId}
          mailSent={sp.mailSent}
          paymentTransactionId={sp.paymentTransactionId}
          providerMailSent={sp.providerMailSent}
          rawErrorJson={sp.rawErrorJson}
          rawErrorMessage={sp.rawErrorMessage}
          rawErrorName={sp.rawErrorName}
          rawErrorStackFirstLine={sp.rawErrorStackFirstLine}
          rawErrorStep={sp.rawErrorStep}
          reservationId={sp.reservationId}
          status={sp.status}
          subscriptionChargeId={sp.subscriptionChargeId}
          subscriptionContractId={sp.subscriptionContractId}
          subscriptionPeriodId={sp.subscriptionPeriodId}
          supabaseCode={sp.supabaseCode}
          supabaseDetails={sp.supabaseDetails}
          supabaseHint={sp.supabaseHint}
          supabaseMessage={sp.supabaseMessage}
          actionVersion={sp.actionVersion}
          intentCreated={sp.intentCreated}
          initialPaymentCreated={sp.initialPaymentCreated}
          ticketId={sp.ticketId}
          ticketQrToken={sp.ticketQrToken}
          ticketPrepared={sp.ticketPrepared}
          ticketCreated={sp.ticketCreated}
          paymentSimulated={sp.paymentSimulated}
          noticeMessage={sp.message}
        />

        <div className="grid gap-6">
          <TestBookingsSection
            title="Workshop-Testbuchung"
            description="Erzeugt eine simulierte Workshop-Buchung inklusive Ticket, QR und optional interner Payment-Simulation."
          >
            <TestBookingSkeletonForm
              action={prepareWorkshopTestBookingAction}
              title="Workshop-Testbuchung erstellen"
              description="Erzeugt eine simulierte booking auf dem bestehenden Fachpfad, optional mit interner Workshop-Payment-Simulation."
            >
              <SelectInput name="courseId" label="Angebot auswaehlen">
                {(workshopOffers ?? []).map((offer) => {
                  const firstSession = firstSessionByCourseId.get(offer.id);
                  const timeLabel = formatWorkshopDateTime(
                    firstSession?.starts_at ?? offer.starts_at,
                    firstSession?.ends_at ?? offer.ends_at
                  );
                  const optionLabel = [
                    offer.title?.trim() || "Ohne Titel",
                    timeLabel,
                    `Status: ${offer.status ?? "-"}`,
                    `Preis: ${formatWorkshopMoney(offer.price_cents, offer.currency)}`,
                    `Typ: ${offer.kind ?? "-"}`,
                  ]
                    .filter(Boolean)
                    .join(" | ");

                  return (
                    <option key={offer.id} value={offer.id}>
                      {optionLabel}
                    </option>
                  );
                })}
              </SelectInput>
              <TextInput name="firstName" label="Vorname" placeholder="[TEST] Max" />
              <TextInput name="lastName" label="Nachname" placeholder="Mustermann" />
              <TextInput name="email" label="E-Mail" type="email" placeholder="max@example.invalid" />
              <TextInput name="amountCents" label="Betrag optional" type="number" placeholder="4900" />
              <CheckboxInput
                name="simulatePayment"
                label="Interne Zahlung simulieren"
                description="Erzeugt bei Betrag > 0 eine interne payment_transaction und einen Ledger-Eintrag ohne PSP-Call."
              />
              <CheckboxInput
                name="sendCustomerTestMail"
                label="Kund*innen-Testmail senden"
                description="Diese Testmail wird wirklich verschickt. Ohne Opt-in bleibt die gespeicherte E-Mail rein simuliert auf .invalid."
              />
              <CheckboxInput
                name="sendProviderTestMail"
                label="Anbieter*innen-Testmail senden"
                description="Diese Testmail wird wirklich verschickt. Ohne Opt-in wird keine Anbieter*innen-Buchungsbenachrichtigung versendet."
              />
              <TextInput
                name="customerTestMailRecipient"
                label="Kund*innen-Testmail-Empfaenger optional"
                type="email"
                placeholder="qa@example.com"
              />
              <TextInput
                name="providerTestMailRecipient"
                label="Anbieter*innen-Testmail-Empfaenger optional"
                type="email"
                placeholder="provider-qa@example.com"
              />
            </TestBookingSkeletonForm>
          </TestBookingsSection>

          <TestBookingsSection
            title="Trial-Testbuchung"
            description="Foundation-Form fuer spaetere Probestunden-Reservierungen mit Ticket- und QR-Vorbereitung."
          >
            <TestBookingSkeletonForm
              action={prepareTrialTestBookingAction}
              title="Trial-Testbuchung erstellen"
              description="Erzeugt eine simulierte trial_reservation inklusive Ticket und QR auf dem bestehenden Fachpfad."
            >
              <TextInput name="courseId" label="course_id" placeholder="uuid" />
              <TextInput name="firstName" label="Vorname" placeholder="[TEST] Erika" />
              <TextInput name="lastName" label="Nachname" placeholder="Muster" />
              <TextInput name="email" label="E-Mail" type="email" placeholder="erika@example.invalid" />
              <TextInput name="trialSlotId" label="trial_slot_id optional" placeholder="uuid" />
              <CheckboxInput
                name="sendTestMail"
                label="Testmail senden"
                description="Diese Testmail wird wirklich verschickt. Ohne Opt-in bleibt die gespeicherte E-Mail rein simuliert auf .invalid."
              />
              <TextInput
                name="testMailRecipientOverride"
                label="Test-E-Mail-Empfaenger ueberschreiben optional"
                type="email"
                placeholder="qa@example.com"
              />
            </TestBookingSkeletonForm>
          </TestBookingsSection>

          <TestBookingsSection
            title="Direkte Kurs-Testanmeldung"
            description="Erzeugt einen internen course_registration_intent und kann optional direkt die interne Erstzahlung bis Contract, Period, Charge, Payment und Ledger simulieren."
          >
            <TestBookingSkeletonForm
              action={prepareDirectCourseTestRegistrationAction}
              title="Direkte Kurs-Testanmeldung erstellen"
              description="Erzeugt einen Test-Intent fuer ein laufendes Angebot. Optional kann die interne Erstzahlung direkt simuliert und direkt danach das Kursticket fuer Teilnehmeransicht und Check-in vorbereitet werden."
            >
              <SelectInput name="courseId" label="Laufendes Angebot auswaehlen">
                {(directCourseOffers ?? []).map((offer) => {
                  const provider = offer.teacher_id ? directCourseProviderById.get(offer.teacher_id) : null;
                  const providerLabel = provider?.provider_type
                    ? getProviderDisplayName(provider.provider_type, provider)
                    : [provider?.first_name, provider?.last_name].filter(Boolean).join(" ").trim() || "Anbieter*in offen";
                  const optionLabel = [
                    offer.title?.trim() || "Ohne Titel",
                    `Anbieter*in: ${providerLabel}`,
                    `Monatsbetrag: ${formatDirectCoursePrice(offer.price_cents, offer.currency)}`,
                    `Status: ${offer.status ?? "-"}`,
                  ].join(" | ");

                  return (
                    <option key={offer.id} value={offer.id}>
                      {optionLabel}
                    </option>
                  );
                })}
              </SelectInput>
              <TextInput name="firstName" label="Vorname" placeholder="[TEST] Sam" />
              <TextInput name="lastName" label="Nachname" placeholder="Beispiel" />
              <TextInput name="email" label="E-Mail" type="email" placeholder="sim.sam@example.invalid" />
              <TextInput name="startDate" label="Startdatum optional" type="date" />
              <TextInput name="amountCents" label="Betrag optional" type="number" placeholder="6900" />
              <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
              <CheckboxInput
                name="simulateInitialPayment"
                label="Initialzahlung direkt simulieren"
                description="Erzeugt nach dem Test-Intent intern Contract, erste Period, erste Charge, payment_transaction und ledger_entry."
              />
              <CheckboxInput
                name="prepareParticipantTicket"
                label="Kursticket danach vorbereiten"
                description="Nur zusammen mit der Initialzahlung: erzeugt oder reused das contract-basierte Kursticket fuer Teilnehmeransicht und Check-in."
              />
            </TestBookingSkeletonForm>

            <div className="mt-4">
              <TestBookingSkeletonForm
                action={simulateDirectCourseInitialPaymentAction}
                title="Initialzahlung fuer bestehenden Test-Intent simulieren"
                description="Nutzt einen vorhandenen Simulations-Intent und erzeugt intern Contract, erste Period, erste Charge, payment_transaction und ledger_entry. Optional kann direkt danach das Kursticket vorbereitet werden."
                submitLabel="Initialzahlung simulieren"
              >
                <TextInput
                  name="courseRegistrationIntentId"
                  label="course_registration_intent_id"
                  placeholder="uuid"
                />
                <TextInput name="amountCents" label="Betrag optional" type="number" placeholder="6900" />
                <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
                <CheckboxInput
                  name="prepareParticipantTicket"
                  label="Kursticket danach vorbereiten"
                  description="Erzeugt oder reused das contract-basierte Kursticket fuer Teilnehmeransicht und Check-in."
                />
              </TestBookingSkeletonForm>
            </div>

            <div className="mt-4">
              <TestBookingSkeletonForm
                action={prepareDirectCourseParticipantTicketAction}
                title="Kurs-Ticket / Teilnehmeransicht vorbereiten"
                description="Erzeugt oder reused fuer einen aktiven Simulations-Contract das Kursticket inklusive QR-Binding. Keine Stripe-Felder, keine Mail, kein Payment."
                submitLabel="Ticket vorbereiten"
              >
                <TextInput
                  name="courseRegistrationIntentId"
                  label="course_registration_intent_id"
                  placeholder="uuid"
                />
              </TestBookingSkeletonForm>
            </div>
          </TestBookingsSection>
        </div>
      </div>
    </main>
  );
}
