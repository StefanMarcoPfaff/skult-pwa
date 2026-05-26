import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateFinancialDocumentInput,
  DocumentStatus,
  DocumentType,
  FinancialDocumentRecord,
  FinancialDocumentInsert,
  FinancialDocumentUpdate,
} from "@/lib/documents/types";

type FinancialDocumentClient = SupabaseClient;

export const PROVIDER_VISIBLE_FINANCIAL_DOCUMENT_TYPES = [
  "provider_payout_statement",
  "provider_platform_fee_invoice",
  "refund_receipt",
] as const satisfies readonly DocumentType[];

export const ADMIN_VISIBLE_FINANCIAL_DOCUMENT_TYPES = [
  "customer_receipt",
  "provider_payout_statement",
  "provider_platform_fee_invoice",
  "platform_revenue_statement",
  "refund_receipt",
] as const satisfies readonly DocumentType[];

export type FinancialDocumentViewerRole = "provider" | "admin";

type ProviderDocumentQuery = {
  providerId: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
  limit?: number;
};

type AdminDocumentQuery = {
  providerId?: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
  limit?: number;
};

type MarkIssuedInput = {
  documentId: string;
  documentNumber?: string | null;
  pdfPath?: string | null;
  issuedAt?: string | null;
};

type MarkSentInput = {
  documentId: string;
  sentAt?: string | null;
};

function getFinancialDocumentClient(client?: FinancialDocumentClient): FinancialDocumentClient {
  return client ?? createSupabaseAdmin();
}

export function getVisibleFinancialDocumentTypes(
  role: FinancialDocumentViewerRole
): readonly DocumentType[] {
  return role === "admin"
    ? ADMIN_VISIBLE_FINANCIAL_DOCUMENT_TYPES
    : PROVIDER_VISIBLE_FINANCIAL_DOCUMENT_TYPES;
}

function applyVisibleDocumentTypeFilter<TStatement extends { in: (column: string, values: readonly string[]) => TStatement }>(
  statement: TStatement,
  role: FinancialDocumentViewerRole
): TStatement {
  return statement.in("document_type", getVisibleFinancialDocumentTypes(role));
}

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeDocumentPayload(
  input: CreateFinancialDocumentInput
): FinancialDocumentInsert {
  return {
    ...input,
    status: input.status ?? "draft",
    currency: normalizeCurrency(input.currency),
    metadata: input.metadata ?? {},
  };
}

async function updateFinancialDocumentRecord(
  documentId: string,
  patch: FinancialDocumentUpdate,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord | null> {
  const supabase = getFinancialDocumentClient(client);
  const { data, error } = await supabase
    .from("financial_documents")
    .update(patch as never)
    .eq("id", documentId)
    .select("*")
    .maybeSingle<FinancialDocumentRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function createFinancialDocumentRecord(
  input: CreateFinancialDocumentInput,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord> {
  const supabase = getFinancialDocumentClient(client);
  const { data, error } = await supabase
    .from("financial_documents")
    .insert(normalizeDocumentPayload(input) as never)
    .select("*")
    .single<FinancialDocumentRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getFinancialDocumentsForProvider(
  query: ProviderDocumentQuery,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord[]> {
  const supabase = getFinancialDocumentClient(client);
  let statement = supabase
    .from("financial_documents")
    .select("*")
    .eq("provider_id", query.providerId)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (query.documentType) {
    statement = statement.eq("document_type", query.documentType);
  }

  if (query.status) {
    statement = statement.eq("status", query.status);
  }

  if (query.limit && query.limit > 0) {
    statement = statement.limit(query.limit);
  }

  const { data, error } = await statement.returns<FinancialDocumentRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getVisibleFinancialDocumentsForProvider(
  query: ProviderDocumentQuery,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord[]> {
  const supabase = getFinancialDocumentClient(client);
  let statement = applyVisibleDocumentTypeFilter(
    supabase
      .from("financial_documents")
      .select("*")
      .eq("provider_id", query.providerId)
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    "provider"
  );

  if (query.documentType && getVisibleFinancialDocumentTypes("provider").includes(query.documentType)) {
    statement = statement.eq("document_type", query.documentType);
  }

  if (query.status) {
    statement = statement.eq("status", query.status);
  }

  if (query.limit && query.limit > 0) {
    statement = statement.limit(query.limit);
  }

  const { data, error } = await statement.returns<FinancialDocumentRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getFinancialDocumentsForAdmin(
  query: AdminDocumentQuery = {},
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord[]> {
  const supabase = getFinancialDocumentClient(client);
  let statement = supabase
    .from("financial_documents")
    .select("*")
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (query.providerId) {
    statement = statement.eq("provider_id", query.providerId);
  }

  if (query.documentType) {
    statement = statement.eq("document_type", query.documentType);
  }

  if (query.status) {
    statement = statement.eq("status", query.status);
  }

  if (query.limit && query.limit > 0) {
    statement = statement.limit(query.limit);
  }

  const { data, error } = await statement.returns<FinancialDocumentRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getVisibleFinancialDocumentsForAdmin(
  query: AdminDocumentQuery = {},
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord[]> {
  const supabase = getFinancialDocumentClient(client);
  let statement = applyVisibleDocumentTypeFilter(
    supabase
      .from("financial_documents")
      .select("*")
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    "admin"
  );

  if (query.providerId) {
    statement = statement.eq("provider_id", query.providerId);
  }

  if (query.documentType && getVisibleFinancialDocumentTypes("admin").includes(query.documentType)) {
    statement = statement.eq("document_type", query.documentType);
  }

  if (query.status) {
    statement = statement.eq("status", query.status);
  }

  if (query.limit && query.limit > 0) {
    statement = statement.limit(query.limit);
  }

  const { data, error } = await statement.returns<FinancialDocumentRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markFinancialDocumentIssued(
  input: MarkIssuedInput,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord | null> {
  return updateFinancialDocumentRecord(
    input.documentId,
    {
      status: "issued",
      document_number: input.documentNumber ?? undefined,
      pdf_path: input.pdfPath ?? undefined,
      issued_at: input.issuedAt ?? new Date().toISOString(),
    },
    client
  );
}

export async function markFinancialDocumentSent(
  input: MarkSentInput,
  client?: FinancialDocumentClient
): Promise<FinancialDocumentRecord | null> {
  return updateFinancialDocumentRecord(
    input.documentId,
    {
      sent_at: input.sentAt ?? new Date().toISOString(),
    },
    client
  );
}
