import LegalPlaceholderPage from "../placeholder-page";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";

export default function WorkshopStornoPage() {
  return (
    <LegalPlaceholderPage
      title={LEGAL_PLACEHOLDERS.workshopStorno.title}
      summary={LEGAL_PLACEHOLDERS.workshopStorno.summary}
    />
  );
}
