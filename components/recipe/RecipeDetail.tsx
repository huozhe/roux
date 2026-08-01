"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IngredientsList } from "@/components/recipe/IngredientsList";
import {
  formatCookMinutes,
  formatQty,
  formatTimestamp,
  fullDate,
  relativeAgo,
  youtubeEmbedUrl,
  youtubeStepUrl,
  youtubeWatchUrl,
} from "@/lib/format";
import { useLivePrefs } from "@/lib/prefs/client";
import type { Ingredient, Recipe, Step, UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";
import { useDialogA11y } from "@/lib/ui/useDialogA11y";

type Draft = {
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
};

type RemoveMode = "archive" | "delete" | null;

async function apiJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 204) {
      return { ok: true, data: undefined as T };
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      recipe?: Recipe;
      slug?: string;
    };
    if (!res.ok) {
      return { ok: false, error: body.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export function RecipeDetail({
  recipe: initial,
  prefs = DEFAULT_PREFS,
}: {
  recipe: Recipe;
  prefs?: UserPrefs;
}) {
  const [recipe, setRecipe] = useState(initial);
  const livePrefs = useLivePrefs(prefs);
  const showTimestamps = livePrefs.timestamps !== false;
  const layout = livePrefs.layout === "split" ? "split" : "single";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [notesStatus, setNotesStatus] = useState("Only you can see these");
  const [videoOpen, setVideoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<"" | "link" | "text">("");
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState<RemoveMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesBaseline = useRef(recipe.notes ?? "");

  const closeShare = useCallback(() => setShareOpen(false), []);
  const closeConfirm = useCallback(() => setConfirming(false), []);
  const shareDialogRef = useDialogA11y(shareOpen, closeShare);
  const confirmDialogRef = useDialogA11y(confirming, closeConfirm);

  const gone = recipe.video_status === "gone";
  const playable = !gone;
  const timeLabel = formatCookMinutes(recipe.cook_minutes);
  const servings = recipe.servings ?? "";
  const metaParts = [
    recipe.channel_title,
    timeLabel,
    servings,
    recipe.uploaded_at ? `uploaded ${fullDate(recipe.uploaded_at)}` : null,
    recipe.added_at ? `added ${relativeAgo(recipe.added_at)}` : null,
  ].filter(Boolean);

  const verifyLabel = recipe.verified
    ? "verified by me"
    : `${recipe.confidence} confidence`;
  const verifyTagCls = recipe.verified ? "tag tag-neutral" : "tag tag-outline";

  const startEdit = () => {
    setDraft({
      title: recipe.title,
      ingredients: recipe.ingredients.map((i) => ({ ...i })),
      steps: recipe.steps.map((s) => ({ ...s })),
    });
    setEditing(true);
    setError(null);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    const ingredients = draft.ingredients.map((i) => ({
      ...i,
      inferred: false,
    }));
    const steps = draft.steps.map((s, i) => ({ ...s, n: i + 1 }));
    const result = await apiJson<{ recipe: Recipe }>(
      `/api/recipes/${recipe.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          ingredients,
          steps,
        }),
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRecipe(result.data.recipe);
    setDraft(null);
    setEditing(false);
  };

  const markVerified = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await apiJson<{ recipe: Recipe }>(
      `/api/recipes/${recipe.id}/verify`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRecipe(result.data.recipe);
  };

  const persistNotes = useCallback(
    async (value: string) => {
      if (value === notesBaseline.current) return;
      setNotesStatus("Saving…");
      const result = await apiJson<{ recipe: Recipe }>(
        `/api/recipes/${recipe.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ notes: value || null }),
        },
      );
      if (!result.ok) {
        setNotesStatus("Couldn’t save notes");
        return;
      }
      notesBaseline.current = value;
      setRecipe(result.data.recipe);
      setNotesStatus("Saved to this recipe");
    },
    [recipe.id],
  );

  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  const onNotesChange = (value: string) => {
    setNotes(value);
    setNotesStatus("Saving…");
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      void persistNotes(value);
    }, 600);
  };

  const openShare = async () => {
    setCopied("");
    setShareOpen(true);
    setError(null);
    if (shareSlug) return;
    setShareBusy(true);
    const result = await apiJson<{ slug: string }>(
      `/api/recipes/${recipe.id}/share`,
      { method: "POST" },
    );
    setShareBusy(false);
    if (!result.ok) {
      setError(result.error);
      setShareOpen(false);
      return;
    }
    setShareSlug(result.data.slug);
  };

  const killShare = async () => {
    if (!shareSlug || shareBusy) return;
    setShareBusy(true);
    const result = await apiJson<undefined>(`/api/share/${shareSlug}`, {
      method: "DELETE",
    });
    setShareBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShareSlug(null);
    setShareOpen(false);
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${shareSlug ?? "…"}`
      : `roux.cooking/r/${shareSlug ?? "…"}`;

  const copyLink = async () => {
    if (!shareSlug) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("link");
    } catch {
      setError("Couldn’t copy link");
    }
  };

  const copyText = async () => {
    const lines = [
      recipe.title,
      "",
      "Ingredients",
      ...recipe.ingredients.map(
        (ing) => `${formatQty(ing)} ${ing.name}`.trim(),
      ),
      "",
      "Steps",
      ...recipe.steps.map((s) => `${s.n}. ${s.text}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied("text");
    } catch {
      setError("Couldn’t copy text");
    }
  };

  const archiveRecipe = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await apiJson<{ recipe: Recipe }>(
      `/api/recipes/${recipe.id}/archive`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    setRemoved("archive");
  };

  const deletePermanently = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await apiJson<undefined>(`/api/recipes/${recipe.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    setRemoved("delete");
  };

  if (removed) {
    return (
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          padding: "35.2px 17.6px",
          display: "flex",
          flexDirection: "column",
          gap: 13.2,
        }}
      >
        <h2 style={{ margin: 0 }}>
          {removed === "archive" ? "Recipe archived" : "Recipe deleted"}
        </h2>
        <p className="text-muted" style={{ margin: 0 }}>
          {removed === "archive"
            ? "It’ll sit in Archive for 30 days. You can restore it from the library."
            : "Gone for good. A later sync won’t re-add this video."}
        </p>
        <Link href="/" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1240,
        width: "100%",
        margin: "0 auto",
        padding: "17.6px 17.6px 70px",
        display: "flex",
        flexDirection: "column",
        gap: 17.6,
      }}
    >
      <Link
        href="/"
        className="btn btn-ghost"
        style={{
          alignSelf: "flex-start",
          fontFamily: "var(--font-body)",
          fontSize: 13,
        }}
      >
        <ChevronLeft />
        Library
      </Link>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 17.6,
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 260,
            display: "flex",
            flexDirection: "column",
            gap: 8.8,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recipe.cuisine && (
              <span className="tag tag-accent">{recipe.cuisine}</span>
            )}
            {recipe.main_ingredient && (
              <span className="tag tag-accent-2">{recipe.main_ingredient}</span>
            )}
            <span className={verifyTagCls}>{verifyLabel}</span>
          </div>
          <h1 style={{ fontSize: 40, margin: 0, textWrap: "pretty" }}>
            {recipe.title}
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            {metaParts.join(" · ")}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8.8 }}>
          <Link
            href={`/recipes/${recipe.id}/cook`}
            className="btn btn-primary"
            style={{ minHeight: 44, marginTop: 0 }}
          >
            Cook mode
          </Link>
          {gone ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled
              style={{ minHeight: 44 }}
            >
              Video unavailable
            </button>
          ) : (
            <a
              className="btn btn-secondary"
              href={youtubeWatchUrl(recipe.video_id)}
              target="_blank"
              rel="noreferrer"
              style={{ minHeight: 44 }}
            >
              Watch video
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => (editing ? cancelEdit() : startEdit())}
            style={{ minHeight: 44 }}
            disabled={busy}
          >
            {editing ? "Cancel edit" : "Edit recipe"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void openShare()}
            style={{ minHeight: 44 }}
            disabled={busy || shareBusy}
          >
            <ShareIcon />
            Share
          </button>
          <button
            type="button"
            className="btn btn-icon btn-secondary"
            onClick={() => setConfirming(true)}
            title="Remove from library"
            style={{ width: 44, height: 44 }}
            disabled={busy}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="card"
          style={{
            padding: "13.2px 17.6px",
            background: "var(--color-accent-100)",
            color: "var(--color-accent-900)",
            fontSize: 13.5,
          }}
        >
          {error}
        </div>
      ) : null}

      {(gone || recipe.video_status === "off_playlist") && (
        <div
          className="card"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 13.2,
            background: "var(--color-neutral-200)",
            padding: "13.2px 17.6px",
          }}
        >
          <span
            style={{
              color: "var(--color-neutral-700)",
              display: "grid",
              flex: "none",
            }}
          >
            <VideoOffIcon />
          </span>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              fontSize: 13.5,
              color: "var(--color-neutral-900)",
            }}
          >
            {gone
              ? "The uploader took this video down, so the link is dead. The write-up, your notes and the timestamps stay — they're yours now. Roux keeps the channel name and the original video title for searching."
              : "You removed this from the playlist, but the recipe stays in your library until you archive it. The video still plays."}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirming(true)}
            style={{ marginTop: 0, flex: "none", background: "var(--color-bg)" }}
          >
            Remove recipe
          </button>
        </div>
      )}

      {shareOpen && (
        <div className="dialog-backdrop" role="presentation" onClick={closeShare}>
          <div
            ref={shareDialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-title" id="share-dialog-title">
              Share “{recipe.title}”
            </div>
            <div className="dialog-body">
              Anyone with the link can read the ingredients and steps. Your notes
              and your verified flags are never included.
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 20,
                background: "var(--color-bg)",
                border: "1px solid var(--color-divider)",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  flex: "1 1 140px",
                  minWidth: 0,
                  fontSize: 13.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {shareBusy || !shareSlug ? "Creating link…" : shareUrl}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void copyLink()}
                style={{ marginTop: 0, flex: "none" }}
                disabled={!shareSlug || shareBusy}
              >
                {copied === "link" ? "Link copied" : "Copy link"}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8.8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyText()}
              >
                {copied === "text" ? "Recipe copied" : "Copy as text"}
              </button>
              <button type="button" className="btn btn-secondary" disabled>
                Print / PDF
              </button>
            </div>
            <div
              className="dialog-actions"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void killShare()}
                disabled={!shareSlug || shareBusy}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--color-accent-700)",
                }}
              >
                Kill this link
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeShare}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="dialog-backdrop" role="presentation" onClick={closeConfirm}>
          <div
            ref={confirmDialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-title" id="remove-dialog-title">
              Remove “{recipe.title}”?
            </div>
            <div className="dialog-body">
              Archiving keeps the write-up and your notes for 30 days and stops
              the next sync from re-adding it. Deleting now is immediate and
              permanent — if the video is still in the playlist, a later sync
              would write it up again from scratch.
            </div>
            <div className="dialog-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeConfirm}
                disabled={busy}
                style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void deletePermanently()}
                disabled={busy}
              >
                Delete permanently
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void archiveRecipe()}
                disabled={busy}
                style={{ marginTop: 0 }}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && draft ? (
        <EditForm
          draft={draft}
          setDraft={setDraft}
          onSave={() => void saveEdit()}
          onCancel={cancelEdit}
          busy={busy}
        />
      ) : (
        <>
          {!recipe.verified && (
            <div
              className="card"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 13.2,
                background: "var(--color-accent-100)",
                padding: "13.2px 17.6px",
              }}
            >
              <span
                style={{
                  color: "var(--color-accent-700)",
                  display: "grid",
                  flex: "none",
                }}
              >
                <AlertIcon />
              </span>
              <div
                style={{
                  flex: 1,
                  minWidth: 180,
                  fontSize: 13.5,
                  color: "var(--color-accent-900)",
                }}
              >
                Written from the video transcript — {recipe.confidence}{" "}
                confidence. Quantities in brackets were inferred. Check them
                before you commit.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void markVerified()}
                disabled={busy}
                style={{ marginTop: 0, flex: "none" }}
              >
                Mark verified
              </button>
            </div>
          )}

          {layout === "split" ? (
            <SplitLayout
              recipe={recipe}
              playable={playable}
              gone={gone}
              videoOpen={videoOpen}
              onToggleVideo={() => setVideoOpen((v) => !v)}
              notes={notes}
              onNotes={onNotesChange}
              notesStatus={notesStatus}
              showTimestamps={showTimestamps}
            />
          ) : (
            <SingleScroll
              recipe={recipe}
              playable={playable}
              gone={gone}
              videoOpen={videoOpen}
              onToggleVideo={() => setVideoOpen((v) => !v)}
              notes={notes}
              onNotes={onNotesChange}
              notesStatus={notesStatus}
              showTimestamps={showTimestamps}
            />
          )}
        </>
      )}
    </div>
  );
}

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

      <NotesCard notes={notes} onNotes={onNotes} notesStatus={notesStatus} />
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
        <NotesCard notes={notes} onNotes={onNotes} notesStatus={notesStatus} />
      </div>
    </div>
  );
}

function NotesCard({
  notes,
  onNotes,
  notesStatus,
}: {
  notes: string;
  onNotes: (v: string) => void;
  notesStatus: string;
}) {
  return (
    <div
      className="card"
      style={{
        gap: 8.8,
        padding: 22,
        background: "var(--color-accent-2-100)",
      }}
    >
      <h4 style={{ margin: 0 }}>My notes</h4>
      <textarea
        className="input"
        placeholder="Substitutions, what went wrong, what to do differently…"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        style={{
          background: "var(--color-bg)",
          borderRadius: 20,
          fontSize: 15,
          minHeight: 96,
        }}
      />
      <div className="text-muted" style={{ fontSize: 12 }}>
        {notesStatus}
      </div>
    </div>
  );
}

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy = false,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const patch = useCallback(
    (fn: (d: Draft) => void) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: Draft = {
          title: prev.title,
          ingredients: prev.ingredients.map((i) => ({ ...i })),
          steps: prev.steps.map((s) => ({ ...s })),
        };
        fn(next);
        return next;
      });
    },
    [setDraft],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 17.6,
        maxWidth: 780,
      }}
    >
      <div className="card elev-sm" style={{ padding: 22, gap: 13.2 }}>
        <div className="field">
          <label htmlFor="recipe-title">Recipe title</label>
          <input
            id="recipe-title"
            className="input"
            value={draft.title}
            onChange={(e) => patch((d) => { d.title = e.target.value; })}
            style={{ minHeight: 44, fontSize: 16 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <h4 style={{ margin: 0 }}>Ingredients</h4>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            quantities in brackets were inferred
          </span>
        </div>
        {draft.ingredients.map((ing, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 8.8, alignItems: "center" }}
          >
            <input
              className="input"
              value={ing.inferred ? `[${ing.qty}]` : ing.qty}
              onChange={(e) =>
                patch((d) => {
                  const raw = e.target.value;
                  const inferred = raw.startsWith("[") && raw.endsWith("]");
                  d.ingredients[i] = {
                    ...d.ingredients[i]!,
                    qty: inferred ? raw.slice(1, -1) : raw,
                    inferred,
                  };
                })
              }
              style={{ width: 110, flex: "none", minHeight: 40 }}
            />
            <input
              className="input"
              value={ing.name}
              onChange={(e) =>
                patch((d) => {
                  d.ingredients[i] = {
                    ...d.ingredients[i]!,
                    name: e.target.value,
                  };
                })
              }
              style={{ flex: 1, minHeight: 40 }}
            />
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              title="Remove"
              onClick={() =>
                patch((d) => {
                  d.ingredients.splice(i, 1);
                })
              }
              style={{ flex: "none" }}
            >
              <MinusIcon />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            patch((d) => {
              d.ingredients.push({
                qty: "",
                name: "",
                inferred: false,
                group: "Other",
              });
            })
          }
          style={{ alignSelf: "flex-start", marginTop: 0 }}
        >
          Add ingredient
        </button>
      </div>

      <div className="card elev-sm" style={{ padding: 22, gap: 13.2 }}>
        <h4 style={{ margin: 0 }}>Steps</h4>
        {draft.steps.map((s, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
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
              {i + 1}
            </div>
            <textarea
              className="input"
              value={s.text}
              onChange={(e) =>
                patch((d) => {
                  d.steps[i] = { ...d.steps[i]!, text: e.target.value };
                })
              }
              style={{
                flex: 1,
                borderRadius: 20,
                minHeight: 72,
                fontSize: 15,
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: "none",
                alignItems: "center",
              }}
            >
              <div className="text-muted" style={{ fontSize: 12 }}>
                {formatTimestamp(s.t_seconds)}
              </div>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                title="Remove"
                onClick={() =>
                  patch((d) => {
                    d.steps.splice(i, 1);
                  })
                }
              >
                <MinusIcon />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            patch((d) => {
              d.steps.push({
                n: d.steps.length + 1,
                text: "",
                t_seconds: 0,
              });
            })
          }
          style={{ alignSelf: "flex-start", marginTop: 0 }}
        >
          Add step
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          padding: "13.2px 0",
          background: "var(--color-bg)",
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={busy}
          style={{ minHeight: 44, marginTop: 0 }}
        >
          {busy ? "Saving…" : "Save & mark verified"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
          style={{ minHeight: 44 }}
        >
          Discard changes
        </button>
        <div className="text-muted" style={{ fontSize: 12.5 }}>
          Your edits win over the next sync — the transcript never overwrites a
          verified recipe.
        </div>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

function ShareIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M12 3v13" />
      <path d="m8 7 4-4 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
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

function AlertIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
