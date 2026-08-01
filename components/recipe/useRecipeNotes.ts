"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe } from "@/lib/types";
import { recipeApiJson } from "@/components/recipe/recipeApi";

/** Owns notes draft + autosave timer (CQ-1 state lift). */
export function useRecipeNotes(
  recipeId: string,
  initialNotes: string,
  onRecipeUpdate: (r: Recipe) => void,
) {
  const [notes, setNotes] = useState(initialNotes);
  const [notesStatus, setNotesStatus] = useState("Only you can see these");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesBaseline = useRef(initialNotes);

  const persistNotes = useCallback(
    async (value: string) => {
      if (value === notesBaseline.current) return;
      setNotesStatus("Saving…");
      const result = await recipeApiJson<{ recipe: Recipe }>(
        `/api/recipes/${recipeId}`,
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
      onRecipeUpdate(result.data.recipe);
      setNotesStatus("Saved to this recipe");
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
      setNotesStatus("Saving…");
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => {
        void persistNotes(value);
      }, 600);
    },
    [persistNotes],
  );

  return { notes, notesStatus, onNotesChange };
}
