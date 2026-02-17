"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPublishedAction } from "./actions";

export default function PublishToggle({
  courseId,
  isPublished,
}: {
  courseId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await setPublishedAction(courseId, !isPublished);
          router.refresh();
        })
      }
      disabled={pending}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        fontWeight: 800,
        background: isPublished ? "#fff" : "#000",
        color: isPublished ? "#000" : "#fff",
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "not-allowed" : "pointer",
      }}
    >
      {pending ? "…" : isPublished ? "Verbergen" : "Veröffentlichen"}
    </button>
  );
}
