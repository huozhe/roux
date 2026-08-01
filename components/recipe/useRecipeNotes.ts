"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe } from "@/lib/types";
import { recipeApiJson } from "@/components/recipe/recipeApi";

/** Debounce for notes autosave — kept as named constant for tests. */
export const NOTES_DEBOUNCE_MS = 600;

export const NOTES_STATUS = {
  idle: "Only you can see these",
  saving: "Saving…",
  saved: "Saved to this recipe",
  failed: "Couldn’t save notes",
} as const;

/** Pure: notes PATCH body (empty string → null). */
export function notesPatchBody(value: string) {
  return { notes: value || null };
}

/** Owns notes draft + autosave timer (CQ-1 state lift). */
export function useRecipeNotes(
  recipeId: string,
  initialNotes: string,
  onRecipeUpdate: (r: Recipe) => void,
) {
  const [notes, setNotes] = useState(initialNotes);
  const [notesStatus, setNotesStatus] = useState<string>(NOTES_STATUS.idle);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesBaseline = useRef(initialNotes);

  const persistNotes = useCallback(
    async (value: string) => {
      if (value === notesBaseline.current) return;
      setNotesStatus(NOTES_STATUS.saving);
      const result = await recipeApiJson<{ recipe: Recipe }>(
        `/api/recipes/${recipeId}`,
        {
          method: "PATCH",
          body: JSON.stringify(notesPatchBody(value)),
        },
      );
      if (!result.ok) {
        setNotesStatus(NOTES_STATUS.failed);
        return;
      }
      notesBaseline.current = value;
      onRecipeUpdate(result.data.recipe);
      setNotesStatus(NOTES_STATUS.saved);
    },
    [recipeId, onRecipeUpdate],
  );

  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  const onNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      setNotesStatus(NOTES_STATUS.saving);
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => {
        void persistNotes(value);
      }, NOTES_DEBOUNCE_MS);
    },
    [persistNotes],
  );

  return { notes, notesStatus, onNotesChange };
}
