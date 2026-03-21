import { createSupabaseAdmin } from "@/lib/supabase/admin";

type CountRow = {
  course_id: string | null;
};

export type OfferAvailability = {
  capacity: number | null;
  occupied: number;
  free: number | null;
  isSoldOut: boolean;
  badgeClassName: string;
  badgeText: string;
};

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
  const [{ data: courseRows }, { data: workshopRows }] = await Promise.all([
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
  ]);

  return {
    courseCounts: buildCountMap(courseRows ?? []),
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

export function buildOfferAvailability(capacity: number | null, occupied: number): OfferAvailability {
  const free = capacity === null ? null : Math.max(0, capacity - occupied);

  if (free === null) {
    return {
      capacity,
      occupied,
      free,
      isSoldOut: false,
      badgeClassName: "bg-gray-100 text-gray-700",
      badgeText: "offen",
    };
  }

  if (free <= 0) {
    return {
      capacity,
      occupied,
      free: 0,
      isSoldOut: true,
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
      badgeClassName: "bg-amber-100 text-amber-800",
      badgeText: `${free} frei`,
    };
  }

  return {
    capacity,
    occupied,
    free,
    isSoldOut: false,
    badgeClassName: "bg-emerald-100 text-emerald-700",
    badgeText: `${free} frei`,
  };
}
