"use client";

import { useCallback, useEffect, useState } from "react";
import type { Playlist } from "@/lib/types";
import {
  formatSyncWhen,
  relativeSyncAgo,
  resultTagClass,
} from "@/components/sync/format";

export type SyncRunRow = {
  id?: number | string;
  started_at: string;
  finished_at?: string | null;
  found: number;
  written: number;
  skipped: number;
  result: string | null;
  detail?: {
    needTranscript?: Array<{
      videoId?: string;
      title?: string;
      reason?: string;
    }>;
    errors?: Array<{ videoId?: string; message?: string }>;
    message?: string;
  } | null;
};

type Counters = {
  addedThisMonth: number | null;
  needTranscript: number | null;
  unverified: number | null;
};

type CaptionSkipItem = {
  videoId: string;
  title: string;
  kind: string;
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
    const detail =
      r.detail && typeof r.detail === "object"
        ? (r.detail as SyncRunRow["detail"])
        : null;
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
      detail,
    });
  }
  return out;
}

function parseCounters(json: unknown): Counters {
  if (!json || typeof json !== "object") {
    return { addedThisMonth: null, needTranscript: null, unverified: null };
  }
  const o = json as Record<string, unknown>;
  const n = (...keys: string[]) => {
    for (const k of keys) {
      if (typeof o[k] === "number" && Number.isFinite(o[k] as number)) {
        return o[k] as number;
      }
    }
    return null;
  };
  return {
    addedThisMonth: n(
      "addedThisMonth",
      "added_this_month",
      "written_this_month",
    ),
    needTranscript: n(
      "needTranscriptCount",
      "needTranscript",
      "need_transcript",
      "no_transcript",
    ),
    unverified: n("unverifiedCount", "unverified", "unverified_count"),
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
  const [captionSkips, setCaptionSkips] = useState<{
    no_captions: CaptionSkipItem[];
    auth_blocked: CaptionSkipItem[];
    unavailable: CaptionSkipItem[];
  }>({ no_captions: [], auth_blocked: [], unavailable: [] });
  const [expandNoCaptions, setExpandNoCaptions] = useState(false);
  const [expandAuthBlocked, setExpandAuthBlocked] = useState(false);
  const [expandUnavailable, setExpandUnavailable] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let unauthorized = false;

    const [plRes, histRes, statusRes, skipsRes] = await Promise.all([
      fetch("/api/playlists"),
      fetch("/api/sync/history"),
      fetch("/api/sync/status").catch(() => null),
      fetch("/api/sync/caption-skips").catch(() => null),
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

      if (skipsRes?.ok) {
        const data = (await skipsRes.json()) as {
          groups?: {
            no_captions?: CaptionSkipItem[];
            auth_blocked?: CaptionSkipItem[];
            unavailable?: CaptionSkipItem[];
          };
        };
        setCaptionSkips({
          no_captions: data.groups?.no_captions ?? [],
          auth_blocked: data.groups?.auth_blocked ?? [],
          unavailable: data.groups?.unavailable ?? [],
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
            Sync runs on your computer with <code>npm run sync</code>.
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
          Fetch captions and write recipes from your selected playlists.
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: "17.6px 22px",
          gap: "8.8px",
          background: "var(--color-accent-2-100)",
        }}
      >
        <h4 style={{ margin: 0, color: "var(--color-accent-2-900)" }}>
          Sync runs on your computer
        </h4>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-accent-2-900)" }}>
          YouTube blocks caption access from Vercel (cloud IPs). On your laptop,
          with <code>.env.local</code> configured, run:
        </p>
        <pre
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--color-bg)",
            fontSize: 14,
            overflowX: "auto",
          }}
        >
          npm run sync
        </pre>
        <p className="text-muted" style={{ margin: 0, fontSize: 12.5 }}>
          Uses the same Neon DB as production — refresh the library after it
          finishes. Optional: <code>npm run sync -- --max=10</code>
        </p>
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
                color: "var(--color-neutral-700)",
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
                color: "var(--color-neutral-700)",
              }}
            >
              Last run
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {loading ? "…" : relativeSyncAgo(lastRunAt)}
            </div>
            <div className="text-muted" style={{ fontSize: "12.5px" }}>
              local only · npm run sync
            </div>
          </div>
        </div>

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
              caption skips
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

      <CaptionSkipSection
        title="No captions"
        hint="Playable videos with no CC/ASR. Sync skips these automatically."
        items={captionSkips.no_captions}
        expanded={expandNoCaptions}
        onToggle={() => setExpandNoCaptions((v) => !v)}
      />
      <CaptionSkipSection
        title="Auth blocked"
        hint="YouTube LOGIN_REQUIRED / cookie-IP. Sync skips these. Refresh cookies if you expect captions."
        items={captionSkips.auth_blocked}
        expanded={expandAuthBlocked}
        onToggle={() => setExpandAuthBlocked((v) => !v)}
      />
      <CaptionSkipSection
        title="Unavailable / deleted"
        hint="Gone or terminated videos. Sync skips these automatically."
        items={captionSkips.unavailable}
        expanded={expandUnavailable}
        onToggle={() => setExpandUnavailable((v) => !v)}
      />

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
        {history[0]?.detail?.errors &&
        history[0].detail.errors.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "13.2px 17.6px",
              borderRadius: 20,
              background: "var(--color-accent-100)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-accent-800)",
              }}
            >
              Last run — extract errors
            </div>
            {history[0].detail.errors.slice(0, 5).map((e, i) => (
              <div key={e.videoId ?? i} style={{ fontSize: 13 }}>
                {e.videoId ? `${e.videoId}: ` : ""}
                {e.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CaptionSkipSection({
  title,
  hint,
  items,
  expanded,
  onToggle,
}: {
  title: string;
  hint: string;
  items: CaptionSkipItem[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card" style={{ padding: 22, gap: "13.2px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
        }}
      >
        <h4 style={{ margin: 0 }}>{title}</h4>
        <span className="tag tag-neutral">{items.length}</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-body)",
            fontSize: 13,
          }}
          onClick={onToggle}
          disabled={items.length === 0}
        >
          {items.length === 0
            ? "None"
            : expanded
              ? "Collapse"
              : "Expand list"}
        </button>
      </div>
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        {hint}
      </p>
      {expanded && items.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {items.map((item) => (
            <div
              key={item.videoId}
              style={{
                padding: "10px 13.2px",
                borderRadius: 16,
                background: "var(--color-bg)",
              }}
            >
              <a
                href={`https://www.youtube.com/watch?v=${item.videoId}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 14, fontWeight: 600 }}
              >
                {item.title || item.videoId}
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
