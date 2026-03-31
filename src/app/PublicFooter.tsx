"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/legal";

const HIDDEN_PREFIXES = [
  "/dashboard",
  "/login",
  "/signup",
  "/reset-password",
  "/scan",
  "/ticket",
  "/tickets",
  "/auth",
  "/embed",
] as const;

export default function PublicFooter() {
  const pathname = usePathname();

  if (!pathname || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white/95">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© {new Date().getFullYear()} RESER</p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href={LEGAL_LINKS.agb} className="transition hover:text-slate-900">
            AGB
          </Link>
          <Link href={LEGAL_LINKS.privacy} className="transition hover:text-slate-900">
            Datenschutz
          </Link>
          <Link href={LEGAL_LINKS.imprint} className="transition hover:text-slate-900">
            Impressum
          </Link>
        </nav>
      </div>
    </footer>
  );
}
