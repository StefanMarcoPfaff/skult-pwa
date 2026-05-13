import "server-only";

export function parsePaymentsV2AdminEmails(): string[] {
  return (process.env.PAYMENTS_V2_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function canAccessPaymentsV2Audit(userEmail: string | null | undefined): boolean {
  const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
  const configuredEmails = parsePaymentsV2AdminEmails();

  if (configuredEmails.length > 0) {
    return configuredEmails.includes(normalizedEmail);
  }

  return process.env.NODE_ENV !== "production";
}
