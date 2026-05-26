import { NextResponse } from "next/server";
import { canAccessPaymentsV2Audit } from "@/app/dashboard/admin/payments-v2/access";
import {
  getVisibleFinancialDocumentForAdmin,
  getVisibleFinancialDocumentForProvider,
} from "@/lib/documents/financial-documents";
import { createFinancialDocumentSignedDownloadUrl } from "@/lib/documents/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: {
    params: Promise<unknown>;
  }
) {
  const { documentId } = (await context.params) as { documentId: string };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const isAdmin = canAccessPaymentsV2Audit(user.email);
  const record = isAdmin
    ? await getVisibleFinancialDocumentForAdmin({ documentId })
    : await getVisibleFinancialDocumentForProvider({
        documentId,
        providerId: user.id,
      });

  if (!record?.id) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }

  if (!record.pdf_path) {
    return NextResponse.json({ error: "pdf_not_generated" }, { status: 409 });
  }

  const signedUrl = await createFinancialDocumentSignedDownloadUrl({
    pdfPath: record.pdf_path,
  });

  return NextResponse.redirect(signedUrl);
}
