import { createHmac, timingSafeEqual } from "crypto";

type SessionCheckInTokenPayload = {
  courseId: string;
  sessionId: string | null;
  eventDate: string | null;
  exp: number;
  iat: number;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionCheckInSecret(): string {
  const secret =
    process.env.ATTENDANCE_QR_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";
  if (!secret.trim()) {
    throw new Error("Missing attendance QR secret.");
  }
  return secret;
}

function signValue(value: string): string {
  return createHmac("sha256", getSessionCheckInSecret()).update(value).digest("base64url");
}

export function createSessionCheckInToken(input: {
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  expiresAt: Date;
}): string {
  const payload: SessionCheckInTokenPayload = {
    courseId: input.courseId,
    sessionId: input.sessionId ?? null,
    eventDate: input.eventDate ?? null,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionCheckInToken(token: string): SessionCheckInTokenPayload | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const [encodedPayload, signature] = trimmed.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signValue(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionCheckInTokenPayload;
    if (!payload.courseId || (!payload.sessionId && !payload.eventDate)) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
