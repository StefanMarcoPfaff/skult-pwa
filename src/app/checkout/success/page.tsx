import Link from "next/link";

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { courseId?: string };
}) {
  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-bold">Zahlung erfolgreich ✅</h1>
      <p className="text-sm text-gray-700">
        Danke! Der Workshop ist (Test-Flow) als bezahlt durchgelaufen.
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
