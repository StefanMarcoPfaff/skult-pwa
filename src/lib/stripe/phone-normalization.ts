function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeGermanPhoneForStripe(value: string | null | undefined): string | undefined {
  const raw = optionalText(value);
  if (!raw) return undefined;

  const compact = raw.replace(/[\s\-\/().]/g, "");
  const normalizedPrefix = compact.startsWith("0049")
    ? `+49${compact.slice(4)}`
    : compact.startsWith("+49")
      ? compact
      : compact.startsWith("0")
        ? `+49${compact.slice(1)}`
        : compact;

  if (!/^\+49[1-9]\d{5,14}$/.test(normalizedPrefix)) return undefined;
  return normalizedPrefix;
}
