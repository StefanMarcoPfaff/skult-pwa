import LegalPage from "../legal-page";

export default function CourseCancellationPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches"
      title="Hinweis zur Kurskündigung"
      intro={
        <p>
          Dieser Hinweis ergänzt die auf der Angebotsseite dargestellten Informationen für
          fortlaufende Kurse mit wiederkehrender Abrechnung.
        </p>
      }
      sections={[
        {
          title: "Monatliche Abrechnung",
          content: (
            <p>
              Fortlaufende Kurse werden als wiederkehrende Leistung gebucht. Die Abrechnung erfolgt
              monatlich ab dem jeweiligen Buchungsdatum, sofern auf der Angebotsseite nichts
              Abweichendes angegeben ist.
            </p>
          ),
        },
        {
          title: "Ordentliche Kündigung",
          content: (
            <p>
              Eine ordentliche Kündigung ist monatlich zum Ende des laufenden Abrechnungszeitraums
              möglich. Bereits begonnene Abrechnungszeiträume werden grundsätzlich nicht anteilig
              erstattet.
            </p>
          ),
        },
        {
          title: "Form der Kündigung",
          content: (
            <p>
              Die Kündigung sollte über den jeweils vorgesehenen Kommunikations- oder
              Support-Kanal erklärt werden, damit sie dem Angebot eindeutig zugeordnet und
              fristgerecht bearbeitet werden kann.
            </p>
          ),
        },
      ]}
    />
  );
}
