import QRCode from "react-qr-code";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const DEFAULT_SITE_URL = "http://localhost:3000";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function buildTicketCheckInUrl(qrToken: string): string {
  const url = new URL("/dashboard/check-in", getSiteUrl());
  url.searchParams.set("token", qrToken);
  return url.toString();
}

export function buildTicketQrCodeDataUrl(qrToken: string): string {
  const svg = renderToStaticMarkup(
    createElement(QRCode, {
      value: buildTicketCheckInUrl(qrToken),
      size: 180,
      bgColor: "#ffffff",
      fgColor: "#111111",
      level: "M",
    })
  );

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
