import { formatCoursePriceFromRow } from "@/lib/course-display";
import { formatBerlinDate, formatBerlinDateTimeRange, formatBerlinTime } from "@/lib/formatting/berlin-time";
import { getWorkshopCancellationPolicySummary } from "@/lib/offer-policies";
import { getOfferKindLabel } from "@/lib/offer-ui";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import {
  formatWorkshopPriceLabel,
  resolveWorkshopProviderDisplay,
  shouldShowWorkshopCancellationPolicy,
} from "@/lib/workshop-offer-display";

export type OfferViewModelSession = {
  dateLabel: string;
  timeLabel: string;
  dateTimeLabel: string;
  startsAtBerlin: string | null;
  endsAtBerlin: string | null;
};

export type OfferViewModel = {
  offerTitle: string;
  offerTypeLabel: string;
  providerDisplayName: string | null;
  organizationLabel: string | null;
  leaderName: string | null;
  providerLogoUrl: string | null;
  providerPhotoUrl: string | null;
  offerImageUrl: string | null;
  locationLabel: string | null;
  locationDetails: string | null;
  priceLabel: string | null;
  isFree: boolean;
  cancellationLabel: string | null;
  showCancellationTerms: boolean;
  sessions: OfferViewModelSession[];
  descriptionFormatted: string | null;
  replyToEmail: string;
  calendarData: {
    startsAt: string | null;
    endsAt: string | null;
  };
};

export type OfferViewModelCourseInput = {
  title?: string | null;
  kind?: string | null;
  description?: string | null;
  location?: string | null;
  location_details?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  price_type?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  instructor_name?: string | null;
  workshop_storno_policy?: string | null;
  cancellation_model?: string | null;
  offer_image_url?: string | null;
};

export type OfferViewModelProfileInput = {
  first_name?: string | null;
  last_name?: string | null;
  provider_type?: ProviderType | null;
  organization_name?: string | null;
  photo_url?: string | null;
  company_logo_url?: string | null;
  email?: string | null;
};

export type OfferViewModelSessionInput = {
  starts_at?: string | null;
  ends_at?: string | null;
};

function isOneTimeOfferKind(kind: string | null | undefined): boolean {
  return kind === "workshop" || kind === "exclusive_offer";
}

function buildSessionViewModel(session: OfferViewModelSessionInput): OfferViewModelSession {
  const startsAt = session.starts_at ?? null;
  const endsAt = session.ends_at ?? null;
  const dateLabel = startsAt ? formatBerlinDate(startsAt) : "Termin folgt";
  const startTime = startsAt ? formatBerlinTime(startsAt) : null;
  const endTime = endsAt ? formatBerlinTime(endsAt) : null;
  const timeLabel = startTime && startTime !== "-" ? (endTime && endTime !== "-" ? `${startTime}-${endTime}` : startTime) : "Termin folgt";

  return {
    dateLabel,
    timeLabel,
    dateTimeLabel: formatBerlinDateTimeRange(startsAt, endsAt) ?? "Termin folgt",
    startsAtBerlin: startTime && startTime !== "-" ? startTime : null,
    endsAtBerlin: endTime && endTime !== "-" ? endTime : null,
  };
}

export function buildOfferViewModel(input: {
  course: OfferViewModelCourseInput;
  providerProfile?: OfferViewModelProfileInput | null;
  sessions?: OfferViewModelSessionInput[];
  paymentStatus?: "paid" | "free" | null;
  replyToEmail?: string | null;
}): OfferViewModel {
  const kind = input.course.kind ?? null;
  const isOneTime = isOneTimeOfferKind(kind);
  const providerProfile = input.providerProfile ?? null;
  const providerDisplayName = providerProfile?.provider_type
    ? getProviderDisplayName(providerProfile.provider_type, providerProfile)
    : [providerProfile?.first_name, providerProfile?.last_name].filter(Boolean).join(" ").trim() || null;
  const roleDisplay = resolveWorkshopProviderDisplay({
    providerType: providerProfile?.provider_type ?? null,
    providerName: providerDisplayName,
    instructorName: input.course.instructor_name ?? null,
    fallbackProviderName: providerDisplayName,
  });
  const priceCents = input.course.price_cents ?? null;
  const isFree = input.paymentStatus === "free" || priceCents === null || priceCents <= 0;
  const showCancellationTerms =
    isOneTime && shouldShowWorkshopCancellationPolicy(priceCents, input.paymentStatus);
  const sessions = (input.sessions && input.sessions.length > 0 ? input.sessions : [{ starts_at: input.course.starts_at, ends_at: input.course.ends_at }])
    .map(buildSessionViewModel);

  return {
    offerTitle: input.course.title?.trim() || "Angebot",
    offerTypeLabel: getOfferKindLabel(kind),
    providerDisplayName,
    organizationLabel: roleDisplay.organizationLabel,
    leaderName: roleDisplay.instructorLabel,
    providerLogoUrl: providerProfile?.company_logo_url ?? null,
    providerPhotoUrl: providerProfile?.photo_url ?? null,
    offerImageUrl: input.course.offer_image_url ?? null,
    locationLabel: input.course.location ?? null,
    locationDetails: input.course.location_details ?? null,
    priceLabel: isOneTime
      ? formatWorkshopPriceLabel(priceCents, input.course.currency ?? null, input.paymentStatus)
      : formatCoursePriceFromRow({
          kind,
          priceType: input.course.price_type ?? null,
          priceCents,
          currency: input.course.currency ?? "EUR",
        }),
    isFree,
    cancellationLabel: showCancellationTerms
      ? getWorkshopCancellationPolicySummary({ cancellation_policy: input.course.workshop_storno_policy ?? null })
      : null,
    showCancellationTerms,
    sessions,
    descriptionFormatted: input.course.description?.trim() || null,
    replyToEmail: input.replyToEmail?.trim() || providerProfile?.email?.trim() || "hello@getreser.app",
    calendarData: {
      startsAt: input.course.starts_at ?? input.sessions?.[0]?.starts_at ?? null,
      endsAt: input.course.ends_at ?? input.sessions?.[input.sessions.length - 1]?.ends_at ?? null,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderOfferSummaryEmailHtml(viewModel: OfferViewModel): string {
  const imageUrl = viewModel.providerLogoUrl || viewModel.providerPhotoUrl;
  const imageHtml = imageUrl
    ? `<div style="margin:0 0 16px;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(viewModel.organizationLabel ?? viewModel.offerTitle)}" style="max-height:72px;max-width:180px;width:auto;border-radius:10px;display:block;" /></div>`
    : "";
  const rows = [
    ["Angebot", viewModel.offerTitle],
    ["Art", viewModel.offerTypeLabel],
    ["Organisation / Anbietende", viewModel.organizationLabel],
    ["Leitung", viewModel.leaderName],
    ["Ort", viewModel.locationLabel],
    ["Ort / Zusatzinfo", viewModel.locationDetails],
    ["Datum / Zeiten", viewModel.sessions.map((session) => session.dateTimeLabel).join("<br />")],
    ["Preis", viewModel.priceLabel],
    viewModel.showCancellationTerms ? ["Stornierungsbedingungen", viewModel.cancellationLabel] : null,
  ].filter((row): row is [string, string] => Boolean(row?.[1]));

  return `
    <div style="margin:24px 0;padding:18px 20px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;">
      ${imageHtml}
      ${rows
        .map(
          ([label, value]) => `
            <div style="margin:0 0 14px;">
              <div style="font-size:12px;line-height:1.35;color:#5b6470;font-weight:700;">${escapeHtml(label)}</div>
              <div style="margin-top:3px;color:#111827;">${value.includes("<br />") ? value : escapeHtml(value)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
