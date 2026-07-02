export const OFFER_IMAGES_BUCKET = "offer-images";
export const OFFER_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_OFFER_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ALLOWED_OFFER_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

export type OfferImageValidationResult =
  | {
      ok: true;
      normalizedExtension: string;
    }
  | {
      ok: false;
      error: string;
      reason: "missing_file" | "invalid_type" | "file_too_large";
    };

function normalizeExtension(fileName: string, mimeType: string): string {
  const extensionFromName = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
  if (ALLOWED_OFFER_IMAGE_EXTENSIONS.includes(extensionFromName as (typeof ALLOWED_OFFER_IMAGE_EXTENSIONS)[number])) {
    return extensionFromName;
  }

  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function getOfferImageMaxSizeLabel(): string {
  return "5 MB";
}

export function getOfferImageUrl(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export function buildOfferImageObjectPath(offerId: string, extension: string, timestamp = Date.now()): string {
  return `${offerId}/cover-${timestamp}.${extension}`;
}

export function validateOfferImageFile(input: {
  size: number;
  type: string | null | undefined;
  name: string | null | undefined;
}): OfferImageValidationResult {
  const mimeType = String(input.type ?? "").trim().toLowerCase();
  const fileName = String(input.name ?? "").trim();

  if (!fileName || input.size <= 0) {
    return {
      ok: false,
      error: "Bitte wähle eine Bilddatei aus.",
      reason: "missing_file",
    };
  }

  if (!ALLOWED_OFFER_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_OFFER_IMAGE_MIME_TYPES)[number])) {
    return {
      ok: false,
      error: "Dieses Dateiformat wird nicht unterstützt. Bitte nutze JPG, JPEG, PNG oder WebP.",
      reason: "invalid_type",
    };
  }

  if (input.size > OFFER_IMAGE_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: "Das Bild ist zu groß. Maximal erlaubt sind 5 MB.",
      reason: "file_too_large",
    };
  }

  return {
    ok: true,
    normalizedExtension: normalizeExtension(fileName, mimeType),
  };
}
