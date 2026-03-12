"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

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

function parseDatetimeLocalToISO(value: FormDataEntryValue | null): string | null {
  const s = value ? String(value).trim() : "";
  if (!s) return null;
  // datetime-local: "YYYY-MM-DDTHH:mm" (no timezone). JS Date interprets it as local time.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

function computeNextCourseStartsAtISO(weekday: number, startTime: string): string | null {
  const time = parseTimeParts(startTime);
  if (!time) return null;

  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    time.hour,
    time.minute,
    0,
    0
  );

  const dayDelta = (weekday - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + dayDelta);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate.toISOString();
}

function parseSessionsJson(formData: FormData): Array<{ starts_at: string; ends_at: string }> | null {
  const raw = String(formData.get("sessions_json") || "").trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const out: Array<{ starts_at: string; ends_at: string }> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const starts_at = (item as any).starts_at;
    const ends_at = (item as any).ends_at;
    if (typeof starts_at !== "string" || typeof ends_at !== "string") return null;

    const s = new Date(starts_at);
    const e = new Date(ends_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (e.getTime() <= s.getTime()) return null;

    out.push({ starts_at, ends_at });
  }
  return out;
}

function logSupabaseError(context: string, error: any) {
  console.error("[SupabaseError]", {
    context,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}

function formatUserSupabaseError(error: any): string {
  const msg = String(error?.message || "Unbekannter Fehler").slice(0, 160);
  if (process.env.NODE_ENV !== "production") {
    const code = error?.code ? ` code=${error.code}` : "";
    const hint = error?.hint ? ` hint=${String(error.hint).slice(0, 80)}` : "";
    return `${msg}${code}${hint}`;
  }
  return msg;
}

// WORKSHOP (multi-session)  calls DB RPC public.create_workshop_with_sessions
export async function createWorkshopAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    logSupabaseError("auth.getUser", userErr);
    return { error: formatUserSupabaseError(userErr) };
  }
  if (!userData.user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Bitte gib einen Titel an." };

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const capacity = parseOptionalInt(formData.get("capacity"));

  // price_cents should already be sent as integer by the form (EUR input -> cents conversion in client)
  const price_cents = parseOptionalInt(formData.get("price_cents"));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";

  const sessions = parseSessionsJson(formData);
  if (!sessions) return { error: "Bitte füge mindestens einen gültigen Termin hinzu (Ende nach Start)." };

  // IMPORTANT: This RPC must exist in Supabase SQL Editor (or applied migration), otherwise you'll get PGRST202.
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

// COURSE (single-row insert for now)
export async function createCourseAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    logSupabaseError("auth.getUser", userErr);
    return { error: formatUserSupabaseError(userErr) };
  }
  if (!userData.user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Bitte gib einen Titel an." };

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const capacity = parseOptionalInt(formData.get("capacity"));

  const weekday = parseOptionalInt(formData.get("weekday"));
  const start_time = String(formData.get("start_time") || "").trim();
  const duration_minutes = parseOptionalInt(formData.get("duration_minutes"));
  const recurrence_type = String(formData.get("recurrence_type") || "").trim();
  const trial_mode = String(formData.get("trial_mode") || "all_sessions")
    .trim()
    .toLowerCase();

  if (weekday === null || weekday < 0 || weekday > 6) return { error: "Bitte wähle einen gültigen Wochentag (0-6)." };
  if (!start_time) return { error: "Bitte gib eine Startzeit an." };
  if (duration_minutes === null || duration_minutes <= 0) return { error: "Bitte gib eine gültige Dauer in Minuten an." };
  if (!recurrence_type) return { error: "Bitte wähle eine Wiederholung." };
  if (trial_mode !== "all_sessions" && trial_mode !== "manual") {
    return { error: "Bitte wähle eine gültige Probestunden-Regel." };
  }

  const starts_at =
    parseDatetimeLocalToISO(formData.get("starts_at")) ??
    computeNextCourseStartsAtISO(weekday, start_time);
  if (!starts_at) return { error: "Startdatum konnte nicht berechnet werden. Bitte pruefe den Wochentag und die Startzeit." };

  const price_cents = parseOptionalInt(formData.get("price_cents"));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";

  const { data: inserted, error } = await supabase
    .from("courses")
    .insert({
      teacher_id: userData.user.id,
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

  redirect("/dashboard/courses?created=1");
}
