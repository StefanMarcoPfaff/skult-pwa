import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getContractParticipationGate } from "@/lib/subscription-participation";
import { loadTicketByQrToken, type TicketRow, type TicketStatus } from "@/lib/tickets";

export type AttendanceMethod = "teacher_scan" | "participant_scan" | "manual";
export type AttendanceSource = "teacher_magic_link" | null;

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
  source: AttendanceSource;
  checkin_access_link_id: string | null;
  checked_in_by_label: string | null;
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

type ContractAttendanceRow = {
  id: string;
  status: string | null;
  cancel_effective_date: string | null;
  course_registration_intent_id: string | null;
};

type IntentAttendanceRow = {
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_stop_date: string | null;
};

type AttendanceScope = {
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function normalizeEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

function isDuplicateError(error: unknown): boolean {
  const maybeError = error as SupabaseErrorLike;
  return maybeError?.code === "23505" || /duplicate key|unique/i.test(String(maybeError?.message ?? ""));
}

function isMissingAttendanceTableError(error: unknown): boolean {
  const maybeError = error as SupabaseErrorLike;
  return maybeError?.code === "42P01" || /attendance_records.*does not exist|relation .*attendance_records.* does not exist/i.test(String(maybeError?.message ?? ""));
}

function isMissingAttendanceAuditColumnError(error: unknown): boolean {
  const maybeError = error as SupabaseErrorLike;
  return maybeError?.code === "42703" || /source|checkin_access_link_id|checked_in_by_label/i.test(String(maybeError?.message ?? ""));
}

function buildSyntheticAttendance(input: {
  ticket: AttendanceTicketRow;
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  checkedInAt: string;
  checkedInBy?: string | null;
  method: AttendanceMethod;
  room?: string | null;
  instructorName?: string | null;
  source?: AttendanceSource;
  checkInAccessLinkId?: string | null;
  checkedInByLabel?: string | null;
}): AttendanceRow {
  return {
    id: `legacy-ticket-${input.ticket.id}`,
    course_id: input.courseId,
    session_id: input.sessionId ?? null,
    event_date: normalizeEventDate(input.eventDate),
    ticket_id: input.ticket.id,
    booking_id: input.ticket.booking_id,
    trial_reservation_id: input.ticket.trial_reservation_id,
    subscription_id: input.ticket.subscription_id,
    checked_in_at: input.checkedInAt,
    checked_in_by: input.checkedInBy ?? null,
    method: input.method,
    room: input.room ?? null,
    instructor_name: input.instructorName ?? null,
    source: input.source ?? null,
    checkin_access_link_id: input.checkInAccessLinkId ?? null,
    checked_in_by_label: input.checkedInByLabel ?? null,
    created_at: input.checkedInAt,
  };
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

  const { data, error } = await scopedQuery.maybeSingle<AttendanceRow>();
  if (error && isMissingAttendanceTableError(error)) {
    return null;
  }
  if (error) {
    throw error;
  }
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

async function assertTicketAttendanceAllowed(ticket: AttendanceTicketRow, eventDate: string | null | undefined): Promise<void> {
  if (!ticket.subscription_id) {
    return;
  }

  const admin = createSupabaseAdmin();
  const { data: contract } = await admin
    .from("subscription_contracts")
    .select("id,status,cancel_effective_date,course_registration_intent_id")
    .eq("id", ticket.subscription_id)
    .maybeSingle<ContractAttendanceRow>();

  if (!contract) {
    return;
  }

  const { data: intent } = contract.course_registration_intent_id
    ? await admin
        .from("course_registration_intents")
        .select("subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_stop_date")
        .eq("id", contract.course_registration_intent_id)
        .maybeSingle<IntentAttendanceRow>()
    : { data: null as IntentAttendanceRow | null };

  const gate = getContractParticipationGate({
    contractStatus: contract.status,
    subscriptionStatus: intent?.subscription_status ?? null,
    pauseStartDate: intent?.subscription_pause_start_date ?? null,
    pauseEndDate: intent?.subscription_pause_end_date ?? null,
    cancelEffectiveDate: contract.cancel_effective_date,
    subscriptionStopDate: intent?.subscription_stop_date ?? null,
    eventDate: eventDate ?? null,
  });

  if (!gate.allowed) {
    throw new Error(gate.reason ?? "Ticket is not valid for check-in.");
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
  source?: AttendanceSource;
  checkInAccessLinkId?: string | null;
  checkedInByLabel?: string | null;
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

  await assertTicketAttendanceAllowed(ticket, input.eventDate);

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
  const payloadWithoutAudit = {
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
  const payload = {
    ...payloadWithoutAudit,
    source: input.source ?? null,
    checkin_access_link_id: input.checkInAccessLinkId ?? null,
    checked_in_by_label: input.checkedInByLabel ?? null,
  };

  let { data, error } = await admin.from("attendance_records").insert(payload).select("*").maybeSingle<AttendanceRow>();
  if (error && isMissingAttendanceAuditColumnError(error)) {
    const retry = await admin.from("attendance_records").insert(payloadWithoutAudit).select("*").maybeSingle<AttendanceRow>();
    data = retry.data;
    error = retry.error;
  }
  if (error && isMissingAttendanceTableError(error)) {
    const legacyCheckedInAt = ticket.checked_in_at ?? checkedInAt;
    const alreadyRecorded = Boolean(ticket.checked_in_at);
    if (!alreadyRecorded) {
      await markLegacyTicketCheckedIn(ticket, legacyCheckedInAt, input.checkedInBy ?? null);
    }

    return {
      attendance: buildSyntheticAttendance({
        ticket,
        courseId: input.courseId,
        sessionId: input.sessionId ?? null,
        eventDate: input.eventDate ?? null,
        checkedInAt: legacyCheckedInAt,
        checkedInBy: input.checkedInBy ?? null,
        method: input.method,
        room: input.room ?? null,
        instructorName: input.instructorName ?? null,
        source: input.source ?? null,
        checkInAccessLinkId: input.checkInAccessLinkId ?? null,
        checkedInByLabel: input.checkedInByLabel ?? null,
      }),
      ticket,
      alreadyRecorded,
    };
  }
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
  source?: AttendanceSource;
  checkInAccessLinkId?: string | null;
  checkedInByLabel?: string | null;
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
    source: input.source ?? null,
    checkInAccessLinkId: input.checkInAccessLinkId ?? null,
    checkedInByLabel: input.checkedInByLabel ?? null,
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
  if (error && isMissingAttendanceTableError(error)) {
    return;
  }
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

  const { data, error } = await scopedQuery.returns<AttendanceRow[]>();
  if (error && isMissingAttendanceTableError(error)) {
    return new Map();
  }
  if (error) {
    throw error;
  }
  return new Map(((data as AttendanceRow[] | null) ?? []).map((row: AttendanceRow) => [row.ticket_id, row]));
}
