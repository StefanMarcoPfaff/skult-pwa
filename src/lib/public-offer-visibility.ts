type PublicOfferVisibilityInput = {
  kind: string | null | undefined;
  status?: string | null;
  isPublished?: boolean | null;
  visibility?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  now?: number;
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeOfferVisibility(value: string | null | undefined): "public" | "private_link" {
  return String(value ?? "").toLowerCase() === "private_link" ? "private_link" : "public";
}

export function isDirectlyAccessibleOffer(input: PublicOfferVisibilityInput): boolean {
  if (input.isPublished === false) return false;

  const kind = (input.kind ?? "").toLowerCase();
  const status = (input.status ?? "").toLowerCase();
  const now = input.now ?? Date.now();
  const startsAt = parseTimestamp(input.startsAt);
  const endsAt = parseTimestamp(input.endsAt);

  if (status && status !== "active") {
    return false;
  }

  if (kind === "workshop" || kind === "exclusive_offer") {
    return startsAt !== null && startsAt >= now;
  }

  if (kind === "course") {
    if (startsAt === null) return false;
    if (endsAt === null) return true;
    return endsAt >= now;
  }

  return false;
}

export function isPubliclyVisibleOffer(input: PublicOfferVisibilityInput): boolean {
  return normalizeOfferVisibility(input.visibility) === "public" && isDirectlyAccessibleOffer(input);
}
