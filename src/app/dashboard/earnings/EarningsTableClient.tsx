"use client";

import { useMemo, useState } from "react";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";

export type EarningsTableRow = {
  id: string;
  offerTitle: string;
  offerTypeLabel: string;
  date: string;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  statusLabel: string;
  statusDetail: string | null;
  statusToneClass: string;
};

type SortKey = "offerTitle" | "date" | "grossCents" | "platformFeeCents" | "netCents" | "statusLabel";

function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format((amountCents ?? 0) / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("de-DE", {
    dateStyle: "medium",
  });
}

export default function EarningsTableClient({ rows }: { rows: EarningsTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    sorted.sort((left, right) => {
      switch (sortKey) {
        case "offerTitle":
        case "statusLabel":
          return left[sortKey].localeCompare(right[sortKey], "de", { sensitivity: "base" }) * directionFactor;
        case "date": {
          const leftTime = new Date(left.date).getTime();
          const rightTime = new Date(right.date).getTime();
          const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
          const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
          return (safeLeft - safeRight) * directionFactor;
        }
        case "grossCents":
        case "platformFeeCents":
        case "netCents":
          return (left[sortKey] - right[sortKey]) * directionFactor;
        default:
          return 0;
      }
    });

    return sorted;
  }, [rows, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "date" ? "desc" : "asc");
  }

  if (sortedRows.length === 0) {
    return <DashboardEmptyState title="Keine passenden Einnahmen gefunden." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/70">
          <tr>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="Angebot"
                active={sortKey === "offerTitle"}
                direction={sortDirection}
                onToggle={() => toggleSort("offerTitle")}
              />
            </th>
            <th className="px-3 py-3 text-xs font-semibold tracking-wide text-slate-500">Typ</th>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="Datum"
                active={sortKey === "date"}
                direction={sortDirection}
                onToggle={() => toggleSort("date")}
              />
            </th>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="Brutto"
                active={sortKey === "grossCents"}
                direction={sortDirection}
                onToggle={() => toggleSort("grossCents")}
                align="right"
              />
            </th>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="RESER-Abzug"
                active={sortKey === "platformFeeCents"}
                direction={sortDirection}
                onToggle={() => toggleSort("platformFeeCents")}
                align="right"
              />
            </th>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="Dein Betrag"
                active={sortKey === "netCents"}
                direction={sortDirection}
                onToggle={() => toggleSort("netCents")}
                align="right"
              />
            </th>
            <th className="px-3 py-3">
              <SortableTableHeader
                label="Status"
                active={sortKey === "statusLabel"}
                direction={sortDirection}
                onToggle={() => toggleSort("statusLabel")}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedRows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-3 py-3">
                <div className="font-medium text-slate-900">{row.offerTitle}</div>
              </td>
              <td className="px-3 py-3 text-slate-700">{row.offerTypeLabel}</td>
              <td className="px-3 py-3 text-slate-700">{formatDate(row.date)}</td>
              <td className="px-3 py-3 text-right font-medium text-slate-900">{formatMoney(row.grossCents)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{formatMoney(row.platformFeeCents)}</td>
              <td className="px-3 py-3 text-right font-medium text-slate-900">{formatMoney(row.netCents)}</td>
              <td className="px-3 py-3">
                <div className="space-y-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.statusToneClass}`}>
                    {row.statusLabel}
                  </span>
                  {row.statusDetail ? <div className="text-xs text-slate-500">{row.statusDetail}</div> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
