import { generateRecurringCourseSessions } from "@/lib/course-sessions";

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

export function computeUpcomingTrialSlots(input: TrialSlotInput): TrialSlot[] {
  const mode = (input.trialMode ?? "all_sessions").toLowerCase();
  if (mode !== "all_sessions") return [];

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 42 * MS_PER_DAY);

  return generateRecurringCourseSessions({
    starts_at: input.startsAt,
    weekday: input.weekday,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    recurrence_type: input.recurrenceType,
    fromDate: now,
    untilDate: windowEnd,
    limit: 3,
  }).map((occurrence) => {
    const startsAt = new Date(occurrence.starts_at);
    const endsAt = new Date(occurrence.ends_at);

    return {
      startsAt: occurrence.starts_at,
      endsAt: occurrence.ends_at,
      label: formatSlotLabel(startsAt, endsAt),
    };
  });
}
