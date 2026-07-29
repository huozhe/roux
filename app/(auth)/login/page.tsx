import Link from "next/link";

function RouxMark({ size = 22 }: { size?: number }) {
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

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        padding: "26.4px",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: "17.6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "var(--color-accent)",
              display: "grid",
              placeItems: "center",
              color: "var(--color-bg)",
            }}
          >
            <RouxMark />
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 26,
              letterSpacing: "-0.015em",
            }}
          >
            Roux
          </div>
        </div>

        <div>
          <h1 style={{ fontSize: 38, marginBottom: "8.8px" }}>
            Your playlist, as a cookbook.
          </h1>
          <p className="text-muted" style={{ fontSize: 15, margin: 0 }}>
            Sign in with the Google account that owns the playlist. Roux reads
            it, writes down the ingredients and steps, and keeps them in sync.
          </p>
        </div>

        <div className="card elev-md" style={{ gap: "13.2px", padding: 22 }}>
          {/* Wired to Auth.js in T1 */}
          <Link
            href="/api/auth/signin"
            className="btn btn-primary btn-block"
            style={{ minHeight: 46, fontSize: 15, marginTop: 0 }}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 4 }}
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18" />
            </svg>
            Continue with Google
          </Link>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--color-neutral-500)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background: "var(--color-divider)",
              }}
            />
            Later
            <div
              style={{
                flex: 1,
                height: 1,
                background: "var(--color-divider)",
              }}
            />
          </div>

          <p className="text-muted" style={{ fontSize: "12.5px", margin: 0 }}>
            Email and password sign-up is stubbed for when you open this up to
            other people — the flow drops in below this button without changing
            the layout.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled
            style={{ marginTop: 0 }}
          >
            Sign up with email
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          Read-only access to your YouTube playlists. Nothing is posted, nothing
          is public.
        </p>
      </div>
    </div>
  );
}
