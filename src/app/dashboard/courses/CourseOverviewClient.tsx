"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildMailtoHref, normalizeEmailRecipients, shouldWarnAboutLargeMailingGroup } from "@/lib/mailto";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";

type CourseStatusFilter =
  | "all"
  | "active"
  | "draft"
  | "withdrawn"
  | "paused"
  | "ended"
  | "cancelled"
  | "archived";
type OfferTypeFilter = "all" | "one-time" | "ongoing";
type VisibilityFilter = "all" | "public" | "private_link";
type BookingFilter = "all" | "with-bookings" | "without-bookings" | "free-seats" | "sold-out";
type SortKey = "date" | "title" | "kind" | "status" | "freeSeats" | "bookings" | "created";
type ChipTone = "neutral" | "green" | "orange" | "red" | "sky" | "amber";

type CourseListState = {
  query: string;
  statusFilter: CourseStatusFilter;
  offerTypeFilter: OfferTypeFilter;
  visibilityFilter: VisibilityFilter;
  bookingFilter: BookingFilter;
  sortKey: SortKey;
  sortDirection: SortDirection;
};

export type CourseOverviewItem = {
  id: string;
  title: string;
  description: string | null;
  kind: "one-time" | "ongoing";
  kindLabel: string;
  statusLabel: string;
  normalizedStatus: "draft" | "active" | "pause_scheduled" | "paused" | "stop_scheduled" | "ended" | null;
  archived: boolean;
  imageUrl: string | null;
  priceLabel: string | null;
  visibility: "public" | "private_link";
  visibilityLabel: string;
  location: string | null;
  locationDetails: string | null;
  instructorName: string | null;
  capacity: number | null;
  occupiedSeats: number;
  freeSeats: number | null;
  workshopTiming: string | null;
  courseTiming: string | null;
  nextDateLabel: string | null;
  detailHref: string;
  recipientEmails: string[];
  sortTitle: string;
  sortStatus: string;
  sortKind: string;
  sortDate: number | null;
  sortPrice: number | null;
  sortSeats: number | null;
  sortBookings: number;
  sortCreatedAt: number | null;
};

const STATUS_FILTER_OPTIONS: Array<{ value: CourseStatusFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle", tone: "neutral" },
  { value: "active", label: "Veröffentlicht / Aktiv", tone: "green" },
  { value: "draft", label: "Entwurf", tone: "amber" },
  { value: "withdrawn", label: "Zurückgezogen", tone: "orange" },
  { value: "paused", label: "Pausiert", tone: "orange" },
  { value: "ended", label: "Beendet", tone: "red" },
  { value: "cancelled", label: "Storniert / Abgesagt", tone: "red" },
  { value: "archived", label: "Archiviert", tone: "red" },
];

const OFFER_TYPE_FILTER_OPTIONS: Array<{ value: OfferTypeFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle Angebotsarten", tone: "neutral" },
  { value: "one-time", label: "einmaliges Angebot", tone: "sky" },
  { value: "ongoing", label: "laufendes Angebot", tone: "green" },
];

const VISIBILITY_FILTER_OPTIONS: Array<{ value: VisibilityFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle", tone: "neutral" },
  { value: "public", label: "öffentlich sichtbar", tone: "green" },
  { value: "private_link", label: "nur per Link buchbar", tone: "sky" },
];

const BOOKING_FILTER_OPTIONS: Array<{ value: BookingFilter; label: string; tone: ChipTone }> = [
  { value: "all", label: "Alle Buchungsstände", tone: "neutral" },
  { value: "with-bookings", label: "mit Buchungen/Reservierungen", tone: "green" },
  { value: "without-bookings", label: "ohne Buchungen/Reservierungen", tone: "amber" },
  { value: "free-seats", label: "freie Plätze verfügbar", tone: "sky" },
  { value: "sold-out", label: "ausgebucht", tone: "red" },
];

function parseStatusFilter(value: string | null, fallback: CourseStatusFilter): CourseStatusFilter {
  if (
    value === "active" ||
    value === "draft" ||
    value === "withdrawn" ||
    value === "paused" ||
    value === "ended" ||
    value === "cancelled" ||
    value === "archived"
  ) {
    return value;
  }
  return fallback;
}

function parseOfferTypeFilter(value: string | null): OfferTypeFilter {
  if (value === "one_time" || value === "one-time") return "one-time";
  if (value === "ongoing") return "ongoing";
  return "all";
}

function parseVisibilityFilter(value: string | null): VisibilityFilter {
  if (value === "public" || value === "private_link") return value;
  return "all";
}

function parseBookingFilter(value: string | null): BookingFilter {
  if (value === "with_bookings" || value === "with-bookings") return "with-bookings";
  if (value === "without_bookings" || value === "without-bookings") return "without-bookings";
  if (value === "free_seats" || value === "free-seats") return "free-seats";
  if (value === "sold_out" || value === "sold-out") return "sold-out";
  return "all";
}

function parseSortKey(value: string | null): SortKey {
  if (value === "title" || value === "kind" || value === "status" || value === "date" || value === "created") return value;
  if (value === "free_seats" || value === "freeSeats") return "freeSeats";
  if (value === "bookings") return "bookings";
  return "date";
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

function mapLegacyViewToStatusFilter(value: string | null | undefined): CourseStatusFilter {
  if (value === "active") return "active";
  if (value === "drafts") return "draft";
  if (value === "archive") return "ended";
  return "all";
}

function getUrlState(searchParams: URLSearchParams, fallbackStatusFilter: CourseStatusFilter): CourseListState {
  return {
    query: searchParams.get("q") ?? "",
    statusFilter: searchParams.has("status")
      ? parseStatusFilter(searchParams.get("status"), fallbackStatusFilter)
      : fallbackStatusFilter,
    offerTypeFilter: parseOfferTypeFilter(searchParams.get("offerType")),
    visibilityFilter: parseVisibilityFilter(searchParams.get("visibility")),
    bookingFilter: parseBookingFilter(searchParams.get("booking")),
    sortKey: parseSortKey(searchParams.get("sort")),
    sortDirection: parseSortDirection(searchParams.get("direction")),
  };
}

function writeUrlState(searchParams: URLSearchParams, state: CourseListState) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("view");

  if (state.query.trim()) params.set("q", state.query.trim());
  else params.delete("q");

  if (state.statusFilter !== "all") params.set("status", state.statusFilter);
  else params.delete("status");

  if (state.offerTypeFilter === "one-time") params.set("offerType", "one_time");
  else if (state.offerTypeFilter === "ongoing") params.set("offerType", "ongoing");
  else params.delete("offerType");

  if (state.visibilityFilter !== "all") params.set("visibility", state.visibilityFilter);
  else params.delete("visibility");

  if (state.bookingFilter === "with-bookings") params.set("booking", "with_bookings");
  else if (state.bookingFilter === "without-bookings") params.set("booking", "without_bookings");
  else if (state.bookingFilter === "free-seats") params.set("booking", "free_seats");
  else if (state.bookingFilter === "sold-out") params.set("booking", "sold_out");
  else params.delete("booking");

  if (state.sortKey !== "date") params.set("sort", state.sortKey === "freeSeats" ? "free_seats" : state.sortKey);
  else params.delete("sort");

  if (state.sortDirection !== "asc") params.set("direction", state.sortDirection);
  else params.delete("direction");

  return params;
}

function buildHrefWithParam(href: string, key: string, value: string) {
  const [path, rawQuery = ""] = href.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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

function getStatusBadgeClassName(item: CourseOverviewItem) {
  if (item.archived) return "border-slate-200 bg-slate-100 text-slate-700";
  if (item.normalizedStatus === "draft" || item.normalizedStatus === "paused" || item.normalizedStatus === "pause_scheduled") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }
  if (item.normalizedStatus === "ended" || item.normalizedStatus === "stop_scheduled") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-green-200 bg-green-50 text-green-700";
}

function getCardClassName(item: CourseOverviewItem) {
  if (item.archived) return "border-slate-200 bg-slate-50/80 hover:border-slate-300";
  if (item.normalizedStatus === "draft" || item.normalizedStatus === "paused" || item.normalizedStatus === "pause_scheduled") {
    return "border-orange-200 bg-orange-50/35 hover:border-orange-300";
  }
  if (item.normalizedStatus === "ended" || item.normalizedStatus === "stop_scheduled") {
    return "border-red-200 bg-red-50/30 hover:border-red-300";
  }
  return "border-green-200 bg-green-50/25 hover:border-green-300";
}

function getStatusLabel(item: CourseOverviewItem) {
  return item.archived ? "Archiviert" : item.statusLabel;
}

function itemMatchesStatus(item: CourseOverviewItem, filter: CourseStatusFilter) {
  if (filter === "all") return true;
  if (filter === "archived") return item.archived;
  if (item.archived) return false;
  if (filter === "active") return item.normalizedStatus === "active";
  if (filter === "draft") return item.normalizedStatus === "draft";
  if (filter === "paused") return item.normalizedStatus === "paused" || item.normalizedStatus === "pause_scheduled";
  if (filter === "ended") return item.normalizedStatus === "ended" || item.normalizedStatus === "stop_scheduled";
  if (filter === "withdrawn") return item.kind === "one-time" && item.normalizedStatus === "draft";
  if (filter === "cancelled") return item.kind === "one-time" && item.normalizedStatus === "ended";
  return true;
}

export default function CourseOverviewClient(props: {
  items: CourseOverviewItem[];
  initialView?: "all" | "active" | "drafts" | "archive";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const fallbackStatusFilter = mapLegacyViewToStatusFilter(searchParams.get("view") ?? props.initialView);
  const initialState = useMemo(
    () => getUrlState(new URLSearchParams(searchParamString), fallbackStatusFilter),
    [fallbackStatusFilter, searchParamString]
  );
  const [query, setQuery] = useState(initialState.query);
  const [statusFilter, setStatusFilter] = useState<CourseStatusFilter>(initialState.statusFilter);
  const [offerTypeFilter, setOfferTypeFilter] = useState<OfferTypeFilter>(initialState.offerTypeFilter);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>(initialState.visibilityFilter);
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>(initialState.bookingFilter);
  const [sortKey, setSortKey] = useState<SortKey>(initialState.sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialState.sortDirection);

  useEffect(() => {
    setQuery(initialState.query);
    setStatusFilter(initialState.statusFilter);
    setOfferTypeFilter(initialState.offerTypeFilter);
    setVisibilityFilter(initialState.visibilityFilter);
    setBookingFilter(initialState.bookingFilter);
    setSortKey(initialState.sortKey);
    setSortDirection(initialState.sortDirection);
  }, [initialState]);

  function updateUrl(nextState: CourseListState) {
    const params = writeUrlState(new URLSearchParams(searchParamString), nextState);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function updateListState(next: Partial<CourseListState>) {
    const nextState: CourseListState = {
      query,
      statusFilter,
      offerTypeFilter,
      visibilityFilter,
      bookingFilter,
      sortKey,
      sortDirection,
      ...next,
    };

    if (next.query !== undefined) setQuery(next.query);
    if (next.statusFilter !== undefined) setStatusFilter(next.statusFilter);
    if (next.offerTypeFilter !== undefined) setOfferTypeFilter(next.offerTypeFilter);
    if (next.visibilityFilter !== undefined) setVisibilityFilter(next.visibilityFilter);
    if (next.bookingFilter !== undefined) setBookingFilter(next.bookingFilter);
    if (next.sortKey !== undefined) setSortKey(next.sortKey);
    if (next.sortDirection !== undefined) setSortDirection(next.sortDirection);

    updateUrl(nextState);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const items = props.items.filter((item) => {
      const haystack = [
        item.title,
        item.location ?? "",
        item.locationDetails ?? "",
        item.instructorName ?? "",
        item.description ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
      if (!itemMatchesStatus(item, statusFilter)) return false;
      if (offerTypeFilter !== "all" && item.kind !== offerTypeFilter) return false;
      if (visibilityFilter !== "all" && item.visibility !== visibilityFilter) return false;
      if (bookingFilter === "with-bookings" && item.occupiedSeats <= 0) return false;
      if (bookingFilter === "without-bookings" && item.occupiedSeats > 0) return false;
      if (bookingFilter === "free-seats" && (item.freeSeats === null || item.freeSeats <= 0)) return false;
      if (bookingFilter === "sold-out" && (item.capacity === null || item.freeSeats !== 0)) return false;
      return true;
    });

    const directionFactor = sortDirection === "asc" ? 1 : -1;
    items.sort((left, right) => {
      if (sortKey === "title") {
        return left.sortTitle.localeCompare(right.sortTitle, "de", { sensitivity: "base" }) * directionFactor;
      }
      if (sortKey === "kind") {
        return left.sortKind.localeCompare(right.sortKind, "de", { sensitivity: "base" }) * directionFactor;
      }
      if (sortKey === "status") {
        return left.sortStatus.localeCompare(right.sortStatus, "de", { sensitivity: "base" }) * directionFactor;
      }
      if (sortKey === "freeSeats") {
        return ((left.sortSeats ?? -1) - (right.sortSeats ?? -1)) * directionFactor;
      }
      if (sortKey === "bookings") {
        return (left.sortBookings - right.sortBookings) * directionFactor;
      }
      if (sortKey === "created") {
        return ((left.sortCreatedAt ?? 0) - (right.sortCreatedAt ?? 0)) * directionFactor;
      }
      return ((left.sortDate ?? Number.MAX_SAFE_INTEGER) - (right.sortDate ?? Number.MAX_SAFE_INTEGER)) * directionFactor;
    });
    return items;
  }, [
    bookingFilter,
    normalizedQuery,
    offerTypeFilter,
    props.items,
    sortDirection,
    sortKey,
    statusFilter,
    visibilityFilter,
  ]);

  const filterIsActive =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    offerTypeFilter !== "all" ||
    visibilityFilter !== "all" ||
    bookingFilter !== "all";
  const activeFilterCount = [
    normalizedQuery.length > 0,
    statusFilter !== "all",
    offerTypeFilter !== "all",
    visibilityFilter !== "all",
    bookingFilter !== "all",
  ].filter(Boolean).length;
  const sortingIsActive = sortKey !== "date" || sortDirection !== "asc";
  const filteredRecipients = normalizeEmailRecipients(visibleItems.flatMap((item) => item.recipientEmails));
  const filteredMailHref = buildMailtoHref({
    bcc: filteredRecipients,
    subject: "Information für gefilterte Angebote",
  });
  const showMailWarning = shouldWarnAboutLargeMailingGroup(filteredRecipients.length, filteredMailHref);
  const currentUrlState: CourseListState = {
    query,
    statusFilter,
    offerTypeFilter,
    visibilityFilter,
    bookingFilter,
    sortKey,
    sortDirection,
  };
  const currentListParams = writeUrlState(new URLSearchParams(searchParamString), currentUrlState).toString();
  const returnTo = currentListParams ? `${pathname}?${currentListParams}` : pathname;

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      updateListState({ sortDirection: sortDirection === "asc" ? "desc" : "asc" });
      return;
    }

    updateListState({
      sortKey: nextKey,
      sortDirection: nextKey === "date" || nextKey === "title" || nextKey === "kind" || nextKey === "status" ? "asc" : "desc",
    });
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
              <p className="mt-1 text-sm text-muted-foreground">Status, Angebotsart, Sichtbarkeit und Buchungsstand eingrenzen.</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:hidden">
              aufklappen
            </span>
            <span className="hidden shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 group-open:inline-flex">
              einklappen
            </span>
          </summary>

          <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
            <label className="grid min-w-0 gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Suche</span>
              <input
                value={query}
                onChange={(event) => updateListState({ query: event.target.value })}
                placeholder="Titel, Ort, Leitung oder Beschreibung"
                className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Angebotsstatus</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={statusFilter}
                    tone={option.tone}
                    onSelect={(value) => updateListState({ statusFilter: value })}
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
                    onSelect={(value) => updateListState({ offerTypeFilter: value })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sichtbarkeit</p>
              <div className="flex flex-wrap gap-2">
                {VISIBILITY_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={visibilityFilter}
                    tone={option.tone}
                    onSelect={(value) => updateListState({ visibilityFilter: value })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Buchungsstatus</p>
              <div className="flex flex-wrap gap-2">
                {BOOKING_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    activeValue={bookingFilter}
                    tone={option.tone}
                    onSelect={(value) => updateListState({ bookingFilter: value })}
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
              <p className="mt-1 text-sm text-muted-foreground">Reihenfolge der Angebotsliste festlegen.</p>
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
              <SortChip label="Datum" active={sortKey === "date"} direction={sortDirection} onToggle={() => toggleSort("date")} />
              <SortChip label="Titel" active={sortKey === "title"} direction={sortDirection} onToggle={() => toggleSort("title")} />
              <SortChip label="Angebotsart" active={sortKey === "kind"} direction={sortDirection} onToggle={() => toggleSort("kind")} />
              <SortChip label="Status" active={sortKey === "status"} direction={sortDirection} onToggle={() => toggleSort("status")} />
              <SortChip label="freie Plätze" active={sortKey === "freeSeats"} direction={sortDirection} onToggle={() => toggleSort("freeSeats")} />
              <SortChip label="Buchungen" active={sortKey === "bookings"} direction={sortDirection} onToggle={() => toggleSort("bookings")} />
              <SortChip label="Erstellt" active={sortKey === "created"} direction={sortDirection} onToggle={() => toggleSort("created")} />
            </div>
          </div>
        </details>
      </div>

      {filterIsActive ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {visibleItems.length} gefilterte Angebote, {filteredRecipients.length} eindeutige E-Mail-Adressen.
            </p>
            {showMailWarning ? (
              <p className="text-sm text-amber-700">
                Bei sehr großen Gruppen kann dein E-Mail-Programm die Empfängerliste möglicherweise nicht vollständig übernehmen.
              </p>
            ) : null}
          </div>
          {filteredMailHref ? (
            <a
              href={filteredMailHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Gefilterte Angebote anschreiben
            </a>
          ) : (
            <span className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
              Keine E-Mail-Adressen in der Auswahl
            </span>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Angebotsliste</h2>
        <span className="text-sm text-muted-foreground">{visibleItems.length} Einträge</span>
      </div>

      {visibleItems.length === 0 ? <DashboardEmptyState title="Keine passenden Angebote gefunden." /> : null}

      <div className="space-y-3">
        {visibleItems.map((item) => (
          <Link
            key={item.id}
            href={buildHrefWithParam(item.detailHref, "returnTo", returnTo)}
            className={`block rounded-[24px] border p-4 transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 sm:p-5 ${getCardClassName(item)}`}
          >
            <div className="space-y-4">
              <div className="flex gap-3 sm:gap-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-16 sm:w-16">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500">
                      {item.title.trim().slice(0, 1).toUpperCase() || "A"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-lg font-semibold text-slate-950">{item.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{item.kindLabel}</p>
                    </div>
                    <span className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClassName(item)}`}>
                      {getStatusLabel(item)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <DetailField label="Nächster Termin" value={item.nextDateLabel ?? "-"} />
                <DetailField
                  label="Ort"
                  value={
                    item.location || item.locationDetails ? (
                      <span className="line-clamp-2">{[item.location, item.locationDetails].filter(Boolean).join(", ")}</span>
                    ) : (
                      "-"
                    )
                  }
                />
                <DetailField
                  label="Plätze"
                  value={
                    <span className="grid gap-0.5">
                      <span>Gesamt: {item.capacity === null ? "Unbegrenzt" : item.capacity}</span>
                      <span>Gebucht: {item.occupiedSeats}</span>
                      <span>Frei: {item.freeSeats === null ? "-" : item.freeSeats}</span>
                    </span>
                  }
                />
                <DetailField label="Sichtbarkeit" value={item.visibilityLabel} />
                <DetailField label="Preis" value={item.priceLabel ?? "-"} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
