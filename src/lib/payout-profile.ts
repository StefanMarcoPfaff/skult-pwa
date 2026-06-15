export const PROVIDER_PAYOUT_PROFILE_PROVIDER = "reser_payment_v2";

export const PROVIDER_PAYOUT_METHODS = ["iban"] as const;
export type ProviderPayoutMethod = (typeof PROVIDER_PAYOUT_METHODS)[number];

export function isProviderPayoutMethod(value: string | null | undefined): value is ProviderPayoutMethod {
  return value === "iban";
}

export function normalizeOptionalText(value: FormDataEntryValue | string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function normalizeIban(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized || null;
}

export function isValidIban(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value);
}

export function getIbanLast4(value: string | null | undefined): string | null {
  if (!value || value.length < 4) return null;
  return value.slice(-4);
}

export function maskIbanLast4(last4: string | null | undefined): string | null {
  if (!last4) return null;
  return `IBAN ****${last4}`;
}

export function normalizePaypalEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase() || null;
}

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const [localPart, domain] = value.split("@");
  if (!localPart || !domain) return value;
  const visibleLocal = localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  return `${visibleLocal}@${domain}`;
}
