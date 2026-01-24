"use client";

import { useState } from "react";

type Props =
  | {
      mode: "course";
      courseId: string;
      sessionId: string;
      disabled?: boolean;
      reserveAction: (courseId: string, sessionId: string) => Promise<void>;
      cancelAction: (courseId: string, sessionId: string) => Promise<void>;
    }
  | {
      mode: "workshop";
      courseId: string;
      disabled?: boolean;
      buyAction: (courseId: string) => Promise<void>;
    };

export default function ReserveButton(props: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleCourseReserve() {
    if (props.mode !== "course") return;
    setLoading(true);
    setMsg(null);
    try {
      await props.reserveAction(props.courseId, props.sessionId);
      setMsg("Reserviert ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleCourseCancel() {
    if (props.mode !== "course") return;
    setLoading(true);
    setMsg(null);
    try {
      await props.cancelAction(props.courseId, props.sessionId);
      setMsg("Storniert ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleWorkshopBuy() {
    if (props.mode !== "workshop") return;
    setLoading(true);
    setMsg(null);
    try {
      await props.buyAction(props.courseId);
      setMsg("Kauf gestartet (pending) ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setLoading(false);
    }
  }

  if (props.mode === "course") {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || props.disabled}
            onClick={handleCourseReserve}
            className={`rounded-lg px-3 py-2 text-sm font-semibold active:scale-[0.99] ${
              props.disabled ? "bg-gray-200 text-gray-500" : "bg-black text-white"
            }`}
          >
            {loading ? "..." : "Reservieren"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleCourseCancel}
            className="rounded-lg px-3 py-2 text-sm font-semibold border border-gray-300 text-gray-700 active:scale-[0.99]"
          >
            {loading ? "..." : "Storno"}
          </button>
        </div>

        {msg && <div className="text-xs text-gray-600">{msg}</div>}
      </div>
    );
  }

  // workshop
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={loading || props.disabled}
        onClick={handleWorkshopBuy}
        className={`w-full rounded-xl py-2 font-semibold active:scale-[0.99] ${
          props.disabled ? "bg-gray-200 text-gray-500" : "bg-black text-white"
        }`}
      >
        {loading ? "..." : "Jetzt kostenpflichtig buchen"}
      </button>

      {msg && <div className="text-xs text-gray-600">{msg}</div>}
    </div>
  );
}
