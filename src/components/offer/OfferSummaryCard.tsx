import type { ReactNode } from "react";
import type { OfferViewModel } from "@/lib/offers/offer-view-model";
import FormattedOfferDescription from "./FormattedOfferDescription";

type OfferSummaryCardProps = {
  viewModel: OfferViewModel;
  compact?: boolean;
  showDescription?: boolean;
  showTicketInfo?: boolean;
  previewMode?: boolean;
  children?: ReactNode;
};

function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function SummaryRow(props: { label: string; value: ReactNode }) {
  if (!props.value) return null;
  return (
    <div>
      <dt className="font-semibold text-slate-950">{props.label}</dt>
      <dd className="mt-1 text-slate-700">{props.value}</dd>
    </div>
  );
}

export default function OfferSummaryCard(props: OfferSummaryCardProps) {
  const vm = props.viewModel;
  const providerImageUrl = vm.providerLogoUrl || vm.providerPhotoUrl;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {isHttpUrl(vm.offerImageUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vm.offerImageUrl} alt={vm.offerTitle} className={props.compact ? "h-36 w-full object-cover" : "h-56 w-full object-cover"} />
      ) : null}

      <div className={props.compact ? "space-y-4 p-4" : "space-y-5 p-5"}>
        <header className="space-y-3">
          {isHttpUrl(providerImageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={providerImageUrl}
              alt={vm.organizationLabel ?? vm.offerTitle}
              className="max-h-16 max-w-44 rounded-xl object-contain"
            />
          ) : null}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{vm.offerTypeLabel}</p>
            <h2 className={props.compact ? "text-xl font-black text-slate-950" : "text-2xl font-black text-slate-950"}>{vm.offerTitle}</h2>
            {props.previewMode ? (
              <p className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
                Vorschau - noch nicht öffentlich buchbar
              </p>
            ) : null}
          </div>
        </header>

        {props.showDescription ? (
          <FormattedOfferDescription text={vm.descriptionFormatted} className="space-y-4 text-sm leading-7 text-slate-700" />
        ) : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <SummaryRow label="Organisation / Anbietende" value={vm.organizationLabel} />
          <SummaryRow label="Leitung" value={vm.leaderName} />
          <SummaryRow
            label="Ort"
            value={
              vm.locationLabel ? (
                <>
                  {vm.locationLabel}
                  {vm.locationDetails ? <span className="block text-slate-500">{vm.locationDetails}</span> : null}
                </>
              ) : null
            }
          />
          <SummaryRow label="Preis" value={vm.priceLabel} />
          <SummaryRow
            label="Datum / Zeiten"
            value={
              <div className="space-y-1">
                {vm.sessions.map((session, index) => (
                  <p key={`${index}-${session.dateTimeLabel}`}>{session.dateTimeLabel}</p>
                ))}
              </div>
            }
          />
          {vm.showCancellationTerms ? (
            <SummaryRow label="Stornierungsbedingungen" value={vm.cancellationLabel} />
          ) : null}
        </dl>

        {props.showTicketInfo ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            Bitte zeige dieses Ticket beim Einlass vor.
          </p>
        ) : null}

        {props.children}
      </div>
    </article>
  );
}
