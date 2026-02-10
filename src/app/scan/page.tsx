"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanStartPage() {
  const [code, setCode] = useState("");
  const router = useRouter();

  function go() {
    const c = code.trim();
    if (!c) return;
    router.push(`/scan/${encodeURIComponent(c)}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Ticket-Scan</h1>
      <p style={{ marginTop: 12, fontSize: 18, color: "#444" }}>
        Für Dozent*innen: Ticket-Code eingeben oder QR-Link öffnen.
      </p>

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="attendee_key einfügen…"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            minWidth: 320,
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={go}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "black",
            color: "white",
            border: "none",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Prüfen
        </button>
      </div>

      <p style={{ marginTop: 18, color: "#666" }}>
        Kamera-Scan bauen wir als nächsten Schritt (morgen). 🙂
      </p>
    </main>
  );
}
