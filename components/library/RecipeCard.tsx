import Link from "next/link";
import {
  formatCookMinutes,
  fullDate,
  recipeThumbnailUrl,
  relativeAgo,
} from "@/lib/format";
import type { Recipe, SortKey } from "@/lib/types";

const STATUS_TEXT: Record<"gone" | "off_playlist", string> = {
  gone: "Video unavailable",
  off_playlist: "No longer in the playlist",
};

type Props = {
  recipe: Recipe;
  sort: SortKey;
};

export function RecipeCard({ recipe: r, sort }: Props) {
  const time = formatCookMinutes(r.cook_minutes);
  const dateLabel =
    sort === "uploaded" && r.uploaded_at
      ? `uploaded ${fullDate(r.uploaded_at)}`
      : `added ${relativeAgo(r.added_at)}`;
  const flag = r.verified ? "verified" : `${r.confidence} confidence`;
  const status =
    r.video_status === "gone" || r.video_status === "off_playlist"
      ? r.video_status
      : null;
  const statusNote = status ? STATUS_TEXT[status] : "";
  const statusCls =
    status === "gone" ? "tag tag-outline" : "tag tag-neutral";
  const thumb = recipeThumbnailUrl(r);

  return (
    <Link
      href={`/recipes/${r.id}`}
      className="card elev-sm"
      style={{
        padding: 10,
        gap: 10,
        cursor: "pointer",
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          borderRadius: 20,
          background: "var(--color-neutral-300)",
          display: "grid",
          placeItems: "center",
          color: "var(--color-neutral-100)",
          overflow: "hidden",
        }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <svg width={34} height={34} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        {time ? (
          <div
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(32,30,29,0.72)",
              color: "#f5ead8",
            }}
          >
            {time}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {r.cuisine ? <span className="tag tag-accent">{r.cuisine}</span> : null}
        {r.main_ingredient ? (
          <span className="tag tag-accent-2">{r.main_ingredient}</span>
        ) : null}
      </div>
      <div className="card-title" style={{ fontSize: 16 }}>
        {r.title}
      </div>
      <div className="card-meta" style={{ justifyContent: "space-between" }}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.channel_title}
        </span>
        <span style={{ flex: "none" }}>{flag}</span>
      </div>
      <div className="card-meta" style={{ marginTop: -4 }}>
        {dateLabel}
      </div>
      {status ? (
        <span className={statusCls} style={{ alignSelf: "flex-start" }}>
          {statusNote}
        </span>
      ) : null}
    </Link>
  );
}
