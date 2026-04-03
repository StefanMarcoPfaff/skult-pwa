const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_PROFILE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const ALLOWED_PROFILE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

export type ProfileImageValidationResult =
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
  if (ALLOWED_PROFILE_IMAGE_EXTENSIONS.includes(extensionFromName as (typeof ALLOWED_PROFILE_IMAGE_EXTENSIONS)[number])) {
    return extensionFromName;
  }

  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function getProfileImageMaxSizeLabel(): string {
  return "5 MB";
}

export function validateProfileImageFile(input: {
  size: number;
  type: string | null | undefined;
  name: string | null | undefined;
}): ProfileImageValidationResult {
  const mimeType = String(input.type ?? "").trim().toLowerCase();
  const fileName = String(input.name ?? "").trim();

  if (!fileName || input.size <= 0) {
    return {
      ok: false,
      error: "Bitte waehle eine Bilddatei aus.",
      reason: "missing_file",
    };
  }

  if (!ALLOWED_PROFILE_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_PROFILE_IMAGE_MIME_TYPES)[number])) {
    return {
      ok: false,
      error: "Dieses Dateiformat wird nicht unterstuetzt. Bitte nutze JPG, PNG oder WebP.",
      reason: "invalid_type",
    };
  }

  if (input.size > PROFILE_IMAGE_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: "Das Bild ist zu gross. Bitte waehle eine kleinere Datei.",
      reason: "file_too_large",
    };
  }

  return {
    ok: true,
    normalizedExtension: normalizeExtension(fileName, mimeType),
  };
}
