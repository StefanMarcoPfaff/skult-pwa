import Image from "next/image";
import Link from "next/link";

const audienceCards = [
  {
    title: "Für Teilnehmende",
    items: ["Angebote entdecken", "Tickets abrufen", "Buchungen verwalten", "Check-ins durchführen"],
  },
  {
    title: "Für Anbietende",
    items: [
      "Angebote erstellen",
      "Teilnehmende verwalten",
      "Check-ins durchführen",
      "Einnahmen & Auszahlungen verwalten",
    ],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-5 py-8 text-slate-950 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col items-center justify-center text-center">
        <div className="mb-7">
          <Image
            src="/RESER_Logo.png"
            alt="RESER Logo"
            width={320}
            height={128}
            priority
            className="mx-auto h-auto w-full max-w-[230px] sm:max-w-[300px]"
          />
        </div>

        <div className="max-w-3xl space-y-5">
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Create. Reserve. Belong.</h1>

          <div className="mx-auto max-w-2xl space-y-3 text-base leading-7 text-slate-600 sm:text-lg">
            <p>Verwandle Deine Leidenschaft in ein Angebot.</p>
            <p>RESER verbindet unabhängige Anbieter*innen mit den Menschen, die danach suchen.</p>
          </div>
        </div>

        <div className="mt-10 flex w-full max-w-xl flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/courses"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ich suche Angebote
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Ich möchte Angebote anbieten
          </Link>
        </div>

        <div className="mt-8 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
          {audienceCards.map((card) => (
            <section key={card.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-950">{card.title}</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
                {card.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
