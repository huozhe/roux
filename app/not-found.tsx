import Link from "next/link";

function RouxMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 12a8.5 8.5 0 1 0-8.5 8.5" />
      <path d="M12 16.8A4.8 4.8 0 1 0 7.2 12" />
      <path d="M12 13.2a1.2 1.2 0 1 1-1.2-1.2" />
    </svg>
  );
}

export default function NotFound() {
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
        gap: 17.6,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "var(--font-heading)",
          fontSize: 22,
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: "var(--color-accent)",
            display: "grid",
            placeItems: "center",
            color: "var(--color-bg)",
          }}
        >
          <RouxMark />
        </span>
        Roux
      </div>
      <h1 style={{ margin: 0, fontSize: 28 }}>Page not found</h1>
      <p
        className="text-muted"
        style={{ margin: 0, maxWidth: 360, fontSize: 14.5, lineHeight: 1.5 }}
      >
        That link may have been mistyped, revoked, or never existed. Shared
        recipe links can be killed by the owner at any time.
      </p>
      <Link href="/" className="btn btn-primary" style={{ marginTop: 8 }}>
        Back to library
      </Link>
    </div>
  );
}
