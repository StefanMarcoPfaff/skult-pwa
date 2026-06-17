import type { FinancialDocumentMetadata, FinancialDocumentRecord } from "@/lib/documents/types";
import type { FinancialDocumentViewerRole } from "@/lib/documents/financial-documents";
import { formatBerlinDate, formatBerlinDateTime } from "@/lib/formatting/berlin-time";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/platform-fees";
import { generateFinancialDocumentPdfAction } from "./actions";

type DocumentFilterState = {
  docType: string;
  docStatus: string;
  docPeriod: string;
  docOffer: string;
  offerType: string;
  status: string;
  period: string;
  offer: string;
};

type FinancialDocumentsSectionProps = {
  documents: FinancialDocumentRecord[];
  filters: DocumentFilterState;
  role: FinancialDocumentViewerRole;
  returnTo: string;
  pdfFeedback: {
    action: string | null;
    documentId: string | null;
    message: string | null;
  };
};

type DocumentStatusTone = "slate" | "green" | "rose";

const DOCUMENT_TYPE_LABELS: Record<FinancialDocumentRecord["document_type"], string> = {
  customer_receipt: "Kund*innen-Beleg",
  provider_payout_statement: "Anbieter*innen-Anteil",
  provider_platform_fee_invoice: "Plattformgebuehren-Beleg",
  platform_revenue_statement: "RESER-Provisionsabrechnung",
  refund_receipt: "Rueckerstattungsbeleg",
};

const DOCUMENT_STATUS_LABELS: Record<FinancialDocumentRecord["status"], string> = {
  draft: "Entwurf",
  issued: "Erstellt",
  voided: "Storniert",
};

const DOCUMENT_STATUS_TONES: Record<FinancialDocumentRecord["status"], DocumentStatusTone> = {
  draft: "slate",
  issued: "green",
  voided: "rose",
};

function formatMoney(amountCents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format((amountCents ?? 0) / 100);
}

function formatDate(value: string | null): string {
  return formatBerlinDate(value);
}

function formatDateTime(value: string | null): string {
  return formatBerlinDateTime(value);
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

function statusToneClass(tone: DocumentStatusTone): string {
  switch (tone) {
    case "green":
      return "bg-green-100 text-green-800";
    case "rose":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getDocumentMetadata(record: FinancialDocumentRecord): FinancialDocumentMetadata | null {
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as FinancialDocumentMetadata;
}

function getDocumentPrimaryAmountLabel(record: FinancialDocumentRecord): string {
  switch (record.document_type) {
    case "provider_payout_statement":
      return "Anbieter*innen-Anteil";
    case "provider_platform_fee_invoice":
      return "Plattformgebuehr";
    case "platform_revenue_statement":
      return "RESER-Provision";
    case "refund_receipt":
      return "Rueckerstattung";
    default:
      return "Betrag";
  }
}

function getDocumentPrimaryAmountCents(record: FinancialDocumentRecord): number {
  switch (record.document_type) {
    case "provider_payout_statement":
      return record.provider_payout_cents;
    case "provider_platform_fee_invoice":
      return record.platform_fee_cents;
    case "platform_revenue_statement":
      return record.platform_fee_cents;
    case "refund_receipt":
      return record.gross_amount_cents;
    default:
      return record.gross_amount_cents;
  }
}

function getDocumentRelevantDate(record: FinancialDocumentRecord): string {
  return record.issued_at ?? record.created_at;
}

function matchesPeriod(dateIso: string, period: string): boolean {
  if (period === "all") return true;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  if (period === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return date >= start && date < end;
  }

  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return date >= start && date < end;
  }

  return true;
}

function buildOfferLabel(record: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): string {
  return metadata?.offer?.title?.trim() || "Angebot";
}

function buildPeriodLabel(record: FinancialDocumentRecord, metadata: FinancialDocumentMetadata | null): string {
  const start = metadata?.period?.start ?? record.period_start;
  const end = metadata?.period?.end ?? record.period_end;

  if (start && end) {
    return `${formatDate(start)} bis ${formatDate(end)}`;
  }

  if (start) {
    return `Ab ${formatDate(start)}`;
  }

  return formatDate(record.issued_at ?? record.created_at);
}

function HiddenEarningsFilters(props: DocumentFilterState) {
  return (
    <>
      <input type="hidden" name="offerType" value={props.offerType} />
      <input type="hidden" name="status" value={props.status} />
      <input type="hidden" name="period" value={props.period} />
      <input type="hidden" name="offer" value={props.offer} />
    </>
  );
}

export default function FinancialDocumentsSection(props: FinancialDocumentsSectionProps) {
  const filteredDocuments = props.documents
    .filter((record) => {
      if (props.filters.docType !== "all" && record.document_type !== props.filters.docType) {
        return false;
      }

      if (props.filters.docStatus !== "all" && record.status !== props.filters.docStatus) {
        return false;
      }

      if (!matchesPeriod(getDocumentRelevantDate(record), props.filters.docPeriod)) {
        return false;
      }

      const metadata = getDocumentMetadata(record);
      const offerLabel = buildOfferLabel(record, metadata).toLowerCase();
      if (props.filters.docOffer && !offerLabel.includes(props.filters.docOffer.toLowerCase())) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      return new Date(getDocumentRelevantDate(right)).getTime() - new Date(getDocumentRelevantDate(left)).getTime();
    });

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Belege & Abrechnungen</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {props.role === "admin"
              ? "Hier findest du alle erzeugten Dokumente. Verfuegbare PDFs koennen direkt heruntergeladen werden."
              : "Hier findest du deine Anbieter*innen-Anteile und Plattformgebuehren-Belege. Verfuegbare PDFs koennen direkt heruntergeladen werden."}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
          Sortierung: Neueste zuerst
        </div>
      </div>

      <form action="/dashboard/earnings" className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
        <HiddenEarningsFilters {...props.filters} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Angebot</span>
          <input
            type="search"
            name="docOffer"
            defaultValue={props.filters.docOffer}
            placeholder="Nach Angebot filtern"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Dokumenttyp</span>
          <select
            name="docType"
            defaultValue={props.filters.docType}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <option value="all">Alle Dokumente</option>
            <option value="provider_payout_statement">Anbieter*innen-Anteil</option>
            <option value="provider_platform_fee_invoice">Plattformgebuehren-Beleg</option>
            {props.role === "admin" ? <option value="customer_receipt">Kund*innen-Beleg</option> : null}
            {props.role === "admin" ? <option value="platform_revenue_statement">RESER-Provisionsabrechnung</option> : null}
            <option value="refund_receipt">Rueckerstattungsbeleg</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Status</span>
          <select
            name="docStatus"
            defaultValue={props.filters.docStatus}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <option value="all">Alle Status</option>
            <option value="issued">Erstellt</option>
            <option value="draft">Entwurf</option>
            <option value="voided">Storniert</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Zeitraum</span>
          <select
            name="docPeriod"
            defaultValue={props.filters.docPeriod}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <option value="all">Alle</option>
            <option value="this_month">Dieser Monat</option>
            <option value="last_month">Letzter Monat</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center self-end rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          Filtern
        </button>
      </form>

      {props.pdfFeedback.action && props.pdfFeedback.message ? (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
            props.pdfFeedback.action === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span className="font-medium">
            {props.pdfFeedback.action === "success" ? "PDF-Status" : "PDF-Fehler"}
          </span>
          <span className="ml-2">{props.pdfFeedback.message}</span>
          {props.pdfFeedback.documentId ? (
            <span className="ml-2 text-xs">Dokument-ID: {props.pdfFeedback.documentId}</span>
          ) : null}
        </div>
      ) : null}

      {filteredDocuments.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          Noch keine passenden Dokumente vorhanden.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {filteredDocuments.map((record) => {
            const metadata = getDocumentMetadata(record);
            const typeLabel = DOCUMENT_TYPE_LABELS[record.document_type];
            const statusLabel = DOCUMENT_STATUS_LABELS[record.status];
            const statusTone = DOCUMENT_STATUS_TONES[record.status];
            const offerLabel = buildOfferLabel(record, metadata);
            const periodLabel = buildPeriodLabel(record, metadata);
            const providerLabel =
              metadata?.providerBillingProfile?.providerDisplayName ||
              metadata?.providerBillingProfile?.documentRecipientName ||
              "Anbieter*in";
            const taxHint = props.role === "admin" ? metadata?.taxHint ?? null : null;
            const roleNotice =
              props.role === "admin"
                ? metadata?.roleNotice ?? "Die Leistung wird durch Anbieter*in erbracht."
                : "Die Leistung wird durch Anbieter*in erbracht.";

            return (
              <article key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        {typeLabel}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusToneClass(statusTone)}`}>
                        {statusLabel}
                      </span>
                      {record.document_number ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                          Nr. {record.document_number}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{offerLabel}</h3>
                      <p className="mt-1 text-sm text-slate-600">{periodLabel}</p>
                    </div>
                  </div>

                  <div className="grid min-w-[220px] gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{getDocumentPrimaryAmountLabel(record)}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatMoney(getDocumentPrimaryAmountCents(record), record.currency)}
                      </p>
                    </div>
                    <div className="text-sm text-slate-600">
                      <p>Erstellt am: {formatDateTime(record.created_at)}</p>
                      <p>Issued at: {formatDateTime(record.issued_at)}</p>
                    </div>
                  </div>
                </div>

                <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Dokumentdetails anzeigen
                  </summary>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Anbieter*in</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{providerLabel}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Angebot</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{offerLabel}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Zeitraum</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{periodLabel}</p>
                      </div>
                      {props.role === "admin" ? (
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Kund*innen-Mail</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {metadata?.customer?.email ?? record.customer_email ?? "-"}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Betragsdetails</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-4">
                          <span>Brutto</span>
                          <span className="font-medium text-slate-900">
                            {formatMoney(record.gross_amount_cents, record.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>{platformFeeLabel(metadata)}</span>
                          <span className="font-medium text-slate-900">
                            {formatMoney(record.platform_fee_cents, record.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Anbieter*innen-Anteil</span>
                          <span className="font-medium text-slate-900">
                            {formatMoney(record.provider_payout_cents, record.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-4 ${props.role === "admin" ? "lg:grid-cols-2" : ""}`}>
                    {props.role === "admin" ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Steuerhinweis</p>
                        <p className="mt-2 text-sm text-slate-700">{taxHint ?? "-"}</p>
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Rollenhinweis</p>
                      <p className="mt-2 text-sm text-slate-700">{roleNotice}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      Dokument-ID: {record.id}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {record.pdf_path ? (
                        <a
                          href={`/api/financial-documents/${record.id}/download`}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          PDF herunterladen
                        </a>
                      ) : (
                        <form action={generateFinancialDocumentPdfAction}>
                          <input type="hidden" name="documentId" value={record.id} />
                          <input type="hidden" name="returnTo" value={props.returnTo} />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                          >
                            PDF erzeugen
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5 text-xs text-slate-500">
        {props.role === "admin"
          ? "Admins sehen weiterhin alle Dokumenttypen. Eine groessere Admin-Dokumentenoberflaeche folgt spaeter."
          : "Anbieter*innen sehen hier nur ihre fachlich relevanten Dokumente."}
      </div>
    </section>
  );
}
