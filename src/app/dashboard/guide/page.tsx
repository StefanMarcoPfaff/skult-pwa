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
      <Link href="/dashboard" className="inline-flex text-sm font-semibold">{"Zurück zum Dashboard"}</Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Kurz-Anleitung</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {"Ein schneller Überblick zu RESER, deinen Angeboten, Teilnehmenden, Check-ins und den wichtigsten Symbolen."}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <GuideSection
          title="1. Erste Schritte"
          items={[
            "Profil ausfüllen und Zahlungsdaten hinterlegen.",
            "Angebot anlegen und alle Angaben kurz prüfen.",
            "Angebot veröffentlichen und den Link teilen.",
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
            <>{"\u25B6"} = {"veröffentlichen oder aktivieren."}</>,
            <>{"\u23F8"} = Kurs pausieren.</>,
            <>{"\u23F9"} = Kurs stoppen oder Workshop absagen.</>,
            <>{"\u270F\uFE0F"} = bearbeiten.</>,
            <>{"\uD83C\uDF9F\uFE0F"} = Anwesenheit erfassen.</>,
            <>{"\u2709\uFE0F"} = Teilnehmer*innen anschreiben.</>,
            <>{"\uD83D\uDD17"} = Link oder Embed-Code kopieren.</>,
          ]}
        />
        <GuideSection
          title="4. Symbole bei Teilnehmenden"
          items={[
            <>{"\u25B6"} = Probestunde freigeben oder aktive Teilnahme anzeigen.</>,
            <>{"\u23F8"} = Teilnahme pausieren.</>,
            <>{"\u23F9"} = {"ablehnen, kündigen oder absagen."}</>,
            <>{"\u270F\uFE0F"} = Daten bearbeiten.</>,
            <>{"\uD83C\uDF9F\uFE0F"} = Teilnehmer*in einchecken.</>,
            <>{"\u2709\uFE0F"} = Person anschreiben.</>,
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
            "Kurs-Pausen und Kündigungen werden durch Dozent*innen gesteuert.",
          ]}
        />
        <GuideSection
          title="7. Teilen & Einbetten"
          items={[
            "Öffentlichen Link nutzen.",
            "Embed-Code für die eigene Website kopieren.",
            "Teilen und Einbetten ist nur bei veröffentlichten Angeboten aktiv.",
          ]}
        />
      </section>
    </main>
  );
}
