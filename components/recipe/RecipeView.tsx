"use client";

import { IngredientsList } from "@/components/recipe/IngredientsList";
import { RecipeNotes } from "@/components/recipe/RecipeNotes";
import {
  formatTimestamp,
  youtubeEmbedUrl,
  youtubeStepUrl,
} from "@/lib/format";
import type { Recipe } from "@/lib/types";

function StepTimestamp({
  recipe,
  gone,
  tSeconds,
  showTimestamps,
}: {
  recipe: Recipe;
  gone: boolean;
  tSeconds: number;
  showTimestamps: boolean;
}) {
  if (gone) {
    return (
      <span className="text-muted" style={{ fontSize: 12.5 }}>
        Was at {formatTimestamp(tSeconds)} — video unavailable
      </span>
    );
  }
  if (!showTimestamps) return null;
  return (
    <a
      href={youtubeStepUrl(recipe.video_id, tSeconds)}
      target="_blank"
      rel="noreferrer"
      style={{ fontSize: 12.5 }}
    >
      Video at {formatTimestamp(tSeconds)}
    </a>
  );
}

function SingleScroll({
  recipe,
  playable,
  gone,
  videoOpen,
  onToggleVideo,
  notes,
  onNotes,
  notesStatus,
  showTimestamps,
  showNotes = false,
}: {
  recipe: Recipe;
  playable: boolean;
  gone: boolean;
  videoOpen: boolean;
  onToggleVideo: () => void;
  notes: string;
  onNotes: (v: string) => void;
  notesStatus: string;
  showTimestamps: boolean;
  showNotes?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 26.4,
        maxWidth: 780,
      }}
    >
      {playable && (
        <button
          type="button"
          onClick={onToggleVideo}
          className="card elev-sm"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 13.2,
            padding: "10px 17.6px 10px 10px",
            cursor: "pointer",
            border: 0,
            width: "100%",
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              flex: "none",
              borderRadius: 999,
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <PlayIcon size={18} />
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
              {videoOpen ? "Hide video" : "Watch the video"}
            </span>
            <span
              className="text-muted"
              style={{
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {recipe.video_title} · {recipe.channel_title}
            </span>
          </span>
          <span
            style={{
              flex: "none",
              display: "grid",
              transform: videoOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.18s ease",
            }}
          >
            <ChevronDown />
          </span>
        </button>
      )}

      {playable && videoOpen && (
        <div
          style={{
            position: "relative",
            aspectRatio: "16 / 9",
            borderRadius: 28,
            background: "var(--color-neutral-300)",
            overflow: "hidden",
            marginTop: -13.2,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <iframe
            title={recipe.video_title}
            src={youtubeEmbedUrl(recipe.video_id)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
          />
        </div>
      )}

      {gone && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13.2,
            padding: "13.2px 17.6px",
            borderRadius: 28,
            background: "var(--color-neutral-200)",
            border: "1px dashed var(--color-neutral-400)",
            color: "var(--color-neutral-700)",
          }}
        >
          <span style={{ flex: "none", display: "grid" }}>
            <VideoOffIcon size={22} />
          </span>
          <span
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
              Video no longer available
            </span>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Was “{recipe.video_title}” by {recipe.channel_title}
            </span>
          </span>
        </div>
      )}

      <div className="card" style={{ gap: 13.2, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Ingredients</h4>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {recipe.ingredients.length}
          </span>
        </div>
        <IngredientsList ingredients={recipe.ingredients} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 13.2 }}>
        <h4 style={{ margin: 0 }}>Steps</h4>
        {recipe.steps.map((s) => (
          <div
            key={s.n}
            style={{
              display: "flex",
              gap: 13.2,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flex: "none",
                borderRadius: 999,
                background: "var(--color-accent-200)",
                color: "var(--color-accent-900)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingBottom: 13.2,
              }}
            >
              <div
                style={{ fontSize: 16, lineHeight: 1.5, textWrap: "pretty" }}
              >
                {s.text}
              </div>
              <StepTimestamp
                recipe={recipe}
                gone={gone}
                tSeconds={s.t_seconds}
                showTimestamps={showTimestamps}
              />
            </div>
          </div>
        ))}
      </div>

      {showNotes ? (
        <RecipeNotes notes={notes} onNotes={onNotes} notesStatus={notesStatus} />
      ) : null}
    </div>
  );
}

function SplitLayout({
  recipe,
  playable,
  gone,
  videoOpen,
  onToggleVideo,
  notes,
  onNotes,
  notesStatus,
  showTimestamps,
  showNotes = false,
}: {
  recipe: Recipe;
  playable: boolean;
  gone: boolean;
  videoOpen: boolean;
  onToggleVideo: () => void;
  notes: string;
  onNotes: (v: string) => void;
  notesStatus: string;
  showNotes?: boolean;
  showTimestamps: boolean;
}) {
  return (
    <div
      className="recipe-split-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)",
        gap: 26.4,
        alignItems: "start",
      }}
    >
      <div
        className="card elev-sm"
        style={{
          gap: 13.2,
          padding: 22,
          position: "sticky",
          top: 90,
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Ingredients</h4>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {recipe.ingredients.length}
          </span>
        </div>
        <IngredientsList ingredients={recipe.ingredients} />

        {playable && (
          <button
            type="button"
            onClick={onToggleVideo}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              marginTop: 4,
              padding: "8px 13.2px 8px 8px",
              border: "1px solid var(--color-divider)",
              borderRadius: 999,
              background: "var(--color-bg)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                flex: "none",
                borderRadius: 999,
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <PlayIcon size={15} />
            </span>
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-heading)",
                fontSize: 14,
              }}
            >
              {videoOpen ? "Hide video" : "Watch the video"}
            </span>
            <span
              style={{
                flex: "none",
                display: "grid",
                transform: videoOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}
            >
              <ChevronDown />
            </span>
          </button>
        )}

        {playable && videoOpen && (
          <div
            style={{
              position: "relative",
              aspectRatio: "16 / 9",
              borderRadius: 20,
              background: "var(--color-neutral-300)",
              overflow: "hidden",
            }}
          >
            <iframe
              title={recipe.video_title}
              src={youtubeEmbedUrl(recipe.video_id)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
            />
          </div>
        )}

        {gone && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 4,
              padding: "10px 13.2px",
              borderRadius: 20,
              background: "var(--color-neutral-200)",
              border: "1px dashed var(--color-neutral-400)",
              color: "var(--color-neutral-700)",
            }}
          >
            <span style={{ flex: "none", display: "grid" }}>
              <VideoOffIcon size={18} />
            </span>
            <span style={{ fontSize: 12.5 }}>Video no longer available</span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 17.6,
          minWidth: 0,
        }}
      >
        <h4 style={{ margin: 0 }}>Steps</h4>
        {recipe.steps.map((s) => (
          <div
            key={s.n}
            className="card"
            style={{
              flexDirection: "row",
              gap: 13.2,
              alignItems: "flex-start",
              padding: 17.6,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flex: "none",
                borderRadius: 999,
                background: "var(--color-accent-200)",
                color: "var(--color-accent-900)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {s.n}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{ fontSize: 16, lineHeight: 1.5, textWrap: "pretty" }}
              >
                {s.text}
              </div>
              <StepTimestamp
                recipe={recipe}
                gone={gone}
                tSeconds={s.t_seconds}
                showTimestamps={showTimestamps}
              />
            </div>
          </div>
        ))}
        {showNotes ? (
          <RecipeNotes notes={notes} onNotes={onNotes} notesStatus={notesStatus} />
        ) : null}
      </div>
    </div>
  );
}

export function RecipeView({
  recipe,
  layout,
  playable,
  gone,
  videoOpen,
  onToggleVideo,
  notes,
  onNotes,
  notesStatus,
  showTimestamps,
  showNotes,
}: {
  recipe: Recipe;
  layout: "single" | "split";
  playable: boolean;
  gone: boolean;
  videoOpen: boolean;
  onToggleVideo: () => void;
  notes: string;
  onNotes: (v: string) => void;
  notesStatus: string;
  showTimestamps: boolean;
  showNotes: boolean;
}) {
  if (layout === "split") {
    return (
      <SplitLayout
        recipe={recipe}
        playable={playable}
        gone={gone}
        videoOpen={videoOpen}
        onToggleVideo={onToggleVideo}
        notes={notes}
        onNotes={onNotes}
        notesStatus={notesStatus}
        showTimestamps={showTimestamps}
        showNotes={showNotes}
      />
    );
  }
  return (
    <SingleScroll
      recipe={recipe}
      playable={playable}
      gone={gone}
      videoOpen={videoOpen}
      onToggleVideo={onToggleVideo}
      notes={notes}
      onNotes={onNotes}
      notesStatus={notesStatus}
      showTimestamps={showTimestamps}
      showNotes={showNotes}
    />
  );
}

function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function VideoOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m2 2 20 20" />
      <path d="M10.7 5H19a2 2 0 0 1 2 2v10" />
      <path d="M5 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11" />
    </svg>
  );
}
