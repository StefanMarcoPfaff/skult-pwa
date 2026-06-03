import Image from "next/image";
import { formatCoursePriceFromRow } from "@/lib/course-display";
import { formatBerlinDateTimeRange } from "@/lib/formatting/berlin-time";
import FormattedOfferDescription from "./FormattedOfferDescription";

type PreviewSession = {
  id?: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type OneTimeOfferPreviewProps = {
  title: string;
  description: string | null;
  location: string | null;
  locationDetails?: string | null;
  offerImageUrl?: string | null;
  priceCents: number | null;
  currency: string | null;
  sessions: PreviewSession[];
  startsAt?: string | null;
  endsAt?: string | null;
  previewMode?: boolean;
};

function formatPrice(priceCents: number | null, currency: string | null): string {
  return (
    formatCoursePriceFromRow({
      kind: "workshop",
      priceType: null,
      priceCents,
      currency: currency ?? "EUR",
    }) ?? "Kostenlos"
  );
}

export default function OneTimeOfferPreview(props: OneTimeOfferPreviewProps) {
  const sessionLines =
    props.sessions.length > 0
      ? props.sessions.map((session) => formatBerlinDateTimeRange(session.starts_at, session.ends_at) ?? "Termindetails folgen")
      : [formatBerlinDateTimeRange(props.startsAt ?? null, props.endsAt ?? null) ?? "Termindetails folgen"];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {props.offerImageUrl ? (
        <Image
          src={props.offerImageUrl}
          alt={props.title}
          width={960}
          height={540}
          className="h-56 w-full object-cover"
        />
      ) : null}

      <div className="space-y-5 p-5">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Besucheransicht</p>
          <h2 className="text-2xl font-black text-slate-950">{props.title}</h2>
          {props.previewMode ? (
            <p className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
              Vorschau - noch nicht öffentlich buchbar
            </p>
          ) : null}
        </header>

        <FormattedOfferDescription text={props.description} className="space-y-4 text-sm leading-7 text-slate-700" />

        <dl className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {props.location ? (
            <div>
              <dt className="font-semibold text-slate-950">Ort</dt>
              <dd>{props.location}</dd>
              {props.locationDetails ? <dd className="text-slate-500">{props.locationDetails}</dd> : null}
            </div>
          ) : null}
          <div>
            <dt className="font-semibold text-slate-950">Preis</dt>
            <dd>{formatPrice(props.priceCents, props.currency)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-slate-950">Datum/Uhrzeit</dt>
            <dd className="space-y-1">
              {sessionLines.map((line, index) => (
                <p key={`${index}-${line}`}>{line}</p>
              ))}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
        >
          Jetzt reservieren
        </button>
      </div>
    </article>
  );
}
