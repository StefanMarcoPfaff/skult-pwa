import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTeacherTrialReservationCancellationEmail } from "@/lib/trial-reservation-emails";

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  location: string | null;
  teacher_id: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logCancellationError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial cancellation]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
}

async function loadMailContext(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,location,teacher_id")
    .eq("id", courseId)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logCancellationError("load-mail-course", courseError);
    return null;
  }

  let teacherName: string | null = null;
  let teacherEmail: string | null = null;

  if (course.teacher_id) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>(),
      admin.auth.admin.getUserById(course.teacher_id),
    ]);

    const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
    teacherName = nameParts.length > 0 ? nameParts.join(" ") : null;
    teacherEmail = authResult.data.user?.email ?? null;
  }

  return {
    courseTitle: course.title ?? "Kurs",
    location: course.location,
    teacherName,
    teacherEmail,
  };
}

async function notifyTeacherAboutCancellation(
  admin: ReturnType<typeof createSupabaseAdmin>,
  reservation: TrialReservationRow
) {
  if (!reservation.email || !reservation.trial_starts_at || !reservation.trial_ends_at) {
    return;
  }

  const mailContext = await loadMailContext(admin, reservation.course_id);
  if (!mailContext) return;

  try {
    await sendTeacherTrialReservationCancellationEmail({
      reservationId: reservation.id,
      courseTitle: mailContext.courseTitle,
      teacherName: mailContext.teacherName,
      teacherEmail: mailContext.teacherEmail,
      customerName: [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim(),
      customerEmail: reservation.email,
      location: mailContext.location,
      trialStartsAt: reservation.trial_starts_at,
      trialEndsAt: reservation.trial_ends_at,
      cancelUrl: "",
    });
  } catch (error) {
    logCancellationError("send-teacher-cancellation", error);
  }
}

export default async function TrialCancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const { data: reservation, error } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at,cancelled_at")
    .eq("cancel_token", token)
    .maybeSingle<TrialReservationRow>();

  if (error || !reservation) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Stornierung nicht möglich</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Stornierungslink ist ungültig oder die Reservierung wurde nicht gefunden.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  if (reservation.cancelled_at) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Reservierung bereits storniert</h1>
        <p className="text-sm text-muted-foreground">
          Diese Probestunden-Reservierung wurde bereits storniert.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  const { error: updateError } = await admin
    .from("trial_reservations")
    .update({
      cancelled_at: new Date().toISOString(),
      status: "cancelled",
    })
    .eq("id", reservation.id);

  if (updateError) {
    logCancellationError("cancel-reservation", updateError);
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Stornierung nicht möglich</h1>
        <p className="text-sm text-muted-foreground">
          Die Probestunden-Reservierung konnte gerade nicht storniert werden. Bitte versuche es erneut.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  await notifyTeacherAboutCancellation(admin, reservation);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Reservierung storniert</h1>
      <p className="text-sm text-muted-foreground">
        Deine Probestunden-Reservierung wurde storniert.
      </p>
      <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
        Zu den Kursen
      </Link>
    </main>
  );
}
