import { Suspense } from "react";
import SignupConfirmationClient from "./signup-confirmation-client";

export default function SignupConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <SignupConfirmationClient />
    </Suspense>
  );
}
