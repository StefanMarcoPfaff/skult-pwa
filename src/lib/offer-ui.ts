export function isOneTimeOfferKind(kind: string | null | undefined): boolean {
  const normalized = String(kind ?? "").toLowerCase();
  return normalized === "workshop" || normalized === "exclusive_offer";
}

export function getOfferKindLabel(kind: string | null): string {
  if (isOneTimeOfferKind(kind)) return "einmaliges Angebot";
  return "laufendes Angebot";
}

export function getOfferCollectionLabel(): string {
  return "Angebote";
}

export function getOfferVisibilityLabel(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase() === "private_link" ? "Nur per Link buchbar" : "Öffentlich sichtbar";
}
