"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const LS_KEY = "skult_ticket_keys";

function shortKey(k: string) {
  return k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : k;
}

export default function TicketsPage() {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      setKeys(list);
    } catch {
      setKeys([]);
    }
  }, []);

  const uniqueKeys = useMemo(() => Array.from(new Set(keys)), [keys]);

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Meine Tickets</h1>
        <Link href="/courses">Alle Kurse</Link>
      </div>

      {uniqueKeys.length === 0 ? (
        <p style={{ marginTop: 14, fontSize: 18 }}>Noch keine Tickets gespeichert.</p>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {uniqueKeys.map((k) => (
            <Link
              key={k}
              href={`/ticket/${k}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                borderRadius: 16,
                border: "1px solid #e5e5e5",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Ticket</div>
                <div style={{ fontFamily: "monospace", color: "#555", marginTop: 4 }}>
                  {shortKey(k)}
                </div>
              </div>

              <div style={{ fontSize: 18 }}>›</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
