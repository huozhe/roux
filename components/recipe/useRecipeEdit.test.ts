import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_RECIPES } from "@/lib/fixtures/recipes";
import { draftFromRecipe, patchBodyFromDraft } from "./useRecipeEdit";

const recipe = FIXTURE_RECIPES[0]!;

describe("draftFromRecipe", () => {
  it("copies title, ingredients, steps without sharing refs", () => {
    const draft = draftFromRecipe(recipe);
    assert.equal(draft.title, recipe.title);
    assert.equal(draft.ingredients.length, recipe.ingredients.length);
    assert.equal(draft.steps.length, recipe.steps.length);
    assert.notEqual(draft.ingredients, recipe.ingredients);
    assert.notEqual(draft.ingredients[0], recipe.ingredients[0]);
    assert.notEqual(draft.steps, recipe.steps);
  });
});

describe("patchBodyFromDraft", () => {
  it("clears inferred and renumbers steps from 1", () => {
    const draft = draftFromRecipe(recipe);
    draft.ingredients[0] = { ...draft.ingredients[0]!, inferred: true };
    draft.steps = [
      { n: 99, text: "first", t_seconds: 0 },
      { n: 3, text: "second", t_seconds: 10 },
    ];
    const body = patchBodyFromDraft(draft);
    assert.equal(body.title, recipe.title);
    assert.equal(body.ingredients[0]!.inferred, false);
    assert.deepEqual(
      body.steps.map((s) => s.n),
      [1, 2],
    );
    assert.equal(body.steps[0]!.text, "first");
  });
});
