"use client";

import { useCallback } from "react";
import { recipeApiJson } from "@/components/recipe/recipeApi";
import { useDialogA11y } from "@/lib/ui/useDialogA11y";

export type RemoveMode = "archive" | "delete";

type Props = {
  open: boolean;
  recipeId: string;
  recipeTitle: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onError: (msg: string | null) => void;
  onRemoved: (mode: RemoveMode) => void;
};

/** Confirm archive/delete — state still open-controlled (two open triggers). */
export function RecipeRemoveDialog({
  open,
  recipeId,
  recipeTitle,
  busy,
  setBusy,
  onClose,
  onError,
  onRemoved,
}: Props) {
  const onCloseStable = useCallback(() => onClose(), [onClose]);
  const panelRef = useDialogA11y(open, onCloseStable);

  if (!open) return null;

  const archiveRecipe = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    const result = await recipeApiJson<{ recipe: unknown }>(
      `/api/recipes/${recipeId}/archive`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onClose();
    onRemoved("archive");
  };

  const deletePermanently = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    const result = await recipeApiJson<undefined>(`/api/recipes/${recipeId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onClose();
    onRemoved("delete");
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCloseStable}>
      <div
        ref={panelRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title" id="remove-dialog-title">
          Remove “{recipeTitle}”?
        </div>
        <div className="dialog-body">
          Archiving keeps the write-up and your notes for 30 days and stops the
          next sync from re-adding it. Deleting now is immediate and permanent —
          if the video is still in the playlist, a later sync would write it up
          again from scratch.
        </div>
        <div className="dialog-actions" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCloseStable}
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
  );
}
