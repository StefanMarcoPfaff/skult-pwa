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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
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
  const start = metadata?.period?.start ?? document.period_start ?? metadata?.offer?.startsAt;
  const end = metadata?.period?.end ?? document.period_end ?? metadata?.offer?.endsAt;

  if (start && end) {
    return `${formatDate(start)} bis ${formatDate(end)}`;
  }

  if (start) {
    return `Ab ${formatDate(start)}`;
  }

  return formatDate(document.issued_at ?? document.created_at);
}

function formatOfferKind(kind: string | null | undefined): string {
  switch (kind) {
    case "workshop":
      return "Workshop";
    case "exclusive_offer":
      return "Einmaliges Angebot";
    case "course":
      return "Kurs";
    default:
      return normalizeText(kind, "Angebot");
  }
}

function taxStatusLabel(value: string | null | undefined): string | null {
  switch (value) {
    case "small_business":
      return "Kleinunternehmerregelung im Anbieterprofil hinterlegt.";
    case "vat_registered":
      return "Umsatzsteuerlich registriertes Anbieterprofil hinterlegt.";
    case "tax_exempt":
      return "Steuerbefreiung im Anbieterprofil hinterlegt.";
    default:
      return null;
  }
}

function taxAmountLabel(document: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): string {
  const taxAmount = document.tax_amount_cents ?? metadata?.amounts.taxAmountCents ?? null;
  return typeof taxAmount === "number" ? formatMoney(taxAmount, document.currency) : "Nicht separat ausgewiesen";
}

function taxRateLabel(metadata: FinancialDocumentMetadata | null): string {
  return metadata?.amounts.taxAmountCents === null || typeof metadata?.amounts.taxAmountCents === "undefined"
    ? "Nicht separat ausgewiesen"
    : "Siehe Belegdaten";
}

function netAmountLabel(document: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): string {
  const taxAmount = document.tax_amount_cents ?? metadata?.amounts.taxAmountCents ?? null;
  if (typeof taxAmount === "number") {
    return formatMoney(Math.max(0, document.gross_amount_cents - taxAmount), document.currency);
  }

  return "Nicht separat ausgewiesen";
}

function buildTaxLines(
  document: FinancialDocumentRecord,
  metadata: FinancialDocumentMetadata | null,
  baseAmountCents = document.gross_amount_cents
): Array<[string, string]> {
  return [
    ["Bruttobetrag", formatMoney(baseAmountCents, document.currency)],
    ["Nettobetrag", netAmountLabel(document, metadata)],
    ["Umsatzsteuerbetrag", taxAmountLabel(document, metadata)],
    ["Steuersatz", taxRateLabel(metadata)],
  ];
}

function buildOfferEntries(document: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): Array<[string, string]> {
  return [
    ["Angebot", normalizeText(metadata?.offer?.title)],
    ["Angebotsart", formatOfferKind(metadata?.offer?.kind)],
    ["Leistungsdatum / Zeitraum", buildPeriodLabel(document, metadata)],
    ["Ort", normalizeText([metadata?.offer?.location, metadata?.offer?.locationDetails].filter(Boolean).join(", "), "-")],
  ];
}

function buildPaymentEntries(document: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): Array<[string, string]> {
  return [
    ["Buchungsdatum", formatDateTime(metadata?.source?.bookingCreatedAt ?? metadata?.payment?.createdAt)],
    ["Zahlungsdatum", formatDateTime(metadata?.payment?.paidAt ?? document.issued_at)],
    ["Zahlungsart", normalizeText(metadata?.payment?.provider, "Stripe/Payment Provider")],
    ["Payment-Transaction-ID", normalizeText(metadata?.payment?.paymentTransactionId ?? metadata?.source?.paymentTransactionId)],
    ["Stripe Payment Intent", normalizeText(metadata?.payment?.stripePaymentIntentId ?? metadata?.payment?.providerPaymentId)],
    ["Stripe Charge", normalizeText(metadata?.payment?.stripeChargeId)],
    ["Checkout Session", normalizeText(metadata?.payment?.providerCheckoutId)],
  ];
}

function buildDocumentEntries(document: FinancialDocumentRecord): Array<[string, string]> {
  return [
    ["Dokumentnummer", normalizeText(document.document_number, "Systemnummer noch nicht vergeben")],
    ["Ausstellungsdatum", formatDate(document.issued_at ?? document.created_at)],
    ["Dokument-ID", document.id],
    ["Erstellt am", formatDateTime(document.created_at)],
  ];
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
      text: normalizeText(metadata?.roleNotice, "Die Leistung wird durch Anbietende erbracht."),
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

function buildDocumentFooterLines(document: FinancialDocumentRecord): PdfLine[] {
  return buildKeyValueLines("Dokument", buildDocumentEntries(document));
}

function renderPdf(lines: PdfLine[]): Buffer {
  return createSimplePdfBuffer(lines);
}

function buildCustomerReceiptLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;
  const customer = metadata?.customer;
  const providerTaxStatus = taxStatusLabel(provider?.vatStatus);

  return [
    ...buildHeaderLines(
      "Beleg fuer gebuchtes Angebot",
      `Rechnungs-/Abrechnungsbeleg fuer deine Unterlagen | ${normalizeText(document.document_number, document.id)}`
    ),
    ...buildKeyValueLines("Aussteller / Leistungserbringer", [
      ["Name", normalizeText(provider?.documentRecipientName ?? provider?.providerDisplayName)],
      ["Adresse", normalizeText(provider?.billingAddressFormatted?.replace(/\n/g, ", "))],
      ["Land", normalizeText(provider?.billingCountry)],
      ["Steuernummer", normalizeText(provider?.taxNumber, "-")],
      ["USt-ID", normalizeText(provider?.vatId, "-")],
      ["Steuerstatus", normalizeText(providerTaxStatus, "-")],
    ]),
    ...buildKeyValueLines("Empfaenger*in", [
      ["Name", normalizeText(customer?.name)],
      ["E-Mail", normalizeText(customer?.email ?? document.customer_email)],
      ["Adresse", "-"],
    ]),
    ...buildKeyValueLines("Leistung", buildOfferEntries(document, metadata)),
    ...buildKeyValueLines("Zahlung", buildPaymentEntries(document, metadata)),
    ...buildKeyValueLines("Betrag / Steuer", [
      ...buildTaxLines(document, metadata),
      ["Hinweis", "Die Zahlung wurde ueber RESER abgewickelt."],
    ]),
    ...buildFooterLines(metadata),
    ...buildDocumentFooterLines(document),
  ];
}

function buildProviderPayoutStatementLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;
  const providerTaxStatus = taxStatusLabel(provider?.vatStatus);

  return [
    ...buildHeaderLines(
      "Abrechnungsbeleg fuer Anbietende",
      `Gutschrift-/Abrechnungsbeleg ueber vermittelte Zahlung | ${normalizeText(document.document_number, document.id)}`
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
      ["Steuernummer", normalizeText(provider?.taxNumber, "-")],
      ["USt-ID", normalizeText(provider?.vatId, "-")],
      ["Steuerstatus", normalizeText(providerTaxStatus, "-")],
    ]),
    ...buildKeyValueLines("Leistung", buildOfferEntries(document, metadata)),
    ...buildKeyValueLines("Zahlung", buildPaymentEntries(document, metadata)),
    ...buildKeyValueLines("Abrechnungsdaten", [
      ["Zahlungen von Teilnehmenden", formatMoney(document.gross_amount_cents, document.currency)],
      [platformFeeLabel(metadata), formatMoney(document.platform_fee_cents, document.currency)],
      ["Anteil fuer Anbietende", formatMoney(document.provider_payout_cents, document.currency)],
      [
        "Hinweis",
        "Die Zahlungsabwicklung erfolgt ueber den eingebundenen Zahlungsdienstleister. RESER stellt die Buchungs- und Abrechnungsdokumentation bereit.",
      ],
    ]),
    ...buildKeyValueLines("Betrag / Steuer", buildTaxLines(document, metadata)),
    ...buildFooterLines(metadata),
    ...buildDocumentFooterLines(document),
  ];
}

function buildProviderPlatformFeeInvoiceLines(input: RenderPdfInput): PdfLine[] {
  const { document, metadata } = input;
  const provider = metadata?.providerBillingProfile;

  return [
    ...buildHeaderLines(
      "Plattformgebuehren-Beleg",
      `Beleg ueber RESER-Plattform-/Vermittlungsgebuehr | ${normalizeText(document.document_number, document.id)}`
    ),
    ...buildKeyValueLines("Aussteller", [
      ["Plattform", RESER_COMPANY.brand],
      ["Rechtstraeger", RESER_COMPANY.legalName],
      ["Adresse", RESER_COMPANY.addressLines.join(", ")],
      ["Kontakt", RESER_COMPANY.email],
      ["Steuernummer", normalizeText(RESER_COMPANY.taxNumber, "-")],
      ["USt-ID", normalizeText(RESER_COMPANY.vatId, "-")],
    ]),
    ...buildKeyValueLines("Empfaenger*in", [
      ["Name", normalizeText(provider?.documentRecipientName ?? provider?.providerDisplayName)],
      ["Adresse", normalizeText(provider?.billingAddressFormatted?.replace(/\n/g, ", "))],
      ["Steuernummer", normalizeText(provider?.taxNumber, "-")],
      ["USt-ID", normalizeText(provider?.vatId, "-")],
    ]),
    ...buildKeyValueLines("Leistung", [
      ["Beschreibung", "Plattform- und Vermittlungsgebuehr fuer Buchung/Angebot"],
      ...buildOfferEntries(document, metadata),
    ]),
    ...buildKeyValueLines("Zahlung", buildPaymentEntries(document, metadata)),
    ...buildKeyValueLines("Gebuehrendaten", [
      ["Zahlungen von Teilnehmenden", formatMoney(document.gross_amount_cents, document.currency)],
      [platformFeeLabel(metadata), formatMoney(document.platform_fee_cents, document.currency)],
      ["Hinweis", "Die Zahlung wurde ueber RESER abgewickelt."],
    ]),
    ...buildKeyValueLines("Betrag / Steuer", buildTaxLines(document, metadata, document.platform_fee_cents)),
    ...buildFooterLines(metadata),
    ...buildDocumentFooterLines(document),
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
      ["Anbietende", normalizeText(provider?.providerDisplayName ?? provider?.documentRecipientName)],
      ["Angebot", normalizeText(metadata?.offer?.title)],
      ["Zeitraum", buildPeriodLabel(document, metadata)],
      ["Payment-Transaction-ID", normalizeText(metadata?.payment?.paymentTransactionId ?? metadata?.source?.paymentTransactionId)],
      ["Bruttoumsatz", formatMoney(document.gross_amount_cents, document.currency)],
      [
        `Plattform-Revenue brutto (${formatPercent(metadata?.amounts.platformFeePercent)}${metadata?.platformFeeOverrideApplied === true ? " individuell" : ""})`,
        formatMoney(document.platform_fee_cents, document.currency),
      ],
    ]),
    ...buildFooterLines(metadata),
    ...buildDocumentFooterLines(document),
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
      ["Mail Teilnehmende", normalizeText(metadata?.customer?.email ?? document.customer_email)],
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
