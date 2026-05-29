import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getProviderDisplayName,
  type WorkshopStornoPolicy,
  type ProviderType,
} from "@/lib/provider-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CourseForm, { type CourseFormValues } from "../../new/_components/CourseForm";
import WorkshopForm, { type WorkshopFormValues } from "../../new/_components/WorkshopForm";
import { updateCourseAction, updateWorkshopAction } from "../../new/actions";

type OfferRow = {
  id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  location: string | null;
  location_details: string | null;
  capacity: number | null;
  kind: string | null;
  starts_at: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  instructor_name: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  price_cents: number | null;
  currency: string | null;
  visibility: "public" | "private_link" | null;
  internal_note: string | null;
  offer_image_url: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type TrialSlotRow = {
  starts_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPriceEur(priceCents: number | null): string {
  if (priceCents === null || !Number.isFinite(priceCents)) return "";
  return (priceCents / 100).toFixed(2);
}

export default async function EditOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const copiedParam = Array.isArray(sp.copied) ? sp.copied[0] : sp.copied;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id,teacher_id,title,description,location,location_details,capacity,kind,starts_at,weekday,start_time,duration_minutes,recurrence_type,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,price_cents,currency,visibility,internal_note,offer_image_url"
    )
    .eq("id", id)
    .eq("teacher_id", user.id)
    .single<OfferRow>();

  if (error || !data) {
    redirect("/dashboard/courses");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const providerType = profile?.provider_type ?? "independent_teacher";
  const providerDisplayName = getProviderDisplayName(providerType, {
    first_name: profile?.first_name,
    last_name: profile?.last_name,
    organization_name: profile?.organization_name,
  });

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("id,course_id,starts_at,ends_at")
    .eq("course_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const { data: trialSlots } = await supabase
    .from("trial_slots")
    .select("starts_at")
    .eq("course_id", id)
    .eq("is_open", true)
    .order("starts_at", { ascending: true })
    .returns<TrialSlotRow[]>();

  const courseInitialValues: CourseFormValues = {
    title: data.title,
    location: data.location ?? "",
    location_details: data.location_details ?? "",
    description: data.description ?? "",
    internal_note: data.internal_note ?? "",
    weekday: data.weekday !== null ? String(data.weekday) : "1",
    start_date: toDateInputValue(data.starts_at),
    start_time: data.start_time ?? "18:00",
    duration_minutes: data.duration_minutes !== null ? String(data.duration_minutes) : "90",
    recurrence_type: data.recurrence_type ?? "weekly",
    trial_mode: data.trial_mode ?? "all_sessions",
    trial_slot_starts: (trialSlots ?? [])
      .map((slot) => slot.starts_at)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    instructor_name: data.instructor_name ?? "",
    capacity: data.capacity !== null ? String(data.capacity) : "",
    price_eur: toPriceEur(data.price_cents),
    currency: data.currency ?? "EUR",
    visibility: data.visibility ?? "public",
    offer_image_url: data.offer_image_url ?? "",
  };

  const workshopInitialValues: WorkshopFormValues = {
    title: data.title,
    location: data.location ?? "",
    location_details: data.location_details ?? "",
    description: data.description ?? "",
    capacity: data.capacity !== null ? String(data.capacity) : "",
    price_eur: toPriceEur(data.price_cents),
    currency: data.currency ?? "EUR",
    instructor_name: data.instructor_name ?? "",
    workshop_storno_policy: (data.workshop_storno_policy ?? "no_refund") as WorkshopStornoPolicy,
    sessions: (sessions ?? [])
      .filter((session) => session.starts_at && session.ends_at)
      .map((session) => ({
        starts_at: session.starts_at as string,
        ends_at: session.ends_at as string,
      })),
    visibility: data.visibility ?? "public",
    internal_note: data.internal_note ?? "",
    offer_image_url: data.offer_image_url ?? "",
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href={`/dashboard/courses/${id}`} className="text-sm font-semibold underline underline-offset-4">
          Zurück zur Vorschau
        </Link>
        <h1 className="text-2xl font-semibold">Angebot ändern</h1>
        <p className="text-sm text-muted-foreground">
          Bearbeite dein Angebot und speichere es wieder in die interne Vorschau.
        </p>
        {copiedParam === "1" ? (
          <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Angebot wurde dupliziert. Bitte Datum und Uhrzeit pruefen.
          </p>
        ) : null}
      </header>

      <div className="rounded-2xl border p-6">
        {data.kind === "course" ? (
          <CourseForm
            initialValues={courseInitialValues}
            submitLabel="Änderungen speichern"
            submitActionOverride={updateCourseAction.bind(null, id)}
            providerType={providerType}
            providerDisplayName={providerDisplayName}
          />
        ) : (
          <WorkshopForm
            initialValues={workshopInitialValues}
            submitLabel="Änderungen speichern"
            submitActionOverride={updateWorkshopAction.bind(null, id)}
            providerType={providerType}
            providerDisplayName={providerDisplayName}
            offerKind={data.kind === "exclusive_offer" ? "exclusive_offer" : "workshop"}
          />
        )}
      </div>
    </div>
  );
}
