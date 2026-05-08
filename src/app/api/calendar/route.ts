import { NextResponse } from "next/server";
import { buildCalendarFile } from "@/lib/calendar";

function getParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = getParam(url, "title");
  const startsAt = getParam(url, "starts_at");

  if (!title || !startsAt) {
    return NextResponse.json({ error: "missing title or starts_at" }, { status: 400 });
  }

  const { filename, content } = buildCalendarFile({
    filename: getParam(url, "filename"),
    events: [
      {
        title,
        startsAt,
        endsAt: getParam(url, "ends_at"),
        location: getParam(url, "location"),
        description: getParam(url, "description"),
      },
    ],
  });

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
