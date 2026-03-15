import QRCode from "qrcode";

const DEFAULT_SITE_URL = "http://localhost:3000";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function buildTicketCheckInUrl(qrToken: string): string {
  const url = new URL("/dashboard/check-in", getSiteUrl());
  url.searchParams.set("token", qrToken);
  return url.toString();
}

export async function buildTicketQrCodeDataUrl(qrToken: string): Promise<string> {
  return QRCode.toDataURL(buildTicketCheckInUrl(qrToken), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    type: "image/png",
  });
}
