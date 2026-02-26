"use server";

/*
Manual test checklist (dashboard only)
1. Open /dashboard/courses/new?kind=workshop while logged in.
2. Fill required workshop fields and submit.
3. Confirm redirect to /dashboard/courses/[id] and detail page shows the new draft.
4. Open /dashboard/courses/new?kind=course while logged in.
5. Fill course recurrence fields and submit.
6. Confirm redirect to /dashboard/courses/[id] and detail page shows the new draft.
7. Confirm public routes (/courses, /courses/[id]) and courses_lite-based flows are unchanged.
*/

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = string | null | void;
type RecurrenceType = "weekly" | "biweekly" | "monthly";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseOptionalInt(raw: string) {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function parseRequiredInt(raw: string) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function parseDateTimeLocalToIso(raw: string) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function summarizeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details ?? "") : "";
  const reason = message || details || code;
  if (!reason) return null;

  const normalized = reason.toLowerCase();
  if (
    code === "42501" ||
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("rls")
  ) {
    return "RLS/permission denied";
  }

  return reason.length > 120 ? `${reason.slice(0, 117)}...` : reason;
}

function logSupabaseError(context: string, error: unknown) {
  if (!error || typeof error !== "object") {
    console.error({ context, error });
    return;
  }

  const err = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  console.error({
    context,
    message: err.message ?? null,
    code: err.code ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
  });
}

function formatUserSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return "Unbekannter Fehler.";
  const err = error as { message?: unknown; code?: unknown; hint?: unknown };
  const message = String(err.message ?? "Unbekannter Fehler.");
  const truncated = message.length > 160 ? `${message.slice(0, 157)}...` : message;
  const debug = process.env.NODE_ENV !== "production";
  if (!debug) return truncated;

  const code = err.code ? ` code=${String(err.code)}` : "";
  const hint = err.hint ? ` hint=${String(err.hint)}` : "";
  return `${truncated}${code}${hint}`;
}

function computeNextOccurrenceIso(weekday: number, startTime: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
    0
  );

  let deltaDays = (weekday - candidate.getDay() + 7) % 7;
  if (deltaDays === 0 && candidate <= now) {
    deltaDays = 7;
  }

  candidate.setDate(candidate.getDate() + deltaDays);
  return candidate.toISOString();
}

async function requireUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createWorkshopAction(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUserId();

  const title = getString(formData, "title");
  const description = getString(formData, "description");
  const location = getString(formData, "location");
  const capacity = parseOptionalInt(getString(formData, "capacity"));
  const price_cents = parseOptionalInt(getString(formData, "price_cents"));
  const currency = (getString(formData, "currency") || "EUR").toUpperCase();
  const sessionsRaw = getString(formData, "sessions_json");

  if (!title) return "Bitte gib einen Titel ein.";
  if (capacity !== null && capacity < 1) return "Kapazitaet muss mindestens 1 sein.";
  if (price_cents !== null && price_cents < 0) return "Preis darf nicht negativ sein.";
  if (!currency) return "Bitte gib eine Waehrung an.";

  if (!sessionsRaw) return "Bitte fuege mindestens einen Termin hinzu.";

  let sessions: Array<{ starts_at: string; ends_at: string }> = [];
  try {
    const parsed = JSON.parse(sessionsRaw);
    if (Array.isArray(parsed)) {
      sessions = parsed.map((item) => ({
        starts_at: String(item?.starts_at ?? "").trim(),
        ends_at: String(item?.ends_at ?? "").trim(),
      }));
    }
  } catch {
    return "Termine konnten nicht gelesen werden.";
  }

  if (sessions.length === 0) return "Bitte fuege mindestens einen Termin hinzu.";

  const normalizedSessions: Array<{ starts_at: string; ends_at: string }> = [];
  for (const session of sessions) {
    const starts_at = parseDateTimeLocalToIso(session.starts_at);
    const ends_at = parseDateTimeLocalToIso(session.ends_at);
    if (!starts_at || !ends_at) {
      return "Bitte pruefe die Start- und Endzeiten der Termine.";
    }
    const startDate = new Date(starts_at);
    const endDate = new Date(ends_at);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return "Bitte pruefe die Start- und Endzeiten der Termine.";
    }
    if (endDate <= startDate) {
      return "Jeder Termin benoetigt ein Ende nach dem Start.";
    }
    normalizedSessions.push({ starts_at, ends_at });
  }

  if (normalizedSessions.length === 0) return "Bitte fuege mindestens einen Termin hinzu.";

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "create_workshop_with_sessions",
    {
      p_title: title,
      p_description: description || null,
      p_location: location || null,
      p_capacity: capacity,
      p_price_cents: price_cents,
      p_currency: currency,
      p_sessions: normalizedSessions,
    }
  );

  if (rpcError || !rpcData) {
    logSupabaseError("createWorkshopAction.rpc", rpcError);
    return formatUserSupabaseError(rpcError);
  }

  const courseId = String(rpcData);
  if (!courseId) {
    return "Workshop konnte nicht gespeichert werden. Bitte versuche es erneut.";
  }

  redirect(`/dashboard/courses/${courseId}`);
}

export async function createCourseAction(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUserId();

  const title = getString(formData, "title");
  const description = getString(formData, "description");
  const location = getString(formData, "location");
  const capacity = parseOptionalInt(getString(formData, "capacity"));
  const weekday = parseRequiredInt(getString(formData, "weekday"));
  const start_time = getString(formData, "start_time");
  const duration_minutes = parseRequiredInt(getString(formData, "duration_minutes"));
  const recurrence_type = getString(formData, "recurrence_type") as RecurrenceType;
  const price_cents = parseOptionalInt(getString(formData, "price_cents"));
  const currency = (getString(formData, "currency") || "EUR").toUpperCase();

  if (!title) return "Bitte gib einen Titel ein.";
  if (weekday === null || weekday < 0 || weekday > 6) return "Bitte waehle einen Wochentag.";
  if (!/^\d{2}:\d{2}$/.test(start_time)) return "Bitte gib eine gueltige Startzeit an.";
  if (duration_minutes === null || duration_minutes < 1) {
    return "Bitte gib eine gueltige Dauer in Minuten an.";
  }
  if (!["weekly", "biweekly", "monthly"].includes(recurrence_type)) {
    return "Bitte waehle einen gueltigen Rhythmus.";
  }
  if (capacity !== null && capacity < 1) return "Kapazitaet muss mindestens 1 sein.";
  if (price_cents !== null && price_cents < 0) return "Preis darf nicht negativ sein.";
  if (!currency) return "Bitte gib eine Waehrung an.";

  // Simple local-time computation on the server: next occurrence for weekday + HH:MM.
  const starts_at = computeNextOccurrenceIso(weekday, start_time);
  if (!starts_at) return "Der erste Termin konnte nicht berechnet werden.";

  const { data, error } = await supabase
    .from("courses")
    .insert({
      teacher_id: userId,
      kind: "course",
      is_published: false,
      title,
      description: description || null,
      location: location || null,
      capacity,
      starts_at,
      weekday,
      start_time,
      duration_minutes,
      recurrence_type,
      price_cents,
      currency,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    logSupabaseError("createCourseAction.insertCourse", error);
    return formatUserSupabaseError(error);
  }

  redirect(`/dashboard/courses/${data.id}`);
}
