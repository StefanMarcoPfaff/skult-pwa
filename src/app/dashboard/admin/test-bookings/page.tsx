import { createSupabaseAdmin } from "@/lib/supabase/admin";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import {
  prepareDirectCourseTestRegistrationAction,
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
  code?: string;
  courseFound?: string;
  courseId?: string;
  kind?: string;
  mailSent?: string;
  message?: string;
  paymentSimulated?: string;
  reservationId?: string;
  status?: string;
  step?: string;
  supabaseCode?: string;
  supabaseMessage?: string;
  ticketId?: string;
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
            Kund*innenmail.
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
          courseFound={sp.courseFound}
          courseId={sp.courseId}
          errorCode={sp.code}
          errorStep={sp.step}
          errorType={sp.kind}
          reservationId={sp.reservationId}
          status={sp.status}
          supabaseCode={sp.supabaseCode}
          supabaseMessage={sp.supabaseMessage}
          ticketId={sp.ticketId}
          paymentSimulated={sp.paymentSimulated}
          mailSent={sp.mailSent}
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
                name="sendTestMail"
                label="Testmail senden"
                description="Diese Testmail wird wirklich verschickt. Ohne Opt-in bleibt die gespeicherte E-Mail rein simuliert auf .invalid."
              />
              <TextInput
                name="testMailRecipient"
                label="Testmail-Empfaenger optional"
                type="email"
                placeholder="qa@example.com"
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
            description="Foundation-Form fuer spaetere interne Kursanmeldungen ohne echten Checkout."
          >
            <TestBookingSkeletonForm
              action={prepareDirectCourseTestRegistrationAction}
              title="Direkte Kurs-Testanmeldung vorbereiten"
              description="Dieser Bereich bleibt vorerst Foundation-only und fuehrt noch keine course_registration_intents, Subscription-Vertraege oder Payment-V2-Buchungen aus."
            >
              <TextInput name="courseId" label="course_id" placeholder="uuid" />
              <TextInput name="firstName" label="Vorname" placeholder="[TEST] Sam" />
              <TextInput name="lastName" label="Nachname" placeholder="Beispiel" />
              <TextInput name="email" label="E-Mail" type="email" placeholder="sim.sam@example.invalid" />
              <TextInput name="startDate" label="Startdatum optional" type="date" />
              <TextInput name="amountCents" label="Betrag optional" type="number" placeholder="6900" />
            </TestBookingSkeletonForm>
          </TestBookingsSection>
        </div>
      </div>
    </main>
  );
}
