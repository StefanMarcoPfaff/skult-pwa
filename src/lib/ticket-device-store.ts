export const TICKET_QR_TOKEN_STORAGE_KEY = "skult_ticket_qr_tokens";

export function readStoredTicketQrTokens(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(TICKET_QR_TOKEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function storeTicketQrToken(qrToken: string): void {
  const trimmed = qrToken.trim();
  if (!trimmed || typeof window === "undefined") return;

  const existing = readStoredTicketQrTokens();
  if (existing.includes(trimmed)) return;

  window.localStorage.setItem(TICKET_QR_TOKEN_STORAGE_KEY, JSON.stringify([trimmed, ...existing].slice(0, 20)));
}
