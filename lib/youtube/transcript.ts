/**
 * Fetch timed captions for a YouTube video without Data API quota.
 * Uses the public player / timedtext endpoints (innertube WEB client).
 * No extra npm packages.
 */
import type { CaptionCue } from "@/lib/extract";

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // public WEB client key
const WEB_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20240101.00.00",
  hl: "en",
  gl: "US",
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
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

/** Parse YouTube timedtext XML (srv3 / default). */
function parseXmlCaptions(xml: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  // <text start="1.23" dur="4.5">...</text>
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

/** Parse json3 caption format. */
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

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const en = tracks.find(
    (t) =>
      t.languageCode === "en" ||
      t.languageCode?.startsWith("en") ||
      t.vssId?.includes(".en"),
  );
  if (en) return en;
  // Prefer manual over ASR when no English
  const manual = tracks.find((t) => t.kind !== "asr");
  return manual ?? tracks[0] ?? null;
}

async function fetchPlayer(videoId: string): Promise<PlayerResponse | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          context: { client: WEB_CLIENT },
          videoId,
        }),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as PlayerResponse;
  } catch {
    return null;
  }
}

async function fetchCaptionBody(baseUrl: string): Promise<CaptionCue[] | null> {
  // Prefer json3 for structured cues
  const jsonUrl = new URL(baseUrl);
  jsonUrl.searchParams.set("fmt", "json3");

  try {
    const res = await fetch(jsonUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith("{")) {
        const cues = parseJson3Captions(text);
        if (cues.length) return cues;
      }
      // fall through to xml
      const xmlCues = parseXmlCaptions(text);
      if (xmlCues.length) return xmlCues;
    }
  } catch {
    /* try plain baseUrl */
  }

  try {
    const res = await fetch(baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith("{")) {
      const cues = parseJson3Captions(text);
      return cues.length ? cues : null;
    }
    const cues = parseXmlCaptions(text);
    return cues.length ? cues : null;
  } catch {
    return null;
  }
}

/**
 * Timed caption cues for a video, or null if unavailable / error.
 */
export async function fetchTranscriptCues(
  videoId: string,
): Promise<CaptionCue[] | null> {
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return null;

  const player = await fetchPlayer(videoId);
  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickTrack(tracks);
  if (track?.baseUrl) {
    const cues = await fetchCaptionBody(track.baseUrl);
    if (cues?.length) return cues;
  }

  // Fallback: public timedtext endpoint (often empty without name/signature)
  for (const lang of ["en", "en-US", "a.en"]) {
    try {
      const url = new URL("https://www.youtube.com/api/timedtext");
      url.searchParams.set("v", videoId);
      url.searchParams.set("lang", lang.replace(/^a\./, ""));
      if (lang.startsWith("a.")) url.searchParams.set("kind", "asr");
      url.searchParams.set("fmt", "json3");
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text) continue;
      const cues = text.startsWith("{")
        ? parseJson3Captions(text)
        : parseXmlCaptions(text);
      if (cues.length) return cues;
    } catch {
      /* next lang */
    }
  }

  return null;
}

/** Exported for unit tests. */
export const _test = {
  parseXmlCaptions,
  parseJson3Captions,
  pickTrack,
  stripTags,
};
