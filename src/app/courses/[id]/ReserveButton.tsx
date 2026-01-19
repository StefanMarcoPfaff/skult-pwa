// src/app/courses/[id]/ReserveButton.tsx
"use client";

import { useActionState } from "react";
import type { ReserveResult } from "./actions";

type Props = {
  courseId: string;
  disabled: boolean;
  reserveAction: (courseId: string) => Promise<ReserveResult>;
  cancelAction: (courseId: string) => Promise<ReserveResult>;
};

const initialState: ReserveResult | null = null;

export default function ReserveButton({
  courseId,
  disabled,
  reserveAction,
  cancelAction,
}: Props) {
  const [reserveState, reserve] = useActionState(async () => {
    return await reserveAction(courseId);
  }, initialState);

  const [cancelState, cancel] = useActionState(async () => {
    return await cancelAction(courseId);
  }, initialState);

  const msg = cancelState ?? reserveState;

  return (
    <div className="space-y-2">
      <form action={reserve}>
        <button
          disabled={disabled}
          className={`w-full rounded-xl py-2 font-semibold active:scale-[0.99] ${
            disabled ? "bg-gray-200 text-gray-500" : "bg-black text-white"
          }`}
          type="submit"
        >
          {disabled ? "Ausgebucht" : "Platz reservieren"}
        </button>
      </form>

      <form action={cancel}>
        <button
          className="w-full rounded-xl py-2 font-semibold border border-gray-300 text-gray-800 active:scale-[0.99]"
          type="submit"
        >
          Reservierung stornieren
        </button>
      </form>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
          {msg.message}
        </p>
      )}
    </div>
  );
}
