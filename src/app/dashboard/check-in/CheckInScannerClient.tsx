"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  disabled?: boolean;
  redirectPath?: string;
  redirectParams?: Record<string, string | null | undefined>;
};

type ScannerState = "idle" | "starting" | "scanning" | "unsupported" | "error";

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
  };
  getSupportedFormats?: () => Promise<string[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

function extractToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("token")?.trim() || null;
  } catch {
    return trimmed;
  }
}

export default function CheckInScannerClient({
  disabled,
  redirectPath = "/dashboard/check-in",
  redirectParams,
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<InstanceType<BarcodeDetectorCtor> | null>(null);
  const [state, setState] = useState<ScannerState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function scanLoop() {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (video.readyState < 2) {
      frameRef.current = requestAnimationFrame(() => {
        void scanLoop();
      });
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      frameRef.current = requestAnimationFrame(() => {
        void scanLoop();
      });
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);

    try {
      const results = await detector.detect(canvas);
      const rawValue = results.find((item) => item.rawValue)?.rawValue ?? null;
      const token = rawValue ? extractToken(rawValue) : null;
      if (token) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const params = new URLSearchParams();
        params.set("token", token);
        Object.entries(redirectParams ?? {}).forEach(([key, value]) => {
          if (!value) return;
          params.set(key, value);
        });
        router.push(`${redirectPath}?${params.toString()}`);
        return;
      }
    } catch {
      setState("error");
      setMessage("Der QR-Code konnte gerade nicht gelesen werden. Du kannst unten den Token manuell eingeben.");
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      void scanLoop();
    });
  }

  async function startScanner() {
    if (disabled) return;
    setMessage(null);
    setState("starting");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === "undefined" ||
      !window.BarcodeDetector
    ) {
      setState("unsupported");
      setMessage("Auf diesem Gerät ist kein direkter Kamerascanner verfügbar. Bitte nutze unten die manuelle Token-Eingabe.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      setState("scanning");
      void scanLoop();
    } catch {
      setState("error");
      setMessage("Die Kamera konnte nicht geöffnet werden. Bitte erlaube den Kamerazugriff oder nutze die manuelle Token-Eingabe.");
    }
  }

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Kamera-Scanner</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Öffne die Kamera und scanne den QR-Code des Tickets direkt vor Ort.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void startScanner()}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Kamera starten
        </button>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {message}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover sm:aspect-video" muted playsInline />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <p className="mt-3 text-xs text-muted-foreground">
        Status:{" "}
        {state === "idle"
          ? "Bereit"
          : state === "starting"
            ? "Kamera wird geöffnet..."
            : state === "scanning"
              ? "Scanner aktiv"
              : state === "unsupported"
                ? "Scanner nicht verfügbar"
                : "Scannerfehler"}
      </p>
    </section>
  );
}
