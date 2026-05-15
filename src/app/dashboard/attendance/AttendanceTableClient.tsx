"use client";

import { useMemo, useState } from "react";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";

export type AttendanceTableRow = {
  rowKey: string;
  date: string;
  time: string;
  offerTitle: string;
  offerKind: string;
  participantName: string;
  participantEmail: string | null;
  instructorName: string;
  room: string | null;
  methodLabel: string | null;
  checkedInAt: string | null;
  status: "present" | "not_checked_in";
  sortDate: number;
};

type SortKey = "date" | "offerTitle" | "participantName" | "instructorName" | "status";

function statusLabel(status: AttendanceTableRow["status"]) {
  return status === "present" ? "Anwesend/Erfasst" : "Offen";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export default function AttendanceTableClient(props: { rows: AttendanceTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    const rows = [...props.rows];
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    rows.sort((left, right) => {
      if (sortKey === "date") return (left.sortDate - right.sortDate) * directionFactor;
      if (sortKey === "status") {
        return statusLabel(left.status).localeCompare(statusLabel(right.status), "de", { sensitivity: "base" }) * directionFactor;
      }
      return left[sortKey].localeCompare(right[sortKey], "de", { sensitivity: "base" }) * directionFactor;
    });

    return rows;
  }, [props.rows, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "date" ? "desc" : "asc");
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Übersicht</h2>
        <span className="text-sm text-slate-600">{sortedRows.length} Einträge</span>
      </div>

      {sortedRows.length === 0 ? (
        <div className="p-5">
          <DashboardEmptyState title="Keine passenden Anwesenheitsdaten gefunden." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="px-4 py-3">
                  <SortableTableHeader
                    label="Datum"
                    active={sortKey === "date"}
                    direction={sortDirection}
                    onToggle={() => toggleSort("date")}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">Uhrzeit</th>
                <th className="px-4 py-3">
                  <SortableTableHeader
                    label="Angebot"
                    active={sortKey === "offerTitle"}
                    direction={sortDirection}
                    onToggle={() => toggleSort("offerTitle")}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">Typ</th>
                <th className="px-4 py-3">
                  <SortableTableHeader
                    label="Teilnehmer*in"
                    active={sortKey === "participantName"}
                    direction={sortDirection}
                    onToggle={() => toggleSort("participantName")}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">E-Mail</th>
                <th className="px-4 py-3">
                  <SortableTableHeader
                    label="Anbieter*in"
                    active={sortKey === "instructorName"}
                    direction={sortDirection}
                    onToggle={() => toggleSort("instructorName")}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortableTableHeader
                    label="Status"
                    active={sortKey === "status"}
                    direction={sortDirection}
                    onToggle={() => toggleSort("status")}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">Raum / Ort</th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">Check-in-Methode</th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500">Check-in-Zeitpunkt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row) => (
                <tr key={row.rowKey} className={row.status === "not_checked_in" ? "bg-amber-50/30 align-top" : "align-top"}>
                  <td className="px-4 py-3 text-slate-700">{row.date}</td>
                  <td className="px-4 py-3 text-slate-700">{row.time}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.offerTitle}</td>
                  <td className="px-4 py-3 text-slate-700">{row.offerKind}</td>
                  <td className="px-4 py-3 text-slate-700">{row.participantName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.participantEmail ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.instructorName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.status === "present" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.room ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.status === "present" ? row.methodLabel ?? "-" : "nicht eingecheckt"}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.checkedInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
