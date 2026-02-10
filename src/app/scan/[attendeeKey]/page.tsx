import ScanClient from "./scan-client";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ attendeeKey: string }>;
}) {
  const { attendeeKey } = await params;

  return <ScanClient attendeeKey={attendeeKey} />;
}
