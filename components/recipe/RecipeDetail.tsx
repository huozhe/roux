"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RecipeEditor } from "@/components/recipe/RecipeEditor";
import { RecipeShareDialog } from "@/components/recipe/RecipeShareDialog";
import { RecipeView } from "@/components/recipe/RecipeView";
import { recipeApiJson } from "@/components/recipe/recipeApi";
import { useRecipeEdit } from "@/components/recipe/useRecipeEdit";
import { useRecipeNotes } from "@/components/recipe/useRecipeNotes";
import {
  formatCookMinutes,
  fullDate,
  relativeAgo,
  youtubeWatchUrl,
} from "@/lib/format";
import { useLivePrefs } from "@/lib/prefs/client";
import type { Recipe, UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";
import { useDialogA11y } from "@/lib/ui/useDialogA11y";

type RemoveMode = "archive" | "delete" | null;

export function RecipeDetail({
  recipe: initial,
  prefs = DEFAULT_PREFS,
  role = "owner",
}: {
  recipe: Recipe;
  prefs?: UserPrefs;
  /** owner = full UI; grantee = read-only (inter-user share). */
  role?: "owner" | "grantee";
}) {
  const isGrantee = role === "grantee";
  const [recipe, setRecipe] = useState(initial);
  const livePrefs = useLivePrefs(prefs);
  const showTimestamps = livePrefs.timestamps !== false;
  const layout = livePrefs.layout === "split" ? "split" : "single";

  const [videoOpen, setVideoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState<RemoveMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRecipeUpdate = useCallback((r: Recipe) => setRecipe(r), []);
  const onError = useCallback((msg: string | null) => setError(msg), []);

  const { notes, notesStatus, onNotesChange } = useRecipeNotes(
    recipe.id,
    recipe.notes ?? "",
    onRecipeUpdate,
  );
  const {
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
  } = useRecipeEdit(recipe, onRecipeUpdate, onError, busy, setBusy);

  const closeShare = useCallback(() => setShareOpen(false), []);
  const closeConfirm = useCallback(() => setConfirming(false), []);
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

  const markVerified = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await recipeApiJson<{ recipe: Recipe }>(
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

  const archiveRecipe = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await recipeApiJson<{ recipe: Recipe }>(
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
    const result = await recipeApiJson<undefined>(`/api/recipes/${recipe.id}`, {
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
          {!isGrantee ? (
            <>
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
                onClick={() => setShareOpen(true)}
                style={{ minHeight: 44 }}
                disabled={busy}
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
            </>
          ) : (
            <span className="tag tag-neutral" style={{ alignSelf: "center" }}>
              Shared with you · read-only
            </span>
          )}
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
              ? "The uploader took this video down, so the link is dead. The write-up, your notes and the timestamps stay — they\'re yours now. Roux keeps the channel name and the original video title for searching."
              : "You removed this from the playlist, but the recipe stays in your library until you archive it. The video still plays."}
          </div>
          {!isGrantee ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(true)}
              style={{ marginTop: 0, flex: "none", background: "var(--color-bg)" }}
            >
              Remove recipe
            </button>
          ) : null}
        </div>
      )}

      {!isGrantee && shareOpen ? (
        <RecipeShareDialog
          key={recipe.id}
          open={shareOpen}
          recipe={recipe}
          onClose={closeShare}
          onError={setError}
        />
      ) : null}

      {confirming && !isGrantee && (
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

      {editing && draft && !isGrantee ? (
        <RecipeEditor
          draft={draft}
          setDraft={setDraft}
          onSave={() => void saveEdit()}
          onCancel={cancelEdit}
          busy={busy}
        />
      ) : (
        <>
          {!isGrantee && !recipe.verified && (
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

          <RecipeView
            recipe={recipe}
            layout={layout}
            playable={playable}
            gone={gone}
            videoOpen={videoOpen}
            onToggleVideo={() => setVideoOpen((v) => !v)}
            notes={notes}
            onNotes={onNotesChange}
            notesStatus={notesStatus}
            showTimestamps={showTimestamps}
            showNotes={!isGrantee}
          />
        </>
      )}
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


