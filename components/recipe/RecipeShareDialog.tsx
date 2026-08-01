"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialogA11y } from "@/lib/ui/useDialogA11y";
import type { Recipe } from "@/lib/types";

type OutgoingGrant = {
  grantId: string;
  recipeId: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string | null;
  createdAt: string;
};

type Props = {
  open: boolean;
  recipe: Recipe;
  onClose: () => void;
  onError?: (message: string) => void;
};

async function apiJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 204) {
      return { ok: true, data: undefined as T };
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
    } & T;
    if (!res.ok) {
      return { ok: false, error: body.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Share dialog: public link + share with existing Roux user (grants).
 * Extracted from RecipeDetail (CQ-1 seam + grants UI).
 */
export function RecipeShareDialog({
  open,
  recipe,
  onClose,
  onError,
}: Props) {
  const onCloseStable = useCallback(() => onClose(), [onClose]);
  const panelRef = useDialogA11y(open, onCloseStable);

  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<"" | "link" | "text">("");
  const [email, setEmail] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grants, setGrants] = useState<OutgoingGrant[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const reportError = useCallback(
    (msg: string) => {
      setLocalError(msg);
      onError?.(msg);
    },
    [onError],
  );

  const loadGrants = useCallback(async () => {
    const res = await apiJson<{ grants: OutgoingGrant[] }>(
      `/api/recipes/${recipe.id}/grants`,
    );
    if (res.ok) setGrants(res.data.grants);
  }, [recipe.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setShareBusy(true);
      const shareRes = await apiJson<{ slug: string }>(
        `/api/recipes/${recipe.id}/share`,
        { method: "POST" },
      );
      if (cancelled) return;
      setShareBusy(false);
      if (!shareRes.ok) {
        reportError(shareRes.error);
        onCloseStable();
        return;
      }
      setShareSlug(shareRes.data.slug);
      await loadGrants();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, recipe.id, loadGrants, onCloseStable, reportError]);

  if (!open) return null;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${shareSlug ?? "…"}`
      : `roux.cooking/r/${shareSlug ?? "…"}`;

  async function killShare() {
    if (!shareSlug || shareBusy) return;
    setShareBusy(true);
    const result = await apiJson<undefined>(`/api/share/${shareSlug}`, {
      method: "DELETE",
    });
    setShareBusy(false);
    if (!result.ok) {
      reportError(result.error);
      return;
    }
    setShareSlug(null);
    onCloseStable();
  }

  async function copyLink() {
    if (!shareSlug) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("link");
    } catch {
      reportError("Couldn’t copy link");
    }
  }

  async function copyText() {
    const lines = [
      recipe.title,
      shareUrl,
      "",
      "Shared via Roux — ingredients and steps only.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied("text");
    } catch {
      reportError("Couldn’t copy text");
    }
  }

  async function grantToEmail() {
    const trimmed = email.trim();
    if (!trimmed || grantBusy) return;
    setGrantBusy(true);
    setLocalError(null);
    const res = await apiJson<{ grantId: string }>(
      `/api/recipes/${recipe.id}/grants`,
      {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      },
    );
    setGrantBusy(false);
    if (!res.ok) {
      // 404 = not found / unknown user / self — same shape by design
      setLocalError(
        res.error === "Not found"
          ? "No Roux account for that email, or you can’t share this recipe."
          : res.error,
      );
      return;
    }
    setEmail("");
    await loadGrants();
  }

  async function revokeGrant(grantId: string) {
    setGrantBusy(true);
    const res = await apiJson<undefined>(
      `/api/recipes/${recipe.id}/grants/${grantId}`,
      { method: "DELETE" },
    );
    setGrantBusy(false);
    if (!res.ok) {
      setLocalError(res.error);
      return;
    }
    await loadGrants();
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={onCloseStable}
    >
      <div
        ref={panelRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, 100%)" }}
      >
        <div className="dialog-title" id="share-dialog-title">
          Share “{recipe.title}”
        </div>

        <div className="dialog-body">
          Anyone with the public link can read ingredients and steps. Your notes
          and verified flags are never included.
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 20,
            background: "var(--color-bg)",
            border: "1px solid var(--color-divider)",
            minWidth: 0,
          }}
        >
          <span
            style={{
              flex: "1 1 140px",
              minWidth: 0,
              fontSize: 13.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shareBusy || !shareSlug ? "Creating link…" : shareUrl}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void copyLink()}
            style={{ marginTop: 0, flex: "none" }}
            disabled={!shareSlug || shareBusy}
          >
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8.8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void copyText()}
          >
            {copied === "text" ? "Recipe copied" : "Copy as text"}
          </button>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--color-divider)",
            paddingTop: 13.2,
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            Share with a Roux user
          </div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            They must already have signed in with Google. They get a read-only
            copy in Shared with me — not a public link.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8.8 }}>
            <input
              className="input"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Recipient email"
              style={{ flex: "1 1 160px", minHeight: 44 }}
              disabled={grantBusy}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void grantToEmail()}
              disabled={grantBusy || !email.trim()}
              style={{ marginTop: 0 }}
            >
              {grantBusy ? "Sharing…" : "Share"}
            </button>
          </div>
          {grants.length > 0 ? (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {grants.map((g) => (
                <li
                  key={g.grantId}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 120 }}>
                    {g.recipientName
                      ? `${g.recipientName} (${g.recipientEmail})`
                      : g.recipientEmail}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      marginTop: 0,
                      fontSize: 13,
                      color: "var(--color-accent-700)",
                    }}
                    disabled={grantBusy}
                    onClick={() => void revokeGrant(g.grantId)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {localError ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--color-accent-800)",
              background: "var(--color-accent-100)",
              padding: "8px 12px",
              borderRadius: 12,
            }}
          >
            {localError}
          </div>
        ) : null}

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
            onClick={() => void killShare()}
            disabled={!shareSlug || shareBusy}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-accent-700)",
            }}
          >
            Kill public link
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCloseStable}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
