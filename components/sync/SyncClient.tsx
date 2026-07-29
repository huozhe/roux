"use client";

import { useCallback, useEffect, useState } from "react";
import type { Playlist } from "@/lib/types";
import {
  formatSyncWhen,
  relativeSyncAgo,
  resultTagClass,
} from "@/components/sync/format";
import { readSseStream } from "@/components/sync/sse";

export type SyncRunRow = {
  id?: number | string;
  started_at: string;
  finished_at?: string | null;
  found: number;
  written: number;
  skipped: number;
  result: string | null;
};

type Counters = {
  addedThisMonth: number | null;
  needTranscript: number | null;
  unverified: number | null;
};

function parseHistory(json: unknown): SyncRunRow[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const raw = Array.isArray(json)
    ? json
    : Array.isArray(o.runs)
      ? o.runs
      : Array.isArray(o.history)
        ? o.history
        : [];
  const out: SyncRunRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const started =
      (typeof r.started_at === "string" && r.started_at) ||
      (typeof r.startedAt === "string" && r.startedAt) ||
      "";
    if (!started) continue;
    out.push({
      id: (r.id as number | string | undefined) ?? started,
      started_at: started,
      finished_at:
        (typeof r.finished_at === "string" && r.finished_at) ||
        (typeof r.finishedAt === "string" && r.finishedAt) ||
        null,
      found: Number(r.found ?? 0) || 0,
      written: Number(r.written ?? 0) || 0,
      skipped: Number(r.skipped ?? 0) || 0,
      result:
        typeof r.result === "string"
          ? r.result
          : r.result == null
            ? null
            : String(r.result),
    });
  }
  return out;
}

function parseCounters(json: unknown): Counters {
  if (!json || typeof json !== "object") {
    return { addedThisMonth: null, needTranscript: null, unverified: null };
  }
  const o = json as Record<string, unknown>;
  const n = (k: string) =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number)
      ? (o[k] as number)
      : null;
  return {
    addedThisMonth:
      n("added_this_month") ?? n("addedThisMonth") ?? n("written_this_month"),
    needTranscript:
      n("need_transcript") ?? n("needTranscript") ?? n("no_transcript"),
    unverified: n("unverified"),
  };
}

function counterLabel(v: number | null): string {
  if (v == null) return "—";
  return String(v);
}

export function SyncClient() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [history, setHistory] = useState<SyncRunRow[]>([]);
  const [counters, setCounters] = useState<Counters>({
    addedThisMonth: null,
    needTranscript: null,
    unverified: null,
  });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needAuth, setNeedAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");

  const load = useCallback(async () => {
    setError(null);
    let unauthorized = false;

    const [plRes, histRes, statusRes] = await Promise.all([
      fetch("/api/playlists"),
      fetch("/api/sync/history"),
      fetch("/api/sync/status").catch(() => null),
    ]);

    if (plRes.status === 401 || histRes.status === 401) {
      unauthorized = true;
    }
    if (statusRes && statusRes.status === 401) unauthorized = true;

    if (unauthorized) {
      setNeedAuth(true);
      setPlaylists([]);
      setHistory([]);
      setLoading(false);
      return;
    }
    setNeedAuth(false);

    try {
      if (plRes.ok) {
        const data = (await plRes.json()) as { playlists?: Playlist[] };
        setPlaylists(data.playlists ?? []);
      } else if (plRes.status !== 404) {
        const data = (await plRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `Playlists failed (${plRes.status})`);
      }

      if (histRes.ok) {
        const data = await histRes.json();
        const runs = parseHistory(data);
        setHistory(runs);
        if (runs[0]?.started_at) setLastRunAt(runs[0].started_at);
      } else if (histRes.status === 404) {
        setHistory([]);
      } else {
        const data = (await histRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError((e) => e ?? data.error ?? `History failed (${histRes.status})`);
      }

      if (statusRes?.ok) {
        const data = await statusRes.json();
        setCounters(parseCounters(data));
        const o = data as Record<string, unknown>;
        const last =
          (typeof o.last_run_at === "string" && o.last_run_at) ||
          (typeof o.lastRunAt === "string" && o.lastRunAt) ||
          null;
        if (last) setLastRunAt(last);
      } else {
        setCounters({
          addedThisMonth: null,
          needTranscript: null,
          unverified: null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sync data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client load on mount
    void load();
  }, [load]);

  async function runSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncStage("Starting…");
    setError(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.status === 401) {
        setNeedAuth(true);
        setSyncStage("");
        setSyncing(false);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `Sync failed (${res.status})`);
        setSyncStage("");
        setSyncing(false);
        return;
      }

      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("text/event-stream") || res.body) {
        for await (const stage of readSseStream(res.body)) {
          if (stage.trim()) setSyncStage(stage.trim());
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync network error");
    } finally {
      setSyncing(false);
      setSyncStage("");
    }
  }

  const selected = playlists.filter((p) => p.selected);
  const watchingTitle =
    selected.length === 0
      ? "No playlists selected"
      : selected.length === 1
        ? selected[0]!.title
        : `${selected.length} playlists`;
  const watchingMeta =
    selected.length === 0
      ? "Pick sources in Settings"
      : selected
          .map((p) => `${p.item_count.toLocaleString("en-US")} videos`)
          .join(" · ");

  if (needAuth) {
    return (
      <div
        style={{
          maxWidth: 900,
          width: "100%",
          margin: "0 auto",
          padding: "26.4px 17.6px 70px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div>
          <h1 style={{ fontSize: 34, margin: 0 }}>Sync</h1>
          <div className="text-muted" style={{ fontSize: "13.5px" }}>
            Roux checks the playlist on a schedule and writes up anything new.
          </div>
        </div>
        <div className="card elev-sm" style={{ padding: 22, gap: "17.6px" }}>
          <h4 style={{ margin: 0 }}>Sign in required</h4>
          <p className="text-muted" style={{ margin: 0, fontSize: "13.5px" }}>
            Sign in with Google to sync playlists and see history.
          </p>
          <a
            href="/login"
            className="btn btn-primary"
            style={{ marginTop: 0, alignSelf: "flex-start" }}
          >
            Continue with Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 900,
        width: "100%",
        margin: "0 auto",
        padding: "26.4px 17.6px 70px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div>
        <h1 style={{ fontSize: 34, margin: 0 }}>Sync</h1>
        <div className="text-muted" style={{ fontSize: "13.5px" }}>
          Roux checks the playlist on a schedule and writes up anything new.
        </div>
      </div>

      {error ? (
        <div
          className="card"
          style={{
            padding: "13.2px 17.6px",
            color: "var(--color-accent)",
            fontSize: 14,
          }}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="card elev-sm" style={{ padding: 22, gap: "17.6px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "17.6px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-neutral-600)",
              }}
            >
              Watching
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>
              {loading ? "…" : watchingTitle}
            </div>
            <div className="text-muted" style={{ fontSize: "12.5px" }}>
              {loading ? "" : watchingMeta}
            </div>
            {selected.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                {selected.map((p) => (
                  <span key={p.id} className="tag tag-accent-2">
                    {p.title}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 130,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-neutral-600)",
              }}
            >
              Last run
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {loading ? "…" : relativeSyncAgo(lastRunAt)}
            </div>
            <div className="text-muted" style={{ fontSize: "12.5px" }}>
              next daily
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44, marginTop: 0 }}
            disabled={syncing || loading}
            onClick={() => void runSync()}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>

        {syncing ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "13.2px",
              padding: "13.2px 17.6px",
              borderRadius: 20,
              background: "var(--color-bg)",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                border: "2.75px solid var(--color-accent-200)",
                borderTopColor: "var(--color-accent)",
                animation: "spin 0.8s linear infinite",
                flex: "none",
              }}
              aria-hidden
            />
            <div style={{ fontSize: 14 }}>{syncStage || "Syncing…"}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8.8px" }}>
          <div
            style={{
              flex: 1,
              minWidth: 120,
              background: "var(--color-bg)",
              borderRadius: 20,
              padding: "13.2px",
            }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 25 }}>
              {counterLabel(counters.addedThisMonth)}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              added this month
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 120,
              background: "var(--color-bg)",
              borderRadius: 20,
              padding: "13.2px",
            }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 25 }}>
              {counterLabel(counters.needTranscript)}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              need a transcript
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 120,
              background: "var(--color-bg)",
              borderRadius: 20,
              padding: "13.2px",
            }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 25 }}>
              {counterLabel(counters.unverified)}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              unverified
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, gap: "13.2px" }}>
        <h4 style={{ margin: 0 }}>History</h4>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Found</th>
                <th>Written up</th>
                <th>Skipped</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    No sync runs yet
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={String(h.id ?? h.started_at)}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatSyncWhen(h.started_at)}
                    </td>
                    <td>{h.found}</td>
                    <td>{h.written}</td>
                    <td>{h.skipped}</td>
                    <td>
                      <span className={resultTagClass(h.result)}>
                        {h.result ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
