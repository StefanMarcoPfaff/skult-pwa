"use client";

import { useMemo, useState } from "react";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";
import { OfferCard, type OfferCardProps } from "./OfferCard";

type SortKey = "title" | "date" | "status" | "price";

export type CourseOverviewItem = OfferCardProps & {
  sortTitle: string;
  sortStatus: string;
  sortDate: number | null;
  sortPrice: number | null;
};

export default function CourseOverviewClient(props: { items: CourseOverviewItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedItems = useMemo(() => {
    const items = [...props.items];
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    items.sort((left, right) => {
      if (sortKey === "title") {
        return left.sortTitle.localeCompare(right.sortTitle, "de", { sensitivity: "base" }) * directionFactor;
      }

      if (sortKey === "status") {
        return left.sortStatus.localeCompare(right.sortStatus, "de", { sensitivity: "base" }) * directionFactor;
      }

      if (sortKey === "price") {
        return ((left.sortPrice ?? -1) - (right.sortPrice ?? -1)) * directionFactor;
      }

      return ((left.sortDate ?? Number.MAX_SAFE_INTEGER) - (right.sortDate ?? Number.MAX_SAFE_INTEGER)) * directionFactor;
    });

    return items;
  }, [props.items, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "title" || nextKey === "status" ? "asc" : "desc");
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Übersicht</h2>
            <p className="mt-1 text-sm text-slate-600">{sortedItems.length} Angebote</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SortableTableHeader
              label="Titel"
              active={sortKey === "title"}
              direction={sortDirection}
              onToggle={() => toggleSort("title")}
            />
            <SortableTableHeader
              label="Datum / nächster Termin"
              active={sortKey === "date"}
              direction={sortDirection}
              onToggle={() => toggleSort("date")}
            />
            <SortableTableHeader
              label="Status"
              active={sortKey === "status"}
              direction={sortDirection}
              onToggle={() => toggleSort("status")}
            />
            <SortableTableHeader
              label="Preis"
              active={sortKey === "price"}
              direction={sortDirection}
              onToggle={() => toggleSort("price")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedItems.map((item) => (
          <OfferCard key={item.id} {...item} />
        ))}
      </div>
    </section>
  );
}
