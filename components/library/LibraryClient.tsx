"use client";

import { useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";
import { categoryOptions, CUISINES, MAINS } from "@/lib/categories";
import { recipeThumbnailUrl, relativeAgo } from "@/lib/format";
import { useLivePrefs } from "@/lib/prefs/client";
import { filterAndSortRecipes } from "@/lib/search";
import type {
  LibraryView,
  Recipe,
  SortDir,
  SortKey,
  UserPrefs,
} from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";
import { RecipeCard } from "./RecipeCard";

type Props = {
  /** Full set (library + archive); filters applied client-side. */
  recipes: Recipe[];
  lastSyncLabel?: string;
  prefs?: UserPrefs;
};

function defaultDir(sort: SortKey): SortDir {
  return sort === "time" ? "asc" : "desc";
}

export function LibraryClient({
  recipes: initialRecipes,
  lastSyncLabel = "never",
  prefs = DEFAULT_PREFS,
}: Props) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string[]>([]);
  const [main, setMain] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("added");
  const [dir, setDir] = useState<SortDir>("desc");
  const [view, setView] = useState<LibraryView>("library");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const livePrefs = useLivePrefs(prefs);
  const showNewShelf = Boolean(livePrefs.newShelf);
  // Prefs customs (manual + learned from LLM) plus any labels already on recipes.
  const cuisineOptions = useMemo(() => {
    const fromRecipes = recipes
      .map((r) => r.cuisine)
      .filter((v): v is string => Boolean(v?.trim()));
    return categoryOptions(
      CUISINES,
      [...(livePrefs.customCuisines ?? []), ...fromRecipes],
      livePrefs.hiddenCuisines,
    );
  }, [livePrefs.customCuisines, livePrefs.hiddenCuisines, recipes]);
  const mainOptions = useMemo(() => {
    const fromRecipes = recipes
      .map((r) => r.main_ingredient)
      .filter((v): v is string => Boolean(v?.trim()));
    return categoryOptions(
      MAINS,
      [...(livePrefs.customMains ?? []), ...fromRecipes],
      livePrefs.hiddenMains,
    );
  }, [livePrefs.customMains, livePrefs.hiddenMains, recipes]);

  const archiveCount = useMemo(
    () => recipes.filter((r) => r.archived_at != null).length,
    [recipes],
  );

  const totalLibrary = useMemo(
    () => recipes.filter((r) => r.archived_at == null).length,
    [recipes],
  );

  const list = useMemo(
    () =>
      filterAndSortRecipes(recipes, {
        q: query,
        cuisine,
        main,
        sort,
        dir,
        view,
      }),
    [recipes, query, cuisine, main, sort, dir, view],
  );

  async function restoreRecipe(id: string) {
    setActionId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/recipes/${id}/restore`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipe?: Recipe;
      };
      if (!res.ok || !body.recipe) {
        setActionError(body.error ?? "Restore failed");
        return;
      }
      setRecipes((prev) =>
        prev.map((r) => (r.id === id ? body.recipe! : r)),
      );
    } catch {
      setActionError("Restore failed");
    } finally {
      setActionId(null);
    }
  }

  async function deleteRecipe(id: string) {
    setActionId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? "Delete failed");
        return;
      }
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setActionError("Delete failed");
    } finally {
      setActionId(null);
    }
  }

  const hasFilters =
    cuisine.length > 0 || main.length > 0 || query.trim().length > 0;
  const isEmpty = view === "library" && list.length === 0;
  const archiveEmpty = view === "archive" && list.length === 0;

  const dirLabel =
    sort === "time"
      ? dir === "asc"
        ? "Quickest first"
        : "Longest first"
      : dir === "asc"
        ? "Oldest first"
        : "Newest first";

  function toggleChip(key: "cuisine" | "main", value: string) {
    const set = key === "cuisine" ? setCuisine : setMain;
    const cur = key === "cuisine" ? cuisine : main;
    set(
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  }

  function setSortKey(next: SortKey) {
    setSort(next);
    setDir(defaultDir(next));
  }

  function clearFilters() {
    setCuisine([]);
    setMain([]);
    setQuery("");
  }

  const newShelfRecipes = useMemo(() => {
    if (!showNewShelf || view !== "library" || hasFilters) return [];
    return recipes
      .filter((r) => r.archived_at == null)
      .slice()
      .sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
      .slice(0, 3);
  }, [recipes, showNewShelf, view, hasFilters]);

  return (
    <div
      style={{
        maxWidth: 1240,
        width: "100%",
        margin: "0 auto",
        padding: "26.4px 17.6px 70px",
        display: "flex",
        flexDirection: "column",
        gap: 26.4,
      }}
    >
      {/* Header + search */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 13.2,
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 34, margin: 0 }}>Library</h1>
          <div className="text-muted" style={{ fontSize: 13 }}>
            {totalLibrary} recipe{totalLibrary === 1 ? "" : "s"} · synced{" "}
            {lastSyncLabel}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-neutral-600)",
              display: "grid",
              pointerEvents: "none",
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            className="input"
            type="search"
            placeholder="Search recipe, ingredient, or author"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search recipes"
            style={{ minHeight: 44, paddingLeft: 40, fontSize: 15 }}
          />
        </div>
      </div>

      {/* Newly added shelf (hidden when newShelf pref is false) */}
      {showNewShelf && newShelfRecipes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 13.2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h4 style={{ margin: 0 }}>Newly added</h4>
            <div className="tag tag-accent">
              {newShelfRecipes.length} from the last sync
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 13.2,
              overflowX: "auto",
              paddingBottom: 6,
            }}
          >
            {newShelfRecipes.map((r) => {
              const thumb = recipeThumbnailUrl(r);
              return (
              <a
                key={r.id}
                href={`/recipes/${r.id}`}
                className="card elev-sm"
                style={{
                  minWidth: 300,
                  maxWidth: 300,
                  flexDirection: "row",
                  gap: 13.2,
                  padding: 10,
                  cursor: "pointer",
                  alignItems: "center",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    width: 104,
                    height: 68,
                    flex: "none",
                    borderRadius: 18,
                    background: "var(--color-neutral-300)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--color-neutral-100)",
                    overflow: "hidden",
                  }}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      width={68}
                      height={68}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <svg
                      width={24}
                      height={24}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div
                    className="card-title"
                    style={{
                      fontSize: 15,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.channel_title}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    added {relativeAgo(r.added_at)}
                  </div>
                </div>
              </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8.8 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-neutral-600)",
              width: 74,
            }}
          >
            Show
          </div>
          <div className="seg" role="radiogroup" aria-label="Library view">
            <label className="seg-opt">
              <input
                type="radio"
                name="view"
                checked={view === "library"}
                onChange={() => setView("library")}
              />
              <span>Library</span>
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="view"
                checked={view === "archive"}
                onChange={() => setView("archive")}
              />
              <span>Archive · {archiveCount}</span>
            </label>
          </div>
        </div>

        {view === "library" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8.8 }}>
            <FilterField
              label="Cuisine"
              options={cuisineOptions}
              selected={cuisine}
              onToggle={(v) => toggleChip("cuisine", v)}
              onSelectOne={(v) => setCuisine(v ? [v] : [])}
              allLabel="All cuisines"
            />
            <FilterField
              label="Main"
              options={mainOptions}
              selected={main}
              onToggle={(v) => toggleChip("main", v)}
              onSelectOne={(v) => setMain(v ? [v] : [])}
              allLabel="All mains"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-neutral-600)",
                  width: 74,
                }}
              >
                Sort
              </div>
              <div className="seg" role="radiogroup" aria-label="Sort by">
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === "added"}
                    onChange={() => setSortKey("added")}
                  />
                  <span>Date added</span>
                </label>
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === "uploaded"}
                    onChange={() => setSortKey("uploaded")}
                  />
                  <span>Date uploaded</span>
                </label>
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === "time"}
                    onChange={() => setSortKey("time")}
                  />
                  <span>Cook time</span>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
                style={{ gap: 8 }}
                title="Reverse the order"
              >
                <span
                  style={{
                    display: "grid",
                    transform: dir === "asc" ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}
                >
                  <ArrowDown size={14} strokeWidth={2.75} aria-hidden />
                </span>
                {dirLabel}
              </button>
              {hasFilters ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearFilters}
                  style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
                >
                  Clear filters
                </button>
              ) : null}
              <div
                className="text-muted"
                style={{ fontSize: 13, marginLeft: "auto" }}
              >
                {list.length} shown
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Archive view */}
      {view === "archive" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 13.2 }}>
          <div
            className="card"
            style={{
              background: "var(--color-accent-2-100)",
              padding: "17.6px 22px",
              gap: 4,
            }}
          >
            <h4 style={{ margin: 0 }}>Archive</h4>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "var(--color-accent-2-900)",
              }}
            >
              Removed recipes sit here for 30 days, then go for good. While a
              recipe is archived Roux remembers not to re-add it, even if the
              video is still in the playlist.
            </p>
          </div>
          {actionError ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-accent-700)" }}>
              {actionError}
            </p>
          ) : null}
          {archiveEmpty ? (
            <div
              className="card"
              style={{
                alignItems: "center",
                textAlign: "center",
                padding: 44,
                gap: 4,
              }}
            >
              <h4 style={{ margin: 0 }}>Nothing archived</h4>
              <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
                Remove a recipe from its page and it lands here first.
              </p>
            </div>
          ) : (
            list.map((r) => (
              <div
                key={r.id}
                className="card elev-sm"
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 13.2,
                  padding: "13.2px 17.6px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 200,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div className="card-title" style={{ fontSize: 16 }}>
                    {r.title}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>
                    {r.channel_title} · added {relativeAgo(r.added_at)} ·
                    deletes in 30 days
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 0 }}
                  disabled={actionId === r.id}
                  onClick={() => void restoreRecipe(r.id)}
                >
                  {actionId === r.id ? "…" : "Restore"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontFamily: "var(--font-body)", fontSize: 13 }}
                  disabled={actionId === r.id}
                  onClick={() => void deleteRecipe(r.id)}
                >
                  Delete now
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Recipe grid */}
      {view === "library" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))",
            gap: 17.6,
          }}
        >
          {list.map((r) => (
            <RecipeCard key={r.id} recipe={r} sort={sort} />
          ))}
        </div>
      ) : null}

      {/* Empty filters state */}
      {isEmpty ? (
        <div
          className="card"
          style={{
            alignItems: "center",
            textAlign: "center",
            padding: 44,
            gap: 8.8,
          }}
        >
          <h4 style={{ margin: 0 }}>Nothing matches that</h4>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            Try a different cuisine, or search the author&apos;s channel name.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterField({
  label,
  options,
  selected,
  onToggle,
  onSelectOne,
  allLabel,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  onSelectOne: (value: string | null) => void;
  allLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-neutral-600)",
          width: 74,
          flex: "none",
        }}
      >
        {label}
      </div>
      <div className="library-filter-chips">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              className={on ? "btn btn-primary" : "tag tag-neutral"}
              style={{
                cursor: "pointer",
                border: on ? undefined : 0,
                fontFamily: "inherit",
                fontSize: 13,
                padding: "7px 14px",
              }}
              onClick={() => onToggle(opt)}
              aria-pressed={on}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <select
        className="input library-filter-select"
        aria-label={label}
        value={selected[0] ?? ""}
        onChange={(e) => onSelectOne(e.target.value || null)}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
