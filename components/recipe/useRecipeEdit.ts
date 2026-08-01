"use client";

import { useState } from "react";
import type { RecipeDraft } from "@/components/recipe/RecipeEditor";
import type { Recipe } from "@/lib/types";
import { recipeApiJson } from "@/components/recipe/recipeApi";

/** Pure: build edit draft from recipe (testable without React). */
export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map((i) => ({ ...i })),
    steps: recipe.steps.map((s) => ({ ...s })),
  };
}

/** Pure: PATCH body for save (clears inferred, renumbers steps). */
export function patchBodyFromDraft(draft: RecipeDraft) {
  return {
    title: draft.title,
    ingredients: draft.ingredients.map((i) => ({
      ...i,
      inferred: false,
    })),
    steps: draft.steps.map((s, i) => ({ ...s, n: i + 1 })),
  };
}

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
    setDraft(draftFromRecipe(recipe));
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
    const body = patchBodyFromDraft(draft);
    const result = await recipeApiJson<{ recipe: Recipe }>(
      `/api/recipes/${recipe.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
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
