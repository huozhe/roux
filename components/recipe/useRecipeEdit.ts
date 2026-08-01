"use client";

import { useState } from "react";
import type { RecipeDraft } from "@/components/recipe/RecipeEditor";
import type { Recipe } from "@/lib/types";
import { recipeApiJson } from "@/components/recipe/recipeApi";

/** Owns edit mode + draft + save (CQ-1 state lift). */
export function useRecipeEdit(
  recipe: Recipe,
  onRecipeUpdate: (r: Recipe) => void,
  onError: (msg: string | null) => void,
  busy: boolean,
  setBusy: (b: boolean) => void,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const startEdit = () => {
    setDraft({
      title: recipe.title,
      ingredients: recipe.ingredients.map((i) => ({ ...i })),
      steps: recipe.steps.map((s) => ({ ...s })),
    });
    setEditing(true);
    onError(null);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!draft || busy) return;
    setBusy(true);
    onError(null);
    const ingredients = draft.ingredients.map((i) => ({
      ...i,
      inferred: false,
    }));
    const steps = draft.steps.map((s, i) => ({ ...s, n: i + 1 }));
    const result = await recipeApiJson<{ recipe: Recipe }>(
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
      onError(result.error);
      return;
    }
    onRecipeUpdate(result.data.recipe);
    setDraft(null);
    setEditing(false);
  };

  return {
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
