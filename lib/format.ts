import type { Ingredient } from "@/lib/types";

/** Display qty; inferred values render in brackets when not already bracketed. */
export function formatQty(ing: Pick<Ingredient, "qty" | "inferred">): string {
  const q = ing.qty.trim();
  if (!ing.inferred) return q;
  if (q.startsWith("[") && q.endsWith("]")) return q;
  return `[${q}]`;
}

/** Parse "1:10" or "1:10:05" style times to seconds. */
export function parseTimestamp(t: string): number {
  const parts = t
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  return 0;
}

/** Format seconds as M:SS or H:MM:SS. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export function youtubeWatchUrl(videoId: string, tSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (tSeconds == null || tSeconds <= 0) return base;
  return `${base}&t=${Math.floor(tSeconds)}s`;
}

export function youtubeStepUrl(videoId: string, tSeconds: number): string {
  return youtubeWatchUrl(videoId, tSeconds);
}

/** URL slug base from title; caller appends uniqueness suffix. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Share slug: title-slug + 4 hex chars. */
export function makeShareSlug(title: string, randomHex4: string): string {
  const base = slugifyTitle(title) || "recipe";
  const hex = randomHex4.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 4);
  return `${base}-${hex.padEnd(4, "0")}`;
}

export function formatCookMinutes(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hr`;
  return `${h} hr ${m}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function fullDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  void now;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
