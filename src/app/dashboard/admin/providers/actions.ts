"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateProviderPlatformFeeOverride } from "@/lib/platform-fees";
import { requirePaymentsV2AdminAccess } from "../payments-v2/access";
import { ADMIN_PROVIDERS_PATH } from "../payments-v2/ui";

function parseOptionalPercentFraction(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  return parsed / 100;
}

function redirectWithParams(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${ADMIN_PROVIDERS_PATH}?${search.toString()}`);
}

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateProviderPlatformFeeOverrideAction(formData: FormData) {
  await requirePaymentsV2AdminAccess();

  const providerId = String(formData.get("providerId") ?? "").trim();
  const resetToDefault = String(formData.get("resetToDefault") ?? "") === "1";
  const platformFeePercent = resetToDefault ? null : parseOptionalPercentFraction(formData.get("platformFeePercent"));
  const note = String(formData.get("note") ?? "").trim();

  if (!providerId) {
    redirectWithParams({ action: "fee-error", message: "Anbieter*in fehlt." });
  }

  if (!resetToDefault && platformFeePercent === null) {
    redirectWithParams({ action: "fee-error", providerId, message: "Bitte eine gueltige Plattformgebuehr angeben." });
  }

  try {
    const result = await updateProviderPlatformFeeOverride({
      providerId,
      platformFeePercent,
      note,
    });

    revalidatePath(ADMIN_PROVIDERS_PATH);
    redirectWithParams({
      action: "fee-ok",
      providerId,
      message: result.isOverride
        ? `Individuelle Plattformgebuehr wurde auf ${String(result.platformFeePercent * 100)}% gesetzt.`
        : "Individuelle Plattformgebuehr wurde entfernt. Standard 7% gilt wieder.",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message =
      error instanceof Error && error.message === "provider_payout_profile_not_found"
        ? "Noch kein Auszahlungprofil vorhanden. Die Plattformgebuehr kann erst nach hinterlegten Auszahlungsdaten bearbeitet werden."
        : error instanceof Error
          ? error.message
          : "Plattformgebuehr konnte nicht aktualisiert werden.";

    revalidatePath(ADMIN_PROVIDERS_PATH);
    redirectWithParams({ action: "fee-error", providerId, message });
  }
}
