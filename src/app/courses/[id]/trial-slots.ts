export type TrialMode = "all_sessions" | "manual";
export type RecurrenceType = "weekly" | "biweekly" | "monthly";

export type TrialSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

type TrialSlotInput = {
  weekday: number | null;
  startTime: string | null;
  durationMinutes: number | null;
  recurrenceType: string | null;
  trialMode: string | null;
  startsAt: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTime(startTime: string | null): { hour: number; minute: number } | null {
  if (!startTime) return null;
  const match = startTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function supportsRecurrence(value: string): value is RecurrenceType {
  return value === "weekly" || value === "biweekly" || value === "monthly";
}

function formatSlotLabel(startsAt: Date, endsAt: Date): string {
  const date = startsAt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = startsAt.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = endsAt.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} | ${startTime}-${endTime}`;
}

function addSlotIfWithinWindow(
  slots: TrialSlot[],
  startsAt: Date,
  durationMinutes: number,
  now: Date,
  windowEnd: Date
) {
  if (startsAt < now || startsAt > windowEnd || slots.length >= 3) return;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  slots.push({
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    label: formatSlotLabel(startsAt, endsAt),
  });
}

export function computeUpcomingTrialSlots(input: TrialSlotInput): TrialSlot[] {
  const mode = (input.trialMode ?? "all_sessions").toLowerCase();
  if (mode !== "all_sessions") return [];

  const recurrenceRaw = (input.recurrenceType ?? "weekly").toLowerCase();
  if (!supportsRecurrence(recurrenceRaw)) return [];

  if (input.durationMinutes === null || input.durationMinutes <= 0) return [];

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 42 * MS_PER_DAY);
  const slots: TrialSlot[] = [];

  if (recurrenceRaw === "weekly") {
    if (input.weekday === null || input.weekday < 0 || input.weekday > 6) return [];
    const parsedTime = parseTime(input.startTime);
    if (!parsedTime) return [];

    const first = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parsedTime.hour,
      parsedTime.minute,
      0,
      0
    );
    const dayDelta = (input.weekday - first.getDay() + 7) % 7;
    first.setDate(first.getDate() + dayDelta);
    if (first < now) {
      first.setDate(first.getDate() + 7);
    }

    for (
      let occurrence = new Date(first);
      occurrence <= windowEnd && slots.length < 3;
      occurrence = new Date(occurrence.getTime() + 7 * MS_PER_DAY)
    ) {
      addSlotIfWithinWindow(slots, occurrence, input.durationMinutes, now, windowEnd);
    }

    return slots;
  }

  // biweekly/monthly rely on starts_at as anchor
  const anchorRaw = input.startsAt ? new Date(input.startsAt) : null;
  if (!anchorRaw || Number.isNaN(anchorRaw.getTime())) return [];

  let anchor = new Date(anchorRaw);
  const parsedTime = parseTime(input.startTime);
  if (parsedTime) {
    anchor = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      parsedTime.hour,
      parsedTime.minute,
      0,
      0
    );
  }

  if (recurrenceRaw === "biweekly") {
    let occurrence = new Date(anchor);
    while (occurrence < now) {
      occurrence = new Date(occurrence.getTime() + 14 * MS_PER_DAY);
    }

    for (
      ;
      occurrence <= windowEnd && slots.length < 3;
      occurrence = new Date(occurrence.getTime() + 14 * MS_PER_DAY)
    ) {
      addSlotIfWithinWindow(slots, occurrence, input.durationMinutes, now, windowEnd);
    }

    return slots;
  }

  // monthly occurrences are anchored to starts_at and incremented by calendar month
  let occurrence = new Date(anchor);
  while (occurrence < now) {
    occurrence = new Date(occurrence);
    occurrence.setMonth(occurrence.getMonth() + 1);
  }

  while (occurrence <= windowEnd && slots.length < 3) {
    addSlotIfWithinWindow(slots, occurrence, input.durationMinutes, now, windowEnd);
    const next = new Date(occurrence);
    next.setMonth(next.getMonth() + 1);
    occurrence = next;
  }

  return slots;
}
