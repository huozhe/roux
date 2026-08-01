"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const LINKS = [
  { href: "/", label: "Library", match: (p: string) => p === "/" || p.startsWith("/recipes") },
  { href: "/sync", label: "Sync", match: (p: string) => p.startsWith("/sync") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
] as const;

export function AppNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Main"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-divider)",
      }}
    >
      <div
        className="nav"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          width: "100%",
          gap: 17.6,
          padding: "13.2px 17.6px",
        }}
      >
        <Link
          href="/"
          className="nav-brand"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginRight: "auto",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
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
        </Link>
        {LINKS.map(({ href, label, match }) => (
          <Link
            key={href}
            href={href}
            aria-current={match(pathname) ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--color-accent-2-300)",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-accent-2-900)",
          }}
          aria-label="Account"
        >
          JL
        </div>
      </div>
    </nav>
  );
}
