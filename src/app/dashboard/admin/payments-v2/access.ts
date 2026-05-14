import "server-only";

import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function parsePaymentsV2AdminEmails(): string[] {
  return (process.env.PAYMENTS_V2_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function canAccessPaymentsV2Audit(userEmail: string | null | undefined): boolean {
  const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
  const configuredEmails = parsePaymentsV2AdminEmails();

  if (configuredEmails.length > 0) {
    return configuredEmails.includes(normalizedEmail);
  }

  return process.env.NODE_ENV !== "production";
}

export async function requirePaymentsV2AdminAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!canAccessPaymentsV2Audit(user.email)) {
    notFound();
  }

  return user;
}
