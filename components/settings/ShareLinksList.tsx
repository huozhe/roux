"use client";

import { useState } from "react";

export type SharedLink = {
  slug: string;
  title: string;
  url: string;
};

type ShareLinksListProps = {
  /** Server-provided list of active shares. */
  initialLinks?: SharedLink[];
};

export function ShareLinksList({ initialLinks = [] }: ShareLinksListProps) {
  const [links, setLinks] = useState<SharedLink[]>(initialLinks);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRevoke(slug: string) {
    setBusySlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/share/${slug}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn’t revoke link");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.slug !== slug));
    } catch {
      setError("Couldn’t revoke link");
    } finally {
      setBusySlug(null);
    }
  }

  const empty = links.length === 0;

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: "13.2px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <h4 style={{ margin: 0 }}>Shared links</h4>
        <span className="text-muted" style={{ fontSize: "12.5px" }}>
          Read-only pages you&apos;ve handed out
        </span>
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}

      {empty ? (
        <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
          None yet. Share a recipe from its page and the link shows up here —
          killing it here breaks it everywhere.
        </p>
      ) : (
        links.map((l) => (
          <div
            key={l.slug}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              padding: "10px 13.2px",
              borderRadius: 20,
              background: "var(--color-bg)",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 180,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>{l.title}</span>
              <span className="text-muted" style={{ fontSize: "12.5px" }}>
                {l.url}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 0 }}
              disabled={busySlug === l.slug}
              onClick={() => void onRevoke(l.slug)}
            >
              {busySlug === l.slug ? "…" : "Kill link"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
