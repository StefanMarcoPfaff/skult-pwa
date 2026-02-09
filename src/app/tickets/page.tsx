"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LS_KEY = "skult_ticket_keys";

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

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 38, fontWeight: 800 }}>Meine Tickets</h1>

      {keys.length === 0 ? (
        <p style={{ marginTop: 12 }}>Noch keine Tickets gespeichert.</p>
      ) : (
        <ul style={{ marginTop: 12 }}>
          {keys.map((k) => (
            <li key={k}>
              <Link href={`/ticket/${k}`}>{k}</Link>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/courses">Alle Kurse</Link>
      </div>
    </main>
  );
}
