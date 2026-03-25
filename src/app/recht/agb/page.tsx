import LegalPage from "../legal-page";

export default function AgbPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches"
      title="Allgemeine Geschäftsbedingungen (AGB)"
      intro={<p>Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der Plattform RESER.</p>}
      sections={[
        {
          title: "1. Geltungsbereich",
          content: (
            <>
              <p>Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der Plattform RESER.</p>
              <p>
                RESER stellt eine Online-Plattform zur Verfügung, über die Anbieter Kurse und
                Workshops präsentieren und Teilnehmer Buchungen oder Anmeldungen vornehmen können.
              </p>
            </>
          ),
        },
        {
          title: "2. Rolle von RESER",
          content: (
            <>
              <p>RESER fungiert ausschließlich als Vermittlungsplattform.</p>
              <p>
                RESER stellt die technische Infrastruktur für Darstellung, Anfrage, Buchung,
                Anmeldung und Kommunikation bereit.
              </p>
            </>
          ),
        },
        {
          title: "3. Vertragspartner",
          content: (
            <>
              <p>
                Vertragspartner für die Durchführung der angebotenen Kurse und Workshops sind
                ausschließlich der jeweilige Anbieter und der jeweilige Teilnehmer.
              </p>
              <p>
                RESER wird nicht Vertragspartner der über die Plattform angebahnten oder
                geschlossenen Verträge.
              </p>
            </>
          ),
        },
        {
          title: "4. Angebote und Buchungen",
          content: (
            <>
              <p>
                Die Darstellung von Kursen und Workshops auf RESER stellt kein eigenes Angebot von
                RESER dar.
              </p>
              <p>
                Die Buchung eines Workshops oder die verbindliche Anmeldung zu einem Kurs erfolgt
                beim jeweiligen Anbieter über die von RESER bereitgestellten Funktionen.
              </p>
            </>
          ),
        },
        {
          title: "5. Probestunden",
          content: (
            <>
              <p>Probestunden sind kostenlos und unverbindlich.</p>
              <p>Nach der Reservierung erhält der Teilnehmer eine Bestätigung sowie ein Ticket.</p>
              <p>
                Erst nach Teilnahme an der Probestunde und anschließender Freigabe durch den
                Anbieter kann eine verbindliche Anmeldung zu einem fortlaufenden Kurs erfolgen.
              </p>
            </>
          ),
        },
        {
          title: "6. Preise und Zahlungsabwicklung",
          content: (
            <>
              <p>Es gelten die beim jeweiligen Angebot angegebenen Preise.</p>
              <p>Die Zahlungsabwicklung erfolgt über externe Zahlungsdienstleister.</p>
              <p>
                RESER schuldet selbst keine Durchführung der angebotenen Leistungen und erbringt
                keine eigenen Unterrichts- oder Veranstaltungsleistungen.
              </p>
            </>
          ),
        },
        {
          title: "7. Kündigung von fortlaufenden Kursen",
          content: (
            <>
              <p>Fortlaufende Kurse werden monatlich ab Buchungsdatum abgerechnet.</p>
              <p>
                Eine Kündigung ist jeweils zum Ende des laufenden Abrechnungszeitraums möglich,
                soweit im konkreten Angebot nichts Abweichendes angegeben ist.
              </p>
            </>
          ),
        },
        {
          title: "8. Stornierung von Workshops",
          content: (
            <p>
              Für Workshops gelten die jeweils im Angebot ausgewiesenen Stornierungsbedingungen des
              Anbieters.
            </p>
          ),
        },
        {
          title: "9. Ausfall von Angeboten",
          content: (
            <>
              <p>
                Die Durchführung der Kurse und Workshops liegt in der Verantwortung des jeweiligen
                Anbieters.
              </p>
              <p>Bei Ausfall eines Angebots informiert der Anbieter die Teilnehmer eigenständig.</p>
              <p>
                Die Abwicklung von Rückerstattungen, Umbuchungen oder Ersatzterminen erfolgt
                ausschließlich zwischen Anbieter und Teilnehmer.
              </p>
              <p>RESER übernimmt hierfür keine Verantwortung.</p>
            </>
          ),
        },
        {
          title: "10. Haftung",
          content: (
            <>
              <p>
                RESER haftet nur für Schäden, die auf vorsätzlicher oder grob fahrlässiger
                Pflichtverletzung von RESER beruhen.
              </p>
              <p>
                Für Inhalt, Durchführung, Qualität, Verfügbarkeit oder Ausfall der von Anbietern
                eingestellten Angebote übernimmt RESER keine Haftung.
              </p>
            </>
          ),
        },
        {
          title: "11. Zahlungsbezug und Vermittlungsrolle",
          content: (
            <>
              <p>
                Zahlungen werden über externe Zahlungsdienstleister im Zusammenhang mit der
                Vermittlungsplattform abgewickelt.
              </p>
              <p>
                Unabhängig von der technischen Zahlungsabwicklung bleibt der jeweilige Anbieter
                allein verantwortlich für die angebotene Leistung sowie für etwaige
                Rückabwicklungen gegenüber Teilnehmern.
              </p>
            </>
          ),
        },
        {
          title: "12. Schlussbestimmungen",
          content: (
            <>
              <p>Es gilt das Recht der Bundesrepublik Deutschland.</p>
              <p>
                Sollte eine Bestimmung dieser AGB ganz oder teilweise unwirksam sein oder werden,
                bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
