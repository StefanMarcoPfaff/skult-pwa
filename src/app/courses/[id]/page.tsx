// src/app/courses/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ReserveButton from "./ReserveButton";
import { reserveCourseSession, cancelCourseSession } from "./actions";
import { PayButton } from "./PayButton";

type CourseRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  offer_type: "course" | "workshop";
  booking_mode: "approval" | "direct" | "request";
  price_type: "free" | "paid";
  price_cents: number;
  currency: string;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  seats_taken: number;
};

function formatMoney(cents: number, currency = "EUR") {
  const eur = (cents / 100).toFixed(2).replace(".", ",");
  return `${eur} ${currency}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CourseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: course, error: cErr } = await supabase
    .from("courses_lite")
    .select(
      "id,title,subtitle,description,location,offer_type,booking_mode,price_type,price_cents,currency"
    )
    .eq("id", id)
    .single<CourseRow>();

  if (cErr || !course) return notFound();

  // Für Kurse: die nächsten 2 Termine
  let sessions: SessionRow[] = [];
  if (course.offer_type === "course") {
    const { data: sess, error: sErr } = await supabase
      .from("course_sessions")
      .select("id,course_id,starts_at,ends_at,capacity,seats_taken")
      .eq("course_id", id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(2);

    if (!sErr && sess) sessions = sess as SessionRow[];
  }

  const workshopBookable =
    course.offer_type === "workshop" &&
    course.price_type === "paid" &&
    (course.price_cents ?? 0) > 0;

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <Link href="/courses" className="text-sm text-gray-600">
          Zurück
        </Link>
      </header>

      {course.subtitle && (
        <p className="text-sm text-gray-600">{course.subtitle}</p>
      )}

      <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
        <div className="text-sm text-gray-600">{course.location}</div>

        <div className="flex items-center gap-2">
          <span className="text-xs rounded-full px-2 py-0.5 inline-block bg-gray-100 text-gray-700">
            {course.offer_type === "course" ? "Kurs" : "Workshop"}
          </span>

          {course.offer_type === "workshop" && course.price_type === "paid" && (
            <span className="text-xs rounded-full px-2 py-0.5 inline-block bg-emerald-100 text-emerald-700">
              {formatMoney(course.price_cents ?? 0, course.currency ?? "EUR")}
            </span>
          )}

          {course.offer_type === "course" && (
            <span className="text-xs rounded-full px-2 py-0.5 inline-block bg-blue-100 text-blue-700">
              Schnupper-Reservierung
            </span>
          )}
        </div>
      </div>

      {course.description && (
        <p className="text-sm leading-6 text-gray-800">{course.description}</p>
      )}

      {/* Kurs-Flow */}
      {course.offer_type === "course" && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Schnuppertermin wählen</h2>

          {sessions.length === 0 ? (
            <p className="text-sm text-red-600">
              Noch keine Termine hinterlegt. (In Supabase in{" "}
              <code>course_sessions</code> zwei Termine anlegen.)
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded-2xl border border-gray-200 p-4">
                {sessions.map((s) => {
                  const free = Math.max(0, s.capacity - s.seats_taken);

                  return (
                    <div
                      key={s.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-3"
                    >
                      <div>
                        <div className="text-sm font-semibold">
                          {fmtDate(s.starts_at)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {s.ends_at ? `bis ${fmtDate(s.ends_at)}` : ""}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs rounded-full px-2 py-0.5 inline-block ${
                            free === 0
                              ? "bg-red-100 text-red-700"
                              : free <= 3
                              ? "bg-orange-100 text-orange-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {free === 0 ? "Ausgebucht" : `${free} frei`}
                        </div>
                      </div>

                      <ReserveButton
                        mode="course"
                        courseId={id}
                        sessionId={s.id}
                        disabled={free === 0}
                        reserveAction={reserveCourseSession}
                        cancelAction={cancelCourseSession}
                      />
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-gray-500">
                Nach dem Schnuppern kann die Dozent*in dich freischalten. Dann
                bekommst du per E-Mail den Anmeldelink fürs Abo (kommt als
                nächster Schritt).
              </p>
            </>
          )}
        </section>
      )}

      {/* Workshop-Flow */}
      {course.offer_type === "workshop" && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Workshop direkt buchen</h2>

          <p className="text-sm text-gray-700">
            In Version 1 ist der Workshop nur direkt kostenpflichtig buchbar.
          </p>

          {workshopBookable ? (
            <PayButton courseId={id} />
          ) : (
            <p className="text-sm text-red-600">
              Dieser Workshop ist aktuell nicht buchbar (kein Preis gesetzt).
            </p>
          )}

          <p className="text-xs text-gray-500">
            Hinweis: Du wirst zu Stripe Checkout weitergeleitet. Nach erfolgreicher
            Zahlung ist der Workshop gebucht.
          </p>
        </section>
      )}
    </main>
  );
}
