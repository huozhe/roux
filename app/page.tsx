/** Authenticated home shell. Library UI lands in T6 (`app/(app)/page.tsx`). */
export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>Roux</h1>
      <p className="text-muted" style={{ marginTop: 8 }}>
        Library loading…
      </p>
    </main>
  );
}
