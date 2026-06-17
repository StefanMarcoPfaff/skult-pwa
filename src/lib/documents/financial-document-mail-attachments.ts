import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "resend";
import { FINANCIAL_DOCUMENTS_STORAGE_BUCKET } from "@/lib/documents/pdf/constants";
import type { DocumentType } from "@/lib/documents/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type MailAttachmentDocument = {
  id: string;
  document_type: DocumentType;
  pdf_path: string | null;
};

type AttachmentDefinition = {
  documentType: DocumentType;
  filename: string;
};

type AttachmentQuery = {
  bookingId?: string | null;
  paymentTransactionId?: string | null;
  ledgerEntryId?: string | null;
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
};

const ATTACHMENT_FILENAMES: Record<
  "customer_receipt" | "provider_payout_statement" | "provider_platform_fee_invoice",
  string
> = {
  customer_receipt: "beleg-fuer-teilnehmende.pdf",
  provider_payout_statement: "abrechnungsbeleg-fuer-anbietende.pdf",
  provider_platform_fee_invoice: "reser-plattformgebuehr.pdf",
};

function getAdminSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createSupabaseAdmin();
}

function logAttachmentCount(context: string, attachments: Attachment[]) {
  console.info("[financial-document-mail-attachments] attachment count", {
    context,
    count: attachments.length,
  });
}

async function loadAttachmentsFromDocuments(input: {
  context: string;
  documents: MailAttachmentDocument[];
  definitions: AttachmentDefinition[];
  supabase?: SupabaseClient;
}): Promise<Attachment[]> {
  const supabase = getAdminSupabase(input.supabase);
  const attachments: Attachment[] = [];

  for (const definition of input.definitions) {
    const document = input.documents.find((item) => item.document_type === definition.documentType) ?? null;

    if (!document?.id) {
      console.warn("[financial-document-mail-attachments] missing financial document", {
        context: input.context,
        documentType: definition.documentType,
      });
      continue;
    }

    if (!document.pdf_path) {
      console.warn("[financial-document-mail-attachments] missing pdf_path", {
        context: input.context,
        documentId: document.id,
        documentType: document.document_type,
      });
      continue;
    }

    const { data, error } = await supabase.storage
      .from(FINANCIAL_DOCUMENTS_STORAGE_BUCKET)
      .download(document.pdf_path);

    if (error || !data) {
      console.warn("[financial-document-mail-attachments] storage fetch failed", {
        context: input.context,
        documentId: document.id,
        documentType: document.document_type,
        pdfPath: document.pdf_path,
        error,
      });
      continue;
    }

    try {
      attachments.push({
        filename: definition.filename,
        content: Buffer.from(await data.arrayBuffer()),
        contentType: "application/pdf",
      });
    } catch (error) {
      console.warn("[financial-document-mail-attachments] storage body read failed", {
        context: input.context,
        documentId: document.id,
        documentType: document.document_type,
        pdfPath: document.pdf_path,
        error,
      });
    }
  }

  logAttachmentCount(input.context, attachments);
  return attachments;
}

async function queryDocuments(input: {
  query: AttachmentQuery;
  documentTypes: DocumentType[];
  supabase: SupabaseClient;
}): Promise<MailAttachmentDocument[]> {
  const results: MailAttachmentDocument[] = [];
  const seen = new Set<string>();
  const clauses: Array<[keyof AttachmentQuery, string]> = [
    ["bookingId", "booking_id"],
    ["paymentTransactionId", "payment_transaction_id"],
    ["ledgerEntryId", "ledger_entry_id"],
    ["payoutBatchId", "payout_batch_id"],
    ["payoutItemId", "payout_item_id"],
  ];

  for (const [queryKey, column] of clauses) {
    const value = input.query[queryKey]?.trim();
    if (!value) continue;

    const { data, error } = await input.supabase
      .from("financial_documents")
      .select("id,document_type,pdf_path,created_at")
      .eq(column, value)
      .in("document_type", input.documentTypes)
      .order("created_at", { ascending: false })
      .returns<Array<MailAttachmentDocument & { created_at: string | null }>>();

    if (error) {
      console.warn("[financial-document-mail-attachments] document lookup failed", {
        column,
        value,
        documentTypes: input.documentTypes,
        error,
      });
      continue;
    }

    for (const document of data ?? []) {
      if (seen.has(document.id)) continue;
      seen.add(document.id);
      results.push({
        id: document.id,
        document_type: document.document_type,
        pdf_path: document.pdf_path,
      });
    }
  }

  return results;
}

export async function loadCustomerReceiptAttachmentForMail(input: {
  context: string;
  query: AttachmentQuery;
  supabase?: SupabaseClient;
}): Promise<Attachment[]> {
  const supabase = getAdminSupabase(input.supabase);
  const documents = await queryDocuments({
    query: input.query,
    documentTypes: ["customer_receipt"],
    supabase,
  });

  return loadAttachmentsFromDocuments({
    context: input.context,
    documents,
    definitions: [{ documentType: "customer_receipt", filename: ATTACHMENT_FILENAMES.customer_receipt }],
    supabase,
  });
}

export async function loadProviderPayoutAttachmentsForMail(input: {
  context: string;
  query: AttachmentQuery;
  supabase?: SupabaseClient;
}): Promise<Attachment[]> {
  const supabase = getAdminSupabase(input.supabase);
  const documents = await queryDocuments({
    query: input.query,
    documentTypes: ["provider_payout_statement", "provider_platform_fee_invoice"],
    supabase,
  });

  return loadAttachmentsFromDocuments({
    context: input.context,
    documents,
    definitions: [
      {
        documentType: "provider_payout_statement",
        filename: ATTACHMENT_FILENAMES.provider_payout_statement,
      },
      {
        documentType: "provider_platform_fee_invoice",
        filename: ATTACHMENT_FILENAMES.provider_platform_fee_invoice,
      },
    ],
    supabase,
  });
}
