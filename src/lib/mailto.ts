const LARGE_MAILTO_RECIPIENT_COUNT = 40;
const LARGE_MAILTO_HREF_LENGTH = 1800;

function normalizeEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function normalizeEmailRecipients(emails: Array<string | null | undefined>): string[] {
  const unique = new Map<string, string>();
  for (const email of emails) {
    if (typeof email !== "string") continue;
    const normalized = normalizeEmail(email);
    if (!normalized || unique.has(normalized)) continue;
    unique.set(normalized, normalized);
  }
  return Array.from(unique.values());
}

type MailtoLinkOptions = {
  to?: Array<string | null | undefined>;
  bcc?: Array<string | null | undefined>;
  subject?: string | null;
};

export function buildMailtoHref(options: MailtoLinkOptions): string | null {
  const to = normalizeEmailRecipients(options.to ?? []);
  const bcc = normalizeEmailRecipients(options.bcc ?? []);

  if (to.length === 0 && bcc.length === 0) return null;

  const params: string[] = [];
  if (options.subject?.trim()) {
    params.push(`subject=${encodeURIComponent(options.subject.trim())}`);
  }
  if (bcc.length > 0) {
    params.push(`bcc=${encodeURIComponent(bcc.join(","))}`);
  }

  const toSegment = to.map((email) => encodeURIComponent(email)).join(",");
  return `mailto:${toSegment}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}

export function shouldWarnAboutLargeMailingGroup(recipientCount: number, href: string | null): boolean {
  if (recipientCount >= LARGE_MAILTO_RECIPIENT_COUNT) return true;
  return Boolean(href && href.length >= LARGE_MAILTO_HREF_LENGTH);
}

export function buildOfferMailSubject(kind: string | null, title: string | null): string {
  const normalized = String(kind ?? "").toLowerCase();
  const kindLabel =
    normalized === "exclusive_offer"
      ? "Exklusiv-Angebot"
      : normalized === "workshop"
        ? "einmaliges Angebot"
        : "laufendes Angebot";
  return `Information zu deinem ${kindLabel}: ${title?.trim() || kindLabel}`;
}

export function buildParticipantMailSubject(offerTitle: string | null): string {
  return `Information zu deiner Buchung: ${offerTitle?.trim() || "Angebot"}`;
}
