import type { Metadata } from "next";

/**
 * Guest shell for a whole-library link (docs/plans/shared-library-mode.md).
 * The token sits in the URL, so keep it out of search engines and out of the
 * Referer header sent to YouTube and other outbound links.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 13.2,
          padding: "13.2px 17.6px",
          background: "var(--color-surface)",
        }}
      >
        <span
          style={{
            marginRight: "auto",
            fontFamily: "var(--font-heading)",
            fontSize: 15,
          }}
        >
          Shared from Roux
        </span>
        <span className="tag tag-neutral">read-only</span>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
