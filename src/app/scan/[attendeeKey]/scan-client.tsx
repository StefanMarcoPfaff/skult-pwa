"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type VerifyResponse = {
  found: boolean;
  status: string | null;
  checkedInAt: string | null;
  title?: string | null;
  location?: string | null;
  error?: string | null;
};

type CheckinResponse = {
  ok?: boolean;
  found?: boolean;
  alreadyCheckedIn?: boolean;
  checkedInAt?: string | null;
  status?: string | null;
  title?: string | null;
  location?: string | null;
  error?: string | null;
};

function formatStatus(status: string | null) {
  switch (status) {
    case "paid":
      return "bezahlt";
    case "pending":
      return "ausstehend";
    case "canceled":
      return "storniert";
    default:
      return status ?? "—";
  }
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE");
  return `${date} | ${time}`;
}

export default function ScanClient({ attendeeKey }: { attendeeKey: string }) {
  const safeKey = useMemo(() => (attendeeKey || "").trim(), [attendeeKey]);

  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [checkinOk, setCheckinOk] = useState(false);

  async function loadVerify() {
    setLoading(true);
    setCheckinMsg(null);
    setCheckinOk(false);

    try {
      if (!safeKey) {
        setVerify({ found: false, status: null, checkedInAt: null, error: "missing attendeeKey" });
        return;
      }

      const res = await fetch(`/api/bookings/verify?attendeeKey=${encodeURIComponent(safeKey)}`);
      const data = (await res.json()) as VerifyResponse;

      setVerify(data);
    } catch (e: any) {
      setVerify({
        found: false,
        status: null,
        checkedInAt: null,
        error: e?.message || "verify failed",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeKey]);

  const isValid = !!verify?.found && verify.status === "paid";
  const isCheckedIn = !!verify?.checkedInAt;

  async function doCheckin() {
    setCheckingIn(true);
    setCheckinMsg(null);
    setCheckinOk(false);

    try {
      const res = await fetch("/api/bookings/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: safeKey }),
      });

      const data = (await res.json()) as CheckinResponse;

      if (!res.ok || data?.ok === false) {
        setCheckinMsg(data?.error || "Check-in fehlgeschlagen.");
        setCheckinOk(false);
        return;
      }

      setCheckinOk(true);
      setCheckinMsg(data.alreadyCheckedIn ? "Schon eingecheckt ✅" : "Check-in gespeichert ✅");

      // danach nochmal verifizieren, damit UI den Timestamp zeigt
      await loadVerify();
    } catch (e: any) {
      setCheckinMsg(e?.message || "Check-in fehlgeschlagen.");
      setCheckinOk(false);
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black tracking-tight">Ticket-Check</h1>

          <div className="mt-6 text-sm text-gray-500">
            Ticket-Nr.: <span className="font-mono">{safeKey || "—"}</span>
          </div>
        </div>

        <Link href="/courses" className="text-lg underline">
          Zurück
        </Link>
      </div>

      <div className="mt-10 rounded-3xl border p-10">
        {loading ? (
          <div className="text-xl">Prüfe Ticket…</div>
        ) : verify?.error ? (
          <div className="text-red-600 text-2xl font-semibold">Fehler: {verify.error}</div>
        ) : isValid ? (
          <div>
            <div className="flex items-center gap-4">
              <div className="text-5xl">✅</div>
              <div className="text-5xl font-black text-green-600">Gültig</div>
            </div>

            <div className="mt-6 text-3xl font-bold">
              {verify?.title || "Workshop"}{" "}
              <span className="text-gray-500 font-normal">· {verify?.location || "—"}</span>
            </div>

            <div className="mt-4 text-xl">
              Status: <span className="font-semibold">{formatStatus(verify?.status ?? null)}</span>
            </div>

            <div className="mt-2 text-xl">
              Check-In:{" "}
              {isCheckedIn ? (
                <span className="font-semibold">{formatDateTime(verify.checkedInAt!)}</span>
              ) : (
                <span className="text-gray-500">noch nicht erfolgt</span>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={loadVerify}
                className="rounded-2xl border px-8 py-4 text-xl"
                disabled={loading}
              >
                Neu prüfen
              </button>

              <button
                onClick={doCheckin}
                className="rounded-2xl bg-gray-800 px-10 py-4 text-xl text-white disabled:opacity-50"
                disabled={checkingIn || isCheckedIn}
                title={isCheckedIn ? "Ticket ist bereits eingecheckt" : "Check-in durchführen"}
              >
                {isCheckedIn ? "Eingecheckt" : checkingIn ? "Speichere…" : "Einchecken"}
              </button>
            </div>

            {checkinMsg ? (
              <div className={`mt-6 text-xl ${checkinOk ? "text-green-700" : "text-red-600"}`}>
                {checkinMsg}
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4">
              <div className="text-5xl">❌</div>
              <div className="text-5xl font-black text-red-600">Ungültig</div>
            </div>
            <div className="mt-4 text-2xl text-gray-700">Ticket nicht gefunden oder nicht bezahlt.</div>
            <div className="mt-6">
              <button onClick={loadVerify} className="rounded-2xl border px-8 py-4 text-xl">
                Neu prüfen
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
