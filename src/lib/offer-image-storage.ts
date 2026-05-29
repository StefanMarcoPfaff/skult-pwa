import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OFFER_IMAGES_BUCKET,
  buildOfferImageObjectPath,
  validateOfferImageFile,
} from "@/lib/offer-image-upload";

export async function uploadOfferImage(input: {
  offerId: string;
  file: File;
}): Promise<{ url: string } | { error: string }> {
  const validation = validateOfferImageFile({
    size: input.file.size,
    type: input.file.type,
    name: input.file.name,
  });

  if (!validation.ok) {
    return { error: validation.error };
  }

  const objectPath = buildOfferImageObjectPath(input.offerId, validation.normalizedExtension);
  const storageAdmin = createSupabaseAdmin();
  const { error: uploadError } = await storageAdmin.storage.from(OFFER_IMAGES_BUCKET).upload(objectPath, input.file, {
    contentType: input.file.type,
    upsert: true,
  });

  if (uploadError) {
    console.error("[offer-image-upload]", {
      offerId: input.offerId,
      bucket: OFFER_IMAGES_BUCKET,
      objectPath,
      message: uploadError.message,
    });
    return { error: "Das Angebotsfoto konnte nicht hochgeladen werden." };
  }

  const { data } = storageAdmin.storage.from(OFFER_IMAGES_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    return { error: "Das Angebotsfoto wurde hochgeladen, aber die Bild-URL konnte nicht erzeugt werden." };
  }

  return { url: publicUrl };
}
