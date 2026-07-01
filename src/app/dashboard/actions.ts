"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getPaidOfferPublicationReadiness,
  getProviderBillingProfile,
} from "@/lib/provider-billing-profile";

export async function setPublishedAction(courseId: string, publish: boolean) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const { data } = await supabase.auth.getUser();

  if (!data.user) throw new Error("Not authenticated");

  if (publish) {
    const { data: course } = await admin
      .from("courses")
      .select("id,teacher_id,kind,price_cents")
      .eq("id", courseId)
      .eq("teacher_id", data.user.id)
      .maybeSingle<{ id: string; teacher_id: string; kind: string | null; price_cents: number | null }>();

    if (!course) {
      throw new Error("Angebot nicht gefunden.");
    }

    if ((course.kind === "workshop" || course.kind === "exclusive_offer") && (course.price_cents ?? 0) > 0) {
      const profile = await getProviderBillingProfile(admin, data.user.id);
      const readiness = getPaidOfferPublicationReadiness(profile);
      if (!readiness.isReady) {
        const details = readiness.missingFields.length ? `\n${readiness.missingFields.join("\n")}` : "";
        throw new Error(`Kostenpflichtige Angebote koennen noch nicht veroeffentlicht werden.${details}`);
      }
    }
  }

  const { error } = await supabase
    .from("courses")
    .update({ is_published: publish })
    .eq("id", courseId);

  if (error) throw new Error(error.message);
}
