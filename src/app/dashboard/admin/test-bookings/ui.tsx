import Link from "next/link";
import type { ReactNode } from "react";

export const TEST_BOOKINGS_ADMIN_PATH = "/dashboard/admin/test-bookings";

export function TestBookingsNotice({
  action,
  bookingId,
  archivedAt,
  bookingCreated,
  courseRegistrationIntentId,
  courseFound,
  courseId,
  customerMailSent,
  duplicateBookingId,
  errorCode,
  errorStep,
  errorType,
  ledgerEntryId,
  mailSent,
  reservationId,
  ticketCreated,
  paymentTransactionId,
  status,
  subscriptionChargeId,
  subscriptionContractId,
  subscriptionPeriodId,
  supabaseCode,
  supabaseDetails,
  supabaseHint,
  supabaseMessage,
  rawErrorJson,
  rawErrorMessage,
  rawErrorName,
  rawErrorStackFirstLine,
  rawErrorStep,
  actionVersion,
  intentCreated,
  initialPaymentCreated,
  ticketPrepared,
  ticketId,
  paymentSimulated,
  providerMailSent,
  noticeMessage,
  ticketQrToken,
  fullMonthAmountCents,
  firstPaymentAmountCents,
  contractStartDate,
  firstPaymentExplanation,
  billableDays,
  daysInMonth,
}: {
  action: string | undefined;
  bookingId?: string | undefined;
  archivedAt?: string | undefined;
  bookingCreated?: string | undefined;
  courseRegistrationIntentId?: string | undefined;
  courseFound?: string | undefined;
  courseId?: string | undefined;
  customerMailSent?: string | undefined;
  duplicateBookingId?: string | undefined;
  errorCode?: string | undefined;
  errorStep?: string | undefined;
  errorType?: string | undefined;
  ledgerEntryId?: string | undefined;
  mailSent?: string | undefined;
  reservationId?: string | undefined;
  ticketCreated?: string | undefined;
  paymentTransactionId?: string | undefined;
  status?: string | undefined;
  subscriptionChargeId?: string | undefined;
  subscriptionContractId?: string | undefined;
  subscriptionPeriodId?: string | undefined;
  supabaseCode?: string | undefined;
  supabaseDetails?: string | undefined;
  supabaseHint?: string | undefined;
  supabaseMessage?: string | undefined;
  rawErrorJson?: string | undefined;
  rawErrorMessage?: string | undefined;
  rawErrorName?: string | undefined;
  rawErrorStackFirstLine?: string | undefined;
  rawErrorStep?: string | undefined;
  actionVersion?: string | undefined;
  intentCreated?: string | undefined;
  initialPaymentCreated?: string | undefined;
  ticketPrepared?: string | undefined;
  ticketId?: string | undefined;
  paymentSimulated?: string | undefined;
  providerMailSent?: string | undefined;
  noticeMessage?: string | undefined;
  ticketQrToken?: string | undefined;
  fullMonthAmountCents?: string | undefined;
  firstPaymentAmountCents?: string | undefined;
  contractStartDate?: string | undefined;
  firstPaymentExplanation?: string | undefined;
  billableDays?: string | undefined;
  daysInMonth?: string | undefined;
}) {
  if (!action) return null;

  let message = "Foundation only. Es wurden keine Testbuchungen erzeugt.";
  let toneClass = "border-sky-200 bg-sky-50 text-sky-900";
  let extra: ReactNode = null;

  if (action === "workshop-foundation") {
    message = "Workshop-Testbuchung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "workshop-created") {
    message = noticeMessage
      ? "Workshop-Testbuchung erstellt. Optionale Teilschritte hatten Hinweise oder Warnungen."
      : "Workshop-Testbuchung erfolgreich erstellt.";
    toneClass = noticeMessage ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>Buchung erstellt: {bookingCreated === "yes" ? "ja" : "nein"}</div>
        <div>Ticket erstellt: {ticketCreated === "yes" ? "ja" : "nein"}</div>
        <div>Zahlung simuliert: {paymentSimulated === "yes" ? "ja" : "nein"}</div>
        <div>Kund*innenmail gesendet: {customerMailSent === "yes" ? "ja" : "nein"}</div>
        <div>Anbieter*innenmail gesendet: {providerMailSent === "yes" ? "ja" : "nein"}</div>
        <div>booking_id: {bookingId ?? "-"}</div>
        <div>ticket_id: {ticketId ?? "-"}</div>
        <div>payment_transaction_id: {paymentTransactionId ?? "-"}</div>
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        {noticeMessage ? <div className="mt-2">Warnung: {noticeMessage}</div> : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <Link className="font-medium underline" href="/dashboard/admin/payments-v2">
            Zu Payments V2
          </Link>
          <Link className="font-medium underline" href="/dashboard/earnings">
            Zu Earnings
          </Link>
          <Link className="font-medium underline" href="/dashboard/participants">
            Zur Teilnehmer*innen-Uebersicht
          </Link>
          {courseId ? (
            <Link className="font-medium underline" href={`/dashboard/courses/${courseId}`}>
              Zur Angebotsdetailseite
            </Link>
          ) : null}
        </div>
      </div>
    );
  } else if (action === "trial-foundation") {
    message = "Trial-Testbuchung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "direct-course-foundation") {
    message =
      "Direkte Kurs-Testanmeldung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "direct-course-created") {
    message = "Direkte Kurs-Testanmeldung als interner course_registration_intent erstellt.";
    toneClass = "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>course_id: {courseId ?? "-"}</div>
        <div>{noticeMessage ?? "Noch keine Zahlung, kein Ticket, kein Ledger - das folgt in PR 2."}</div>
      </div>
    );
  } else if (action === "direct-course-error") {
    message = noticeMessage ?? "Die direkte Kurs-Testanmeldung konnte nicht erstellt werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-900";
    extra = (
      <div className="mt-2 space-y-1 text-xs">
        <div>Fehlercode: {errorCode ?? "-"}</div>
        <div>Schritt: {errorStep ?? "-"}</div>
        <div>Intent erstellt: {intentCreated === "yes" ? "ja" : "nein"}</div>
        <div>Initialzahlung: {initialPaymentCreated === "yes" ? "ja" : "nein"}</div>
        <div>Ticket: {ticketPrepared === "yes" ? "ja" : "nein"}</div>
        <div>existing_intent_id: {duplicateBookingId ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>supabase_details: {supabaseDetails ?? "-"}</div>
        <div>supabase_hint: {supabaseHint ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>raw_error_step: {rawErrorStep ?? "-"}</div>
        <div>raw_error_stack_first_line: {rawErrorStackFirstLine ?? "-"}</div>
        <div>raw_error_json: {rawErrorJson ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action === "direct-course-payment-created") {
    message = "Interne Erstzahlung fuer die direkte Kurs-Testanmeldung simuliert.";
    toneClass = "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>course_id: {courseId ?? "-"}</div>
        <div>subscription_contract_id: {subscriptionContractId ?? "-"}</div>
        <div>subscription_period_id: {subscriptionPeriodId ?? "-"}</div>
        <div>subscription_charge_id: {subscriptionChargeId ?? "-"}</div>
        <div>payment_transaction_id: {paymentTransactionId ?? "-"}</div>
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>Monatsbetrag: {fullMonthAmountCents ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(fullMonthAmountCents) / 100) : "-"}</div>
        <div>Startdatum: {contractStartDate ?? "-"}</div>
        <div>Erstzahlung: {firstPaymentAmountCents ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(firstPaymentAmountCents) / 100) : "-"}</div>
        <div>Abrechnungstage: {billableDays ?? "-"} / {daysInMonth ?? "-"}</div>
        <div>Hinweis: {firstPaymentExplanation ?? "Ab dem naechsten Monat wird der volle Monatsbetrag berechnet."}</div>
        <div className="mt-2">
          {noticeMessage ?? "Keine echte Zahlung, keine Auszahlung, keine Mail. Subscription-Audit siehe Payments V2."}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link className="font-medium underline" href="/dashboard/admin/payments-v2/subscriptions">
            Zur Subscription-Audit-Seite
          </Link>
          <Link className="font-medium underline" href="/dashboard/admin/payments-v2">
            Zu Payments V2
          </Link>
        </div>
      </div>
    );
  } else if (action === "direct-course-ticket-prepared") {
    message = "Kursticket und Teilnehmeransicht fuer die direkte Kurs-Simulation vorbereitet.";
    toneClass = "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>course_id: {courseId ?? "-"}</div>
        <div>subscription_contract_id: {subscriptionContractId ?? "-"}</div>
        <div>ticket_id: {ticketId ?? "-"}</div>
        <div>Monatsbetrag: {fullMonthAmountCents ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(fullMonthAmountCents) / 100) : "-"}</div>
        <div>Startdatum: {contractStartDate ?? "-"}</div>
        <div>Erstzahlung: {firstPaymentAmountCents ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(firstPaymentAmountCents) / 100) : "-"}</div>
        <div>Abrechnungstage: {billableDays ?? "-"} / {daysInMonth ?? "-"}</div>
        <div>Hinweis: {firstPaymentExplanation ?? "Ab dem naechsten Monat wird der volle Monatsbetrag berechnet."}</div>
        <div className="mt-2">
          {noticeMessage ?? "Ticket/QR wurde intern vorbereitet. Keine Mail, keine echte Zahlung, kein externer Provider."}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {ticketQrToken ? (
            <Link className="font-medium underline" href={`/ticket/qr/${ticketQrToken}`}>
              Zum Kursticket
            </Link>
          ) : null}
          {courseRegistrationIntentId ? (
            <Link
              className="font-medium underline"
              href={`/dashboard/participants/${courseRegistrationIntentId}?source=registered`}
            >
              Zur Teilnehmerdetailseite
            </Link>
          ) : null}
          <Link className="font-medium underline" href="/dashboard/participants">
            Zur Teilnehmer*innen-Uebersicht
          </Link>
        </div>
      </div>
    );
  } else if (action === "direct-course-payment-error") {
    message = noticeMessage ?? "Die interne Erstzahlungs-Simulation konnte nicht ausgefuehrt werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-900";
    extra = (
      <div className="mt-2 space-y-1 text-xs">
        <div>Fehlercode: {errorCode ?? "-"}</div>
        <div>Schritt: {errorStep ?? "-"}</div>
        <div>Intent erstellt: {intentCreated === "yes" ? "ja" : "nein"}</div>
        <div>Initialzahlung: {initialPaymentCreated === "yes" ? "ja" : "nein"}</div>
        <div>Ticket: {ticketPrepared === "yes" ? "ja" : "nein"}</div>
        <div>existing_intent_id: {duplicateBookingId ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>supabase_details: {supabaseDetails ?? "-"}</div>
        <div>supabase_hint: {supabaseHint ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>raw_error_step: {rawErrorStep ?? "-"}</div>
        <div>raw_error_stack_first_line: {rawErrorStackFirstLine ?? "-"}</div>
        <div>raw_error_json: {rawErrorJson ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action === "trial-created") {
    message = `Trial-Testbuchung erstellt. Ticket erzeugt. Mail gesendet: ${mailSent === "yes" ? "ja" : "nein"}.`;
    toneClass = "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>trial_reservation_id: {reservationId ?? "-"}</div>
        <div>ticket_id: {ticketId ?? "-"}</div>
        {noticeMessage ? <div className="mt-2">{noticeMessage}</div> : null}
        <div className="mt-2">
          <Link className="font-medium underline" href="/dashboard/participants">
            Zur Teilnehmer*innen-Uebersicht
          </Link>
        </div>
      </div>
    );
  } else if (action === "trial-error") {
    message = noticeMessage ?? "Die Trial-Testbuchung konnte nicht erstellt werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-900";
  } else if (action === "workshop-error") {
    message = noticeMessage ?? "Die Workshop-Testbuchung konnte nicht erstellt werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-900";
    extra = (
      <div className="mt-2 space-y-1 text-xs">
        <div>Fehlercode: {errorCode ?? "-"}</div>
        <div>Schritt: {errorStep ?? "-"}</div>
        <div>course_found: {courseFound ?? "-"}</div>
        <div>type: {errorType ?? "-"}</div>
        <div>status: {status ?? "-"}</div>
        <div>archived_at: {archivedAt ?? "-"}</div>
        <div>existing_booking_id: {duplicateBookingId ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <div>{message}</div>
      {extra}
    </div>
  );
}

export function TestBookingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function TestBookingSkeletonForm({
  action,
  title,
  description,
  children,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-700">{description}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
        <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-xs text-amber-950">
          Simulation only. Keine echte Zahlung, keine echte Auszahlung und keine externen Payment-Calls. Kund*innenmail
          oder Anbieter*innenmail nur bei ausdruecklichem Opt-in im jeweiligen Formular.
        </div>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {submitLabel ?? "Simulation ausfuehren"}
        </button>
      </div>
    </form>
  );
}

export function TextInput({
  name,
  label,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "date" | "number";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
      />
    </label>
  );
}

export function SelectInput({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <select
        name={name}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0"
        defaultValue=""
      >
        <option value="" disabled>
          Bitte Angebot auswaehlen
        </option>
        {children}
      </select>
    </label>
  );
}

export function CheckboxInput({
  name,
  label,
  description,
}: {
  name: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">
      <input name={name} type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" />
      <span>
        <span className="block font-medium">{label}</span>
        {description ? <span className="mt-1 block text-xs text-slate-600">{description}</span> : null}
      </span>
    </label>
  );
}
