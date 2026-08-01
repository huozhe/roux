import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import {
  deleteRecipe,
  getRecipeForViewer,
  patchRecipe,
  type RecipePatch,
} from "@/lib/recipes/queries";
import type { Ingredient, Step } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/recipes/:id — owner or grantee (getRecipeForViewer). */
export async function GET(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id } = await ctx.params;
  try {
    const access = await getRecipeForViewer(userId, id);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      recipe: access.recipe,
      role: access.role,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get recipe" },
      { status: 500 },
    );
  }
}

function isIngredient(v: unknown): v is Ingredient {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.qty === "string" &&
    typeof o.name === "string" &&
    typeof o.inferred === "boolean" &&
    (o.group === undefined || typeof o.group === "string")
  );
}

function isStep(v: unknown): v is Step {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.n === "number" &&
    typeof o.text === "string" &&
    typeof o.t_seconds === "number"
  );
}

function parsePatch(body: unknown): RecipePatch | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const patch: RecipePatch = {};

  if ("title" in b) {
    if (typeof b.title !== "string") return null;
    patch.title = b.title;
  }
  if ("ingredients" in b) {
    if (!Array.isArray(b.ingredients) || !b.ingredients.every(isIngredient)) {
      return null;
    }
    patch.ingredients = b.ingredients;
  }
  if ("steps" in b) {
    if (!Array.isArray(b.steps) || !b.steps.every(isStep)) return null;
    patch.steps = b.steps;
  }
  if ("notes" in b) {
    if (b.notes !== null && typeof b.notes !== "string") return null;
    patch.notes = b.notes as string | null;
  }
  if ("cuisine" in b) {
    if (b.cuisine !== null && typeof b.cuisine !== "string") return null;
    patch.cuisine = b.cuisine as string | null;
  }
  if ("main_ingredient" in b) {
    if (b.main_ingredient !== null && typeof b.main_ingredient !== "string") {
      return null;
    }
    patch.main_ingredient = b.main_ingredient as string | null;
  }
  if ("cook_minutes" in b) {
    if (
      b.cook_minutes !== null &&
      (typeof b.cook_minutes !== "number" || !Number.isFinite(b.cook_minutes))
    ) {
      return null;
    }
    patch.cook_minutes = b.cook_minutes as number | null;
  }
  if ("servings" in b) {
    if (b.servings !== null && typeof b.servings !== "string") return null;
    patch.servings = b.servings as string | null;
  }

  return patch;
}

/** PATCH /api/recipes/:id — title/ingredients/steps → verified=true */
export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = parsePatch(body);
  if (!patch) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id } = await ctx.params;
  try {
    const recipe = await patchRecipe(userId, id, patch);
    if (!recipe) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ recipe });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update recipe",
      },
      { status: 500 },
    );
  }
}

/** DELETE /api/recipes/:id — permanent + tombstone */
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id } = await ctx.params;
  try {
    const ok = await deleteRecipe(userId, id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to delete recipe",
      },
      { status: 500 },
    );
  }
}
