import { normalizeBookingEmail } from "@/lib/booking-duplicate-guard";

export type WorkshopBookingGuestInput = {
  firstName: string;
  lastName: string;
  email: string | null;
};

export type WorkshopBookingGuestRow = {
  id: string;
  booking_id: string;
  course_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  position: number;
  confirmation_email_sent_at: string | null;
  created_at: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeMaxGuestCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function getMaxGuestsForCapacity(maxGuests: unknown, capacity: number | null): number {
  const normalized = normalizeMaxGuestCount(maxGuests);
  if (typeof capacity !== "number" || !Number.isFinite(capacity)) return normalized;
  return Math.max(0, Math.min(normalized, Math.max(0, Math.trunc(capacity) - 1)));
}

export function parseWorkshopBookingGuests(value: unknown): WorkshopBookingGuestInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawEmail = cleanText(entry.email);
    return {
      firstName: cleanText(entry.firstName),
      lastName: cleanText(entry.lastName),
      email: rawEmail ? normalizeBookingEmail(rawEmail) : null,
    };
  });
}

export function validateWorkshopBookingGuests(input: {
  guests: WorkshopBookingGuestInput[];
  maxGuestCount: unknown;
  capacity: number | null;
  mainEmail: string;
}): { ok: true; allowedGuestCount: number } | { ok: false; error: string; status: number } {
  const allowedGuestCount = getMaxGuestsForCapacity(input.maxGuestCount, input.capacity);

  if (input.guests.length > allowedGuestCount) {
    return {
      ok: false,
      error: "Fuer dieses Angebot sind nicht so viele Begleitpersonen erlaubt.",
      status: 400,
    };
  }

  for (const guest of input.guests) {
    if (!guest.firstName || !guest.lastName) {
      return {
        ok: false,
        error: "Bitte gib fuer jede Begleitperson Vor- und Nachname an.",
        status: 400,
      };
    }

    if (guest.email && guest.email === input.mainEmail) {
      return {
        ok: false,
        error: "Die E-Mail-Adresse einer Begleitperson darf nicht mit der buchenden Person identisch sein.",
        status: 400,
      };
    }
  }

  return { ok: true, allowedGuestCount };
}

export function getWorkshopSeatCount(guestCount: number): number {
  return 1 + Math.max(0, Math.trunc(guestCount));
}
