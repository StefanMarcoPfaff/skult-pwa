import type {
  DocumentType,
  FinancialDocumentMetadata,
  FinancialDocumentRecord,
} from "@/lib/documents/types";
import { RESER_COMPANY } from "@/lib/documents/pdf/constants";
import { createSimplePdfBuffer } from "@/lib/documents/pdf/pdf-primitives";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/platform-fees";

type PdfLine = Parameters<typeof createSimplePdfBuffer>[0][number];

type RenderPdfInput = {
  document: FinancialDocumentRecord;
  metadata: FinancialDocumentMetadata | null;
};

function formatMoney(amountCents: number, currency: string | null | undefined): string {
  const normalizedCurrency = currency?.trim().toUpperCase() || "EUR";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: normalizedCurrency,
  })
    .format((amountCents ?? 0) / 100)
    .replace("€", "EUR");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("de-DE", {
    dateStyle: "medium",
  });
}

function normalizeText(value: string | null | undefined, fallback = "-"): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function formatPercent(value: number | null | undefined): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_PLATFORM_FEE_PERCENT;
  return new Intl.NumberFormat("de-DE", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalized);
}

function platformFeeLabel(metadata: FinancialDocumentMetadata | null): string {
  const overrideLabel = metadata?.platformFeeOverrideApplied === true ? " individuell" : "";
  return `Plattformgebuehr (${formatPercent(metadata?.amounts.platformFeePercent)}${overrideLabel})`;
}

function buildPeriodLabel(document: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): string {
  const start = metadata?.period?.start ?? document.period_start;
  const end = metadata?.period?.end ?? document.period_end;

  if (start && end) {
    return `${formatDate(start)} bis ${formatDate(end)}`;
  }

  if (start) {
    return `Ab ${formatDate(start)}`;
  }

  return formatDate(document.issued_at ?? document.created_at);
}

function buildHeaderLines(title: string, subtitle: string): PdfLine[] {
  return [
    {
      text: RESER_COMPANY.brand,
      fontName: "F2",
      fontSize: 24,
      color: [0.06, 0.10, 0.20],
      leading: 30,
    },
    {
      text: title,
      fontName: "F2",
      fontSize: 18,
      color: [0.06, 0.10, 0.20],
      leading: 26,
    },
    {
      text: subtitle,
      fontSize: 10,
      color: [0.35, 0.39, 0.45],
      leading: 18,
    },
    { text: "", leading: 10 },
  ];
}

function buildKeyValueLines(sectionTitle: string, entries: Array<[string, string]>): PdfLine[] {
  const lines: PdfLine[] = [
    {
      text: sectionTitle,
      fontName: "F2",
      fontSize: 12,
      color: [0.09, 0.12, 0.18],
      leading: 18,
    },
  ];

  for (const [label, value] of entries) {
    lines.push({
      text: `${label}: ${value}`,
      fontSize: 10.5,
      color: [0.18, 0.20, 0.24],
      leading: 15,
    });
  }

  lines.push({ text: "", leading: 10 });
  return lines;
}

function buildFooterLines(metadata: FinancialDocumentMetadata | null): PdfLine[] {
  return [
    {
      text: "Hinweis",
      fontName: "F2",
      fontSize: 12,
      color: [0.09, 0.12, 0.18],
      leading: 18,
    },
    {
      text: normalizeText(metadata?.roleNotice, "Die Leistung wird durch Anbieter*in erbracht."),
      fontSize: 10.5,
      color: [0.18, 0.20, 0.24],
      leading: 15,
    },
    {
      text: normalizeText(metadata?.taxHint, "Steuerberechnung bleibt unveraendert; das Dokument spiegelt nur die vorhandenen Betraege."),
      fontSize: 10.5,
      color: [0.18, 0.20, 0.24],
      leading: 15,
    },
  ];
}

function renderPdf(lines: PdfLine[]): Buffer {
  return createSimplePdfBuffer(lines);
}

function buildCustomerReceiptLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;
  const customer = metadata?.customer;

  return [
    ...buildHeaderLines(
      "Kund*innen-Beleg",
      `Dokument-ID ${document.id} | Erstellt ${formatDate(document.issued_at ?? document.created_at)}`
    ),
    ...buildKeyValueLines("Leistungserbringer*in", [
      ["Name", normalizeText(provider?.documentRecipientName ?? provider?.providerDisplayName)],
      ["Adresse", normalizeText(provider?.billingAddressFormatted?.replace(/\n/g, ", "))],
      ["Land", normalizeText(provider?.billingCountry)],
      ["Steuernummer", normalizeText(provider?.taxNumber, "-")],
      ["USt-ID", normalizeText(provider?.vatId, "-")],
    ]),
    ...buildKeyValueLines("Kund*in", [
      ["Name", normalizeText(customer?.name)],
      ["E-Mail", normalizeText(customer?.email ?? document.customer_email)],
    ]),
    ...buildKeyValueLines("Leistungsdaten", [
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum / Datum", buildPeriodLabel(document, metadata)],
      ["Betrag", formatMoney(document.gross_amount_cents, document.currency)],
      ["Waehrung", normalizeText(document.currency, "EUR")],
      ["Dokumentnummer", normalizeText(document.document_number, "Noch nicht vergeben")],
    ]),
    ...buildFooterLines(metadata),
  ];
}

function buildProviderPayoutStatementLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;

  return [
    ...buildHeaderLines(
      "Dokumentation Anbieter*innen-Anteil",
      `Ausgestellt durch ${RESER_COMPANY.brand} | Erstellt ${formatDate(document.issued_at ?? document.created_at)}`
    ),
    ...buildKeyValueLines("Aussteller", [
      ["Plattform", RESER_COMPANY.brand],
      ["Rechtstraeger", RESER_COMPANY.legalName],
      ["Adresse", RESER_COMPANY.addressLines.join(", ")],
      ["Kontakt", RESER_COMPANY.email],
    ]),
    ...buildKeyValueLines("Empfaenger*in", [
      ["Name", normalizeText(provider?.documentRecipientName ?? provider?.providerDisplayName)],
      ["Adresse", normalizeText(provider?.billingAddressFormatted?.replace(/\n/g, ", "))],
    ]),
    ...buildKeyValueLines("Abrechnungsdaten", [
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum", buildPeriodLabel(document, metadata)],
      ["Brutto-Kundenzahlungen", formatMoney(document.gross_amount_cents, document.currency)],
      [platformFeeLabel(metadata), formatMoney(document.platform_fee_cents, document.currency)],
      ["Anbieter*innen-Anteil", formatMoney(document.provider_payout_cents, document.currency)],
      [
        "Hinweis",
        "Die Zahlungsabwicklung erfolgt ueber den eingebundenen Zahlungsdienstleister. RESER dokumentiert den Anbieter*innen-Anteil.",
      ],
      ["Dokumentnummer", normalizeText(document.document_number, "Noch nicht vergeben")],
    ]),
    ...buildFooterLines(metadata),
  ];
}

function buildProviderPlatformFeeInvoiceLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;

  return [
    ...buildHeaderLines(
      "Plattformgebuehren-Beleg",
      `Beleg ueber RESER-Plattformgebuehr | Erstellt ${formatDate(document.issued_at ?? document.created_at)}`
    ),
    ...buildKeyValueLines("Aussteller", [
      ["Plattform", RESER_COMPANY.brand],
      ["Rechtstraeger", RESER_COMPANY.legalName],
      ["Adresse", RESER_COMPANY.addressLines.join(", ")],
      ["Kontakt", RESER_COMPANY.email],
    ]),
    ...buildKeyValueLines("Empfaenger*in", [
      ["Name", normalizeText(provider?.documentRecipientName ?? provider?.providerDisplayName)],
      ["Adresse", normalizeText(provider?.billingAddressFormatted?.replace(/\n/g, ", "))],
    ]),
    ...buildKeyValueLines("Gebuehrendaten", [
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum", buildPeriodLabel(document, metadata)],
      ["Brutto-Kundenzahlungen", formatMoney(document.gross_amount_cents, document.currency)],
      [platformFeeLabel(metadata), formatMoney(document.platform_fee_cents, document.currency)],
      ["Hinweis", "Beleg ueber RESER-Plattformgebuehr"],
      ["Dokumentnummer", normalizeText(document.document_number, "Noch nicht vergeben")],
    ]),
    ...buildFooterLines(metadata),
  ];
}

function buildPlatformRevenueStatementLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;

  return [
    ...buildHeaderLines(
      "RESER-Provisionsabrechnung",
      `Interne Revenue-Sicht | Erstellt ${formatDate(document.issued_at ?? document.created_at)}`
    ),
    ...buildKeyValueLines("RESER intern", [
      ["Plattform", RESER_COMPANY.brand],
      ["Rechtstraeger", RESER_COMPANY.legalName],
      ["Kontakt", RESER_COMPANY.email],
    ]),
    ...buildKeyValueLines("Kontext", [
      ["Anbieter*in", normalizeText(provider?.providerDisplayName ?? provider?.documentRecipientName)],
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum", buildPeriodLabel(document, metadata)],
      ["Bruttoumsatz", formatMoney(document.gross_amount_cents, document.currency)],
      [
        `Plattform-Revenue brutto (${formatPercent(metadata?.amounts.platformFeePercent)}${metadata?.platformFeeOverrideApplied === true ? " individuell" : ""})`,
        formatMoney(document.platform_fee_cents, document.currency),
      ],
      ["Dokumentnummer", normalizeText(document.document_number, "Noch nicht vergeben")],
    ]),
    ...buildFooterLines(metadata),
  ];
}

function buildRefundReceiptLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  return [
    ...buildHeaderLines(
      "Rueckerstattungsbeleg",
      `Refund-Dokument | Erstellt ${formatDate(document.issued_at ?? document.created_at)}`
    ),
    ...buildKeyValueLines("Belegdaten", [
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum", buildPeriodLabel(document, metadata)],
      ["Kund*innen-Mail", normalizeText(metadata?.customer?.email ?? document.customer_email)],
      ["Rueckerstattungsbetrag", formatMoney(document.gross_amount_cents, document.currency)],
      ["Dokumentnummer", normalizeText(document.document_number, "Noch nicht vergeben")],
    ]),
    ...buildFooterLines(metadata),
  ];
}

export function renderCustomerReceiptPdf(input: RenderPdfInput): Buffer {
  return renderPdf(buildCustomerReceiptLines(input));
}

export function renderProviderPayoutStatementPdf(input: RenderPdfInput): Buffer {
  return renderPdf(buildProviderPayoutStatementLines(input));
}

export function renderProviderPlatformFeeInvoicePdf(input: RenderPdfInput): Buffer {
  return renderPdf(buildProviderPlatformFeeInvoiceLines(input));
}

export function renderPlatformRevenueStatementPdf(input: RenderPdfInput): Buffer {
  return renderPdf(buildPlatformRevenueStatementLines(input));
}

export function renderRefundReceiptPdf(input: RenderPdfInput): Buffer {
  return renderPdf(buildRefundReceiptLines(input));
}

export function renderFinancialDocumentPdfByType(input: RenderPdfInput): Buffer {
  const renderers: Record<DocumentType, (value: RenderPdfInput) => Buffer> = {
    customer_receipt: renderCustomerReceiptPdf,
    provider_payout_statement: renderProviderPayoutStatementPdf,
    provider_platform_fee_invoice: renderProviderPlatformFeeInvoicePdf,
    platform_revenue_statement: renderPlatformRevenueStatementPdf,
    refund_receipt: renderRefundReceiptPdf,
  };

  return renderers[input.document.document_type](input);
}
