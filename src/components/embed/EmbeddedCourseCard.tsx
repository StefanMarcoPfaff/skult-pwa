import Image from "next/image";
import Link from "next/link";
import { formatCoursePriceFromRow } from "@/lib/course-display";
import type { PublicOfferDetails } from "@/lib/public-offers";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const weekdayLabels: Record<number, string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

function recurrenceLabel(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "weekly") return "wöchentlich";
  if (normalized === "biweekly") return "14-tägig";
  if (normalized === "monthly") return "monatlich";
  return value;
}

function formatWorkshopDateTime(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null;

  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) return null;

  const date = startDate.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!endsAt) return `${date} · ${startTime}`;

  const endDate = new Date(endsAt);
  if (Number.isNaN(endDate.getTime())) return `${date} · ${startTime}`;

  const endTime = endDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${startTime}-${endTime}`;
}

function formatCourseDateTime(offer: Record<string, unknown>): string | null {
  const weekday = asNumber(offer.weekday);
  const startTime = asString(offer.start_time);
  const recurrence = recurrenceLabel(asString(offer.recurrence_type));
  const weekdayLabel = weekday !== null ? weekdayLabels[weekday] ?? null : null;
  const parts = [weekdayLabel, startTime, recurrence].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function getTeaserText(offer: Record<string, unknown>): string | null {
  return asString(offer.subtitle) ?? asString(offer.description);
}

function getPriceLabel(offer: Record<string, unknown>): string | null {
  return formatCoursePriceFromRow({
    kind: asString(offer.offer_type) ?? asString(offer.kind),
    priceType: asString(offer.price_type),
    priceCents: asNumber(offer.price_cents),
    currency: asString(offer.currency) ?? "EUR",
  });
}

export function EmbeddedCourseCard({
  courseId,
  details,
}: {
  courseId: string;
  details: PublicOfferDetails;
}) {
  const title = asString(details.offer.title) ?? "Ohne Titel";
  const location = asString(details.offer.location);
  const teaser = getTeaserText(details.offer);
  const price = getPriceLabel(details.offer);
  const dateTime =
    details.kind === "course"
      ? formatCourseDateTime(details.offer)
      : formatWorkshopDateTime(asString(details.offer.starts_at), asString(details.offer.ends_at));
  const providerName = details.providerLabel ?? details.profileHeading ?? "RESER";

  return (
    <article className="w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.45)]">
      <div className="bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_42%,#ecfeff_100%)] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {details.kind === "course" ? "Kurs" : "Workshop"}
            </p>
            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-[2rem]">
                {title}
              </h1>
              <p className="text-sm text-slate-600">{providerName}</p>
            </div>
          </div>

          {details.profilePhotoUrl ? (
            <Image
              src={details.profilePhotoUrl}
              alt={providerName}
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl border border-white/80 object-cover shadow-sm"
            />
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {location ? (
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ort</p>
              <p className="mt-1 font-medium text-slate-900">{location}</p>
            </div>
          ) : null}
          {dateTime ? (
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Datum & Zeit</p>
              <p className="mt-1 font-medium text-slate-900">{dateTime}</p>
            </div>
          ) : null}
          {price ? (
            <div className="rounded-2xl bg-white/80 px-4 py-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Preis</p>
              <p className="mt-1 font-medium text-slate-900">{price}</p>
            </div>
          ) : null}
        </div>

        {teaser ? (
          <p className="mt-6 line-clamp-4 text-sm leading-6 text-slate-600">
            {teaser}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-5">
          <p className="text-xs text-slate-500">Buchung über RESER</p>
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Jetzt buchen
          </Link>
        </div>
      </div>
    </article>
  );
}
