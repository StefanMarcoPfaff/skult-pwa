"use client";

import { useState } from "react";

export default function TrialReserve({ courseId }: { courseId: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reserve() {
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/trial/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, email }),
    });

    const json = await res.json();

    if (!json.ok) {
      setMsg(json.error || "Fehler");
      setBusy(false);
      return;
    }

    // Ticket direkt öffnen
    window.location.href = json.ticketUrl;
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Kostenlose Probestunde reservieren</h3>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 800 }}>E-Mail</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dein.name@email.de"
          type="email"
          required
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
        />
      </label>

      <button
        onClick={reserve}
        disabled={busy || !email}
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: "none",
          background: "black",
          color: "white",
          fontWeight: 900,
          opacity: busy ? 0.7 : 1,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "…" : "Probestunde reservieren"}
      </button>

      {msg && <p style={{ marginTop: 10, color: "crimson" }}>{msg}</p>}
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Du bekommst ein Ticket mit QR-Code per Mail (für Dozent*innen-Scan).
      </p>
    </div>
  );
}
