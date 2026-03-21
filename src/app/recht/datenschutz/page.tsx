import LegalPlaceholderPage from "../placeholder-page";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";

export default function PrivacyPage() {
  return (
    <LegalPlaceholderPage
      title={LEGAL_PLACEHOLDERS.privacy.title}
      summary={LEGAL_PLACEHOLDERS.privacy.summary}
    />
  );
}
