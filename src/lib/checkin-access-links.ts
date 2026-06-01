import { createHash, randomBytes } from "crypto";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type CheckInAccessScope = "workshop" | "course_session" | "course_range";

export type CheckInAccessLinkRow = {
  id: string;
  token_hash: string;
  course_id: string;
  scope: CheckInAccessScope;
  valid_from: string | null;
  expires_at: string;
  pin_hash: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type ValidCheckInAccessLink = {
  link: CheckInAccessLinkRow;
};

export function generateCheckInAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCheckInAccessToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function buildCheckInAccessUrl(token: string): string {
  return `${getSiteUrl()}/checkin/${encodeURIComponent(token)}`;
}

export async function loadValidCheckInAccessLink(token: string): Promise<ValidCheckInAccessLink | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const admin = createSupabaseAdmin();
  const tokenHash = hashCheckInAccessToken(trimmed);
  const { data } = await admin
    .from("checkin_access_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle<CheckInAccessLinkRow>();

  if (!data) return null;

  const now = Date.now();
  if (data.revoked_at) return null;
  if (data.valid_from && new Date(data.valid_from).getTime() > now) return null;
  if (new Date(data.expires_at).getTime() <= now) return null;

  await admin.from("checkin_access_links").update({ last_used_at: new Date(now).toISOString() }).eq("id", data.id);

  return { link: data };
}

export function getDefaultCheckInAccessExpiry(input: {
  courseEndsAt?: string | null;
  sessionEndsAt?: Array<string | null | undefined>;
}): Date {
  const candidates = [
    ...(input.sessionEndsAt ?? []),
    input.courseEndsAt ?? null,
  ]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (candidates.length > 0) {
    const latest = new Date(Math.max(...candidates));
    latest.setHours(latest.getHours() + 48);
    return latest;
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
}
