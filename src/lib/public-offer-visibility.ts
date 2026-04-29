type PublicOfferVisibilityInput = {
  kind: string | null | undefined;
  status?: string | null;
  isPublished?: boolean | null;
  startsAt?: string | null;
  endsAt?: string | null;
  now?: number;
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isPubliclyVisibleOffer(input: PublicOfferVisibilityInput): boolean {
  if (input.isPublished === false) return false;

  const kind = (input.kind ?? "").toLowerCase();
  const status = (input.status ?? "").toLowerCase();
  const now = input.now ?? Date.now();
  const startsAt = parseTimestamp(input.startsAt);
  const endsAt = parseTimestamp(input.endsAt);

  if (status === "draft" || status === "paused" || status === "ended") {
    return false;
  }

  if (kind === "workshop") {
    return startsAt !== null && startsAt >= now;
  }

  if (kind === "course") {
    if (startsAt === null) return false;
    if (endsAt === null) return true;
    return endsAt >= now;
  }

  return false;
}
