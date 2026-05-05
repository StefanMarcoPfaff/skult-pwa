import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { verifySessionCheckInToken } from "@/lib/session-checkin-token";
import SessionSelfCheckInClient from "./SessionSelfCheckInClient";

type CourseRow = {
  id: string;
  title: string | null;
  location: string | null;
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
};

function formatDateTimeRange(start: string | null, end: string | null): string {
  if (!start) return "-";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "-";

  const base = date.toLocaleDateString("de-DE", {
    dateStyle: "medium",
  });
  const startTime = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return `${base} | ${startTime}`;

  const endDate = new Date(end);
  const endTime = Number.isNaN(endDate.getTime())
    ? "-"
    : endDate.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });
  return `${base} | ${startTime}-${endTime}`;
}

export default async function SessionSelfCheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifySessionCheckInToken(token);
  if (!verified) notFound();

  const admin = createSupabaseAdmin();
  const { data: course } = await admin
    .from("courses")
    .select("id,title,location")
    .eq("id", verified.courseId)
    .maybeSingle<CourseRow>();

  if (!course) notFound();

  const { data: session } = verified.sessionId
    ? await admin
        .from("course_sessions")
        .select("id,starts_at,ends_at")
        .eq("id", verified.sessionId)
        .maybeSingle<SessionRow>()
    : { data: null };

  const eventLabel = session
    ? formatDateTimeRange(session.starts_at, session.ends_at)
    : verified.eventDate ?? "Termin";

  return (
    <SessionSelfCheckInClient
      sessionToken={token}
      offerTitle={course.title ?? "Angebot"}
      eventLabel={eventLabel}
      location={course.location}
    />
  );
}
