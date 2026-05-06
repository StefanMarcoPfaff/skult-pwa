import Link from "next/link";

function GuideSection(props: { title: string; items: string[] }) {
  return (
    <section className="rounded-3xl border p-5">
      <h2 className="text-xl font-semibold">{props.title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
        {props.items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}

export default function DashboardGuidePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-semibold">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Kurz-Anleitung</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Ein schneller Ueberblick zu RESER, deinen Angeboten, Teilnehmenden, Check-ins und den wichtigsten Symbolen.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <GuideSection
          title="1. Erste Schritte"
          items={[
            "Profil ausfuellen und Zahlungsdaten hinterlegen.",
            "Angebot anlegen und alle Angaben kurz pruefen.",
            "Angebot veroeffentlichen und den Link teilen.",
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
            "Play = veroeffentlichen oder aktivieren.",
            "Pause = Kurs pausieren.",
            "Stop = Kurs stoppen oder Workshop absagen.",
            "Bleistift = bearbeiten.",
            "Check-in = Anwesenheit erfassen.",
            "E-Mail = Teilnehmer*innen anschreiben.",
            "Teilen = Link oder Embed-Code kopieren.",
          ]}
        />
        <GuideSection
          title="4. Symbole bei Teilnehmenden"
          items={[
            "Play = Probestunde freigeben oder aktive Teilnahme anzeigen.",
            "Pause = Teilnahme pausieren.",
            "Stop = ablehnen, kuendigen oder absagen.",
            "Bleistift = Daten bearbeiten.",
            "Check-in = Teilnehmer*in einchecken.",
            "E-Mail = Person anschreiben.",
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
            "Kurs-Pausen und Kuendigungen werden durch Dozent*innen gesteuert.",
          ]}
        />
        <GuideSection
          title="7. Teilen & Einbetten"
          items={[
            "Oeffentlichen Link nutzen.",
            "Embed-Code fuer die eigene Website kopieren.",
            "Teilen und Einbetten ist nur bei veroeffentlichten Angeboten aktiv.",
          ]}
        />
      </section>
    </main>
  );
}
