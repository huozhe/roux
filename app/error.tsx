"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100%",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "35.2px 17.6px",
        gap: 13.2,
        textAlign: "center",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--font-heading)",
          fontSize: 28,
        }}
      >
        Something went wrong
      </h1>
      <p className="text-muted" style={{ margin: 0, maxWidth: 360, fontSize: 14.5 }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
