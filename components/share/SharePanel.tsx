"use client";

import { useState } from "react";
import { makeShareSlug } from "@/lib/format";

type SharePanelProps = {
  open: boolean;
  title: string;
  /** Existing slug if already shared; otherwise a fixture-style stub is built. */
  slug?: string | null;
  onClose: () => void;
  onRevoke?: () => void;
  onPreview?: (slug: string) => void;
};

function buildStubSlug(title: string) {
  // Deterministic-ish placeholder for UI until POST /share exists.
  return makeShareSlug(title, "a7f3");
}

export function SharePanel({
  open,
  title,
  slug,
  onClose,
  onRevoke,
  onPreview,
}: SharePanelProps) {
  const [copied, setCopied] = useState<"link" | "text" | "">("");
  if (!open) return null;

  const resolved = slug || buildStubSlug(title);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://roux.app";
  const shareUrl = `${origin}/r/${resolved}`;

  async function copy(text: string, kind: "link" | "text") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard may be blocked; leave label unchanged.
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        style={{ width: "min(480px, 100%)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title" id="share-panel-title">
          Share “{title}”
        </div>
        <div className="dialog-body">
          Anyone with the link can read the ingredients and steps. Your notes
          and your verified flags are never included.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 17.6px",
            borderRadius: 999,
            background: "var(--color-bg)",
            border: "1px solid var(--color-divider)",
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "13.5px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shareUrl}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 0, flex: "none" }}
            onClick={() => copy(shareUrl, "link")}
          >
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8.8px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              copy(
                `${title}\n${shareUrl}\n\nShared via Roux — ingredients and steps only.`,
                "text",
              )
            }
          >
            {copied === "text" ? "Copied" : "Copy text"}
          </button>
          <button type="button" className="btn btn-secondary" disabled>
            Print / PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onPreview?.(resolved)}
          >
            See what they see
          </button>
        </div>
        <div
          className="dialog-actions"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-accent-700)",
            }}
            onClick={onRevoke}
          >
            Kill this link
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
