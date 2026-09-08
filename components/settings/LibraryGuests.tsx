"use client";

import { useState } from "react";

export type LibraryGuest = {
  token: string;
  label: string;
  url: string;
};

type Props = {
  initialGuests?: LibraryGuest[];
  /** Origin for building a full URL after minting a link client-side. */
  origin?: string;
};

/** Owner view of whole-library guest links: invite, copy, cut off. */
export function LibraryGuests({ initialGuests = [], origin = "" }: Props) {
  const [guests, setGuests] = useState<LibraryGuest[]>(initialGuests);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onInvite() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        label?: string;
      };
      if (!res.ok || !body.token) {
        setError(body.error ?? "Couldn’t make a link");
        return;
      }
      const path = `/s/${body.token}`;
      setGuests((prev) => [
        {
          token: body.token!,
          label: body.label ?? "",
          url: origin ? `${origin}${path}` : path,
        },
        ...prev,
      ]);
      setLabel("");
    } catch {
      setError("Couldn’t make a link");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(token: string) {
    setBusyToken(token);
    setError(null);
    try {
      const res = await fetch(`/api/library-shares/${token}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn’t cut off this guest");
        return;
      }
      setGuests((prev) => prev.filter((g) => g.token !== token));
    } catch {
      setError("Couldn’t cut off this guest");
    } finally {
      setBusyToken(null);
    }
  }

  async function onCopy(g: LibraryGuest) {
    try {
      await navigator.clipboard.writeText(g.url);
      setCopied(g.token);
    } catch {
      setError("Couldn’t copy — select the link and copy it by hand");
    }
  }

  return (
    <div className="card elev-sm" style={{ padding: 22, gap: 13.2 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Guests</h2>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          People who can read your whole library without an account
        </span>
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Who is this for? e.g. Mum"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Guest name"
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 0, flex: "none" }}
          disabled={busy}
          onClick={() => void onInvite()}
        >
          {busy ? "…" : "Make a link"}
        </button>
      </div>

      {guests.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          No guests yet. A guest link opens your library read-only — your notes
          never show, and archived recipes stay hidden.
        </p>
      ) : (
        guests.map((g) => (
          <div
            key={g.token}
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
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {g.label || "Unnamed guest"}
              </span>
              <span
                className="text-muted"
                style={{
                  fontSize: 12.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.url}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 0 }}
              onClick={() => void onCopy(g)}
            >
              {copied === g.token ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
              disabled={busyToken === g.token}
              onClick={() => void onRevoke(g.token)}
            >
              {busyToken === g.token ? "…" : "Cut off"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
