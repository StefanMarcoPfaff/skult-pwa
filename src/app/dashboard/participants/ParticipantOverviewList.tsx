"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { buildMailtoHref } from "@/lib/mailto";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";
import { getParticipantStatusPresentation, type ParticipantStatusSource } from "./participant-status-ui";

type TrialLifecycleAction = {
  kind: "trial";
  reservationId: string;
  redirectTo: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  stopDisabled: boolean;
  showApprovalAction: boolean;
  showCancellationAction: boolean;
};

type RegisteredLifecycleAction = {
  kind: "registered";
  reservationId: string;
  redirectTo: string;
  defaultActiveUntilDate: string;
  defaultPauseEndDate?: string | null;
  defaultStopDate: string;
  playLabel?: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  pauseLabel?: string;
  stopLabel?: string;
  pauseDisabled: boolean;
  stopDisabled: boolean;
};

type WorkshopLifecycleAction = {
  kind: "workshop";
  bookingId: string;
  redirectTo: string;
  paymentStatus: string | null;
  playMode: string;
  stopDisabled: boolean;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
};

type ParticipantLifecycleAction =
  | TrialLifecycleAction
  | RegisteredLifecycleAction
  | WorkshopLifecycleAction;

type ParticipantCheckIn = {
  courseId: string;
  sessionId: string | null;
  eventDate: string;
  ticketId: string;
  room: string | null;
  instructorName: string | null;
  scanHref: string;
  showHref: string;
  enabled: boolean;
  disabledReason: string | null;
  checkedInAt: string | null;
};

type ParticipantArchiveAction = {
  participantId: string;
  source: "trial" | "registered" | "workshop";
  redirectTo: string;
  title: string;
  text: string;
  allowed: boolean;
  reason: string;
};

type ParticipantCalendarAction = {
  href: string | null;
  disabledReason: string | null;
};

type CardPresentation = {
  articleClassName: string;
  badge: {
    label: string;
    className: string;
  };
};

export type ParticipantOverviewItem = {
  id: string;
  detailHref: string;
  displayName: string;
  email: string | null;
  offerTitle: string;
  offerKindLabel: string;
  sourceLabel: string;
  metaLabel: string | null;
  decisionInfo: string | null;
  highlight: boolean;
  status: ParticipantStatusSource;
  statusLabel: string;
  mailHref: string | null;
  calendarAction: ParticipantCalendarAction;
  lifecycleAction: ParticipantLifecycleAction;
  checkIn: ParticipantCheckIn | null;
  archiveAction: ParticipantArchiveAction;
  sortDate: string;
};

export type ParticipantStatusFilter = "all" | "active" | "trial" | "paused" | "ended";

type CheckInFilter = "all" | "checked-in" | "not-checked-in";
type OfferTypeFilter = "all" | "one-time" | "ongoing";
type SortKey = "date" | "name" | "offer" | "status" | "checkIn";

type ChipTone = "neutral" | "green" | "orange" | "red" | "emerald" | "sky" | "amber";

const STATUS_FILTER_OPTIONS: Array<{ value: ParticipantStatusFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle", tone: "neutral" },
  { value: "active", label: "Aktiv", tone: "green" },
  { value: "trial", label: "Probestunde", tone: "amber" },
  { value: "paused", label: "Pausiert", tone: "orange" },
  { value: "ended", label: "Beendet/Gekündigt", tone: "red" },
];

const CHECK_IN_FILTER_OPTIONS: Array<{ value: CheckInFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle Check-ins", tone: "neutral" },
  { value: "checked-in", label: "Eingecheckt", tone: "emerald" },
  { value: "not-checked-in", label: "Nicht eingecheckt", tone: "amber" },
];

const OFFER_TYPE_FILTER_OPTIONS: Array<{ value: OfferTypeFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle Angebotsarten", tone: "neutral" },
  { value: "one-time", label: "einmaliges Angebot", tone: "sky" },
  { value: "ongoing", label: "laufendes Angebot", tone: "green" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getCardPresentation(item: ParticipantOverviewItem, checkedInAt: string | null): CardPresentation {
  const presentation = getParticipantStatusPresentation(item.status, checkedInAt);
  return {
    articleClassName: presentation.cardClassName,
    badge: {
      label: presentation.badgeLabel,
      className: presentation.badgeClassName,
    },
  };
}

function getCheckInStatusLabel(item: ParticipantOverviewItem, checkedInAt: string | null) {
  if (checkedInAt) return "Eingecheckt";
  if (!item.checkIn) return "Nicht eincheckbar";
  return "Nicht eingecheckt";
}

function getFilterChipClasses(tone: ChipTone, active: boolean) {
  if (tone === "green") {
    return active
      ? "border-green-600 bg-green-600 text-white"
      : "border-green-200 bg-green-50 text-green-800 hover:border-green-300";
  }
  if (tone === "orange") {
    return active
      ? "border-orange-500 bg-orange-500 text-white"
      : "border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300";
  }
  if (tone === "red") {
    return active
      ? "border-red-600 bg-red-600 text-white"
      : "border-red-200 bg-red-50 text-red-800 hover:border-red-300";
  }
  if (tone === "emerald") {
    return active
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300";
  }
  if (tone === "sky") {
    return active
      ? "border-sky-600 bg-sky-600 text-white"
      : "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300";
  }
  if (tone === "amber") {
    return active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300";
  }

  return active
    ? "border-slate-900 bg-slate-900 text-white"
    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300";
}

function FilterChip<T extends string>(props: {
  label: string;
  value: T;
  activeValue: T;
  tone: ChipTone;
  onSelect: (value: T) => void;
}) {
  const active = props.value === props.activeValue;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => props.onSelect(props.value)}
      className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition ${getFilterChipClasses(props.tone, active)}`}
    >
      {props.label}
    </button>
  );
}

function SortChip(props: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onToggle: () => void;
}) {
  return (
    <SortableTableHeader
      label={props.label}
      active={props.active}
      direction={props.direction}
      onToggle={props.onToggle}
      className={`min-h-10 justify-center rounded-full border px-4 py-2 text-sm normal-case tracking-normal ${
        props.active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
      }`}
    />
  );
}

function DetailField(props: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{props.label}</p>
      <div className="mt-1 min-w-0 text-sm font-medium text-slate-950">{props.value}</div>
    </div>
  );
}

export function ParticipantOverviewList(props: {
  items: ParticipantOverviewItem[];
  statusFilter: ParticipantStatusFilter;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ParticipantStatusFilter>(props.statusFilter);
  const [offerFilter, setOfferFilter] = useState("all");
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>("all");
  const [offerTypeFilter, setOfferTypeFilter] = useState<OfferTypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const checkedInById = useMemo(
    () => Object.fromEntries(props.items.map((item) => [item.id, item.checkIn?.checkedInAt ?? null])),
    [props.items]
  );

  const offerOptions = useMemo(
    () =>
      Array.from(new Set(props.items.map((item) => item.offerTitle).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "de", { sensitivity: "base" })
      ),
    [props.items]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const items = props.items.filter((item) => {
      const haystack = [item.displayName, item.email ?? "", item.offerTitle].join(" ").toLowerCase();
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
      if (offerFilter !== "all" && item.offerTitle !== offerFilter) return false;

      const checkedInAt = checkedInById[item.id] ?? null;
      if (checkInFilter === "checked-in" && !checkedInAt) return false;
      if (checkInFilter === "not-checked-in" && checkedInAt) return false;

      if (offerTypeFilter === "one-time" && item.offerKindLabel !== "einmaliges Angebot") return false;
      if (
        offerTypeFilter === "ongoing" &&
        item.offerKindLabel !== "laufendes Angebot"
      ) {
        return false;
      }

      if (statusFilter === "all") return true;
      if (statusFilter === "active") {
        if (item.status.kind === "registered") return (item.status.subscriptionStatus ?? "active") === "active";
        if (item.status.kind === "workshop") return item.status.bookingStatus === "paid";
        return item.status.kind === "trial" && item.status.decisionStatus === "approved";
      }
      if (statusFilter === "trial") {
        return item.sourceLabel === "Probeteilnahme";
      }
      if (statusFilter === "paused") {
        return (
          item.status.kind === "registered" &&
          ["paused", "pause_scheduled"].includes(item.status.subscriptionStatus ?? "")
        );
      }
      if (statusFilter === "ended") {
        if (item.status.kind === "trial") {
          return Boolean(item.status.cancelledAt) || item.status.decisionStatus === "rejected";
        }
        if (item.status.kind === "registered") {
          return ["cancel_scheduled", "cancelled", "inactive"].includes(item.status.subscriptionStatus ?? "");
        }
        return item.status.bookingStatus !== "paid";
      }
      return true;
    });

    const directionFactor = sortDirection === "asc" ? 1 : -1;

    items.sort((left, right) => {
      if (sortKey === "name") {
        return left.displayName.localeCompare(right.displayName, "de", { sensitivity: "base" }) * directionFactor;
      }

      if (sortKey === "status") {
        return (
          left.statusLabel.localeCompare(right.statusLabel, "de", { sensitivity: "base" }) * directionFactor ||
          right.sortDate.localeCompare(left.sortDate) * directionFactor
        );
      }

      if (sortKey === "checkIn") {
        const leftCheckedInAt = checkedInById[left.id] ?? "";
        const rightCheckedInAt = checkedInById[right.id] ?? "";
        const leftRank = leftCheckedInAt ? 0 : 1;
        const rightRank = rightCheckedInAt ? 0 : 1;
        if (leftRank !== rightRank) return (leftRank - rightRank) * directionFactor;
        return rightCheckedInAt.localeCompare(leftCheckedInAt) * directionFactor;
      }

      if (sortKey === "offer") {
        return (
          left.offerTitle.localeCompare(right.offerTitle, "de", { sensitivity: "base" }) * directionFactor ||
          left.displayName.localeCompare(right.displayName, "de", { sensitivity: "base" }) * directionFactor
        );
      }

      const leftPriority = left.highlight ? 0 : 1;
      const rightPriority = right.highlight ? 0 : 1;
      if (leftPriority !== rightPriority) return (leftPriority - rightPriority) * directionFactor;
      return right.sortDate.localeCompare(left.sortDate) * directionFactor;
    });

    return items;
  }, [
    checkInFilter,
    checkedInById,
    normalizedQuery,
    offerFilter,
    offerTypeFilter,
    props.items,
    sortDirection,
    sortKey,
    statusFilter,
  ]);

  const filterIsActive =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    offerFilter !== "all" ||
    checkInFilter !== "all" ||
    offerTypeFilter !== "all";
  const activeFilterCount = [
    normalizedQuery.length > 0,
    statusFilter !== "all",
    offerFilter !== "all",
    checkInFilter !== "all",
    offerTypeFilter !== "all",
  ].filter(Boolean).length;
  const sortingIsActive = sortKey !== "date" || sortDirection !== "desc";
  const filteredMailHref = buildMailtoHref({
    bcc: visibleItems.map((item) => item.email),
    subject: "Information für gefilterte Teilnehmende",
  });

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "date" ? "desc" : "asc");
  }

  return (
    <section className="space-y-5">
      <div className="space-y-4">
        <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-950">Filtern</h2>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                    {activeFilterCount} Filter aktiv
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Status, Angebot, Check-in und Angebotsart eingrenzen.</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:hidden">
              aufklappen
            </span>
            <span className="hidden shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:inline-flex">
              einklappen
            </span>
          </summary>

          <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Teilnahmestatus</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={statusFilter}
                    tone={option.tone}
                    onSelect={setStatusFilter}
                  />
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Angebot
                </span>
                <select
                  value={offerFilter}
                  onChange={(event) => setOfferFilter(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-900"
                >
                  <option value="all">Alle Angebote</option>
                  {offerOptions.map((offerTitle) => (
                    <option key={offerTitle} value={offerTitle}>
                      {offerTitle}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Suche
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, E-Mail oder Angebot"
                  className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 px-4 py-3"
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Check-in-Status</p>
              <div className="flex flex-wrap gap-2">
                {CHECK_IN_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={checkInFilter}
                    tone={option.tone}
                    onSelect={setCheckInFilter}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Angebotsart</p>
              <div className="flex flex-wrap gap-2">
                {OFFER_TYPE_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={offerTypeFilter}
                    tone={option.tone}
                    onSelect={setOfferTypeFilter}
                  />
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-950">Sortieren</h2>
                {sortingIsActive ? (
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                    Sortierung aktiv
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Reihenfolge der Teilnehmendenliste festlegen.</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:hidden">
              aufklappen
            </span>
            <span className="hidden shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:inline-flex">
              einklappen
            </span>
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              <SortChip
                label="Datum"
                active={sortKey === "date"}
                direction={sortDirection}
                onToggle={() => toggleSort("date")}
              />
              <SortChip
                label="Teilnehmer*in"
                active={sortKey === "name"}
                direction={sortDirection}
                onToggle={() => toggleSort("name")}
              />
              <SortChip
                label="Angebot"
                active={sortKey === "offer"}
                direction={sortDirection}
                onToggle={() => toggleSort("offer")}
              />
              <SortChip
                label="Status"
                active={sortKey === "status"}
                direction={sortDirection}
                onToggle={() => toggleSort("status")}
              />
              <SortChip
                label="Check-in"
                active={sortKey === "checkIn"}
                direction={sortDirection}
                onToggle={() => toggleSort("checkIn")}
              />
            </div>
          </div>
        </details>
      </div>

      {filterIsActive ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {visibleItems.length} gefilterte Teilnehmende, davon{" "}
            {visibleItems.filter((item) => item.email).length} mit E-Mail-Adresse.
          </p>
          {filteredMailHref ? (
            <a
              href={filteredMailHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Gefilterte Teilnehmende anschreiben
            </a>
          ) : (
            <span className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
              Keine E-Mail-Adressen in der Auswahl
            </span>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Teilnehmendenliste</h2>
        <span className="text-sm text-muted-foreground">{visibleItems.length} Einträge</span>
      </div>

      {visibleItems.length === 0 ? <DashboardEmptyState title="Keine passenden Teilnehmenden gefunden." /> : null}

      {visibleItems.map((item) => {
        const checkedInAt = checkedInById[item.id] ?? null;
        const presentation = getCardPresentation(item, checkedInAt);
        const checkInStatusLabel = getCheckInStatusLabel(item, checkedInAt);

        return (
          <Link
            key={item.id}
            href={item.detailHref}
            className={`block rounded-[24px] border p-4 transition hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 sm:p-5 ${presentation.articleClassName}`}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-lg font-semibold text-slate-950">{item.displayName}</h2>
                  {item.email ? <p className="truncate text-sm text-muted-foreground">{item.email}</p> : null}
                  <p className="text-sm text-muted-foreground">
                    {item.offerKindLabel} · {item.offerTitle}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${presentation.badge.className}`}
                >
                  {presentation.badge.label}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <DetailField label="Angebot" value={<span className="line-clamp-2">{item.offerTitle}</span>} />
                <DetailField label="Angebotsart" value={item.offerKindLabel} />
                <DetailField label="Angebotsstatus" value={item.statusLabel} />
                <DetailField label="Check-in-Status" value={checkInStatusLabel} />
                <DetailField label="Letzter Check-in" value={checkedInAt ? formatDateTime(checkedInAt) : "-"} />
              </div>

            </div>
          </Link>
        );
      })}
    </section>
  );
}
