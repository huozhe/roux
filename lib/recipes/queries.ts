import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  getDb,
  recipeTombstones,
  recipes,
  shareLinks,
  users,
  type RecipeRow,
} from "@/lib/db";
import { mergeLearnedCategories } from "@/lib/categories";
import { makeShareSlug } from "@/lib/format";
import type {
  Ingredient,
  Recipe,
  RecipeListParams,
  SortDir,
  SortKey,
  Step,
  UserPrefs,
} from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";
import { rowToRecipe } from "./map";

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

function parseListParams(sp: URLSearchParams): RecipeListParams {
  const cuisine = [
    ...sp.getAll("cuisine"),
    ...sp.getAll("cuisine[]"),
  ].filter(Boolean);
  const main = [...sp.getAll("main"), ...sp.getAll("main[]")].filter(Boolean);
  const sortRaw = sp.get("sort");
  const dirRaw = sp.get("dir");
  const viewRaw = sp.get("view");
  const sort: SortKey | undefined =
    sortRaw === "added" || sortRaw === "uploaded" || sortRaw === "time"
      ? sortRaw
      : undefined;
  const dir: SortDir | undefined =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : undefined;
  const view =
    viewRaw === "library" || viewRaw === "archive" ? viewRaw : undefined;
  return {
    q: sp.get("q") ?? undefined,
    cuisine: cuisine.length ? cuisine : undefined,
    main: main.length ? main : undefined,
    sort,
    dir,
    view,
  };
}

export function listParamsFromRequest(req: Request): RecipeListParams {
  return parseListParams(new URL(req.url).searchParams);
}

function sortOrder(sort: SortKey, dir: SortDir) {
  const col =
    sort === "time"
      ? recipes.cookMinutes
      : sort === "uploaded"
        ? recipes.uploadedAt
        : recipes.addedAt;
  return dir === "asc" ? asc(col) : desc(col);
}

/** Active (non-hard-deleted) recipe owned by user. */
function owned(userId: string, id: string): SQL {
  return and(
    eq(recipes.id, id),
    eq(recipes.userId, userId),
    isNull(recipes.deletedAt),
  )!;
}

export async function listRecipes(
  userId: string,
  params: RecipeListParams = {},
): Promise<Recipe[]> {
  const view = params.view ?? "library";
  const sort = params.sort ?? "added";
  const dir =
    params.dir ?? (sort === "time" ? "asc" : "desc");
  const q = (params.q ?? "").trim();

  const filters: SQL[] = [
    eq(recipes.userId, userId),
    isNull(recipes.deletedAt),
  ];

  if (view === "archive") {
    filters.push(isNotNull(recipes.archivedAt));
  } else {
    filters.push(isNull(recipes.archivedAt));
  }

  if (params.cuisine?.length) {
    filters.push(inArray(recipes.cuisine, params.cuisine));
  }
  if (params.main?.length) {
    filters.push(inArray(recipes.mainIngredient, params.main));
  }

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    // ILIKE on key text fields OR generated FTS column (0001_search.sql).
    filters.push(
      or(
        ilike(recipes.title, pattern),
        ilike(recipes.videoTitle, pattern),
        ilike(recipes.channelTitle, pattern),
        ilike(recipes.cuisine, pattern),
        ilike(recipes.mainIngredient, pattern),
        sql`roux.recipes.search @@ plainto_tsquery('english', ${q})`,
      )!,
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(recipes)
    .where(and(...filters))
    .orderBy(sortOrder(sort, dir));

  return rows.map(rowToRecipe);
}

export async function getRecipe(
  userId: string,
  id: string,
): Promise<Recipe | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(recipes)
    .where(owned(userId, id))
    .limit(1);
  return rows[0] ? rowToRecipe(rows[0]) : null;
}

export type RecipePatch = {
  title?: string;
  ingredients?: Ingredient[];
  steps?: Step[];
  notes?: string | null;
  cuisine?: string | null;
  main_ingredient?: string | null;
  cook_minutes?: number | null;
  servings?: string | null;
};

export async function patchRecipe(
  userId: string,
  id: string,
  patch: RecipePatch,
): Promise<Recipe | null> {
  const sets: Partial<RecipeRow> & Record<string, unknown> = {
    writtenAt: new Date(),
  };

  let touchVerified = false;
  if (patch.title !== undefined) {
    sets.title = patch.title;
    touchVerified = true;
  }
  if (patch.ingredients !== undefined) {
    sets.ingredients = patch.ingredients;
    touchVerified = true;
  }
  if (patch.steps !== undefined) {
    sets.steps = patch.steps;
    touchVerified = true;
  }
  if (patch.notes !== undefined) sets.notes = patch.notes;
  if (patch.cuisine !== undefined) sets.cuisine = patch.cuisine;
  if (patch.main_ingredient !== undefined) {
    sets.mainIngredient = patch.main_ingredient;
  }
  if (patch.cook_minutes !== undefined) sets.cookMinutes = patch.cook_minutes;
  if (patch.servings !== undefined) sets.servings = patch.servings;
  if (touchVerified) sets.verified = true;

  const db = getDb();
  const updated = await db
    .update(recipes)
    .set(sets)
    .where(owned(userId, id))
    .returning();
  const recipe = updated[0] ? rowToRecipe(updated[0]) : null;
  if (
    recipe &&
    (patch.cuisine !== undefined || patch.main_ingredient !== undefined)
  ) {
    await learnCategoriesFromLabels(userId, {
      cuisine: recipe.cuisine,
      main: recipe.main_ingredient,
    }).catch(() => {
      /* non-fatal */
    });
  }
  return recipe;
}

/**
 * Persist novel cuisine / main labels from the LLM (or edits) into user prefs
 * so library chips and Settings categories grow automatically.
 */
export async function learnCategoriesFromLabels(
  userId: string,
  labels: { cuisine?: string | null; main?: string | null },
): Promise<UserPrefs | null> {
  const current = await getUserPrefs(userId);
  const merged = mergeLearnedCategories(current, labels);
  if (!merged) return null;
  return updateUserPrefs(userId, merged);
}

/** Distinct non-null cuisine / main values across the user's active recipes. */
export async function listDistinctCategoryLabels(
  userId: string,
): Promise<{ cuisines: string[]; mains: string[] }> {
  const db = getDb();
  const rows = await db
    .select({
      cuisine: recipes.cuisine,
      main: recipes.mainIngredient,
    })
    .from(recipes)
    .where(and(eq(recipes.userId, userId), isNull(recipes.deletedAt)));

  const cuisineKeys = new Set<string>();
  const mainKeys = new Set<string>();
  const cuisines: string[] = [];
  const mains: string[] = [];
  for (const r of rows) {
    const c = r.cuisine?.trim();
    if (c) {
      const k = c.toLowerCase();
      if (!cuisineKeys.has(k)) {
        cuisineKeys.add(k);
        cuisines.push(c);
      }
    }
    const m = r.main?.trim();
    if (m) {
      const k = m.toLowerCase();
      if (!mainKeys.has(k)) {
        mainKeys.add(k);
        mains.push(m);
      }
    }
  }
  return { cuisines, mains };
}

/** Fold recipe labels into prefs (idempotent backfill + Settings sync). */
export async function learnCategoriesFromUserRecipes(
  userId: string,
): Promise<UserPrefs | null> {
  const { cuisines, mains } = await listDistinctCategoryLabels(userId);
  const current = await getUserPrefs(userId);
  let customCuisines = [...(current.customCuisines ?? [])];
  let customMains = [...(current.customMains ?? [])];
  let dirty = false;
  for (const cuisine of cuisines) {
    const merged = mergeLearnedCategories(
      { customCuisines, customMains },
      { cuisine },
    );
    if (merged) {
      customCuisines = merged.customCuisines;
      customMains = merged.customMains;
      dirty = true;
    }
  }
  for (const main of mains) {
    const merged = mergeLearnedCategories(
      { customCuisines, customMains },
      { main },
    );
    if (merged) {
      customCuisines = merged.customCuisines;
      customMains = merged.customMains;
      dirty = true;
    }
  }
  if (!dirty) return null;
  return updateUserPrefs(userId, { customCuisines, customMains });
}

export async function verifyRecipe(
  userId: string,
  id: string,
): Promise<Recipe | null> {
  const db = getDb();
  const updated = await db
    .update(recipes)
    .set({ verified: true, writtenAt: new Date() })
    .where(owned(userId, id))
    .returning();
  return updated[0] ? rowToRecipe(updated[0]) : null;
}

export async function archiveRecipe(
  userId: string,
  id: string,
): Promise<Recipe | null> {
  const db = getDb();
  const updated = await db
    .update(recipes)
    .set({ archivedAt: new Date(), writtenAt: new Date() })
    .where(owned(userId, id))
    .returning();
  return updated[0] ? rowToRecipe(updated[0]) : null;
}

export async function restoreRecipe(
  userId: string,
  id: string,
): Promise<Recipe | null> {
  const db = getDb();
  const updated = await db
    .update(recipes)
    .set({ archivedAt: null, writtenAt: new Date() })
    .where(owned(userId, id))
    .returning();
  return updated[0] ? rowToRecipe(updated[0]) : null;
}

/**
 * Permanent delete: tombstone (userId, videoId) then hard-delete recipe
 * (share_links cascade).
 */
export async function deleteRecipe(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: recipes.id, videoId: recipes.videoId })
    .from(recipes)
    .where(owned(userId, id))
    .limit(1);
  const row = rows[0];
  if (!row) return false;

  await db
    .insert(recipeTombstones)
    .values({ userId, videoId: row.videoId })
    .onConflictDoNothing();

  await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));

  return true;
}

function randomHex4(): string {
  return randomBytes(2).toString("hex");
}

/** Idempotent: return existing non-revoked slug, else create title-4hex. */
export async function shareRecipe(
  userId: string,
  id: string,
): Promise<{ slug: string } | null> {
  const db = getDb();
  const recipeRows = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(owned(userId, id))
    .limit(1);
  const recipe = recipeRows[0];
  if (!recipe) return null;

  const existing = await db
    .select({ slug: shareLinks.slug })
    .from(shareLinks)
    .where(
      and(eq(shareLinks.recipeId, id), isNull(shareLinks.revokedAt)),
    )
    .limit(1);
  if (existing[0]) return { slug: existing[0].slug };

  // Never reuse revoked slugs; mint a fresh one (retry on PK collision).
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = makeShareSlug(recipe.title, randomHex4());
    try {
      await db.insert(shareLinks).values({ recipeId: id, slug });
      return { slug };
    } catch {
      // unique violation → retry
    }
  }
  throw new Error("Failed to allocate share slug");
}

/** Revoke share if the link's recipe belongs to user. */
export async function revokeShare(
  userId: string,
  slug: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const db = getDb();
  const rows = await db
    .select({
      slug: shareLinks.slug,
      recipeUserId: recipes.userId,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .innerJoin(recipes, eq(shareLinks.recipeId, recipes.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return "not_found";
  if (row.recipeUserId !== userId) return "forbidden";
  if (row.revokedAt) return "ok";

  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(eq(shareLinks.slug, slug));
  return "ok";
}

export type ShareLinkListItem = {
  slug: string;
  title: string;
  recipeId: string;
  createdAt: string;
};

/** Active (non-revoked) share links for the user's recipes. */
export async function listShareLinks(
  userId: string,
): Promise<ShareLinkListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      slug: shareLinks.slug,
      title: recipes.title,
      recipeId: recipes.id,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .innerJoin(recipes, eq(shareLinks.recipeId, recipes.id))
    .where(
      and(
        eq(recipes.userId, userId),
        isNull(shareLinks.revokedAt),
        isNull(recipes.deletedAt),
      ),
    )
    .orderBy(desc(shareLinks.createdAt));

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    recipeId: r.recipeId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Public share resolve: non-revoked slug → recipe (notes stripped).
 * Returns null if missing/revoked.
 */
export async function getSharedRecipeBySlug(
  slug: string,
): Promise<Recipe | null> {
  const db = getDb();
  const rows = await db
    .select({ recipe: recipes })
    .from(shareLinks)
    .innerJoin(recipes, eq(shareLinks.recipeId, recipes.id))
    .where(
      and(
        eq(shareLinks.slug, slug),
        isNull(shareLinks.revokedAt),
        isNull(recipes.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const recipe = rowToRecipe(row.recipe);
  // Public page never exposes personal notes / verify state.
  return { ...recipe, notes: null, verified: false };
}

function asUserPrefs(v: unknown): UserPrefs {
  if (!v || typeof v !== "object") return { ...DEFAULT_PREFS };
  const o = v as Partial<UserPrefs>;
  return {
    layout: o.layout === "split" ? "split" : "single",
    timestamps: o.timestamps !== false,
    newShelf: Boolean(o.newShelf),
    syncMarkVerified: Boolean(o.syncMarkVerified),
    ...(Array.isArray(o.customCuisines)
      ? { customCuisines: o.customCuisines.filter((s) => typeof s === "string") }
      : {}),
    ...(Array.isArray(o.customMains)
      ? { customMains: o.customMains.filter((s) => typeof s === "string") }
      : {}),
  };
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const db = getDb();
  const rows = await db
    .select({ prefs: users.prefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return asUserPrefs(rows[0]?.prefs);
}

export async function updateUserPrefs(
  userId: string,
  patch: Partial<UserPrefs>,
): Promise<UserPrefs> {
  const current = await getUserPrefs(userId);
  const next: UserPrefs = {
    layout: patch.layout ?? current.layout,
    timestamps:
      patch.timestamps !== undefined ? patch.timestamps : current.timestamps,
    newShelf: patch.newShelf !== undefined ? patch.newShelf : current.newShelf,
    syncMarkVerified:
      patch.syncMarkVerified !== undefined
        ? patch.syncMarkVerified
        : current.syncMarkVerified,
  };
  if (patch.customCuisines !== undefined) {
    next.customCuisines = patch.customCuisines;
  } else if (current.customCuisines) {
    next.customCuisines = current.customCuisines;
  }
  if (patch.customMains !== undefined) {
    next.customMains = patch.customMains;
  } else if (current.customMains) {
    next.customMains = current.customMains;
  }

  const db = getDb();
  const updated = await db
    .update(users)
    .set({ prefs: next })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!updated[0]) {
    throw new Error("User not found for prefs update");
  }
  return next;
}

/** Active share slug for a recipe the user owns, if any. */
export async function getActiveShareSlug(
  userId: string,
  recipeId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ slug: shareLinks.slug })
    .from(shareLinks)
    .innerJoin(recipes, eq(shareLinks.recipeId, recipes.id))
    .where(
      and(
        eq(shareLinks.recipeId, recipeId),
        eq(recipes.userId, userId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  return rows[0]?.slug ?? null;
}
