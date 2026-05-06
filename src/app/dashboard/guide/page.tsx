import Link from "next/link";
import type { ReactNode } from "react";

function GuideSection(props: { title: string; items: Array<string | ReactNode> }) {
  return (
    <section className="rounded-3xl border p-5">
      <h2 className="text-xl font-semibold">{props.title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
        {props.items.map((item, index) => (
          <p key={index}>{item}</p>
        ))}
      </div>
    </section>
  );
}

export default function DashboardGuidePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-semibold">{"Zur\u00fcck zum Dashboard"}</Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Kurz-Anleitung</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {"Ein schneller \u00dcberblick zu RESER, deinen Angeboten, Teilnehmenden, Check-ins und den wichtigsten Symbolen."}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <GuideSection
          title="1. Erste Schritte"
          items={[
            "Profil ausf\u00fcllen und Zahlungsdaten hinterlegen.",
            "Angebot anlegen und alle Angaben kurz pr\u00fcfen.",
            "Angebot ver\u00f6ffentlichen und den Link teilen.",
          ]}
        />
        <GuideSection
          title="2. Kurse vs. Workshops"
          items={[
            "Workshop = einmaliger Termin mit direkter Zahlung.",
            "Kurs = fortlaufendes Angebot mit Probestunde und monatlicher Zahlung.",
          ]}
        />
        <GuideSection
          title="3. Symbole bei Angeboten"
          items={[
            <>? = {"ver\u00f6ffentlichen oder aktivieren."}</>,
            <>? = Kurs pausieren.</>,
            <>? = Kurs stoppen oder Workshop absagen.</>,
            <>?? = bearbeiten.</>,
            <>??? = Anwesenheit erfassen.</>,
            <>?? = Teilnehmer*innen anschreiben.</>,
            <>?? = Link oder Embed-Code kopieren.</>,
          ]}
        />
        <GuideSection
          title="4. Symbole bei Teilnehmenden"
          items={[
            <>? = Probestunde freigeben oder aktive Teilnahme anzeigen.</>,
            <>? = Teilnahme pausieren.</>,
            <>? = {"ablehnen, k\u00fcndigen oder absagen."}</>,
            <>?? = Daten bearbeiten.</>,
            <>??? = Teilnehmer*in einchecken.</>,
            <>?? = Person anschreiben.</>,
          ]}
        />
        <GuideSection
          title="5. Check-in"
          items={[
            "Teilnehmer-QR scannen.",
            "Termin-QR anzeigen.",
            "Manuell einchecken.",
          ]}
        />
        <GuideSection
          title="6. Zahlungen"
          items={[
            "Workshops werden direkt bezahlt.",
            "Kurse laufen monatlich.",
            "Kurs-Pausen und K\u00fcndigungen werden durch Dozent*innen gesteuert.",
          ]}
        />
        <GuideSection
          title="7. Teilen & Einbetten"
          items={[
            "\u00d6ffentlichen Link nutzen.",
            "Embed-Code f\u00fcr die eigene Website kopieren.",
            "Teilen und Einbetten ist nur bei ver\u00f6ffentlichten Angeboten aktiv.",
          ]}
        />
      </section>
    </main>
  );
}
