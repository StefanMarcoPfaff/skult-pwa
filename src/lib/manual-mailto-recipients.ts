import { normalizeEmailRecipients } from "@/lib/mailto";

type WorkshopMailBooking = {
  id: string;
  status: string | null;
  customer_email: string | null;
  archived_at?: string | null;
  refunded_at?: string | null;
  stripe_refund_id?: string | null;
};

type WorkshopMailTicket = {
  booking_id: string | null;
  workshop_booking_guest_id: string | null;
  customer_email: string | null;
  status: string | null;
};

type WorkshopMailGuest = {
  id: string;
  booking_id: string;
  email: string | null;
};

const ACTIVE_WORKSHOP_TICKET_STATUSES = new Set(["issued", "checked_in"]);

function isActiveWorkshopBookingForMail(booking: WorkshopMailBooking): boolean {
  return (
    !booking.archived_at &&
    booking.status === "paid" &&
    !booking.refunded_at &&
    !booking.stripe_refund_id
  );
}

function isActiveWorkshopTicketForMail(ticket: WorkshopMailTicket | undefined, allowMissingTicket: boolean): boolean {
  if (!ticket) return allowMissingTicket;
  return ACTIVE_WORKSHOP_TICKET_STATUSES.has(String(ticket.status ?? "").toLowerCase());
}

export function collectWorkshopMailRecipientEmails(input: {
  bookings: WorkshopMailBooking[];
  tickets: WorkshopMailTicket[];
  guests: WorkshopMailGuest[];
}): string[] {
  const ticketByBookingId = new Map(
    input.tickets
      .filter((ticket) => ticket.booking_id && !ticket.workshop_booking_guest_id)
      .map((ticket) => [ticket.booking_id as string, ticket])
  );
  const ticketByGuestId = new Map(
    input.tickets
      .filter((ticket) => ticket.workshop_booking_guest_id)
      .map((ticket) => [ticket.workshop_booking_guest_id as string, ticket])
  );
  const guestsByBookingId = new Map<string, WorkshopMailGuest[]>();
  for (const guest of input.guests) {
    const current = guestsByBookingId.get(guest.booking_id) ?? [];
    current.push(guest);
    guestsByBookingId.set(guest.booking_id, current);
  }

  return normalizeEmailRecipients(
    input.bookings.flatMap((booking) => {
      if (!isActiveWorkshopBookingForMail(booking)) return [];

      const bookingTicket = ticketByBookingId.get(booking.id);
      const recipients: Array<string | null | undefined> = [];
      if (isActiveWorkshopTicketForMail(bookingTicket, true)) {
        recipients.push(booking.customer_email ?? bookingTicket?.customer_email);
      }

      for (const guest of guestsByBookingId.get(booking.id) ?? []) {
        const guestTicket = ticketByGuestId.get(guest.id);
        if (!isActiveWorkshopTicketForMail(guestTicket, true)) continue;
        recipients.push(guest.email);
      }

      return recipients;
    })
  );
}
