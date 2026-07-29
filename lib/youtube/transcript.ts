/**
 * Fetch timed captions for a YouTube video.
 *
 * Uses YouTube ANDROID innertube player (v20) — WEB client is blocked from
 * many cloud IPs. Optional OAuth access token helps with unlisted videos the
 * user can access via their playlist.
 */
import type { CaptionCue } from "@/lib/extract";

const ANDROID_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

export type TranscriptFetchOpts = {
  /** Google OAuth access token (youtube.readonly) — improves unlisted/private access. */
  accessToken?: string;
};

export type TranscriptFailure = {
  videoId: string;
  reason: string;
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  name?: { simpleText?: string };
};

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  playabilityStatus?: { status?: string; reason?: string };
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function stripTags(s: string): string {
  return decodeXmlEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Classic timedtext: <text start="seconds" dur="seconds"> */
function parseXmlCaptions(xml: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const startM = /\bstart="([\d.]+)"/.exec(attrs);
    const durM = /\bdur="([\d.]+)"/.exec(attrs);
    if (!startM) continue;
    const text = stripTags(body);
    if (!text) continue;
    const start = Number(startM[1]);
    const duration = durM ? Number(durM[1]) : undefined;
    cues.push({
      text,
      start_seconds: start,
      ...(duration !== undefined && !Number.isNaN(duration)
        ? { duration_seconds: duration }
        : {}),
    });
  }
  return cues;
}

/** srv3 timedtext: <p t="ms" d="ms"> */
function parseSrv3Captions(xml: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml))) {
    const startMs = parseInt(match[1]!, 10);
    const durMs = parseInt(match[2]!, 10);
    const inner = match[3] ?? "";
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner))) {
      text += sMatch[1];
    }
    if (!text) text = stripTags(inner);
    else text = decodeXmlEntities(text).trim();
    if (!text) continue;
    cues.push({
      text,
      start_seconds: startMs / 1000,
      duration_seconds: durMs / 1000,
    });
  }
  return cues;
}

function parseJson3Captions(raw: string): CaptionCue[] {
  let data: {
    events?: Array<{
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    }>;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return [];
  }
  const cues: CaptionCue[] = [];
  for (const ev of data.events ?? []) {
    if (ev.tStartMs == null || !ev.segs?.length) continue;
    const text = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text || text === "\n") continue;
    cues.push({
      text,
      start_seconds: ev.tStartMs / 1000,
      ...(ev.dDurationMs != null
        ? { duration_seconds: ev.dDurationMs / 1000 }
        : {}),
    });
  }
  return cues;
}

function parseCaptionBody(body: string): CaptionCue[] {
  if (!body) return [];
  if (body.startsWith("{") || body.startsWith("[")) {
    return parseJson3Captions(body);
  }
  const srv3 = parseSrv3Captions(body);
  if (srv3.length) return srv3;
  return parseXmlCaptions(body);
}

function rankTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  const score = (t: CaptionTrack) => {
    let s = 0;
    const lang = (t.languageCode ?? "").toLowerCase();
    if (lang === "en" || lang.startsWith("en-") || lang.startsWith("en_")) s += 10;
    if (lang.startsWith("zh")) s += 8; // cooking playlists often Chinese
    if (t.vssId?.includes(".en")) s += 5;
    if (t.kind !== "asr") s += 2;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a));
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return rankTracks(tracks)[0] ?? null;
}

async function fetchAndroidPlayer(
  videoId: string,
  accessToken?: string,
): Promise<PlayerResponse | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": ANDROID_UA,
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const resp = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: ANDROID_VERSION,
              hl: "en",
              gl: "US",
              androidSdkVersion: 34,
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      },
    );
    if (!resp.ok) return null;
    return (await resp.json()) as PlayerResponse;
  } catch {
    return null;
  }
}

async function downloadTrack(
  baseUrl: string,
  videoId: string,
): Promise<CaptionCue[] | null> {
  try {
    // Prefer default XML (srv3) — more reliable than fmt=json3 on some tracks
    const attempts = [baseUrl];
    try {
      const u = new URL(baseUrl);
      u.searchParams.set("fmt", "srv3");
      attempts.unshift(u.toString());
      const u2 = new URL(baseUrl);
      u2.searchParams.set("fmt", "json3");
      attempts.push(u2.toString());
    } catch {
      /* use base only */
    }

    for (const url of attempts) {
      const res = await fetch(url, {
        headers: {
          "User-Agent": WEB_UA,
          Referer: `https://www.youtube.com/watch?v=${videoId}`,
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) continue;
      const body = await res.text();
      const cues = parseCaptionBody(body);
      if (cues.length) return cues;
    }
  } catch {
    return null;
  }
  return null;
}

export type TranscriptResult =
  | { ok: true; cues: CaptionCue[] }
  | { ok: false; reason: string };

/**
 * Detailed fetch for sync diagnostics.
 */
export async function fetchTranscriptDetailed(
  videoId: string,
  opts?: TranscriptFetchOpts,
): Promise<TranscriptResult> {
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) {
    return { ok: false, reason: "invalid video id" };
  }

  const player = await fetchAndroidPlayer(videoId, opts?.accessToken);
  if (!player) {
    return { ok: false, reason: "player request failed" };
  }

  const status = player.playabilityStatus?.status;
  if (status && status !== "OK") {
    return {
      ok: false,
      reason: `video ${status}${player.playabilityStatus?.reason ? `: ${player.playabilityStatus.reason}` : ""}`,
    };
  }

  const tracks =
    player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    return {
      ok: false,
      reason:
        "no caption tracks on player (video may lack CC, or be private/restricted)",
    };
  }

  const ranked = rankTracks(tracks);
  const tried: string[] = [];
  for (const track of ranked) {
    if (!track.baseUrl) continue;
    const label = `${track.languageCode ?? "?"}${track.kind === "asr" ? "/asr" : ""}`;
    tried.push(label);
    const cues = await downloadTrack(track.baseUrl, videoId);
    if (cues?.length) return { ok: true, cues };
  }

  return {
    ok: false,
    reason: `caption download empty (tracks: ${tried.join(", ") || "none"})`,
  };
}

/**
 * Timed caption cues for a video, or null if unavailable / error.
 */
export async function fetchTranscriptCues(
  videoId: string,
  opts?: TranscriptFetchOpts,
): Promise<CaptionCue[] | null> {
  const result = await fetchTranscriptDetailed(videoId, opts);
  return result.ok ? result.cues : null;
}

/** Exported for unit tests. */
export const _test = {
  parseXmlCaptions,
  parseJson3Captions,
  parseSrv3Captions,
  pickTrack,
  stripTags,
  parseCaptionBody,
};
