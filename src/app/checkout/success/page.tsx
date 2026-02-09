import SuccessClient from "./SuccessClient";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 42, fontWeight: 800 }}>Zahlung erfolgreich ✅</h1>
        <p style={{ fontSize: 18, marginTop: 12 }}>Hinweis: session_id fehlt.</p>
      </main>
    );
  }

  return <SuccessClient sessionId={session_id} />;
}
