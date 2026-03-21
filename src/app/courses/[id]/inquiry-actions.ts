"use server";

import { getProviderDisplayName } from "@/lib/provider-profiles";
import { getResend } from "@/lib/resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type OfferInquiryState = {
  error?: string;
  success?: boolean;
};

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

function requiredText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function submitOfferInquiryAction(
  courseId: string,
  _prevState: OfferInquiryState,
  formData: FormData
): Promise<OfferInquiryState> {
  const firstName = requiredText(formData, "first_name");
  const lastName = requiredText(formData, "last_name");
  const email = requiredText(formData, "email").toLowerCase();
  const message = requiredText(formData, "message");

  if (!firstName || !lastName || !email) {
    return { error: "Bitte fuelle mindestens Vorname, Nachname und E-Mail aus." };
  }

  const admin = createSupabaseAdmin();
  const { data: course } = await admin
    .from("courses")
    .select("id,title,kind,teacher_id,instructor_name")
    .eq("id", courseId)
    .maybeSingle<CourseRow>();

  if (!course?.teacher_id) {
    return { error: "Anfrage konnte aktuell nicht versendet werden." };
  }

  const [{ data: profile }, authResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name")
      .eq("id", course.teacher_id)
      .maybeSingle<ProfileRow>(),
    admin.auth.admin.getUserById(course.teacher_id),
  ]);

  const providerEmail = authResult.data.user?.email?.trim() ?? null;
  if (!providerEmail) {
    return { error: "Anfrage konnte aktuell nicht versendet werden." };
  }

  const providerName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
  const resend = getResend();

  await resend.emails.send({
    from: "onboarding@resend.dev",
    to: providerEmail,
    subject: `Neue Anfrage zu ${course.title ?? "deinem Angebot"}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Neue Anfrage zu deinem Angebot</h2>
        <p>Zu <b>${course.title ?? "deinem Angebot"}</b> ist eine neue Anfrage eingegangen.</p>
        <p><b>Art:</b> ${course.kind === "workshop" ? "Workshop" : "Kurs"}</p>
        ${providerName ? `<p><b>Anbieter:</b> ${providerName}</p>` : ""}
        ${course.instructor_name ? `<p><b>Dozent*in:</b> ${course.instructor_name}</p>` : ""}
        <p><b>Name:</b> ${firstName} ${lastName}</p>
        <p><b>E-Mail:</b> ${email}</p>
        ${message ? `<p><b>Nachricht:</b><br/>${message.replace(/\n/g, "<br/>")}</p>` : ""}
      </div>
    `,
    text: [
      "Neue Anfrage zu deinem Angebot",
      `Titel: ${course.title ?? "dein Angebot"}`,
      `Art: ${course.kind === "workshop" ? "Workshop" : "Kurs"}`,
      providerName ? `Anbieter: ${providerName}` : null,
      course.instructor_name ? `Dozent*in: ${course.instructor_name}` : null,
      `Name: ${firstName} ${lastName}`,
      `E-Mail: ${email}`,
      message ? `Nachricht: ${message}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[offer inquiry]", {
      courseId,
      offerTitle: course.title,
      offerKind: course.kind,
      recipient: providerEmail,
      from: email,
    });
  }

  return { success: true };
}
