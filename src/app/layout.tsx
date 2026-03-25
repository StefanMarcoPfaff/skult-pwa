import type { Metadata } from "next";
import "./globals.css";
import PublicFooter from "./PublicFooter";

export const metadata: Metadata = {
  title: "RESER",
  description: "RESER vermittelt Kurse und Workshops und macht Buchungen direkt online möglich.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-slate-950 antialiased">
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
