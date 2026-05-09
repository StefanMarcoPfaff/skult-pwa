import { notFound } from "next/navigation";
import { EmbeddedCourseCard } from "@/components/embed/EmbeddedCourseCard";
import { getPublicCourseById, isOfferPubliclyVisible } from "@/lib/public-offers";

export default async function EmbeddedCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const details = await getPublicCourseById(id);

  if (!details) {
    notFound();
  }

  if (!(await isOfferPubliclyVisible(details.offer))) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-3 sm:p-5">
      <div className="mx-auto max-w-2xl">
        <EmbeddedCourseCard courseId={id} details={details} />
      </div>
    </main>
  );
}
