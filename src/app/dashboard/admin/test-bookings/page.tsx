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
  TestBookingSkeletonForm,
  TestBookingsNotice,
  TestBookingsSection,
  TextInput,
} from "./ui";

export const dynamic = "force-dynamic";

type SearchParams = {
  action?: string;
  bookingId?: string;
  code?: string;
  courseId?: string;
  mailSent?: string;
  message?: string;
  paymentSimulated?: string;
  reservationId?: string;
  ticketId?: string;
};

export default async function TestBookingsAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await requirePaymentsV2SimulationAccess();

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
          bookingId={sp.bookingId}
          courseId={sp.courseId}
          reservationId={sp.reservationId}
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
              <TextInput name="courseId" label="course_id" placeholder="uuid" />
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
