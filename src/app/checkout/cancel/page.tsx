import Link from "next/link";

export default function CancelPage({
  searchParams,
}: {
  searchParams: { courseId?: string };
}) {
  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-bold">Zahlung abgebrochen</h1>
      <p className="text-sm text-gray-700">
        Kein Problem – du kannst es jederzeit erneut versuchen.
      </p>

      {searchParams.courseId && (
        <Link className="text-sm underline" href={`/courses/${searchParams.courseId}`}>
          Zurück zum Workshop
        </Link>
      )}

      <Link className="text-sm underline" href="/courses">
        Alle Kurse
      </Link>
    </main>
  );
}
