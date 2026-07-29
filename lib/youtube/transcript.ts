/**
 * Fetch timed captions for a YouTube video.
 *
 * Primary: `youtube-transcript` (robust against innertube blocks).
 * Fallback: watch-page scrape + timedtext (kept for edge cases / offline tests of parsers).
 */
import { YoutubeTranscript } from "youtube-transcript";
import type { CaptionCue } from "@/lib/extract";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
  const score = (t: CaptionTrack) => {
    let s = 0;
    const lang = (t.languageCode ?? "").toLowerCase();
    if (lang === "en" || lang.startsWith("en-") || lang.startsWith("en_")) s += 10;
    if (t.vssId?.includes(".en")) s += 5;
    if (t.kind !== "asr") s += 2;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function extractJsonObject(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function playerFromHtml(html: string): PlayerResponse | null {
  const markers = ["ytInitialPlayerResponse = ", "ytInitialPlayerResponse="];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = html.indexOf("{", idx + marker.length);
    if (start === -1) continue;
    const raw = extractJsonObject(html, start);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as PlayerResponse;
    } catch {
      /* next */
    }
  }
  return null;
}

async function fetchViaYoutubeTranscript(
  videoId: string,
): Promise<CaptionCue[] | null> {
  const langTries = [undefined, "en", "en-US"] as const;
  for (const lang of langTries) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(
        videoId,
        lang ? { lang } : undefined,
      );
      if (!items?.length) continue;
      return items.map((it) => ({
        // package uses milliseconds for offset/duration
        text: it.text.replace(/\n/g, " ").trim(),
        start_seconds: (it.offset ?? 0) / 1000,
        duration_seconds: (it.duration ?? 0) / 1000,
      })).filter((c) => c.text);
    } catch {
      /* try next lang / fall through */
    }
  }
  return null;
}

async function fetchViaWatchPage(
  videoId: string,
): Promise<CaptionCue[] | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const player = playerFromHtml(html);
    const tracks =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickTrack(tracks);
    if (!track?.baseUrl) return null;

    for (const fmt of ["json3", "srv3", ""]) {
      try {
        const url = new URL(track.baseUrl);
        if (fmt) url.searchParams.set("fmt", fmt);
        const cRes = await fetch(url.toString(), {
          headers: {
            "User-Agent": UA,
            Referer: `https://www.youtube.com/watch?v=${videoId}`,
          },
        });
        if (!cRes.ok) continue;
        const text = await cRes.text();
        if (!text) continue;
        const cues = text.startsWith("{")
          ? parseJson3Captions(text)
          : parseXmlCaptions(text);
        if (cues.length) return cues;
      } catch {
        /* next fmt */
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Timed caption cues for a video, or null if unavailable / error.
 */
export async function fetchTranscriptCues(
  videoId: string,
): Promise<CaptionCue[] | null> {
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return null;

  const primary = await fetchViaYoutubeTranscript(videoId);
  if (primary?.length) return primary;

  const fallback = await fetchViaWatchPage(videoId);
  if (fallback?.length) return fallback;

  return null;
}

/** Exported for unit tests. */
export const _test = {
  parseXmlCaptions,
  parseJson3Captions,
  pickTrack,
  stripTags,
  playerFromHtml,
  extractJsonObject,
};
