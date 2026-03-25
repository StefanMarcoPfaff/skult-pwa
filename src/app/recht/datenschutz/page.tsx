import LegalPage from "../legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches"
      title="Datenschutzerklärung"
      intro={<p>Verantwortlich für die Datenverarbeitung auf dieser Website ist:</p>}
      sections={[
        {
          title: "1. Verantwortlicher",
          content: (
            <>
              <p>Stefan Pfaff</p>
              <p>Holstenplatz 13</p>
              <p>22765 Hamburg</p>
              <p>Deutschland</p>
              <p>E-Mail: hello@getreser.app</p>
            </>
          ),
        },
        {
          title: "2. Allgemeines zur Datenverarbeitung",
          content: (
            <p>
              Personenbezogene Daten werden nur verarbeitet, soweit dies zur Bereitstellung einer
              funktionsfähigen Website sowie zur Bereitstellung der angebotenen Leistungen und
              Inhalte erforderlich ist.
            </p>
          ),
        },
        {
          title: "3. Aufruf der Website",
          content: (
            <p>
              Beim Aufruf dieser Website werden technisch erforderliche Daten verarbeitet,
              insbesondere IP-Adresse, Datum und Uhrzeit des Zugriffs, Browsertyp, Betriebssystem
              und aufgerufene Seiten.
            </p>
          ),
        },
        {
          title: "4. Registrierung, Buchung und Kontaktaufnahme",
          content: (
            <>
              <p>
                Wenn Nutzer über die Plattform Anfragen stellen, Probestunden reservieren,
                Workshops buchen, sich verbindlich zu Kursen anmelden oder Kontakt aufnehmen, werden
                die dabei eingegebenen personenbezogenen Daten verarbeitet.
              </p>
              <p>
                Hierzu gehören insbesondere Name, E-Mail-Adresse, Buchungsdaten sowie gegebenenfalls
                weitere freiwillig angegebene Informationen.
              </p>
            </>
          ),
        },
        {
          title: "5. Weitergabe an Anbieter",
          content: (
            <p>
              Soweit dies für die Durchführung einer Anfrage, Reservierung, Buchung oder Anmeldung
              erforderlich ist, werden die vom Nutzer eingegebenen Daten an den jeweiligen Anbieter
              des gebuchten Angebots weitergeleitet.
            </p>
          ),
        },
        {
          title: "6. Zahlungsabwicklung",
          content: (
            <>
              <p>
                Für die Zahlungsabwicklung werden externe Zahlungsdienstleister eingesetzt,
                insbesondere Stripe.
              </p>
              <p>
                Dabei werden zur Durchführung der Zahlung erforderliche Daten an den jeweiligen
                Zahlungsdienstleister übermittelt.
              </p>
            </>
          ),
        },
        {
          title: "7. Versand von E-Mails",
          content: (
            <p>
              Für den Versand transaktionaler E-Mails, insbesondere Buchungsbestätigungen,
              Ticket-E-Mails und systembezogener Benachrichtigungen, werden externe
              E-Mail-Dienstleister eingesetzt, insbesondere Resend.
            </p>
          ),
        },
        {
          title: "8. Hosting und technische Infrastruktur",
          content: (
            <p>
              Für Hosting, Datenbank, Authentifizierung und technische Infrastruktur werden externe
              Dienstleister eingesetzt, insbesondere Vercel und Supabase.
            </p>
          ),
        },
        {
          title: "9. Rechtsgrundlagen",
          content: (
            <>
              <p>
                Die Verarbeitung personenbezogener Daten erfolgt auf Grundlage von Art. 6 Abs. 1
                lit. b DSGVO, soweit die Verarbeitung zur Durchführung vorvertraglicher Maßnahmen
                oder zur Vertragserfüllung erforderlich ist.
              </p>
              <p>
                Soweit eine Verarbeitung zur Erfüllung rechtlicher Verpflichtungen erforderlich ist,
                erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. c DSGVO.
              </p>
              <p>
                Im Übrigen erfolgt eine Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO,
                sofern ein berechtigtes Interesse an dem sicheren, stabilen und wirtschaftlichen
                Betrieb der Plattform besteht.
              </p>
            </>
          ),
        },
        {
          title: "10. Speicherdauer",
          content: (
            <p>
              Personenbezogene Daten werden nur so lange gespeichert, wie dies für die jeweiligen
              Zwecke erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen.
            </p>
          ),
        },
        {
          title: "11. Rechte der betroffenen Personen",
          content: (
            <p>
              Betroffene Personen haben das Recht auf Auskunft über die gespeicherten
              personenbezogenen Daten, auf Berichtigung unrichtiger Daten, auf Löschung, auf
              Einschränkung der Verarbeitung, auf Datenübertragbarkeit sowie auf Widerspruch gegen
              die Verarbeitung im Rahmen der gesetzlichen Vorgaben.
            </p>
          ),
        },
        {
          title: "12. Beschwerderecht",
          content: (
            <p>
              Betroffene Personen haben das Recht, sich bei einer Datenschutzaufsichtsbehörde über
              die Verarbeitung ihrer personenbezogenen Daten zu beschweren.
            </p>
          ),
        },
        {
          title: "13. Kontakt",
          content: (
            <p>Bei Fragen zum Datenschutz kann jederzeit Kontakt aufgenommen werden: hello@getreser.app</p>
          ),
        },
      ]}
    />
  );
}
