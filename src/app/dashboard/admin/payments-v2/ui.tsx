import Link from "next/link";
import type { ReactNode } from "react";
import { formatBerlinDate, formatBerlinDateTime } from "@/lib/formatting/berlin-time";

export const PAYMENTS_V2_ADMIN_PATH = "/dashboard/admin/payments-v2";
export const PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH = "/dashboard/admin/payments-v2/subscriptions";

export function formatDateTime(value: string | null): string {
  return formatBerlinDateTime(value);
}

export function formatDate(value: string | null): string {
  return formatBerlinDate(value);
}

export function formatMoney(amountCents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format((amountCents ?? 0) / 100);
}

export function shortenId(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function badgeClasses(tone: "green" | "yellow" | "red" | "gray" | "blue"): string {
  switch (tone) {
    case "green":
      return "bg-green-100 text-green-800";
    case "yellow":
      return "bg-amber-100 text-amber-800";
    case "red":
      return "bg-rose-100 text-rose-800";
    case "blue":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function toneForStatus(status: string | null | undefined): "green" | "yellow" | "red" | "gray" | "blue" {
  switch (status) {
    case "active":
    case "paid":
    case "payable":
    case "batched":
    case "simulated_pending":
    case "processed":
    case "succeeded":
    case "verified":
    case "charged":
    case "available":
    case "applied":
    case "completed":
      return "green";
    case "pending":
    case "pending_initial_payment":
    case "pending_event_completion":
    case "processing":
    case "requires_action":
    case "scheduled":
    case "planned":
    case "charge_pending":
    case "pause_scheduled":
    case "cancel_scheduled":
    case "partially_credited":
    case "partially_applied":
    case "draft":
    case "legacy_external":
      return "yellow";
    case "failed":
    case "cancelled":
    case "refunded":
    case "deleted":
    case "expired":
    case "ended":
      return "red";
    case "paused":
    case "credited":
    case "ignored":
      return "gray";
    default:
      return "blue";
  }
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeClasses(toneForStatus(value))}`}>
      {value ?? "-"}
    </span>
  );
}

export function Section({
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

export function AuditNav({ currentPath }: { currentPath: string }) {
  const links = [
    { href: PAYMENTS_V2_ADMIN_PATH, label: "Payments V2 Audit" },
    { href: PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH, label: "Subscription Audit" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const isActive = currentPath === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
