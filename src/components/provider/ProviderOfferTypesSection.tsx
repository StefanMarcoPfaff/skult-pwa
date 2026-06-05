const offerTypes = [
  {
    icon: "🌍",
    title: "Öffentliches einmaliges Angebot",
    text: "Erstelle einzelne Termine, Workshops, Führungen oder Events - von 30 Minuten bis zu mehreren Tagen. Dein Angebot ist öffentlich sichtbar und kann direkt online reserviert oder gebucht werden.",
  },
  {
    icon: "🔁",
    title: "Öffentliches laufendes Angebot",
    text: "Biete regelmäßige Angebote an, z. B. wöchentlich, alle 14 Tage oder monatlich. Ideal für Kurse, Trainings, Gruppenangebote oder fortlaufende Formate - inklusive wiederkehrender Zahlungen.",
  },
  {
    icon: "🔗",
    title: "Exklusives Angebot per Link",
    badge: "RESER Highlight",
    text: "Erstelle individuelle oder versteckte Angebote und teile sie nur mit ausgewählten Personen. Perfekt für private Touren, Einzelcoachings, Firmenworkshops, geschlossene Gruppen oder besondere Sondertermine.",
  },
];

export default function ProviderOfferTypesSection() {
  return (
    <section className="pt-12 sm:pt-14">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Öffentlich anbieten. Regelmäßig verkaufen. Exklusiv teilen.
        </h2>
        <p className="mt-4 text-base font-medium leading-7 text-slate-700">
          Drei Wege, Dein Angebot buchbar zu machen.
        </p>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Mit RESER entscheidest Du selbst, wie Dein Angebot sichtbar wird: öffentlich für alle, regelmäßig als laufendes Angebot oder exklusiv per Link für ausgewählte Teilnehmende.
        </p>
      </div>

      <div className="mt-8 grid gap-3 lg:grid-cols-3">
        {offerTypes.map((offerType) => (
          <article
            key={offerType.title}
            className={`rounded-lg border bg-white p-5 ${
              offerType.badge ? "border-slate-300 shadow-sm" : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-xl">
                <span aria-hidden="true">{offerType.icon}</span>
              </div>
              {offerType.badge ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  {offerType.badge}
                </span>
              ) : null}
            </div>
            <h3 className="mt-4 text-base font-semibold leading-6">{offerType.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{offerType.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
