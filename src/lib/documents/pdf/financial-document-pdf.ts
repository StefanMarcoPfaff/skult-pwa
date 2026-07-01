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

function buildDocumentPdfPath(document: FinancialDocumentRecord, documentNumber: string): string {
  const issuedDate = new Date(document.issued_at ?? document.created_at ?? new Date().toISOString());
  const year = Number.isNaN(issuedDate.getTime()) ? "unknown" : String(issuedDate.getUTCFullYear());
  const sanitizedNumber = documentNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `${year}/${document.document_type}/${document.id}/${sanitizedNumber}.pdf`;
}

function buildMetadataWithDocumentModel(
  document: FinancialDocumentRecord,
  documentNumber: string
): Record<string, unknown> {
  const metadata: Record<string, unknown> = getDocumentMetadata(document) ?? {};
  const offer =
    metadata.offer && typeof metadata.offer === "object" && !Array.isArray(metadata.offer)
      ? (metadata.offer as { startsAt?: string | null })
      : null;
  return {
    ...metadata,
    documentType: document.document_type,
    documentNumber,
    documentCountry: document.document_country,
    documentLocale: document.document_locale,
    documentCurrency: document.currency,
    documentTemplateVersion: document.document_template_version,
    taxRegime: document.tax_regime ?? (metadata.taxRegime as string | null | undefined) ?? null,
    taxStatus: (metadata.taxStatus as string | null | undefined) ?? document.tax_regime ?? null,
    issuedAt: document.issued_at ?? (metadata.issuedAt as string | null | undefined) ?? null,
    serviceDate:
      (metadata.serviceDate as string | null | undefined) ??
      document.period_start ??
      offer?.startsAt ??
      null,
  };
}

async function ensurePersistedDocumentNumber(input: {
  document: FinancialDocumentRecord;
  supabase: SupabaseClient;
}): Promise<FinancialDocumentRecord> {
  if (input.document.document_number) {
    const metadata = getDocumentMetadata(input.document);
    if (
      metadata?.documentNumber === input.document.document_number &&
      metadata.documentCountry === input.document.document_country &&
      metadata.documentTemplateVersion === input.document.document_template_version
    ) {
      return input.document;
    }

    const { data: updatedDocument, error: updateError } = await input.supabase
      .from("financial_documents")
      .update({
        metadata: buildMetadataWithDocumentModel(input.document, input.document.document_number),
      } as never)
      .eq("id", input.document.id)
      .select("*")
      .maybeSingle<FinancialDocumentRecord>();

    if (updateError) {
      throw updateError;
    }

    return updatedDocument ?? input.document;
  }

  const { error } = await input.supabase.rpc("ensure_financial_document_number", {
    p_document_id: input.document.id,
  });

  if (error) {
    throw error;
  }

  const numberedDocument = await getFinancialDocumentById(input.document.id, input.supabase);
  if (!numberedDocument?.document_number) {
    throw new Error(`Document number could not be assigned: ${input.document.id}`);
  }

  const { data: updatedDocument, error: updateError } = await input.supabase
    .from("financial_documents")
    .update({
      metadata: buildMetadataWithDocumentModel(numberedDocument, numberedDocument.document_number),
    } as never)
    .eq("id", numberedDocument.id)
    .select("*")
    .maybeSingle<FinancialDocumentRecord>();

  if (updateError) {
    throw updateError;
  }

  return updatedDocument ?? numberedDocument;
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

  const numberedDocument = await ensurePersistedDocumentNumber({ document, supabase });
  const documentNumber = numberedDocument.document_number;
  if (!documentNumber) {
    throw new Error(`Financial document has no document number: ${numberedDocument.id}`);
  }
  const pdfPath = numberedDocument.pdf_path ?? buildDocumentPdfPath(numberedDocument, documentNumber);

  if (numberedDocument.pdf_path) {
    const record =
      numberedDocument.document_number && numberedDocument.pdf_path === pdfPath
        ? numberedDocument
        : ((await setFinancialDocumentPdfAsset(
            {
              documentId: numberedDocument.id,
              pdfPath,
              documentNumber,
            },
            supabase
          )) ??
          numberedDocument);

    return {
      documentId: record.id,
      documentNumber,
      pdfPath,
      record,
      pdfGenerated: false,
    };
  }

  const metadata = getDocumentMetadata(numberedDocument);
  const pdfBuffer = renderFinancialDocumentPdfByType({
    document: numberedDocument,
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
        documentId: numberedDocument.id,
        pdfPath,
        documentNumber,
      },
      supabase
    )) ?? numberedDocument;

  return {
    documentId: record.id,
    documentNumber,
    pdfPath,
    record,
    pdfGenerated: true,
  };
}
