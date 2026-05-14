import Link from "next/link";

export default function DashboardBackLink() {
  return (
    <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
      Zurück
    </Link>
  );
}
