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
      <Link href="/dashboard" className="inline-flex text-sm font-semibold">
        Zurück zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Kurzanleitung</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Ein schneller Überblick zu RESER, deinen Angeboten, Teilnehmenden, Check-ins und den
          wichtigsten Symbolen.
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
          title="2. Angebotsarten"
          items={[
            "Es gibt zwei Angebotsarten: einmaliges Angebot und laufendes Angebot.",
            "Einmaliges Angebot = für einmalige oder zeitlich begrenzte Angebote mit Direktbuchung.",
            "Laufendes Angebot = für wiederkehrende Angebote mit Probeteilnahme und Monatszahlung.",
          ]}
        />
        <GuideSection
          title="3. Sichtbarkeit"
          items={[
            "Öffentlich sichtbar = dein Angebot erscheint auf RESER und kann von allen gefunden und gebucht werden.",
            "Nur per Link buchbar = dein Angebot erscheint nicht öffentlich auf RESER, ist aber über den direkten Link weiter buchbar.",
            "Aktiv und nur per Link buchbar ist weiterhin teilbar und buchbar, nur eben nicht öffentlich gelistet.",
          ]}
        />
        <GuideSection
          title="4. Kostenlose Einmalangebote"
          items={[
            "Einmalige Angebote dürfen 0 € kosten.",
            "Kostenlose einmalige Angebote lösen keine Stripe-Zahlung aus.",
            "Sie können trotzdem gebucht, bestätigt, per Ticket eingecheckt und im Dashboard verwaltet werden.",
          ]}
        />
        <GuideSection
          title="5. Symbole bei Angeboten"
          items={[
            <>{"\u25B6"} = veröffentlichen oder aktivieren.</>,
            <>{"\u23F8"} = laufendes Angebot pausieren.</>,
            <>{"\u23F9"} = laufendes Angebot stoppen oder einmaliges Angebot absagen.</>,
            <>{"\uD83D\uDCE6"} = archivieren.</>,
            <>{"\u270F\uFE0F"} = bearbeiten.</>,
            <>{"\uD83C\uDF9F\uFE0F"} = Anwesenheit erfassen.</>,
            <>{"\u2709\uFE0F"} = Teilnehmende anschreiben.</>,
            <>{"\uD83D\uDD17"} = Link oder Embed-Code kopieren.</>,
          ]}
        />
        <GuideSection
          title="6. Symbole bei Teilnehmenden"
          items={[
            <>{"\u25B6"} = Probeteilnahme freigeben oder aktive Teilnahme anzeigen.</>,
            <>{"\u23F8"} = Teilnahme pausieren.</>,
            <>{"\u23F9"} = ablehnen, kündigen oder absagen.</>,
            <>{"\uD83D\uDCE6"} = archivieren.</>,
            <>{"\u270F\uFE0F"} = Daten ansehen oder bearbeiten.</>,
            <>{"\uD83C\uDF9F\uFE0F"} = Teilnehmer*in einchecken.</>,
            <>{"\u2709\uFE0F"} = Person anschreiben.</>,
          ]}
        />
        <GuideSection
          title="7. Check-in"
          items={["Teilnehmer-QR scannen.", "Termin-QR anzeigen.", "Manuell einchecken."]}
        />
        <GuideSection
          title="8. Zahlungen"
          items={[
            "Kostenpflichtige einmalige Angebote werden direkt bezahlt.",
            "Kostenlose einmalige Angebote werden direkt bestätigt und brauchen keinen Stripe-Checkout.",
            "Laufende Angebote laufen monatlich.",
          ]}
        />
        <GuideSection
          title="9. Teilen & Einbetten"
          items={[
            "Öffentlichen Link nutzen.",
            "Embed-Code für die eigene Website kopieren.",
            "Teilen und Einbetten ist bei aktiven Angeboten möglich, auch wenn sie nur per Link buchbar sind.",
          ]}
        />
      </section>
    </main>
  );
}
