import Link from "next/link";
import type { ReactNode } from "react";

export const TEST_BOOKINGS_ADMIN_PATH = "/dashboard/admin/test-bookings";

export function TestBookingsNotice({
  action,
  bookingId,
  courseId,
  reservationId,
  ticketId,
  paymentSimulated,
  mailSent,
  noticeMessage,
}: {
  action: string | undefined;
  bookingId?: string | undefined;
  courseId?: string | undefined;
  reservationId?: string | undefined;
  ticketId?: string | undefined;
  paymentSimulated?: string | undefined;
  mailSent?: string | undefined;
  noticeMessage?: string | undefined;
}) {
  if (!action) return null;

  let message = "Foundation only. Es wurden keine Testbuchungen erzeugt.";
  let toneClass = "border-sky-200 bg-sky-50 text-sky-900";
  let extra: ReactNode = null;

  if (action === "workshop-foundation") {
    message = "Workshop-Testbuchung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "workshop-created") {
    message = `Workshop-Testbuchung erstellt. Ticket erzeugt. Zahlung simuliert: ${paymentSimulated === "yes" ? "ja" : "nein"}. Mail gesendet: ${mailSent === "yes" ? "ja" : "nein"}.`;
    toneClass = "border-green-200 bg-green-50 text-green-900";
    extra = (
      <div className="mt-2 text-xs">
        <div>booking_id: {bookingId ?? "-"}</div>
        <div>ticket_id: {ticketId ?? "-"}</div>
        {noticeMessage ? <div className="mt-2">{noticeMessage}</div> : null}
        <div className="mt-2 flex flex-wrap gap-3">
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
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  children: ReactNode;
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
          nur bei ausdruecklichem Opt-in im jeweiligen Formular.
        </div>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Simulation ausfuehren
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
