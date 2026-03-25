import LegalPage from "../legal-page";

export default function ImpressumPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches"
      title="Impressum"
      intro={<p>Angaben gemäß § 5 DDG</p>}
      sections={[
        {
          title: "Angaben gemäß § 5 DDG",
          content: (
            <>
              <p>RESER</p>
              <p>Stefan Pfaff</p>
              <p>Holstenplatz 13</p>
              <p>22765 Hamburg</p>
              <p>Deutschland</p>
              <p>E-Mail: hello@getreser.app</p>
            </>
          ),
        },
        {
          title: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
          content: (
            <>
              <p>Stefan Pfaff</p>
              <p>Holstenplatz 13</p>
              <p>22765 Hamburg</p>
            </>
          ),
        },
        {
          title: "Haftung für Inhalte",
          content: (
            <p>
              Als Diensteanbieter bin ich gemäß den allgemeinen Gesetzen für eigene Inhalte auf
              diesen Seiten verantwortlich. Eine Verpflichtung zur Überwachung übermittelter oder
              gespeicherter fremder Informationen besteht erst ab dem Zeitpunkt der Kenntnis einer
              konkreten Rechtsverletzung. Bei Bekanntwerden entsprechender Rechtsverletzungen werden
              diese Inhalte umgehend entfernt.
            </p>
          ),
        },
        {
          title: "Haftung für Links",
          content: (
            <p>
              Diese Website enthält Links zu externen Websites Dritter, auf deren Inhalte kein
              Einfluss besteht. Deshalb kann für diese fremden Inhalte keine Gewähr übernommen
              werden. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
              Betreiber verantwortlich.
            </p>
          ),
        },
        {
          title: "Urheberrecht",
          content: (
            <p>
              Die durch den Seitenbetreiber erstellten Inhalte und Werke auf dieser Website
              unterliegen dem deutschen Urheberrecht. Jede Verwertung außerhalb der Grenzen des
              Urheberrechts bedarf der vorherigen schriftlichen Zustimmung des jeweiligen
              Rechteinhabers.
            </p>
          ),
        },
      ]}
    />
  );
}
