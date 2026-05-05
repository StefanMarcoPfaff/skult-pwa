import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { loadTicketByQrToken, type TicketRow, type TicketStatus } from "@/lib/tickets";

export type AttendanceMethod = "teacher_scan" | "participant_scan" | "manual";

export type AttendanceRow = {
  id: string;
  course_id: string;
  session_id: string | null;
  event_date: string | null;
  ticket_id: string;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  checked_in_at: string;
  checked_in_by: string | null;
  method: AttendanceMethod;
  room: string | null;
  instructor_name: string | null;
  created_at: string;
};

type AttendanceTicketRow = Pick<
  TicketRow,
  | "id"
  | "course_id"
  | "booking_id"
  | "trial_reservation_id"
  | "subscription_id"
  | "customer_name"
  | "customer_email"
  | "status"
  | "checked_in_at"
  | "checked_in_by"
>;

type AttendanceRecordResult = {
  attendance: AttendanceRow;
  ticket: AttendanceTicketRow;
  alreadyRecorded: boolean;
};

type AttendanceScope = {
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
};

function normalizeEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

function isDuplicateError(error: unknown): boolean {
  const maybeError = error as { code?: string; message?: string };
  return maybeError?.code === "23505" || /duplicate key|unique/i.test(String(maybeError?.message ?? ""));
}

async function loadTicketById(ticketId: string): Promise<AttendanceTicketRow | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("tickets")
    .select(
      "id,course_id,booking_id,trial_reservation_id,subscription_id,customer_name,customer_email,status,checked_in_at,checked_in_by"
    )
    .eq("id", ticketId)
    .maybeSingle<AttendanceTicketRow>();
  return data ?? null;
}

async function findAttendanceRecord(scope: AttendanceScope, ticketId: string): Promise<AttendanceRow | null> {
  const admin = createSupabaseAdmin();
  const eventDate = normalizeEventDate(scope.eventDate);
  const query = admin.from("attendance_records").select("*").eq("course_id", scope.courseId).eq("ticket_id", ticketId);
  const scopedQuery = scope.sessionId
    ? query.eq("session_id", scope.sessionId)
    : eventDate
      ? query.is("session_id", null).eq("event_date", eventDate)
      : null;

  if (!scopedQuery) {
    throw new Error("Attendance scope requires sessionId or eventDate.");
  }

  const { data } = await scopedQuery.maybeSingle<AttendanceRow>();
  return (data as AttendanceRow | null) ?? null;
}

async function markLegacyTicketCheckedIn(
  ticket: AttendanceTicketRow,
  checkedInAt: string,
  checkedInBy: string | null
): Promise<void> {
  const admin = createSupabaseAdmin();

  if (ticket.status === "issued") {
    await admin
      .from("tickets")
      .update({
        status: "checked_in" satisfies TicketStatus,
        checked_in_at: checkedInAt,
        checked_in_by: checkedInBy,
      })
      .eq("id", ticket.id)
      .eq("status", "issued");
  }

  if (ticket.booking_id) {
    await admin
      .from("bookings")
      .update({ checked_in_at: checkedInAt })
      .eq("id", ticket.booking_id)
      .is("checked_in_at", null);
  }
}

export async function recordAttendanceForTicket(input: {
  ticketId: string;
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  checkedInBy?: string | null;
  method: AttendanceMethod;
  room?: string | null;
  instructorName?: string | null;
}): Promise<AttendanceRecordResult> {
  const ticket = await loadTicketById(input.ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  if (ticket.course_id !== input.courseId) {
    throw new Error("Ticket does not belong to this offer.");
  }

  if (ticket.status === "cancelled" || ticket.status === "expired") {
    throw new Error("Ticket is not valid for check-in.");
  }

  const scope: AttendanceScope = {
    courseId: input.courseId,
    sessionId: input.sessionId ?? null,
    eventDate: normalizeEventDate(input.eventDate),
  };

  const existing = await findAttendanceRecord(scope, ticket.id);
  if (existing) {
    return {
      attendance: existing,
      ticket,
      alreadyRecorded: true,
    };
  }

  const checkedInAt = new Date().toISOString();
  const admin = createSupabaseAdmin();
  const payload = {
    course_id: input.courseId,
    session_id: input.sessionId ?? null,
    event_date: normalizeEventDate(input.eventDate),
    ticket_id: ticket.id,
    booking_id: ticket.booking_id,
    trial_reservation_id: ticket.trial_reservation_id,
    subscription_id: ticket.subscription_id,
    checked_in_at: checkedInAt,
    checked_in_by: input.checkedInBy ?? null,
    method: input.method,
    room: input.room ?? null,
    instructor_name: input.instructorName ?? null,
  };

  const { data, error } = await admin.from("attendance_records").insert(payload).select("*").maybeSingle<AttendanceRow>();
  if (error && isDuplicateError(error)) {
    const duplicate = await findAttendanceRecord(scope, ticket.id);
    if (duplicate) {
      return {
        attendance: duplicate,
        ticket,
        alreadyRecorded: true,
      };
    }
  }
  if (error || !data) {
    throw error ?? new Error("Attendance could not be stored.");
  }

  await markLegacyTicketCheckedIn(ticket, data.checked_in_at, input.checkedInBy ?? null);

  return {
    attendance: data,
    ticket,
    alreadyRecorded: false,
  };
}

export async function recordAttendanceForTicketToken(input: {
  qrToken: string;
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  checkedInBy?: string | null;
  method: AttendanceMethod;
  room?: string | null;
  instructorName?: string | null;
}): Promise<AttendanceRecordResult> {
  const lookup = await loadTicketByQrToken(input.qrToken);
  if (!lookup) {
    throw new Error("Ticket not found.");
  }

  return recordAttendanceForTicket({
    ticketId: lookup.ticket.id,
    courseId: input.courseId,
    sessionId: input.sessionId ?? null,
    eventDate: input.eventDate ?? null,
    checkedInBy: input.checkedInBy ?? null,
    method: input.method,
    room: input.room ?? null,
    instructorName: input.instructorName ?? null,
  });
}

export async function removeAttendanceForTicket(input: {
  ticketId: string;
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const eventDate = normalizeEventDate(input.eventDate);
  const query = admin
    .from("attendance_records")
    .delete()
    .eq("course_id", input.courseId)
    .eq("ticket_id", input.ticketId);
  const scopedQuery = input.sessionId
    ? query.eq("session_id", input.sessionId)
    : eventDate
      ? query.is("session_id", null).eq("event_date", eventDate)
      : null;

  if (!scopedQuery) {
    throw new Error("Attendance scope requires sessionId or eventDate.");
  }

  const { error } = await scopedQuery;
  if (error) throw error;
}

export async function loadAttendanceMap(input: {
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  ticketIds: string[];
}): Promise<Map<string, AttendanceRow>> {
  if (input.ticketIds.length === 0) return new Map();

  const admin = createSupabaseAdmin();
  const eventDate = normalizeEventDate(input.eventDate);
  const query = admin
    .from("attendance_records")
    .select("*")
    .eq("course_id", input.courseId)
    .in("ticket_id", input.ticketIds);
  const scopedQuery = input.sessionId
    ? query.eq("session_id", input.sessionId)
    : eventDate
      ? query.is("session_id", null).eq("event_date", eventDate)
      : null;

  if (!scopedQuery) {
    throw new Error("Attendance scope requires sessionId or eventDate.");
  }

  const { data } = await scopedQuery.returns<AttendanceRow[]>();
  return new Map(((data as AttendanceRow[] | null) ?? []).map((row: AttendanceRow) => [row.ticket_id, row]));
}
