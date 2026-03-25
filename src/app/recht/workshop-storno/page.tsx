import LegalPage from "../legal-page";

export default function WorkshopStornoPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches"
      title="Hinweis zur Workshop-Stornierung"
      intro={
        <p>
          Für Workshops gelten die jeweils auf der Angebotsseite ausgewiesenen
          Stornierungsbedingungen. Dieser Hinweis erläutert den allgemeinen Rahmen.
        </p>
      }
      sections={[
        {
          title: "Verbindliche Buchung",
          content: (
            <p>
              Workshop-Buchungen sind nach erfolgreichem Abschluss des Checkouts verbindlich.
              Maßgeblich für Preis, Termin und Stornierungsregel ist die Darstellung auf der
              jeweiligen Angebotsseite im Zeitpunkt der Buchung.
            </p>
          ),
        },
        {
          title: "Individuelle Bedingungen",
          content: (
            <p>
              Anbieter können je nach Workshop unterschiedliche Stornierungs- und
              Erstattungsbedingungen festlegen. Diese werden vor Abschluss der Buchung angezeigt
              und sind Bestandteil des konkreten Vertragsverhältnisses.
            </p>
          ),
        },
        {
          title: "Nichtteilnahme",
          content: (
            <p>
              Eine bloße Nichtteilnahme ersetzt keine wirksame Stornierung. Ob und in welchem
              Umfang eine Erstattung möglich ist, richtet sich nach den im Angebot veröffentlichten
              Bedingungen.
            </p>
          ),
        },
      ]}
    />
  );
}
