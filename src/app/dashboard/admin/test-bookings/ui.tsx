import type { ReactNode } from "react";

export const TEST_BOOKINGS_ADMIN_PATH = "/dashboard/admin/test-bookings";

export function TestBookingsNotice({ action }: { action: string | undefined }) {
  if (!action) return null;

  let message = "Foundation only. Es wurden keine Testbuchungen erzeugt.";

  if (action === "workshop-foundation") {
    message = "Workshop-Testbuchung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "trial-foundation") {
    message = "Trial-Testbuchung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  } else if (action === "direct-course-foundation") {
    message =
      "Direkte Kurs-Testanmeldung ist in PR 1 nur als no-op vorbereitet. Es wurden keine Datensaetze erzeugt.";
  }

  return <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>;
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
  action: () => Promise<void>;
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
          Simulation only. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail. PR 1 fuehrt noch keine
          Fachlogik aus.
        </div>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Foundation no-op
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
