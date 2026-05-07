export function getOfferKindLabel(kind: string | null): string {
  const normalized = String(kind ?? "").toLowerCase();
  if (normalized === "exclusive_offer") return "Exklusiv-Angebot";
  if (normalized === "workshop") return "einmaliges Angebot";
  return "laufendes Angebot";
}

export function getOfferCollectionLabel(): string {
  return "Angebote";
}

export function getOfferVisibilityLabel(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase() === "private_link" ? "Nur per Link sichtbar" : "Öffentlich sichtbar";
}
