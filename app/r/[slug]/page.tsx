import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IngredientsList } from "@/components/recipe/IngredientsList";
import { TooManyRequests } from "@/components/share/TooManyRequests";
import { guestReadAllowed } from "@/lib/guest-rate-limit";
import { getSharedRecipeBySlug } from "@/lib/data/shares";
import {
  formatCookMinutes,
  formatTimestamp,
  youtubeEmbedUrl,
  youtubeStepUrl,
  youtubeWatchUrl,
} from "@/lib/format";
import type { Recipe } from "@/lib/types";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await getSharedRecipeBySlug(slug);
  if (!recipe) {
    return {
      title: "Shared recipe · Roux",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${recipe.title} · Shared from Roux`,
    description: `Recipe written from “${recipe.video_title}” by ${recipe.channel_title}.`,
    robots: { index: false, follow: false },
  };
}

function RouxMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 12a8.5 8.5 0 1 0-8.5 8.5" />
      <path d="M12 16.8A4.8 4.8 0 1 0 7.2 12" />
      <path d="M12 13.2a1.2 1.2 0 1 1-1.2-1.2" />
    </svg>
  );
}

function GoneIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2 2 20 20" />
      <path d="M10.7 5H19a2 2 0 0 1 2 2v10" />
      <path d="M5 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11" />
    </svg>
  );
}

function PublicRecipeBody({ recipe }: { recipe: Recipe }) {
  const playable = recipe.video_status !== "gone";
  const time = formatCookMinutes(recipe.cook_minutes);
  const meta = [time, recipe.servings].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "26.4px 17.6px 70px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8.8px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {recipe.cuisine ? (
            <span className="tag tag-accent">{recipe.cuisine}</span>
          ) : null}
          {recipe.main_ingredient ? (
            <span className="tag tag-accent-2">{recipe.main_ingredient}</span>
          ) : null}
        </div>
        <h1 style={{ fontSize: 38, margin: 0, textWrap: "pretty" }}>
          {recipe.title}
        </h1>
        {meta ? (
          <div className="text-muted" style={{ fontSize: "13.5px" }}>
            {meta}
          </div>
        ) : null}
      </div>

      {playable ? (
        <div className="card" style={{ gap: "13.2px", padding: "13.2px 17.6px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "13.2px",
            }}
          >
            <span style={{ flex: 1, minWidth: 200, fontSize: "13.5px" }}>
              Written from the video by <strong>{recipe.channel_title}</strong>.
              Watch the original for technique and timing.
            </span>
            <a
              className="btn btn-primary"
              href={youtubeWatchUrl(recipe.video_id)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 0, flex: "none" }}
            >
              Watch on YouTube
            </a>
          </div>
          <div
            style={{
              position: "relative",
              aspectRatio: "16 / 9",
              borderRadius: 20,
              overflow: "hidden",
              background: "var(--color-neutral-300)",
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
        </div>
      ) : (
        <div
          className="card"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "13.2px",
            padding: "13.2px 17.6px",
            background: "var(--color-neutral-200)",
            border: "1px dashed var(--color-neutral-400)",
          }}
        >
          <span
            style={{
              flex: "none",
              display: "grid",
              color: "var(--color-neutral-700)",
            }}
          >
            <GoneIcon />
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              color: "var(--color-neutral-900)",
            }}
          >
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
              Video no longer available
            </span>
            <span className="text-muted" style={{ fontSize: "12.5px" }}>
              Written from “{recipe.video_title}” by {recipe.channel_title},
              which has since been taken down.
            </span>
          </span>
        </div>
      )}

      <div className="card" style={{ gap: "13.2px", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Ingredients</h4>
          <span className="text-muted" style={{ fontSize: "12.5px" }}>
            {recipe.ingredients.length}
          </span>
        </div>
        <IngredientsList ingredients={recipe.ingredients} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "13.2px" }}>
        <h4 style={{ margin: 0 }}>Steps</h4>
        {recipe.steps.map((s) => {
          const t = formatTimestamp(s.t_seconds);
          return (
            <div
              key={s.n}
              style={{
                display: "flex",
                gap: "13.2px",
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
                  paddingBottom: "13.2px",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1.5,
                    textWrap: "pretty",
                  }}
                >
                  {s.text}
                </div>
                {playable ? (
                  <a
                    href={youtubeStepUrl(recipe.video_id, s.t_seconds)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "12.5px" }}
                  >
                    Video at {t}
                  </a>
                ) : (
                  <span className="text-muted" style={{ fontSize: "12.5px" }}>
                    Was at {t} — video unavailable
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-muted" style={{ margin: 0, fontSize: "12.5px" }}>
        Shared read-only. The owner can kill this link at any time, and personal
        notes are never shown here.
      </p>
    </div>
  );
}

export default async function PublicSharePage({ params }: PageProps) {
  const { slug } = await params;
  if (!(await guestReadAllowed())) return <TooManyRequests />;

  const recipe = await getSharedRecipeBySlug(slug);
  if (!recipe) notFound();

  return (
    <div style={{ minHeight: "100%", background: "var(--color-bg)" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "13.2px",
          padding: "13.2px 17.6px",
          background: "var(--color-surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginRight: "auto",
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "var(--color-accent)",
              display: "grid",
              placeItems: "center",
              color: "var(--color-bg)",
            }}
          >
            <RouxMark />
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
            Shared from Roux
          </span>
        </div>
        <span className="tag tag-neutral">read-only</span>
      </header>
      <PublicRecipeBody recipe={recipe} />
    </div>
  );
}
