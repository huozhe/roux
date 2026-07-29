/** Short relative labels for last-run (hours included). */
export function relativeSyncAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "yesterday" : `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** History "When" column — Today/Yesterday or Mon D, HH:MM. */
export function formatSyncWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const mon = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${mon}, ${time}`;
}

export function resultTagClass(result: string | null | undefined): string {
  const r = (result ?? "").toLowerCase();
  if (r === "ok") return "tag tag-accent-2";
  if (r === "no change") return "tag tag-neutral";
  if (r.includes("quota") || r.includes("error")) return "tag tag-outline";
  if (r.includes("transcript") || r.includes("gone")) return "tag tag-outline";
  return "tag tag-neutral";
}
