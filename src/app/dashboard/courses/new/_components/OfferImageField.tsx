"use client";

import { useEffect, useState } from "react";
import { getOfferImageMaxSizeLabel, validateOfferImageFile } from "@/lib/offer-image-upload";

export default function OfferImageField({
  initialUrl,
  error,
  onValidationError,
}: {
  initialUrl?: string | null;
  error?: string | null;
  onValidationError: (error: string | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">Angebotsfoto</span>
      <input
        type="file"
        name="offer_image_file"
        accept="image/jpeg,image/png,image/webp"
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (!nextFile) {
            onValidationError(null);
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              setObjectUrl(null);
            }
            setPreviewUrl(initialUrl ?? "");
            return;
          }

          const validation = validateOfferImageFile({
            size: nextFile.size,
            type: nextFile.type,
            name: nextFile.name,
          });

          if (!validation.ok) {
            onValidationError(validation.error);
            event.target.value = "";
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              setObjectUrl(null);
            }
            setPreviewUrl(initialUrl ?? "");
            return;
          }

          onValidationError(null);
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
          const nextObjectUrl = URL.createObjectURL(nextFile);
          setObjectUrl(nextObjectUrl);
          setPreviewUrl(nextObjectUrl);
        }}
        className={
          error
            ? "w-full rounded-xl border border-red-400 bg-red-50 px-3 py-2 text-sm"
            : "w-full rounded-xl border px-3 py-2 text-sm"
        }
      />
      {error ? <span className="block text-xs font-medium text-red-700">{error}</span> : null}
      <span className="block text-xs text-muted-foreground">
        Optional. Dieses Bild wird später auf öffentlichen Angebotsseiten, in Suchergebnissen und Buchungsseiten
        angezeigt.
      </span>
      <span className="block text-xs text-muted-foreground">
        JPG, JPEG, PNG oder WebP, maximal {getOfferImageMaxSizeLabel()}.
      </span>
      <input type="hidden" name="existing_offer_image_url" value={initialUrl ?? ""} />
      {previewUrl.trim() ? (
        <div className="mt-2 overflow-hidden rounded-xl border bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Angebotsfoto Vorschau" className="h-auto max-h-72 w-full object-cover" />
        </div>
      ) : null}
    </label>
  );
}
