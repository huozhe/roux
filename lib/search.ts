import type { Recipe, RecipeListParams, SortDir, SortKey } from "@/lib/types";

function matchesQuery(r: Recipe, q: string): boolean {
  if (!q) return true;
  const hay = [
    r.title,
    r.video_title,
    r.channel_title,
    r.cuisine ?? "",
    r.main_ingredient ?? "",
    ...r.ingredients.map((i) => i.name),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function compare(
  a: Recipe,
  b: Recipe,
  sort: SortKey,
  dir: SortDir,
): number {
  const f = dir === "asc" ? 1 : -1;
  if (sort === "time") {
    return f * ((a.cook_minutes ?? 0) - (b.cook_minutes ?? 0));
  }
  if (sort === "uploaded") {
    return (
      f *
      ((a.uploaded_at ? Date.parse(a.uploaded_at) : 0) -
        (b.uploaded_at ? Date.parse(b.uploaded_at) : 0))
    );
  }
  return f * (Date.parse(a.added_at) - Date.parse(b.added_at));
}

/** Pure filter/sort used by fixture adapter and later by API tests. */
export function filterAndSortRecipes(
  recipes: Recipe[],
  params: RecipeListParams = {},
): Recipe[] {
  const q = (params.q ?? "").trim().toLowerCase();
  const cuisine = params.cuisine ?? [];
  const main = params.main ?? [];
  const view = params.view ?? "library";
  const sort = params.sort ?? "added";
  const dir =
    params.dir ??
    (sort === "time" ? "asc" : "desc");

  const list = recipes.filter((r) => {
    const archived = r.archived_at != null;
    if (view === "archive") {
      if (!archived) return false;
    } else if (archived) {
      return false;
    }
    if (cuisine.length && (!r.cuisine || !cuisine.includes(r.cuisine))) {
      return false;
    }
    if (
      main.length &&
      (!r.main_ingredient || !main.includes(r.main_ingredient))
    ) {
      return false;
    }
    return matchesQuery(r, q);
  });

  return list.slice().sort((a, b) => compare(a, b, sort, dir));
}
