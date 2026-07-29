"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Playlist } from "@/lib/types";

type ApiResponse = {
  playlists?: Playlist[];
  source?: string;
  warning?: string;
  error?: string;
};

function metaLine(p: Playlist): string {
  const vis = p.visibility;
  const n = p.item_count.toLocaleString("en-US");
  return `${vis} · ${n} videos`;
}

export function PlaylistPicker() {
  const [list, setList] = useState<Playlist[]>([]);
  const [source, setSource] = useState<string>("");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/playlists");
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setList([]);
        return;
      }
      setList(data.playlists ?? []);
      setSource(data.source ?? "");
      if (data.warning) setWarning(data.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: Playlist[]) {
    setSaving(true);
    setError(null);
    try {
      const selected = next.filter((p) => p.selected).map((p) => p.id);
      const res = await fetch("/api/playlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        return;
      }
      setList(data.playlists ?? next);
      setSource(data.source ?? source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    const next = list.map((p) =>
      p.id === id ? { ...p, selected: !p.selected } : p,
    );
    setList(next);
    void persist(next);
  }

  const selectedCount = list.filter((p) => p.selected).length;
  const countLabel =
    list.length === 0
      ? "none loaded"
      : `${selectedCount} of ${list.length} selected`;

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
        <h4 style={{ margin: 0 }}>Source playlists</h4>
        <span
          className="text-muted"
          style={{ fontSize: "12.5px", marginRight: "auto" }}
        >
          {countLabel}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
          onClick={() => void load()}
          disabled={loading || saving}
        >
          {loading ? "Refreshing…" : "Refresh list"}
        </button>
      </div>

      {source === "fixtures" && (
        <p className="text-muted" style={{ margin: 0, fontSize: 12.5 }}>
          Showing sample playlists (sign in with Google + DB to load your
          YouTube lists).
        </p>
      )}

      {warning && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}>
          {warning}
        </p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-800)" }}>
          {error}
        </p>
      )}

      {loading && list.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
          Loading playlists…
        </p>
      ) : list.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
          No playlists found on this Google account.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((p) => (
            <label
              key={p.id}
              className="radio"
              style={{
                alignItems: "center",
                gap: "13.2px",
                padding: "10px 13.2px",
                borderRadius: 20,
                background: "var(--color-bg)",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              <input
                type="checkbox"
                name="playlist"
                checked={p.selected}
                disabled={saving}
                onChange={() => toggle(p.id)}
              />
              {p.selected ? (
                <span
                  style={{
                    width: 20,
                    height: 20,
                    flex: "none",
                    borderRadius: 7,
                    background: "var(--color-accent)",
                    border: "1.5px solid var(--color-accent)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--color-bg)",
                  }}
                >
                  <Check size={13} strokeWidth={3.5} />
                </span>
              ) : (
                <span
                  style={{
                    width: 20,
                    height: 20,
                    flex: "none",
                    borderRadius: 7,
                    border: "1.5px solid var(--color-neutral-400)",
                    background: "var(--color-neutral-100)",
                  }}
                />
              )}
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
                <span className="text-muted" style={{ fontSize: "12.5px" }}>
                  {metaLine(p)}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Pick as many as you like — everything lands in one library, and each
        recipe remembers which playlist it came from. New videos are written up
        automatically; Roux decides how often to check.
      </p>
    </div>
  );
}
