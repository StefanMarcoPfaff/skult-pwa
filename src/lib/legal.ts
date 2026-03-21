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
      "Hier werden die finalen Allgemeinen Geschaeftsbedingungen fuer SKULT und die Anbieterbeziehungen verlinkt oder eingebunden.",
  },
  privacy: {
    title: "Datenschutz Placeholder",
    summary:
      "Hier wird die finale Datenschutzerklaerung mit allen Pflichtangaben zur Datenverarbeitung verlinkt oder eingebunden.",
  },
  courseCancellation: {
    title: "Kurs-Kuendigung Placeholder",
    summary:
      "Hier wird die finale rechtliche Erlaeuterung zur Kuendigungslogik fuer wiederkehrende Kurse gepflegt.",
  },
  workshopStorno: {
    title: "Workshop-Storno Placeholder",
    summary:
      "Hier wird die finale rechtliche Erlaeuterung zu Storno- und Erstattungsregeln fuer Workshops gepflegt.",
  },
};
