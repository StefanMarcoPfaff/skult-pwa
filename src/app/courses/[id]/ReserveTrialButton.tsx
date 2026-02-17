"use client";

import { useTransition } from "react";
import { reserveTrial } from "./actions";

export default function ReserveTrialButton({ courseId }: { courseId: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => start(async () => reserveTrial(courseId))}
      disabled={pending}
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        border: "1px solid #000",
        background: "#000",
        color: "#fff",
        fontWeight: 800,
        cursor: pending ? "not-allowed" : "pointer",
      }}
    >
      {pending ? "Reserviere..." : "Kostenlose Probestunde reservieren"}
    </button>
  );
}
