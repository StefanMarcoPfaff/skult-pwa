"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };
type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type WorkshopSession = {
  starts_at: string;
  ends_at: string;
};

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseTimeParts(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getWeekdayForDate(value: string): number | null {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day).getDay();
}

function combineCourseStartsAtISO(startDate: string, startTime: string): string | null {
  const date = parseDateParts(startDate);
  const time = parseTimeParts(startTime);
  if (!date || !time) return null;

  const candidate = new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  return candidate.toISOString();
}

function parseSessionsJson(formData: FormData): WorkshopSession[] | null {
  const raw = String(formData.get("sessions_json") || "").trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const out: WorkshopSession[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    const starts_at = entry.starts_at;
    const ends_at = entry.ends_at;
    if (typeof starts_at !== "string" || typeof ends_at !== "string") return null;

    const s = new Date(starts_at);
    const e = new Date(ends_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (e.getTime() <= s.getTime()) return null;

    out.push({ starts_at, ends_at });
  }
  return out;
}

function logSupabaseError(context: string, error: unknown) {
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[SupabaseError]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
}

function formatUserSupabaseError(error: unknown): string {
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  const msg = String(supabaseError.message || "Unbekannter Fehler").slice(0, 160);
  if (process.env.NODE_ENV !== "production") {
    const code = supabaseError.code ? ` code=${supabaseError.code}` : "";
    const hint = supabaseError.hint ? ` hint=${String(supabaseError.hint).slice(0, 80)}` : "";
    return `${msg}${code}${hint}`;
  }
  return msg;
}

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    logSupabaseError("auth.getUser", error);
    return { supabase, user: null as null, error: formatUserSupabaseError(error) };
  }

  if (!user) {
    redirect("/login");
  }

  return { supabase, user, error: null as string | null };
}

async function assertTeacherOwnsCourse(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, teacherId: string, courseId: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    logSupabaseError("select.courses(owner-check)", error);
    return { ok: false, error: formatUserSupabaseError(error) };
  }

  if (!data) return { ok: false, error: "Angebot nicht gefunden." };
  return { ok: true, error: null as string | null };
}

async function createOrUpdateWorkshop(
  formData: FormData,
  options: { mode: "create" } | { mode: "update"; courseId: string }
): Promise<ActionResult> {
  const { supabase, user, error: authError } = await requireTeacher();
  if (authError) return { error: authError };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Bitte gib einen Titel an." };

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const capacity = parseOptionalInt(formData.get("capacity"));
  const price_cents = parseOptionalInt(formData.get("price_cents"));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";
  const sessions = parseSessionsJson(formData);
  if (!sessions) return { error: "Bitte füge mindestens einen gültigen Termin hinzu (Ende nach Start)." };

  if (options.mode === "create") {
    const { data, error } = await supabase.rpc("create_workshop_with_sessions", {
      p_title: title,
      p_description: description,
      p_location: location,
      p_capacity: capacity,
      p_price_cents: price_cents,
      p_currency: currency,
      p_sessions: sessions,
    });

    if (error) {
      logSupabaseError("rpc.create_workshop_with_sessions", error);
      return { error: formatUserSupabaseError(error) };
    }

    const newId = String(data || "").trim();
    if (!newId) return { error: "Workshop wurde erstellt, aber keine ID zurückgegeben." };
    redirect(`/dashboard/courses/${newId}`);
  }

  const ownership = await assertTeacherOwnsCourse(supabase, user.id, options.courseId);
  if (!ownership.ok) return { error: ownership.error ?? "Angebot nicht gefunden." };

  const firstSessionStart = sessions[0]?.starts_at ?? null;
  const { error: updateCourseError } = await supabase
    .from("courses")
    .update({
      title,
      description,
      location,
      capacity,
      price_cents,
      currency,
      starts_at: firstSessionStart,
    })
    .eq("id", options.courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "workshop");

  if (updateCourseError) {
    logSupabaseError("update.courses(workshop)", updateCourseError);
    return { error: formatUserSupabaseError(updateCourseError) };
  }

  const { error: deleteSessionsError } = await supabase
    .from("course_sessions")
    .delete()
    .eq("course_id", options.courseId);

  if (deleteSessionsError) {
    logSupabaseError("delete.course_sessions(workshop)", deleteSessionsError);
    return { error: formatUserSupabaseError(deleteSessionsError) };
  }

  const { error: insertSessionsError } = await supabase.from("course_sessions").insert(
    sessions.map((session) => ({
      course_id: options.courseId,
      starts_at: session.starts_at,
      ends_at: session.ends_at,
    }))
  );

  if (insertSessionsError) {
    logSupabaseError("insert.course_sessions(workshop)", insertSessionsError);
    return { error: formatUserSupabaseError(insertSessionsError) };
  }

  redirect(`/dashboard/courses/${options.courseId}?saved=1`);
}

async function createOrUpdateCourse(
  formData: FormData,
  options: { mode: "create" } | { mode: "update"; courseId: string }
): Promise<ActionResult> {
  const { supabase, user, error: authError } = await requireTeacher();
  if (authError) return { error: authError };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Bitte gib einen Titel an." };

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const capacity = parseOptionalInt(formData.get("capacity"));

  const weekday = parseOptionalInt(formData.get("weekday"));
  const start_date = String(formData.get("start_date") || "").trim();
  const start_time = String(formData.get("start_time") || "").trim();
  const duration_minutes = parseOptionalInt(formData.get("duration_minutes"));
  const recurrence_type = String(formData.get("recurrence_type") || "").trim();
  const trial_mode = String(formData.get("trial_mode") || "all_sessions").trim().toLowerCase();

  if (weekday === null || weekday < 0 || weekday > 6) {
    return { error: "Bitte wähle einen gültigen Wochentag (0-6)." };
  }
  if (!start_date) return { error: "Bitte wähle ein Startdatum für den Kurs." };
  if (!start_time) return { error: "Bitte gib eine Startzeit an." };
  if (duration_minutes === null || duration_minutes <= 0) {
    return { error: "Bitte gib eine gültige Dauer in Minuten an." };
  }
  if (!recurrence_type) return { error: "Bitte wähle eine Wiederholung." };
  if (trial_mode !== "all_sessions" && trial_mode !== "manual") {
    return { error: "Bitte wähle eine gültige Probestunden-Regel." };
  }

  const startDateWeekday = getWeekdayForDate(start_date);
  if (startDateWeekday === null) {
    return { error: "Bitte wähle ein gültiges Startdatum für den Kurs." };
  }
  if (startDateWeekday !== weekday) {
    return { error: "Das Startdatum muss zum gewählten Wochentag passen." };
  }

  const starts_at = combineCourseStartsAtISO(start_date, start_time);
  if (!starts_at) {
    return { error: "Startdatum konnte nicht berechnet werden. Bitte prüfe Startdatum und Startzeit." };
  }

  const price_cents = parseOptionalInt(formData.get("price_cents"));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";

  if (options.mode === "create") {
    const { data: inserted, error } = await supabase
      .from("courses")
      .insert({
        teacher_id: user.id,
        kind: "course",
        title,
        description,
        location,
        capacity,
        weekday,
        start_time,
        duration_minutes,
        recurrence_type,
        trial_mode,
        starts_at,
        price_cents,
        currency,
        is_published: false,
      })
      .select("id")
      .single();

    if (error) {
      logSupabaseError("insert.courses(course)", error);
      return { error: formatUserSupabaseError(error) };
    }

    redirect(`/dashboard/courses/${inserted.id}`);
  }

  const ownership = await assertTeacherOwnsCourse(supabase, user.id, options.courseId);
  if (!ownership.ok) return { error: ownership.error ?? "Angebot nicht gefunden." };

  const { error } = await supabase
    .from("courses")
    .update({
      title,
      description,
      location,
      capacity,
      weekday,
      start_time,
      duration_minutes,
      recurrence_type,
      trial_mode,
      starts_at,
      price_cents,
      currency,
    })
    .eq("id", options.courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "course");

  if (error) {
    logSupabaseError("update.courses(course)", error);
    return { error: formatUserSupabaseError(error) };
  }

  redirect(`/dashboard/courses/${options.courseId}?saved=1`);
}

export async function createWorkshopAction(formData: FormData): Promise<ActionResult> {
  return createOrUpdateWorkshop(formData, { mode: "create" });
}

export async function updateWorkshopAction(courseId: string, formData: FormData): Promise<ActionResult> {
  return createOrUpdateWorkshop(formData, { mode: "update", courseId });
}

export async function createCourseAction(formData: FormData): Promise<ActionResult> {
  return createOrUpdateCourse(formData, { mode: "create" });
}

export async function updateCourseAction(courseId: string, formData: FormData): Promise<ActionResult> {
  return createOrUpdateCourse(formData, { mode: "update", courseId });
}
