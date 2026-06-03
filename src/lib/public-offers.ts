import "server-only";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDirectlyAccessibleOffer, isPubliclyVisibleOffer } from "@/lib/public-offer-visibility";

type Row = Record<string, unknown>;

type PublicCourseRow = {
  teacher_id: string | null;
  instructor_name: string | null;
  workshop_storno_policy: string | null;
  reservation_notice: string | null;
};

type PublicProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
  bio: string | null;
  intro_video_url: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isHttpUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function getPublicOfferKind(row: Row): "workshop" | "course" | "exclusive_offer" | null {
  const raw = (asString(row.offer_type) ?? asString(row.kind) ?? "").toLowerCase();
  if (raw === "workshop" || raw === "course" || raw === "exclusive_offer") return raw;
  return null;
}

async function hasUpcomingCourseSessions(courseId: string): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const [{ data: anySessionRows, error: anySessionError }, { data: upcomingSessionRows, error: upcomingError }] =
    await Promise.all([
      supabase.from("course_sessions").select("id").eq("course_id", courseId).limit(1),
      supabase
        .from("course_sessions")
        .select("id")
        .eq("course_id", courseId)
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(1),
    ]);

  if (anySessionError || upcomingError) return null;
  if ((anySessionRows ?? []).length === 0) return null;
  return (upcomingSessionRows ?? []).length > 0;
}

export async function isOfferPubliclyVisible(row: Row): Promise<boolean> {
  const kind = getPublicOfferKind(row);
  const isVisible = isPubliclyVisibleOffer({
    kind,
    status: asString(row.status),
    isPublished: typeof row.is_published === "boolean" ? row.is_published : true,
    visibility: asString(row.visibility),
    startsAt: asString(row.starts_at),
    endsAt: asString(row.ends_at),
  });

  if (!isVisible) return false;
  if (kind !== "course") return true;

  const id = asString(row.id);
  if (!id) return false;

  const upcomingSessions = await hasUpcomingCourseSessions(id);
  if (upcomingSessions === null) return true;
  return upcomingSessions;
}

export type PublicOfferDetails = {
  offer: Row;
  kind: "workshop" | "course" | "exclusive_offer";
  publicCourse: PublicCourseRow | null;
  publicProfile: PublicProfileRow | null;
  providerLabel: string | null;
  profileHeading: string | null;
  profileDescription: string | null;
  profilePhotoUrl: string | null;
  profileVideoUrl: string | null;
};

export async function getPublicCourseById(id: string): Promise<PublicOfferDetails | null> {
  const supabase = await createSupabaseServerClient();

  let response = await supabase
    .from("courses_lite")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle<Row>();

  if (response.error) {
    response = await supabase.from("courses_lite").select("*").eq("id", id).maybeSingle<Row>();
  }

  if (response.error || !response.data) return null;

  const offer = response.data;
  const kind = getPublicOfferKind(offer);
  if (!kind) return null;

  if (typeof offer.is_published === "boolean" && !offer.is_published) {
    return null;
  }

  if (
    !isDirectlyAccessibleOffer({
      kind,
      status: asString(offer.status),
      isPublished: typeof offer.is_published === "boolean" ? offer.is_published : true,
      visibility: asString(offer.visibility),
      startsAt: asString(offer.starts_at),
      endsAt: asString(offer.ends_at),
    })
  ) {
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data: loadedCourse } = await admin
    .from("courses")
    .select("teacher_id,instructor_name,workshop_storno_policy,reservation_notice")
    .eq("id", id)
    .maybeSingle<PublicCourseRow>();

  const publicCourse = loadedCourse ?? null;

  let publicProfile: PublicProfileRow | null = null;
  if (publicCourse?.teacher_id) {
    const { data: loadedProfile } = await admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,bio,intro_video_url")
      .eq("id", publicCourse.teacher_id)
      .maybeSingle<PublicProfileRow>();

    publicProfile = loadedProfile ?? null;
  }

  const providerLabel =
    publicProfile?.provider_type
      ? getProviderDisplayName(publicProfile.provider_type, publicProfile)
      : null;

  const profileHeading =
    publicProfile?.provider_type === "studio_provider"
      ? publicCourse?.instructor_name ?? providerLabel
      : [publicProfile?.first_name, publicProfile?.last_name].filter(Boolean).join(" ").trim() ||
        publicCourse?.instructor_name ||
        providerLabel;
  const profilePhotoUrl = publicProfile?.photo_url ?? null;
  const profileVideoUrl = publicProfile?.intro_video_url ?? null;

  return {
    offer,
    kind,
    publicCourse,
    publicProfile,
    providerLabel,
    profileHeading,
    profileDescription: publicProfile?.bio ?? null,
    profilePhotoUrl: isHttpUrl(profilePhotoUrl) ? profilePhotoUrl : null,
    profileVideoUrl: isHttpUrl(profileVideoUrl) ? profileVideoUrl : null,
  };
}
