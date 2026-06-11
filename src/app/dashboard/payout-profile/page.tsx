import { redirect } from "next/navigation";

export default function DashboardPayoutProfileRedirectPage() {
  redirect("/dashboard/profile?section=auszahlungen");
}
