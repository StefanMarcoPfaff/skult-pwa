"use server";

import { redirect } from "next/navigation";
import {
  getProviderDisplayName,
  isWorkshopStornoPolicy,
  type ProviderType,
} from "@/lib/provider-profiles";
import { generateRecurringCourseSessions } from "@/lib/course-sessions";
import { getOfferImageUrl, validateOfferImageFile } from "@/lib/offer-image-upload";
import { uploadOfferImage } from "@/lib/offer-image-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getWorkshopCheckoutCurrency,
  isWorkshopCheckoutCurrencySupported,
  normalizeWorkshopCurrency,
} from "@/lib/workshop-checkout";

type WorkshopSection =
  | "basic"
  | "location"
  | "schedule"
  | "booking"
  | "payment"
  | "publishing";
type WorkshopValidationIssue = {
  field: string;
  message: string;
  section: WorkshopSection;
};
type WorkshopFieldErrors = Record<string, string>;
type ActionResult = {
  error?: string;
  fieldErrors?: WorkshopFieldErrors;
  validationErrors?: WorkshopValidationIssue[];
  redirectTo?: string;
};
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

type TrialSlotInsert = {
  course_id: string;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
  source_type: "manual";
};

function extractCourseIdFromRpcResult(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const candidate = (value as Record<string, unknown>).create_workshop_with_sessions;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function parseOfferVisibility(value: FormDataEntryValue | null): "public" | "private_link" {
  return value === "private_link" ? "private_link" : "public";
}

function parseSinglePaymentOfferKind(value: FormDataEntryValue | null): "workshop" | "exclusive_offer" {
  return value === "exclusive_offer" ? "exclusive_offer" : "workshop";
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function getWorkshopFieldSection(field: string): WorkshopSection {
  if (
    field === "title" ||
    field === "description" ||
    field === "offer_image_file"
  ) {
    return "basic";
  }
  if (field === "location" || field === "location_details" || field === "instructor_name") {
    return "location";
  }
  if (field === "sessions") return "schedule";
  if (field === "capacity" || field === "max_guest_count_per_booking") return "booking";
  if (
    field === "price_eur" ||
    field === "currency" ||
    field === "workshop_storno_policy" ||
    field === "reservation_notice"
  ) {
    return "payment";
  }
  return "publishing";
}

function buildWorkshopValidationResult(errors: WorkshopValidationIssue[]): ActionResult {
  const fieldErrors = errors.reduce<WorkshopFieldErrors>((acc, issue) => {
    acc[issue.field] = issue.message;
    return acc;
  }, {});
  return {
    error: "Bitte korrigiere die markierten Angaben.",
    fieldErrors,
    validationErrors: errors,
  };
}

function validationIssue(field: string, message: string): WorkshopValidationIssue {
  return { field, message, section: getWorkshopFieldSection(field) };
}

function validationError(field: string, message: string): ActionResult {
  return buildWorkshopValidationResult([validationIssue(field, message)]);
}

function parseRequiredPositiveInt(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseRequiredNonNegativeInt(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseWorkshopPriceCents(formData: FormData): { value: number | null } | { error: string } {
  const rawPrice = String(formData.get("price_eur") ?? "").trim();
  if (!rawPrice) return { value: null };
  const parsedPrice = Number(rawPrice.replace(",", "."));
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return { error: "Bitte einen gültigen Preis eingeben." };
  }
  return { value: Math.round(parsedPrice * 100) };
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function getOfferImageInput(formData: FormData): {
  existingOfferImageUrl: string | null;
  offerImageFile: File | null;
} {
  const existingOfferImageUrl = getOfferImageUrl(parseOptionalString(formData.get("existing_offer_image_url")));
  const file = formData.get("offer_image_file");
  return {
    existingOfferImageUrl,
    offerImageFile: file instanceof File && file.size > 0 ? file : null,
  };
}

async function resolveOfferImageUrl(formData: FormData, offerId: string): Promise<{ url: string | null } | { error: string }> {
  const { existingOfferImageUrl, offerImageFile } = getOfferImageInput(formData);
  if (!offerImageFile) return { url: existingOfferImageUrl };

  const validation = validateOfferImageFile({
    size: offerImageFile.size,
    type: offerImageFile.type,
    name: offerImageFile.name,
  });
  if (!validation.ok) return { error: validation.error };

  const uploadResult = await uploadOfferImage({ offerId, file: offerImageFile });
  if ("error" in uploadResult) return uploadResult;

  return { url: uploadResult.url };
}

function parseIsoDateTimeList(values: FormDataEntryValue[]): string[] {
  const out = new Set<string>();

  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) continue;
    out.add(parsed.toISOString());
  }

  return [...out];
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

function logWorkshopSaveEvent(context: string, payload: Record<string, unknown>) {
  console.error("[workshop-save]", {
    context,
    ...payload,
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

async function withTimeout<T>(
  label: string,
  operation: PromiseLike<T>,
  timeoutMs = 20000
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
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

  return { supabase, user: user ?? null, error: null as string | null };
}

async function loadProviderProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
    .eq("id", userId)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      provider_type: ProviderType | null;
      organization_name: string | null;
    }>();

  if (error) {
    logSupabaseError("select.profiles(provider-profile)", error);
    return { profile: null, error: formatUserSupabaseError(error) };
  }

  return { profile: data, error: null as string | null };
}

async function assertTeacherOwnsCourse(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  teacherId: string,
  courseId: string
) {
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
  if (!user) return { redirectTo: "/login" };

  const validationErrors: WorkshopValidationIssue[] = [];
  const title = String(formData.get("title") || "").trim();
  if (!title) validationErrors.push(validationIssue("title", "Bitte einen Titel eingeben."));

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const location_details = parseOptionalString(formData.get("location_details"));
  if (!location) validationErrors.push(validationIssue("location", "Bitte einen Ort eingeben."));
  const capacity = parseRequiredPositiveInt(formData.get("capacity"));
  if (capacity === null) {
    validationErrors.push(validationIssue("capacity", "Bitte eine maximale Teilnehmeranzahl angeben."));
  }
  const max_guest_count_per_booking = parseRequiredNonNegativeInt(formData.get("max_guest_count_per_booking"));
  if (max_guest_count_per_booking === null) {
    validationErrors.push(validationIssue(
      "max_guest_count_per_booking",
      "Bitte eine gültige Anzahl weiterer teilnehmender Personen eingeben."
    ));
  }
  const parsedPrice = parseWorkshopPriceCents(formData);
  if ("error" in parsedPrice) validationErrors.push(validationIssue("price_eur", parsedPrice.error));
  const price_cents = "error" in parsedPrice ? null : parsedPrice.value;
  const currency = normalizeWorkshopCurrency(String(formData.get("currency") || ""));
  const workshop_storno_policy = String(formData.get("workshop_storno_policy") || "").trim();
  const offerKind = parseSinglePaymentOfferKind(formData.get("offer_kind"));
  const visibility = parseOfferVisibility(formData.get("visibility"));
  if (formData.get("visibility") !== "public" && formData.get("visibility") !== "private_link") {
    validationErrors.push(validationIssue("visibility", "Bitte eine gültige Sichtbarkeit auswählen."));
  }
  const internal_note = parseOptionalString(formData.get("internal_note"));
  const reservation_notice = parseOptionalString(formData.get("reservation_notice"));
  const { offerImageFile } = getOfferImageInput(formData);
  if (offerImageFile) {
    const validation = validateOfferImageFile({
      size: offerImageFile.size,
      type: offerImageFile.type,
      name: offerImageFile.name,
    });
    if (!validation.ok) validationErrors.push(validationIssue("offer_image_file", validation.error));
  }
  const sessions = parseSessionsJson(formData);
  if (!sessions) validationErrors.push(validationIssue("sessions", "Bitte mindestens einen Termin angeben."));
  if (
    capacity !== null &&
    max_guest_count_per_booking !== null &&
    max_guest_count_per_booking > Math.max(0, capacity - 1)
  ) {
    validationErrors.push(validationIssue("max_guest_count_per_booking", "Weitere teilnehmende Personen pro Buchung dürfen höchstens Kapazität minus 1 sein."));
  }
  if (!isWorkshopStornoPolicy(workshop_storno_policy)) {
    validationErrors.push(validationIssue("workshop_storno_policy", "Bitte eine gültige Storno-Regel auswählen."));
  }

  if (!isWorkshopCheckoutCurrencySupported(currency)) {
    validationErrors.push(validationIssue("currency", `Workshops sind aktuell nur mit ${getWorkshopCheckoutCurrency()} als Währung verfügbar.`));
  }

  const providerProfileResult = await loadProviderProfile(supabase, user.id);
  if (providerProfileResult.error) return { error: providerProfileResult.error };

  const providerType = providerProfileResult.profile?.provider_type ?? "independent_teacher";
  const providerDisplayName = getProviderDisplayName(providerType, providerProfileResult.profile ?? {});
  if (!providerDisplayName) {
    return { error: "Bitte vervollständige zuerst dein Profil, damit dein öffentlicher Profilname verfügbar ist." };
  }

  const instructorInput = parseOptionalString(formData.get("instructor_name"));
  const instructor_name = providerType === "studio_provider" ? instructorInput : providerDisplayName;
  if (!instructor_name) {
    validationErrors.push(validationIssue("instructor_name", "Bitte eine verantwortliche Person für dieses Angebot angeben."));
  }

  if (validationErrors.length > 0) {
    return buildWorkshopValidationResult(validationErrors);
  }
  if (!sessions || capacity === null || max_guest_count_per_booking === null || "error" in parsedPrice) {
    return buildWorkshopValidationResult(validationErrors);
  }

  logWorkshopSaveEvent("start", {
    mode: options.mode,
    courseId: options.mode === "update" ? options.courseId : null,
    teacherId: user.id,
    offerKind,
    sessionCount: sessions.length,
    hasLocation: Boolean(location),
    hasPrice: price_cents !== null,
  });

  if (options.mode === "create") {
    if (offerKind === "exclusive_offer") {
      const firstSessionStart = sessions[0]?.starts_at ?? null;
      const lastSessionEnd = sessions[sessions.length - 1]?.ends_at ?? null;
      const { data: inserted, error: insertError } = await supabase
        .from("courses")
        .insert({
          teacher_id: user.id,
          kind: "exclusive_offer",
          title,
          description,
          location,
          location_details,
          instructor_name,
          workshop_storno_policy,
          capacity,
          max_guest_count_per_booking,
          price_cents,
          currency,
          visibility,
          internal_note,
          reservation_notice,
          starts_at: firstSessionStart,
          ends_at: lastSessionEnd,
          status: "draft",
          is_published: false,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError || !inserted) {
        logSupabaseError("insert.courses(exclusive-offer)", insertError);
        return { error: formatUserSupabaseError(insertError) };
      }

      const { error: sessionInsertError } = await supabase.from("course_sessions").insert(
        sessions.map((session) => ({
          course_id: inserted.id,
          starts_at: session.starts_at,
          ends_at: session.ends_at,
        }))
      );

      if (sessionInsertError) {
        logSupabaseError("insert.course_sessions(exclusive-offer)", sessionInsertError);
        return { error: formatUserSupabaseError(sessionInsertError) };
      }

      const offerImageResult = await resolveOfferImageUrl(formData, inserted.id);
      if ("error" in offerImageResult) return validationError("offer_image_file", offerImageResult.error);
      if (offerImageResult.url) {
        const { error: imageUpdateError } = await supabase
          .from("courses")
          .update({ offer_image_url: offerImageResult.url })
          .eq("id", inserted.id)
          .eq("teacher_id", user.id);
        if (imageUpdateError) {
          logSupabaseError("update.courses(exclusive-offer-image)", imageUpdateError);
          return { error: formatUserSupabaseError(imageUpdateError) };
        }
      }

      return { redirectTo: `/dashboard/courses/${inserted.id}` };
    }

    try {
      const { data, error } = await withTimeout(
        "rpc.create_workshop_with_sessions",
        supabase.rpc("create_workshop_with_sessions", {
          p_title: title,
          p_description: description,
          p_location: location,
          p_location_details: location_details,
          p_instructor_name: instructor_name,
          p_workshop_storno_policy: workshop_storno_policy,
          p_capacity: capacity,
          p_max_guest_count_per_booking: max_guest_count_per_booking,
          p_price_cents: price_cents,
          p_currency: currency,
          p_sessions: sessions,
        })
      );

      if (error) {
        logSupabaseError("rpc.create_workshop_with_sessions", error);
        return { error: formatUserSupabaseError(error) };
      }

      const newId = extractCourseIdFromRpcResult(data);
      if (!newId) return { error: "Workshop wurde erstellt, aber keine ID zurueckgegeben." };

      const offerImageResult = await resolveOfferImageUrl(formData, newId);
      if ("error" in offerImageResult) return validationError("offer_image_file", offerImageResult.error);

      const { error: statusUpdateError } = await supabase
        .from("courses")
        .update({
          status: "draft",
          is_published: false,
          visibility,
          internal_note,
          reservation_notice,
          offer_image_url: offerImageResult.url,
        })
        .eq("id", newId)
        .eq("teacher_id", user.id)
        .eq("kind", "workshop");

      if (statusUpdateError) {
        logSupabaseError("update.courses(workshop-create-status)", statusUpdateError);
        return { error: formatUserSupabaseError(statusUpdateError) };
      }

      const ownership = await assertTeacherOwnsCourse(supabase, user.id, newId);
      if (!ownership.ok) {
        return { error: ownership.error ?? "Neues Angebot wurde erstellt, konnte aber nicht erneut geladen werden." };
      }

      return { redirectTo: `/dashboard/courses/${newId}` };
    } catch (error: unknown) {
      logWorkshopSaveEvent("timeout_or_exception", {
        mode: "create",
        teacherId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        error:
          "Das Speichern des Workshops dauert zu lange oder konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
      };
    }
  }

  const ownership = await assertTeacherOwnsCourse(supabase, user.id, options.courseId);
  if (!ownership.ok) return { error: ownership.error ?? "Angebot nicht gefunden." };

  const firstSessionStart = sessions[0]?.starts_at ?? null;
  const offerImageResult = await resolveOfferImageUrl(formData, options.courseId);
  if ("error" in offerImageResult) return validationError("offer_image_file", offerImageResult.error);

  try {
    const lastSessionEnd = sessions[sessions.length - 1]?.ends_at ?? null;
    const { error: updateCourseError } = await withTimeout(
      "update.courses(workshop)",
      supabase
        .from("courses")
        .update({
          title,
          description,
          location,
          location_details,
          instructor_name,
          workshop_storno_policy,
          capacity,
          max_guest_count_per_booking,
          price_cents,
          currency,
          starts_at: firstSessionStart,
          ends_at: offerKind === "exclusive_offer" ? lastSessionEnd : null,
          visibility,
          internal_note,
          reservation_notice,
          offer_image_url: offerImageResult.url,
        })
        .eq("id", options.courseId)
        .eq("teacher_id", user.id)
        .eq("kind", offerKind)
    );

    if (updateCourseError) {
      logSupabaseError("update.courses(workshop)", updateCourseError);
      return { error: formatUserSupabaseError(updateCourseError) };
    }

    const { error: deleteSessionsError } = await withTimeout(
      "delete.course_sessions(workshop)",
      supabase.from("course_sessions").delete().eq("course_id", options.courseId)
    );

    if (deleteSessionsError) {
      logSupabaseError("delete.course_sessions(workshop)", deleteSessionsError);
      return { error: formatUserSupabaseError(deleteSessionsError) };
    }

    const { error: insertSessionsError } = await withTimeout(
      "insert.course_sessions(workshop)",
      supabase.from("course_sessions").insert(
        sessions.map((session) => ({
          course_id: options.courseId,
          starts_at: session.starts_at,
          ends_at: session.ends_at,
        }))
      )
    );

    if (insertSessionsError) {
      logSupabaseError("insert.course_sessions(workshop)", insertSessionsError);
      return { error: formatUserSupabaseError(insertSessionsError) };
    }

    return { redirectTo: `/dashboard/courses/${options.courseId}?saved=1` };
  } catch (error: unknown) {
    logWorkshopSaveEvent("timeout_or_exception", {
      mode: "update",
      courseId: options.courseId,
      teacherId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      error:
        "Das Speichern des Workshops dauert zu lange oder konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
    };
  }
}

async function createOrUpdateCourse(
  formData: FormData,
  options: { mode: "create" } | { mode: "update"; courseId: string }
): Promise<ActionResult> {
  const { supabase, user, error: authError } = await requireTeacher();
  if (authError) return { error: authError };
  if (!user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Bitte gib einen Titel an." };

  const description = parseOptionalString(formData.get("description"));
  const location = parseOptionalString(formData.get("location"));
  const location_details = parseOptionalString(formData.get("location_details"));
  const capacity = parseOptionalInt(formData.get("capacity"));

  const weekday = parseOptionalInt(formData.get("weekday"));
  const start_date = String(formData.get("start_date") || "").trim();
  const start_time = String(formData.get("start_time") || "").trim();
  const duration_minutes = parseOptionalInt(formData.get("duration_minutes"));
  const recurrence_type = String(formData.get("recurrence_type") || "").trim();
  const trial_mode = String(formData.get("trial_mode") || "all_sessions").trim().toLowerCase();
  const visibility = parseOfferVisibility(formData.get("visibility"));
  const internal_note = parseOptionalString(formData.get("internal_note"));
  const { offerImageFile } = getOfferImageInput(formData);
  if (offerImageFile) {
    const validation = validateOfferImageFile({
      size: offerImageFile.size,
      type: offerImageFile.type,
      name: offerImageFile.name,
    });
    if (!validation.ok) return { error: validation.error };
  }
  const selectedTrialSlotStarts = parseIsoDateTimeList(formData.getAll("trial_slot_starts_at"));
  const cancellation_model = "monthly";

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

  const validManualTrialOccurrences =
    trial_mode === "manual"
      ? generateRecurringCourseSessions({
          starts_at,
          weekday,
          start_time,
          duration_minutes,
          recurrence_type,
          fromDate: new Date(starts_at),
          untilDate: new Date(new Date(starts_at).setMonth(new Date(starts_at).getMonth() + 6)),
          limit: 12,
        })
      : [];

  if (trial_mode === "manual" && selectedTrialSlotStarts.length === 0) {
    return { error: "Bitte wähle mindestens einen Termin für Probestunden aus." };
  }

  const manualTrialSlots: TrialSlotInsert[] =
    trial_mode === "manual"
      ? validManualTrialOccurrences
          .filter((occurrence) => selectedTrialSlotStarts.includes(occurrence.starts_at))
          .map((occurrence) => ({
            course_id: "",
            starts_at: occurrence.starts_at,
            ends_at: occurrence.ends_at,
            is_open: true,
            source_type: "manual" as const,
          }))
      : [];

  if (trial_mode === "manual" && manualTrialSlots.length !== selectedTrialSlotStarts.length) {
    return { error: "Mindestens einer der ausgewählten Probestunden-Termine ist ungültig." };
  }

  const price_cents = parseOptionalInt(formData.get("price_cents"));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";

  const providerProfileResult = await loadProviderProfile(supabase, user.id);
  if (providerProfileResult.error) return { error: providerProfileResult.error };

  const providerType = providerProfileResult.profile?.provider_type ?? "independent_teacher";
  const providerDisplayName = getProviderDisplayName(providerType, providerProfileResult.profile ?? {});
  if (!providerDisplayName) {
    return { error: "Bitte vervollständige zuerst dein Profil, damit dein öffentlicher Profilname verfügbar ist." };
  }

  const instructorInput = parseOptionalString(formData.get("instructor_name"));
  const instructor_name = providerType === "studio_provider" ? instructorInput : providerDisplayName;

  if (!instructor_name) {
    return { error: "Bitte gib eine zuständige Person für dieses laufende Angebot an." };
  }

  if (options.mode === "create") {
    const { data: inserted, error } = await supabase
      .from("courses")
      .insert({
        teacher_id: user.id,
        kind: "course",
        title,
        description,
        location,
        location_details,
        capacity,
        weekday,
        start_time,
        duration_minutes,
        recurrence_type,
        trial_mode,
        instructor_name,
        cancellation_model,
        starts_at,
        price_cents,
        currency,
        status: "draft",
        is_published: false,
        visibility,
        internal_note,
      })
      .select("id")
      .single();

    if (error) {
      logSupabaseError("insert.courses(course)", error);
      return { error: formatUserSupabaseError(error) };
    }

    if (manualTrialSlots.length > 0) {
      const { error: insertTrialSlotsError } = await supabase.from("trial_slots").insert(
        manualTrialSlots.map((slot) => ({
          ...slot,
          course_id: inserted.id,
        }))
      );

      if (insertTrialSlotsError) {
        logSupabaseError("insert.trial_slots(course-create)", insertTrialSlotsError);
        return { error: formatUserSupabaseError(insertTrialSlotsError) };
      }
    }

    const offerImageResult = await resolveOfferImageUrl(formData, inserted.id);
    if ("error" in offerImageResult) return { error: offerImageResult.error };
    if (offerImageResult.url) {
      const { error: imageUpdateError } = await supabase
        .from("courses")
        .update({ offer_image_url: offerImageResult.url })
        .eq("id", inserted.id)
        .eq("teacher_id", user.id);
      if (imageUpdateError) {
        logSupabaseError("update.courses(course-image)", imageUpdateError);
        return { error: formatUserSupabaseError(imageUpdateError) };
      }
    }

    redirect(`/dashboard/courses/${inserted.id}`);
  }

  const ownership = await assertTeacherOwnsCourse(supabase, user.id, options.courseId);
  if (!ownership.ok) return { error: ownership.error ?? "Angebot nicht gefunden." };
  const offerImageResult = await resolveOfferImageUrl(formData, options.courseId);
  if ("error" in offerImageResult) return { error: offerImageResult.error };

  const { error } = await supabase
    .from("courses")
    .update({
      title,
      description,
      location,
      location_details,
      capacity,
      weekday,
      start_time,
      duration_minutes,
      recurrence_type,
      trial_mode,
      instructor_name,
      cancellation_model,
      starts_at,
      price_cents,
      currency,
      visibility,
      internal_note,
      offer_image_url: offerImageResult.url,
    })
    .eq("id", options.courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "course");

  if (error) {
    logSupabaseError("update.courses(course)", error);
    return { error: formatUserSupabaseError(error) };
  }

  const { error: deleteTrialSlotsError } = await supabase
    .from("trial_slots")
    .delete()
    .eq("course_id", options.courseId);

  if (deleteTrialSlotsError) {
    logSupabaseError("delete.trial_slots(course-update)", deleteTrialSlotsError);
    return { error: formatUserSupabaseError(deleteTrialSlotsError) };
  }

  if (manualTrialSlots.length > 0) {
    const { error: insertTrialSlotsError } = await supabase.from("trial_slots").insert(
      manualTrialSlots.map((slot) => ({
        ...slot,
        course_id: options.courseId,
      }))
    );

    if (insertTrialSlotsError) {
      logSupabaseError("insert.trial_slots(course-update)", insertTrialSlotsError);
      return { error: formatUserSupabaseError(insertTrialSlotsError) };
    }
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




