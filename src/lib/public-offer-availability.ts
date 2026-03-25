import { createSupabaseAdmin } from "@/lib/supabase/admin";

type CountRow = {
  course_id: string | null;
};

type TrialReservationCountRow = {
  course_id: string | null;
  status: string | null;
  decision_status: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  converted_at: string | null;
};

export type OfferAvailability = {
  capacity: number | null;
  occupied: number;
  free: number | null;
  isSoldOut: boolean;
  isBookable: boolean;
  badgeClassName: string;
  badgeText: string;
};

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isActiveTrialReservationForCapacity(row: TrialReservationCountRow, now = Date.now()): boolean {
  if (!row.course_id) return false;
  if (row.cancelled_at || row.converted_at) return false;
  if ((row.status ?? "").toLowerCase() !== "pending") return false;
  if (row.decision_status && (row.decision_status ?? "").toLowerCase() !== "pending") return false;

  const trialEndsAt = parseDate(row.trial_ends_at);
  if (trialEndsAt === null) return true;

  return trialEndsAt >= now;
}

function buildCountMap(rows: CountRow[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows) {
    if (!row.course_id) continue;
    map.set(row.course_id, (map.get(row.course_id) ?? 0) + 1);
  }

  return map;
}

export async function loadOccupiedSeatCountsForOffers(courseIds: string[]): Promise<{
  courseCounts: Map<string, number>;
  workshopCounts: Map<string, number>;
}> {
  if (courseIds.length === 0) {
    return {
      courseCounts: new Map<string, number>(),
      workshopCounts: new Map<string, number>(),
    };
  }

  const admin = createSupabaseAdmin();
  const [{ data: courseRows }, { data: workshopRows }, { data: trialReservationRows }] = await Promise.all([
    admin
      .from("course_registration_intents")
      .select("course_id")
      .in("course_id", courseIds)
      .eq("status", "checkout_completed")
      .returns<CountRow[]>(),
    admin
      .from("bookings")
      .select("course_id")
      .in("course_id", courseIds)
      .eq("status", "paid")
      .returns<CountRow[]>(),
    admin
      .from("trial_reservations")
      .select("course_id,status,decision_status,trial_starts_at,trial_ends_at,cancelled_at,converted_at")
      .in("course_id", courseIds)
      .returns<TrialReservationCountRow[]>(),
  ]);

  const courseCounts = buildCountMap(courseRows ?? []);
  const now = Date.now();

  for (const row of trialReservationRows ?? []) {
    if (!isActiveTrialReservationForCapacity(row, now) || !row.course_id) continue;
    courseCounts.set(row.course_id, (courseCounts.get(row.course_id) ?? 0) + 1);
  }

  return {
    courseCounts,
    workshopCounts: buildCountMap(workshopRows ?? []),
  };
}

export async function loadOccupiedCourseSeats(courseId: string): Promise<number> {
  const { courseCounts } = await loadOccupiedSeatCountsForOffers([courseId]);
  return courseCounts.get(courseId) ?? 0;
}

export async function loadOccupiedWorkshopSeats(courseId: string): Promise<number> {
  const { workshopCounts } = await loadOccupiedSeatCountsForOffers([courseId]);
  return workshopCounts.get(courseId) ?? 0;
}

function formatFreeSeatText(free: number): string {
  if (free === 1) return "Noch 1 Platz frei";
  return `Noch ${free} Plätze frei`;
}

export function buildOfferAvailability(
  capacity: number | null,
  occupied: number,
  options?: { isBookable?: boolean }
): OfferAvailability {
  const isBookable = options?.isBookable ?? true;
  const free = capacity === null ? null : Math.max(0, capacity - occupied);

  if (!isBookable) {
    return {
      capacity,
      occupied,
      free: free === null ? null : Math.max(0, free),
      isSoldOut: false,
      isBookable: false,
      badgeClassName: "bg-slate-100 text-slate-700",
      badgeText: "Nicht mehr buchbar",
    };
  }

  if (free === null) {
    return {
      capacity,
      occupied,
      free,
      isSoldOut: false,
      isBookable: true,
      badgeClassName: "bg-gray-100 text-gray-700",
      badgeText: "Verfügbarkeit auf Anfrage",
    };
  }

  if (free <= 0) {
    return {
      capacity,
      occupied,
      free: 0,
      isSoldOut: true,
      isBookable: true,
      badgeClassName: "bg-red-100 text-red-700",
      badgeText: "Ausgebucht",
    };
  }

  if (free <= 5) {
    return {
      capacity,
      occupied,
      free,
      isSoldOut: false,
      isBookable: true,
      badgeClassName: "bg-amber-100 text-amber-800",
      badgeText: formatFreeSeatText(free),
    };
  }

  return {
    capacity,
    occupied,
    free,
    isSoldOut: false,
    isBookable: true,
    badgeClassName: "bg-emerald-100 text-emerald-700",
    badgeText: formatFreeSeatText(free),
  };
}
