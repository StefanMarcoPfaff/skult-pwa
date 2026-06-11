import LegalPage from "../recht/legal-page";
import { LEGAL_LINKS } from "@/lib/legal";

export default function ZahlungsdienstleisterPage() {
  return (
    <LegalPage
      eyebrow="Information"
      title="Zahlungsdienstleister"
      intro={
        <p>
          RESER nutzt externe Zahlungsdienstleister, um Buchungen, Zahlungen, Rueckerstattungen und Auszahlungen
          sicher abzuwickeln.
        </p>
      }
      sections={[
        {
          title: "Eingesetzte Dienste",
          content: (
            <p>
              Aktuell bzw. geplant werden insbesondere Stripe und gegebenenfalls PayPal eingesetzt.
            </p>
          ),
        },
        {
          title: "Uebermittelte Daten",
          content: (
            <p>
              Zahlungsdaten werden nur uebermittelt, soweit sie fuer Zahlungsabwicklung, Auszahlungen,
              Rueckerstattungen, Verifizierung oder gesetzliche Anforderungen notwendig sind.
            </p>
          ),
        },
        {
          title: "Sensible Zahlungsdaten",
          content: (
            <p>
              RESER speichert sensible Zahlungsdaten nur soweit erforderlich und nutzt Zahlungsdienstleister fuer die
              technische und regulatorische Zahlungsabwicklung.
            </p>
          ),
        },
        {
          title: "Weitere Informationen",
          content: (
            <p>
              Details ergeben sich aus der{" "}
              <a href={LEGAL_LINKS.privacy} className="font-medium underline underline-offset-4">
                Datenschutzerklaerung
              </a>{" "}
              und den{" "}
              <a href={LEGAL_LINKS.agb} className="font-medium underline underline-offset-4">
                AGB
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
