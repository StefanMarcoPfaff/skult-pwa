"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeUpcomingTrialSlots } from "./trial-slots";

export type TrialReservationState = {
  error?: string;
};

type CourseLiteTrialRow = {
  id: string;
  kind: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  starts_at: string | null;
};

function requiredText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isDuplicateReservationError(error: unknown): boolean {
  const supabaseError = error as { code?: string; message?: string } | null;
  if (!supabaseError) return false;
  if (supabaseError.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(supabaseError.message ?? ""));
}

export async function reserveTrialAction(
  courseId: string,
  _prevState: TrialReservationState,
  formData: FormData
): Promise<TrialReservationState> {
  const firstName = requiredText(formData.get("first_name"));
  const lastName = requiredText(formData.get("last_name"));
  const email = requiredText(formData.get("email")).toLowerCase();
  const selectedTrialStart = requiredText(formData.get("trial_starts_at"));

  if (!firstName) return { error: "Bitte gib deinen Vornamen ein." };
  if (!lastName) return { error: "Bitte gib deinen Nachnamen ein." };
  if (!email || !isValidEmail(email)) return { error: "Bitte gib eine gueltige E-Mail-Adresse ein." };
  if (!selectedTrialStart) return { error: "Bitte waehle einen Probestunden-Termin aus." };

  const supabase = await createSupabaseServerClient();

  const { data: course, error: courseError } = await supabase
    .from("courses_lite")
    .select("id,kind,weekday,start_time,duration_minutes,recurrence_type,trial_mode,starts_at")
    .eq("id", courseId)
    .eq("is_published", true)
    .maybeSingle<CourseLiteTrialRow>();

  if (courseError || !course || course.kind !== "course") {
    return { error: "Kurs nicht gefunden." };
  }

  if ((course.trial_mode ?? "all_sessions") !== "all_sessions") {
    return { error: "Probestunden-Termine werden in Kuerze verfuegbar sein." };
  }

  const availableSlots = computeUpcomingTrialSlots({
    weekday: course.weekday,
    startTime: course.start_time,
    durationMinutes: course.duration_minutes,
    recurrenceType: course.recurrence_type,
    trialMode: course.trial_mode,
    startsAt: course.starts_at,
  });

  if (availableSlots.length === 0) {
    return { error: "Aktuell sind keine Probestunden-Termine verfuegbar." };
  }

  const selectedSlot = availableSlots.find((slot) => slot.startsAt === selectedTrialStart);
  if (!selectedSlot) {
    return { error: "Bitte waehle einen gueltigen Probestunden-Termin aus." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("trial_reservations")
    .select("id")
    .eq("course_id", courseId)
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return { error: "Reservierung fehlgeschlagen. Bitte versuche es erneut." };
  }

  if (existing) {
    return {
      error:
        "Für diesen Kurs liegt bereits eine Probestunden-Anfrage mit dieser E-Mail-Adresse vor.",
    };
  }

  const { error: insertError } = await supabase.from("trial_reservations").insert({
    course_id: courseId,
    first_name: firstName,
    last_name: lastName,
    email,
    status: "pending",
    user_id: null,
    trial_starts_at: selectedSlot.startsAt,
    trial_ends_at: selectedSlot.endsAt,
  });

  if (insertError) {
    if (isDuplicateReservationError(insertError)) {
      return {
        error:
          "Für diesen Kurs liegt bereits eine Probestunden-Anfrage mit dieser E-Mail-Adresse vor.",
      };
    }
    return { error: "Reservierung fehlgeschlagen. Bitte versuche es erneut." };
  }

  redirect(`/courses/${courseId}?reserved=1`);
}
