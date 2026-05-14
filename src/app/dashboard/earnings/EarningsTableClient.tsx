"use client";

import { useMemo, useState } from "react";

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
type SortDirection = "asc" | "desc";

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

function SortButton(props: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  direction: SortDirection;
  onToggle: (key: SortKey) => void;
}) {
  const isActive = props.activeSortKey === props.sortKey;
  const marker = isActive ? (props.direction === "asc" ? "↑" : "↓") : "↕";

  return (
    <button
      type="button"
      onClick={() => props.onToggle(props.sortKey)}
      className={`inline-flex items-center gap-1 transition ${
        isActive ? "font-semibold text-slate-900" : "text-slate-500 hover:text-slate-700"
      }`}
      aria-label={`${props.label} sortieren`}
      aria-pressed={isActive}
    >
      <span>{props.label}</span>
      <span className="text-[11px]">{marker}</span>
    </button>
  );
}

export default function EarningsTableClient({ rows }: { rows: EarningsTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((left, right) => {
      const directionFactor = sortDirection === "asc" ? 1 : -1;

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

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">
              <SortButton
                label="Angebot"
                sortKey="offerTitle"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
            <th className="px-3 py-2">Typ</th>
            <th className="px-3 py-2">
              <SortButton
                label="Datum"
                sortKey="date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
            <th className="px-3 py-2">
              <SortButton
                label="Brutto"
                sortKey="grossCents"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
            <th className="px-3 py-2">
              <SortButton
                label="RESER-Abzug"
                sortKey="platformFeeCents"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
            <th className="px-3 py-2">
              <SortButton
                label="Dein Betrag"
                sortKey="netCents"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
            <th className="px-3 py-2">
              <SortButton
                label="Status"
                sortKey="statusLabel"
                activeSortKey={sortKey}
                direction={sortDirection}
                onToggle={toggleSort}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-sm text-slate-500">
                Fuer die aktuelle Auswahl wurden noch keine Eintraege gefunden.
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-900">{row.offerTitle}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">{row.offerTypeLabel}</td>
                <td className="px-3 py-3 text-slate-700">{formatDate(row.date)}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.grossCents)}</td>
                <td className="px-3 py-3 text-slate-700">{formatMoney(row.platformFeeCents)}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.netCents)}</td>
                <td className="px-3 py-3">
                  <div className="space-y-2">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.statusToneClass}`}>
                      {row.statusLabel}
                    </span>
                    {row.statusDetail ? <div className="text-xs text-slate-500">{row.statusDetail}</div> : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
