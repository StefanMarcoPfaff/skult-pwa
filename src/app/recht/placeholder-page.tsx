import Link from "next/link";

export default function LegalPlaceholderPage({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <Link href="/courses" className="text-sm font-semibold underline underline-offset-4">
          Zurueck
        </Link>
        <h1 className="text-3xl font-semibold">{title}</h1>
      </header>

      <section className="rounded-2xl border p-6 text-sm text-muted-foreground">
        <p>{summary}</p>
        <p className="mt-4">
          Dieser Inhalt ist bewusst als MVP-Platzhalter angelegt. Vor dem breiteren Rollout muss
          hier der finale juristisch freigegebene Text oder ein finaler externer Link hinterlegt
          werden.
        </p>
      </section>
    </main>
  );
}
