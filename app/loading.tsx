export default function Loading() {
  return (
    <div
      style={{
        minHeight: "40vh",
        display: "grid",
        placeItems: "center",
        color: "var(--color-neutral-600)",
        fontSize: 14,
        fontFamily: "var(--font-body)",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
