"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessPaymentsV2Audit } from "@/app/dashboard/admin/payments-v2/access";
import {
  getVisibleFinancialDocumentForAdmin,
  getVisibleFinancialDocumentForProvider,
} from "@/lib/documents/financial-documents";
import { generateFinancialDocumentPdf } from "@/lib/documents/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildReturnUrl(basePath: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function parseReturnUrl(input: string | null): { pathname: string; params: URLSearchParams } {
  const fallback = "/dashboard/earnings";
  const trimmed = String(input ?? "").trim();
  const [pathnamePart, queryPart] = (trimmed || fallback).split("?", 2);
  const pathname = pathnamePart.startsWith("/dashboard/earnings") ? pathnamePart : fallback;
  const params = new URLSearchParams(queryPart ?? "");
  return { pathname, params };
}

export async function generateFinancialDocumentPdfAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "").trim();
  const { pathname, params } = parseReturnUrl(String(formData.get("returnTo") ?? ""));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = canAccessPaymentsV2Audit(user.email);

  try {
    const record = isAdmin
      ? await getVisibleFinancialDocumentForAdmin({ documentId })
      : await getVisibleFinancialDocumentForProvider({
          documentId,
          providerId: user.id,
        });

    if (!record?.id) {
      throw new Error("Dokument nicht gefunden oder Zugriff nicht erlaubt.");
    }

    await generateFinancialDocumentPdf({
      documentId: record.id,
    });

    revalidatePath("/dashboard/earnings");
    params.set("pdfAction", "success");
    params.set("pdfDocumentId", record.id);
    params.set("pdfMessage", "PDF wurde erzeugt und gespeichert.");
    redirect(buildReturnUrl(pathname, Object.fromEntries(params.entries())));
  } catch (error) {
    revalidatePath("/dashboard/earnings");
    params.set("pdfAction", "error");
    params.set("pdfDocumentId", documentId);
    params.set("pdfMessage", error instanceof Error ? error.message : "PDF konnte nicht erzeugt werden.");
    redirect(buildReturnUrl(pathname, Object.fromEntries(params.entries())));
  }
}
