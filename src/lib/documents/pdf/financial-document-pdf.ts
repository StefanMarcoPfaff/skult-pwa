import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFinancialDocumentById,
  setFinancialDocumentPdfAsset,
} from "@/lib/documents/financial-documents";
import { FINANCIAL_DOCUMENTS_STORAGE_BUCKET } from "@/lib/documents/pdf/constants";
import { renderFinancialDocumentPdfByType } from "@/lib/documents/pdf/renderers";
import type {
  FinancialDocumentMetadata,
  FinancialDocumentRecord,
} from "@/lib/documents/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type GenerateFinancialDocumentPdfResult = {
  documentId: string;
  documentNumber: string;
  pdfPath: string;
  record: FinancialDocumentRecord;
  pdfGenerated: boolean;
};

function getAdminSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createSupabaseAdmin();
}

function getDocumentMetadata(record: FinancialDocumentRecord): FinancialDocumentMetadata | null {
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as FinancialDocumentMetadata;
}

function buildDocumentNumber(document: FinancialDocumentRecord): string {
  const prefixByType: Record<FinancialDocumentRecord["document_type"], string> = {
    customer_receipt: "RESER-CR",
    provider_payout_statement: "RESER-PS",
    provider_platform_fee_invoice: "RESER-PFI",
    platform_revenue_statement: "RESER-REV",
    refund_receipt: "RESER-RR",
  };

  const issuedDate = new Date(document.issued_at ?? document.created_at ?? new Date().toISOString());
  const datePart = Number.isNaN(issuedDate.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, "")
    : issuedDate.toISOString().slice(0, 10).replace(/-/g, "");
  const idPart = document.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  return `${prefixByType[document.document_type]}-${datePart}-${idPart}`;
}

function buildDocumentPdfPath(document: FinancialDocumentRecord, documentNumber: string): string {
  const issuedDate = new Date(document.issued_at ?? document.created_at ?? new Date().toISOString());
  const year = Number.isNaN(issuedDate.getTime()) ? "unknown" : String(issuedDate.getUTCFullYear());
  const sanitizedNumber = documentNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `${year}/${document.document_type}/${document.id}/${sanitizedNumber}.pdf`;
}

export async function createFinancialDocumentSignedDownloadUrl(input: {
  pdfPath: string;
  expiresInSeconds?: number;
  supabase?: SupabaseClient;
}): Promise<string> {
  const supabase = getAdminSupabase(input.supabase);
  const { data, error } = await supabase.storage
    .from(FINANCIAL_DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(input.pdfPath, input.expiresInSeconds ?? 90);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Signed URL fuer Dokument konnte nicht erzeugt werden");
  }

  return data.signedUrl;
}

export async function generateFinancialDocumentPdf(input: {
  documentId: string;
  supabase?: SupabaseClient;
}): Promise<GenerateFinancialDocumentPdfResult> {
  const supabase = getAdminSupabase(input.supabase);
  const document = await getFinancialDocumentById(input.documentId, supabase);

  if (!document) {
    throw new Error(`Financial document not found: ${input.documentId}`);
  }

  const documentNumber = document.document_number ?? buildDocumentNumber(document);
  const pdfPath = document.pdf_path ?? buildDocumentPdfPath(document, documentNumber);

  if (document.pdf_path) {
    const record =
      document.document_number && document.pdf_path === pdfPath
        ? document
        : ((await setFinancialDocumentPdfAsset(
            {
              documentId: document.id,
              pdfPath,
              documentNumber,
            },
            supabase
          )) ??
          document);

    return {
      documentId: record.id,
      documentNumber,
      pdfPath,
      record,
      pdfGenerated: false,
    };
  }

  const metadata = getDocumentMetadata(document);
  const pdfBuffer = renderFinancialDocumentPdfByType({
    document,
    metadata,
  });

  const { error: uploadError } = await supabase.storage
    .from(FINANCIAL_DOCUMENTS_STORAGE_BUCKET)
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const record =
    (await setFinancialDocumentPdfAsset(
      {
        documentId: document.id,
        pdfPath,
        documentNumber,
      },
      supabase
    )) ?? document;

  return {
    documentId: record.id,
    documentNumber,
    pdfPath,
    record,
    pdfGenerated: true,
  };
}
