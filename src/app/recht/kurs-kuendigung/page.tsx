import LegalPlaceholderPage from "../placeholder-page";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";

export default function CourseCancellationPage() {
  return (
    <LegalPlaceholderPage
      title={LEGAL_PLACEHOLDERS.courseCancellation.title}
      summary={LEGAL_PLACEHOLDERS.courseCancellation.summary}
    />
  );
}
