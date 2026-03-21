import LegalPlaceholderPage from "../placeholder-page";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";

export default function AgbPage() {
  return (
    <LegalPlaceholderPage
      title={LEGAL_PLACEHOLDERS.agb.title}
      summary={LEGAL_PLACEHOLDERS.agb.summary}
    />
  );
}
