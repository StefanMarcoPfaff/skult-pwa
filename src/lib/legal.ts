export const LEGAL_LINKS = {
  agb: "/recht/agb",
  privacy: "/recht/datenschutz",
  courseCancellation: "/recht/kurs-kuendigung",
  workshopStorno: "/recht/workshop-storno",
} as const;

export type LegalPlaceholderContent = {
  title: string;
  summary: string;
};

export const LEGAL_PLACEHOLDERS: Record<keyof typeof LEGAL_LINKS, LegalPlaceholderContent> = {
  agb: {
    title: "AGB Placeholder",
    summary:
      "Hier werden die finalen Allgemeinen Geschäftsbedingungen für SKULT und die Anbieterbeziehungen verlinkt oder eingebunden.",
  },
  privacy: {
    title: "Datenschutz Placeholder",
    summary:
      "Hier wird die finale Datenschutzerklärung mit allen Pflichtangaben zur Datenverarbeitung verlinkt oder eingebunden.",
  },
  courseCancellation: {
    title: "Kurs-Kündigung Placeholder",
    summary:
      "Hier wird die finale rechtliche Erläuterung zur Kündigungslogik für wiederkehrende Kurse gepflegt.",
  },
  workshopStorno: {
    title: "Workshop-Storno Placeholder",
    summary:
      "Hier wird die finale rechtliche Erläuterung zu Storno- und Erstattungsregeln für Workshops gepflegt.",
  },
};
