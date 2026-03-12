import Link from "next/link";
import { redirect } from "next/navigation";
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
  capacity: number | null;
  kind: string | null;
  starts_at: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  price_cents: number | null;
  currency: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      "id,teacher_id,title,description,location,capacity,kind,starts_at,weekday,start_time,duration_minutes,recurrence_type,trial_mode,price_cents,currency"
    )
    .eq("id", id)
    .eq("teacher_id", user.id)
    .single<OfferRow>();

  if (error || !data) {
    redirect("/dashboard/courses");
  }

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("id,course_id,starts_at,ends_at")
    .eq("course_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const courseInitialValues: CourseFormValues = {
    title: data.title,
    location: data.location ?? "",
    description: data.description ?? "",
    weekday: data.weekday !== null ? String(data.weekday) : "1",
    start_date: toDateInputValue(data.starts_at),
    start_time: data.start_time ?? "18:00",
    duration_minutes: data.duration_minutes !== null ? String(data.duration_minutes) : "90",
    recurrence_type: data.recurrence_type ?? "weekly",
    trial_mode: data.trial_mode ?? "all_sessions",
    capacity: data.capacity !== null ? String(data.capacity) : "",
    price_eur: toPriceEur(data.price_cents),
    currency: data.currency ?? "EUR",
  };

  const workshopInitialValues: WorkshopFormValues = {
    title: data.title,
    location: data.location ?? "",
    description: data.description ?? "",
    capacity: data.capacity !== null ? String(data.capacity) : "",
    price_eur: toPriceEur(data.price_cents),
    currency: data.currency ?? "EUR",
    sessions: (sessions ?? [])
      .filter((session) => session.starts_at && session.ends_at)
      .map((session) => ({
        starts_at: session.starts_at as string,
        ends_at: session.ends_at as string,
      })),
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
      </header>

      <div className="rounded-2xl border p-6">
        {data.kind === "course" ? (
          <CourseForm
            initialValues={courseInitialValues}
            submitLabel="Änderungen speichern"
            submitActionOverride={updateCourseAction.bind(null, id)}
          />
        ) : (
          <WorkshopForm
            initialValues={workshopInitialValues}
            submitLabel="Änderungen speichern"
            submitActionOverride={updateWorkshopAction.bind(null, id)}
          />
        )}
      </div>
    </div>
  );
}
