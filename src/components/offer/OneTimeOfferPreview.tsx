import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import OfferSummaryCard from "./OfferSummaryCard";

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
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName?: string | null;
  instructorName?: string | null;
  providerLogoUrl?: string | null;
  providerPhotoUrl?: string | null;
  offerImageUrl?: string | null;
  priceCents: number | null;
  currency: string | null;
  sessions: PreviewSession[];
  startsAt?: string | null;
  endsAt?: string | null;
  previewMode?: boolean;
};

export default function OneTimeOfferPreview(props: OneTimeOfferPreviewProps) {
  const viewModel = buildOfferViewModel({
    course: {
      title: props.title,
      kind: "workshop",
      description: props.description,
      location: props.location,
      location_details: props.locationDetails,
      price_cents: props.priceCents,
      currency: props.currency,
      starts_at: props.startsAt,
      ends_at: props.endsAt,
      instructor_name: props.instructorName,
      offer_image_url: props.offerImageUrl,
    },
    providerProfile: {
      provider_type: props.providerType,
      organization_name: props.providerName,
      first_name: props.providerType === "studio_provider" ? null : props.providerName,
      last_name: null,
      company_logo_url: props.providerLogoUrl,
      photo_url: props.providerPhotoUrl,
    },
    sessions: props.sessions,
  });

  return (
    <OfferSummaryCard viewModel={viewModel} showDescription previewMode={props.previewMode}>
      <button
        type="button"
        disabled
        className="w-full rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
      >
        Jetzt reservieren
      </button>
    </OfferSummaryCard>
  );
}
