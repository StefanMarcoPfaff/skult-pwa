const providerBenefits = [
  {
    icon: "💸",
    title: "Keine monatlichen Softwarekosten",
    text: "Du zahlst nur, wenn Du tatsächlich Buchungen erhältst. Keine Grundgebühr. Kein Risiko.",
  },
  {
    icon: "🚀",
    title: "Verwandle Deine Leidenschaft in ein Angebot",
    text: "Ob Kurs, Workshop, Führung, Coaching oder anderes Live-Angebot - mit RESER machst Du Dein Angebot sichtbar, buchbar und professionell.",
  },
  {
    icon: "⏱️",
    title: "Weniger Verwaltung. Mehr Zeit für Dein Angebot.",
    text: "Buchungen, Teilnehmende, Wartelisten, Anwesenheiten, Stornierungen und Kündigungen zentral verwalten.",
  },
  {
    icon: "💳",
    title: "Automatische Zahlungen & Auszahlungen",
    text: "Von der Buchung bis zur Auszahlung läuft alles digital, nachvollziehbar und automatisiert.",
  },
  {
    icon: "🎟️",
    title: "Professioneller Auftritt für Deine Teilnehmenden",
    text: "Buchungsbestätigungen, Tickets, QR-Codes und E-Mails erscheinen in Deinem Namen und mit Deinem Branding.",
  },
  {
    icon: "📊",
    title: "Volle Transparenz für Deine Finanzen",
    text: "Steuerkonforme Belege, Einnahmen, Auszahlungen und Abrechnungen jederzeit im Blick.",
  },
];

export default function ProviderBenefitsSection() {
  return (
    <section className="border-t border-slate-200 pt-10 sm:pt-12">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Konzentriere Dich auf Dein Angebot. RESER kümmert sich um den Rest.
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Verwandle Deine Leidenschaft in ein Angebot - ohne monatliche Softwarekosten.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providerBenefits.map((benefit) => (
          <article key={benefit.title} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-xl">
              <span aria-hidden="true">{benefit.icon}</span>
            </div>
            <h3 className="text-base font-semibold leading-6">{benefit.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{benefit.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
