import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type TicketType = "workshop" | "trial" | "course_session";
export type TicketStatus = "issued" | "checked_in" | "cancelled" | "expired";

export type TicketRow = {
  id: string;
  type: TicketType;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  course_id: string | null;
  customer_name: string;
  customer_email: string;
  qr_token: string;
  status: TicketStatus;
  checked_in_at: string | null;
  checked_in_by: string | null;
  created_at: string;
};

type TicketCreateInput = {
  type: TicketType;
  bookingId?: string | null;
  trialReservationId?: string | null;
  subscriptionId?: string | null;
  courseId?: string | null;
  customerName: string;
  customerEmail: string;
};

type TicketLookup = {
  ticket: TicketRow;
  courseTitle: string | null;
  courseLocation: string | null;
  courseKind: string | null;
  teacherId: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type TicketIssueResult = {
  ticket: TicketRow;
  created: boolean;
};

/*
 * MVP verification checklist:
 * 1. Reserve a trial lesson or complete a paid workshop booking.
 * 2. Confirm exactly one row exists in public.tickets for the reservation/booking.
 * 3. Confirm the customer email HTML contains an embedded QR image.
 * 4. Open /dashboard/check-in?token=<qr_token>.
 * 5. Confirm the ticket status changes from issued to checked_in.
 * 6. Confirm trial approval is blocked until the ticket is checked in.
 */

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logTicketEvent(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[tickets]", message, payload);
}

function isDuplicateError(error: unknown): boolean {
  const supabaseError = (error ?? {}) as SupabaseErrorLike;
  return supabaseError.code === "23505" || /duplicate key|unique/i.test(String(supabaseError.message ?? ""));
}

export function generateSecureQrToken(): string {
  return randomBytes(24).toString("hex");
}

async function loadExistingTicketForInput(input: TicketCreateInput): Promise<TicketRow | null> {
  const admin = createSupabaseAdmin();

  if (input.bookingId) {
    const { data } = await admin
      .from("tickets")
      .select("*")
      .eq("booking_id", input.bookingId)
      .maybeSingle<TicketRow>();
    if (data) return data;
  }

  if (input.trialReservationId) {
    const { data } = await admin
      .from("tickets")
      .select("*")
      .eq("trial_reservation_id", input.trialReservationId)
      .maybeSingle<TicketRow>();
    if (data) return data;
  }

  return null;
}

async function createTicketRecordInternal(input: TicketCreateInput): Promise<TicketIssueResult> {
  const existing = await loadExistingTicketForInput(input);
  if (existing) {
    return { ticket: existing, created: false };
  }

  const admin = createSupabaseAdmin();
  const payload = {
    type: input.type,
    booking_id: input.bookingId ?? null,
    trial_reservation_id: input.trialReservationId ?? null,
    subscription_id: input.subscriptionId ?? null,
    course_id: input.courseId ?? null,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    qr_token: generateSecureQrToken(),
  };

  const { data, error } = await admin.from("tickets").insert(payload).select("*").single<TicketRow>();

  if (!error && data) {
    return { ticket: data, created: true };
  }

  if (isDuplicateError(error)) {
    const duplicate = await loadExistingTicketForInput(input);
    if (duplicate) {
      return { ticket: duplicate, created: false };
    }
  }

  throw error;
}

export async function createTicketRecord(input: TicketCreateInput): Promise<TicketIssueResult> {
  return createTicketRecordInternal(input);
}

export async function issueTrialTicketForReservation(input: {
  trialReservationId: string;
  courseId: string | null;
  customerName: string;
  customerEmail: string;
}): Promise<TicketIssueResult> {
  const result = await createTicketRecordInternal({
    type: "trial",
    trialReservationId: input.trialReservationId,
    courseId: input.courseId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
  });

  logTicketEvent(result.created ? "trial ticket created" : "trial ticket reused", {
    reservationId: input.trialReservationId,
    ticketId: result.ticket.id,
  });

  return result;
}

export async function issueWorkshopTicketForBooking(input: {
  bookingId: string;
  courseId: string | null;
  customerName: string;
  customerEmail: string;
}): Promise<TicketIssueResult> {
  const result = await createTicketRecordInternal({
    type: "workshop",
    bookingId: input.bookingId,
    courseId: input.courseId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
  });

  logTicketEvent(result.created ? "workshop ticket created" : "workshop ticket reused", {
    bookingId: input.bookingId,
    ticketId: result.ticket.id,
  });

  return result;
}

export async function loadTicketByQrToken(qrToken: string): Promise<TicketLookup | null> {
  const token = qrToken.trim();
  if (!token) return null;

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("tickets")
    .select("*")
    .eq("qr_token", token)
    .maybeSingle<TicketRow>();

  if (error || !data) return null;

  let course:
    | {
        title: string | null;
        location: string | null;
        kind: string | null;
        teacher_id: string | null;
      }
    | null = null;

  if (data.course_id) {
    const { data: courseData } = await admin
      .from("courses")
      .select("title,location,kind,teacher_id")
      .eq("id", data.course_id)
      .maybeSingle<{ title: string | null; location: string | null; kind: string | null; teacher_id: string | null }>();

    course = courseData ?? null;
  }

  return {
    ticket: data,
    courseTitle: course?.title ?? null,
    courseLocation: course?.location ?? null,
    courseKind: course?.kind ?? null,
    teacherId: course?.teacher_id ?? null,
  };
}
