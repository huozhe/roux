/**
 * Fetch timed captions for a YouTube video.
 *
 * Cloud IPs (e.g. Vercel) often get LOGIN_REQUIRED from anonymous innertube.
 * Strategy:
 *  1) ANDROID/IOS player without OAuth (works on many residential networks)
 *  2) Same clients with optional YOUTUBE_COOKIES (browser session — best for Vercel)
 *  3) Watch-page scrape for caption track URLs + timedtext download
 *
 * Do NOT send Google OAuth Bearer to innertube — youtube.readonly tokens return
 * "insufficient authentication scopes" (403) and are not a YouTube web session.
 */
import type { CaptionCue } from "@/lib/extract";

const ANDROID_VERSION = "20.10.38";
const IOS_VERSION = "20.10.4";
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type TranscriptFetchOpts = {
  /**
   * @deprecated OAuth Bearer is not used for innertube (causes 403 with readonly scope).
   * Kept for call-site compatibility.
   */
  accessToken?: string;
  /** Optional cookie header override; defaults to process.env.YOUTUBE_COOKIES */
  cookies?: string;
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

type ClientSpec = {
  name: string;
  clientName: string;
  clientVersion: string;
  userAgent: string;
  extraClient?: Record<string, unknown>;
};

const CLIENTS: ClientSpec[] = [
  {
    name: "ANDROID",
    clientName: "ANDROID",
    clientVersion: ANDROID_VERSION,
    userAgent: `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`,
    extraClient: { androidSdkVersion: 34, hl: "en", gl: "US" },
  },
  {
    name: "IOS",
    clientName: "IOS",
    clientVersion: IOS_VERSION,
    userAgent: `com.google.ios.youtube/${IOS_VERSION} (iPhone16,2; U; CPU iOS 17_5 like Mac OS X;)`,
    extraClient: { hl: "en", gl: "US", deviceModel: "iPhone16,2" },
  },
];

/** Consent cookies that often unlock anonymous access. */
const DEFAULT_CONSENT =
  "CONSENT=YES+cb.20210328-17-p0.en+FX+667; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgLnPpwY";

function resolveCookies(opts?: TranscriptFetchOpts): string {
  const fromOpts = opts?.cookies?.trim();
  if (fromOpts) return fromOpts;
  const fromEnv = process.env.YOUTUBE_COOKIES?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_CONSENT;
}

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

/** Parse WebVTT into cues. */
function parseVttCaptions(vtt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  // 00:00:01.200 --> 00:00:03.400
  const re =
    /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})[^\n]*\n([\s\S]*?)(?=\n\n|\n(?:\d{2}:)?\d{2}:\d{2}\.|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(vtt))) {
    const start =
      Number(m[1] ?? 0) * 3600 +
      Number(m[2]) * 60 +
      Number(m[3]) +
      Number(m[4]) / 1000;
    const end =
      Number(m[5] ?? 0) * 3600 +
      Number(m[6]) * 60 +
      Number(m[7]) +
      Number(m[8]) / 1000;
    const text = stripTags(m[9] ?? "").replace(/\n/g, " ");
    if (!text) continue;
    cues.push({
      text,
      start_seconds: start,
      duration_seconds: Math.max(0, end - start),
    });
  }
  return cues;
}

function parseCaptionBody(body: string): CaptionCue[] {
  if (!body) return [];
  const trimmed = body.trim();
  if (trimmed.startsWith("WEBVTT")) return parseVttCaptions(body);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
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
    if (lang.startsWith("zh")) s += 8;
    if (t.vssId?.includes(".en")) s += 5;
    if (t.kind !== "asr") s += 2;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a));
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return rankTracks(tracks)[0] ?? null;
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
  for (const marker of [
    "ytInitialPlayerResponse = ",
    "ytInitialPlayerResponse=",
    "var ytInitialPlayerResponse = ",
  ]) {
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

type PlayerAttempt =
  | { ok: true; player: PlayerResponse; via: string }
  | { ok: false; via: string; error: string };

async function fetchPlayerInnertube(
  videoId: string,
  client: ClientSpec,
  cookies: string,
): Promise<PlayerAttempt> {
  try {
    const resp = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.userAgent,
          Cookie: cookies,
          "Accept-Language": "en-US,en;q=0.9,zh;q=0.8",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              ...(client.extraClient ?? {}),
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        via: client.name,
        error: `HTTP ${resp.status}${text ? `: ${text.slice(0, 100)}` : ""}`,
      };
    }
    const player = (await resp.json()) as PlayerResponse;
    return { ok: true, player, via: client.name };
  } catch (err) {
    return {
      ok: false,
      via: client.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchPlayerFromWatchPage(
  videoId: string,
  cookies: string,
): Promise<PlayerAttempt> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Cookie: cookies,
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      },
    );
    if (!res.ok) {
      return { ok: false, via: "WATCH_HTML", error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (html.includes('class="g-recaptcha"')) {
      return { ok: false, via: "WATCH_HTML", error: "captcha required" };
    }
    const player = playerFromHtml(html);
    if (!player) {
      return {
        ok: false,
        via: "WATCH_HTML",
        error: "ytInitialPlayerResponse not found",
      };
    }
    return { ok: true, player, via: "WATCH_HTML" };
  } catch (err) {
    return {
      ok: false,
      via: "WATCH_HTML",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function downloadTrack(
  baseUrl: string,
  videoId: string,
  cookies: string,
): Promise<CaptionCue[] | null> {
  const attempts: string[] = [baseUrl];
  try {
    const srv3 = new URL(baseUrl);
    srv3.searchParams.set("fmt", "srv3");
    attempts.push(srv3.toString());
    const json3 = new URL(baseUrl);
    json3.searchParams.set("fmt", "json3");
    attempts.push(json3.toString());
    const vtt = new URL(baseUrl);
    vtt.searchParams.set("fmt", "vtt");
    attempts.push(vtt.toString());
  } catch {
    /* base only */
  }

  const userAgents = [WEB_UA, BROWSER_UA];

  for (const ua of userAgents) {
    for (const url of attempts) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": ua,
            Cookie: cookies,
            Referer: `https://www.youtube.com/watch?v=${videoId}`,
            Origin: "https://www.youtube.com",
            "Accept-Language": "en-US,en;q=0.9,zh;q=0.8",
            Accept: "*/*",
          },
        });
        if (!res.ok) continue;
        const body = await res.text();
        const cues = parseCaptionBody(body);
        if (cues.length) return cues;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

export type TranscriptFailKind =
  /** Playable video, uploader has no captions / ASR. */
  | "no_captions"
  /** YouTube requires login / bot check for this IP or session. */
  | "auth_blocked"
  /** Deleted, private, terminated, unplayable. */
  | "unavailable"
  | "captcha"
  /** Tracks listed but timedtext body empty. */
  | "empty_body"
  | "unknown";

export type TranscriptResult =
  | { ok: true; cues: CaptionCue[] }
  | { ok: false; reason: string; kind: TranscriptFailKind };

type FailAttempt = { kind: TranscriptFailKind; reason: string };

function fail(
  kind: TranscriptFailKind,
  reason: string,
): Extract<TranscriptResult, { ok: false }> {
  return { ok: false, kind, reason };
}

function classifyPlayability(
  status: string | undefined,
  playReason: string | undefined,
  via: string,
): FailAttempt | null {
  const st = status ?? "OK";
  const pr = playReason ?? "";
  if (st === "LOGIN_REQUIRED" || /sign in to confirm/i.test(pr)) {
    return {
      kind: "auth_blocked",
      reason: `${via}: LOGIN_REQUIRED${pr ? ` (${pr})` : ""}`,
    };
  }
  if (st === "UNPLAYABLE" && /sign in/i.test(pr)) {
    return {
      kind: "auth_blocked",
      reason: `${via}: UNPLAYABLE sign-in${pr ? ` (${pr})` : ""}`,
    };
  }
  if (st && st !== "OK") {
    return {
      kind: "unavailable",
      reason: `${via}: video ${st}${pr ? ` (${pr})` : ""}`,
    };
  }
  return null;
}

/** Prefer concrete outcomes: unavailable > no_captions > empty_body > auth > unknown. */
function pickFinalFail(attempts: FailAttempt[]): FailAttempt {
  const order: TranscriptFailKind[] = [
    "unavailable",
    "no_captions",
    "empty_body",
    "captcha",
    "auth_blocked",
    "unknown",
  ];
  for (const kind of order) {
    const hit = attempts.find((a) => a.kind === kind);
    if (hit) return hit;
  }
  return attempts[0] ?? { kind: "unknown", reason: "unknown caption failure" };
}

async function cuesFromPlayer(
  player: PlayerResponse,
  videoId: string,
  cookies: string,
  via: string,
): Promise<TranscriptResult> {
  const status = player.playabilityStatus?.status;
  const playReason = player.playabilityStatus?.reason;
  const blocked = classifyPlayability(status, playReason, via);
  if (blocked) return fail(blocked.kind, blocked.reason);

  const tracks =
    player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    // Playable (status OK) but no tracks = legitimately no captions — not auth.
    return fail("no_captions", `${via}: no caption tracks`);
  }

  const ranked = rankTracks(tracks);
  const tried: string[] = [];
  for (const track of ranked) {
    if (!track.baseUrl) continue;
    const label = `${track.languageCode ?? "?"}${track.kind === "asr" ? "/asr" : ""}`;
    tried.push(label);
    const cues = await downloadTrack(track.baseUrl, videoId, cookies);
    if (cues?.length) return { ok: true, cues };
  }

  return fail(
    "empty_body",
    `${via}: caption body empty (tracks: ${tried.join(", ")})`,
  );
}

/**
 * Detailed fetch for sync diagnostics.
 */
export async function fetchTranscriptDetailed(
  videoId: string,
  opts?: TranscriptFetchOpts,
): Promise<TranscriptResult> {
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) {
    return fail("unknown", "invalid video id");
  }

  const cookies = resolveCookies(opts);
  const hasUserCookies = Boolean(
    opts?.cookies?.trim() || process.env.YOUTUBE_COOKIES?.trim(),
  );
  const fails: FailAttempt[] = [];

  // Innertube ANDROID/IOS with consent (and optional user cookies)
  for (const client of CLIENTS) {
    const attempt = await fetchPlayerInnertube(videoId, client, cookies);
    if (!attempt.ok) {
      fails.push({
        kind: "unknown",
        reason: `${attempt.via}: ${attempt.error}`,
      });
      continue;
    }
    const result = await cuesFromPlayer(
      attempt.player,
      videoId,
      cookies,
      attempt.via,
    );
    if (result.ok) return result;
    fails.push({ kind: result.kind, reason: result.reason });
  }

  // Watch-page scrape (can still list tracks when innertube is auth-blocked)
  const htmlAttempt = await fetchPlayerFromWatchPage(videoId, cookies);
  if (htmlAttempt.ok) {
    const result = await cuesFromPlayer(
      htmlAttempt.player,
      videoId,
      cookies,
      htmlAttempt.via,
    );
    if (result.ok) return result;
    fails.push({ kind: result.kind, reason: result.reason });
  } else {
    const err = htmlAttempt.error;
    fails.push({
      kind: /captcha/i.test(err) ? "captcha" : "unknown",
      reason: `${htmlAttempt.via}: ${err}`,
    });
  }

  const final = pickFinalFail(fails);

  // Only claim auth block when playability said so AND we lack user cookies
  // (or even with cookies if still LOGIN_REQUIRED).
  if (final.kind === "auth_blocked" && !hasUserCookies) {
    return fail(
      "auth_blocked",
      "YouTube blocked anonymous caption access (LOGIN_REQUIRED). " +
        "Set YOUTUBE_COOKIES to a logged-in youtube.com Cookie header. " +
        `Details: ${fails
          .filter((f) => f.kind === "auth_blocked")
          .map((f) => f.reason)
          .slice(0, 2)
          .join(" · ")}`,
    );
  }

  if (final.kind === "no_captions") {
    return fail(
      "no_captions",
      "No captions on this video (playable; uploader disabled captions / no ASR)",
    );
  }

  if (final.kind === "unavailable") {
    return fail("unavailable", final.reason);
  }

  return fail(
    final.kind,
    `${final.reason}${fails.length > 1 ? ` · also: ${fails
      .slice(0, 3)
      .map((f) => f.kind)
      .join(", ")}` : ""}`,
  );
}

export async function fetchTranscriptCues(
  videoId: string,
  opts?: TranscriptFetchOpts,
): Promise<CaptionCue[] | null> {
  const result = await fetchTranscriptDetailed(videoId, opts);
  return result.ok ? result.cues : null;
}

export const _test = {
  parseXmlCaptions,
  parseJson3Captions,
  parseSrv3Captions,
  parseVttCaptions,
  pickTrack,
  stripTags,
  parseCaptionBody,
  playerFromHtml,
};
