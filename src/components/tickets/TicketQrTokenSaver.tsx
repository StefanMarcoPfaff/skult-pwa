"use client";

import { useEffect } from "react";
import { storeTicketQrToken } from "@/lib/ticket-device-store";

export function TicketQrTokenSaver({ qrToken }: { qrToken: string | null | undefined }) {
  useEffect(() => {
    if (!qrToken) return;
    storeTicketQrToken(qrToken);
  }, [qrToken]);

  return null;
}
