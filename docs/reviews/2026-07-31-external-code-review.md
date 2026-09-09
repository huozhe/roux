# Roux — External Code Review

**Reviewer:** Claude Opus 5 (independent review, no prior context on this codebase)
**Date:** 2026-07-31
**Commit reviewed:** `45027b0` (main, clean tree)
**Audience:** the model/agent that built this app

---

## How to use this document

Each finding has a stable ID (`SEC-1`, `ARCH-2`, …). Respond **per finding** using this shape:

```
### SEC-1
Verdict: AGREE | PARTIALLY AGREE | DISAGREE
Reasoning: <1–4 sentences. If you disagree, say specifically what the reviewer got wrong.>
Commitment: FIX NOW | FIX LATER (when?) | WON'T FIX (why?) | NEEDS DECISION FROM OWNER
```

**Do not reply in chat — reply on GitHub.** The full collaboration protocol (branches, PR structure, how the two agents address each other, deadlock rules, and the exact `gh` commands) is in **[§10 Collaboration protocol](#10-collaboration-protocol)**. Read that section before responding.

Expect follow-up rounds. Disagreement is welcome and useful — you have context the reviewer does not, and several findings below are explicitly flagged as judgment calls rather than defects. **Please push back where the reviewer is wrong.** A defended "won't fix" with a clear rationale is a better outcome than a reluctant "fix" that churns the codebase.

Findings are tagged:

- **[DEFECT]** — reviewer asserts this is objectively wrong or will cause a failure.
- **[JUDGMENT]** — a tradeoff. Reasonable people can differ; the reviewer has a preference, not a proof.
- **[UNVERIFIED]** — reviewer believes this is true but could not confirm it without running against prod/live services. Please verify before agreeing.

---

## Verification performed

| Check | Result |
|---|---|
| `npm test` | 59 pass, 0 fail, 24 suites |
| `npx tsc --noEmit` | no errors |
| `npm run lint` | no issues |
| Manual read | all of `lib/`, all API routes, all pages, `LibraryClient`, `RecipeDetail` (partial), `SyncClient`, `PlaylistPicker`, schema, migrations, `proxy.ts`, CI config |

The build is green and the code is internally consistent. Nothing below is a "your code doesn't run" complaint.

---

## 0. What is genuinely good (not filler — this is calibration)

These are things the reviewer expected to be missing and found present. They should not be regressed while addressing anything below.

- **Sync decision logic extracted as pure functions.** `lib/sync/decisions.ts` (`shouldSkipVideo`, `canWriteExtract`) is the correct seam, and it is the part that is actually tested. Good instinct.
- **`verified` is never overwritten on re-extract.** Enforced twice — in `canWriteExtract` and again in the SQL `WHERE` clause at `lib/sync/run.ts:414` (`eq(recipes.verified, false)`). Defense in depth on the one piece of user work that can't be regenerated.
- **Caption-skip persistence** (`lib/sync/caption-skips.ts` + `roux.caption_skips`). Distinguishing `no_captions` from `auth_blocked` and refusing to burn extract budget on caption failures (`lib/sync/run.ts:341`) is a real operational insight, not an obvious one.
- **Tombstones** so a hard-deleted video never gets re-added by sync. Most implementations miss this and get zombie rows.
- **Share page hygiene.** `getSharedRecipeBySlug` strips `notes` and forces `verified: false` (`lib/recipes/queries.ts:507`), and `app/r/[slug]/page.tsx` sets `robots: { index: false }` on both the found and not-found paths. Correct and deliberate.
- **Refresh tokens encrypted at rest** with AES-GCM and a random IV per encryption (`lib/crypto.ts`). Not stored plaintext, which is the common shortcut.
- **`resolveAppUserId`** handles legacy JWTs carrying Google `sub` instead of the app UUID, and explicitly refuses to fall back to raw `sub` for ownership (`lib/auth.ts:79` comment). Someone thought about the migration.
- **Local-only sync was documented, not hidden.** `/api/cron/sync` returns a 503 with `code: "SYNC_LOCAL_ONLY"` rather than silently no-op'ing. That is the right way to retire a path.
- **`schemaFilter: ["roux"]`** in `drizzle.config.ts` so drizzle-kit can't touch `public`. Careful.

---

## 1. Correctness & security

### SEC-1 — `proxy.ts` fails open when auth env is missing **[DEFECT]**

`proxy.ts:12-30`:

```ts
const authConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_SECRET,
);
...
if (!authConfigured) {
  return NextResponse.next();   // ← every route public
}
```

The comment says "Until Google OAuth env is set, allow fixture UI without login (local/dev)" — but the condition is environment-value-driven, not environment-*name*-driven. If either var is ever unset, rotated to empty, or fails to propagate in a Vercel deploy, **the entire authenticated surface becomes public in production**, including `/api/recipes`, `/settings`, and `/api/prefs`. There is no signal that this has happened.

**Ask:** gate on `process.env.NODE_ENV !== "production"` (or `!process.env.VERCEL`) in addition to the env check, so production always fails closed.

---

### SEC-2 — `/api/sync` uses the raw session id, bypassing `resolveAppUserId` **[DEFECT]**

`app/api/sync/route.ts:15-16`:

```ts
const session = await auth().catch(() => null);
const userId = session?.user?.id;
```

Every other authenticated route in the codebase calls `resolveAppUserId()` (`app/api/recipes/*`, `app/api/prefs`, `app/api/share/*`, `app/api/sync/status`, `app/api/sync/history`, `app/api/playlists`). This one does not. `lib/recipes/auth.ts` exists specifically because older JWTs can carry a Google `sub` rather than the app UUID.

Consequence: for a session carrying a `sub`, `runSyncForUser` receives a non-UUID and the request fails as a Postgres cast error surfaced through the SSE `error` event, instead of a clean 401.

Currently masked in production because the route 503s on Vercel before reaching this code (`SYNC_ALLOW_CLOUD` guard) — but it is live on any local run with `SYNC_ALLOW_CLOUD=true`.

**Ask:** use `resolveAppUserId` here like everywhere else.

---

### SEC-3 — Unauthenticated API requests get a 302 to `/login`, not a 401 **[DEFECT, low severity]**

The `proxy.ts` matcher covers `/api/*` (only `_next/*`, favicon, and image extensions are excluded). For a signed-out user, `fetch("/api/recipes")` follows the redirect and returns the `/login` **HTML page** with status 200. Client code then does `res.json()` — which throws — and lands in a generic `catch` that reports "Network error" or similar.

The per-route `requireUserId()` 401s are therefore unreachable for browser fetches; they only fire for direct non-browser calls.

**Ask:** in `proxy.ts`, return `NextResponse.json({error:"Unauthorized"}, {status:401})` for `pathname.startsWith("/api/")` instead of redirecting.

---

### SEC-4 — No rate limiting on any route **[JUDGMENT]**

Zero rate limiting anywhere. Two routes proxy third-party quota: `GET /api/playlists?refresh=1` (YouTube `playlists.list`, paginated) and `POST /api/sync` (YouTube + Anthropic). Both are authenticated, so the blast radius is one signed-in user, and this is a private single-user app — which is why this is JUDGMENT, not DEFECT.

**Ask:** state explicitly whether "private app, trusted user" is the accepted rationale. If so this can be closed as WON'T FIX; the reviewer just wants it to be a decision rather than an omission.

---

### SEC-5 — Share slugs are enumerable **[JUDGMENT]**

`makeShareSlug(title, randomHex4)` → `title-slug` + 4 hex chars = 65,536 possibilities per title. `/r/[slug]` is `noindex` and notes are stripped, so exposure is a recipe title + ingredients + steps. Realistically fine for this app.

**Ask:** confirm this was a deliberate readability-over-entropy tradeoff. If yes, WON'T FIX is a fine answer. If it was incidental, 8 hex chars costs nothing.

---

## 2. Architecture

### ARCH-1 — Two parallel read paths that have already drifted **[DEFECT]** ← *highest priority finding in this document*

There are two independent implementations of "DB row → `Recipe`" and two independent implementations of filter/sort:

| | SSR pages | API routes |
|---|---|---|
| Entry | `lib/data/recipes.ts` | `lib/recipes/queries.ts` |
| Row mapper | `lib/data/db-recipes.ts:53 recipeFromRow` | `lib/recipes/map.ts:20 rowToRecipe` |
| Filter/sort | `lib/search.ts filterAndSortRecipes` (in-memory) | SQL `WHERE` + `ORDER BY` |

Consumers: `app/(app)/page.tsx:3`, `app/(app)/recipes/[id]/page.tsx:4`, `app/(app)/recipes/[id]/cook/page.tsx:4` use the first. `app/api/recipes/**` uses the second.

**They already behave differently.** `db-recipes.ts:69-70` coerces jsonb defensively:

```ts
ingredients: asIngredients(row.ingredients),   // normalizes qty/name/inferred/group
steps: asSteps(row.steps),                     // renumbers n when missing
```

`map.ts:33-34` does not:

```ts
ingredients: row.ingredients ?? [],
steps: row.steps ?? [],
```

So a row with a malformed `steps` entry (missing `n`, or `t_seconds` as a string — both reachable, since `steps` is `jsonb` written from LLM output and from `PATCH /api/recipes/:id`) renders correctly on the server-rendered recipe page and ships malformed JSON from the API to `RecipeDetail`, which then re-renders it client-side. This is a live divergence, not a hypothetical one.

Search also differs: the SQL path uses the FTS column plus ILIKE (`queries.ts:119-132`); the in-memory path substring-matches a joined string including ingredient names (`search.ts:4-17`). Same query string, different result sets, depending on which path served it.

**Ask:** collapse to one. Reviewer's recommendation is to keep `lib/recipes/queries.ts` (it pushes work to Postgres and uses the `recipes_search_gin` index that `0001_search.sql` creates) and delete `lib/data/db-recipes.ts` + the server-side use of `lib/search.ts`. Keep `filterAndSortRecipes` only for the client-side filtering in `LibraryClient`, if you keep that at all (see UX-3).

If there is a reason for the split the reviewer missed — e.g. the fixture fallback in `lib/data/recipes.ts` is load-bearing for demoing without a DB — please say so; that is a legitimate defense and changes the recommendation to "unify the mappers, keep the fixture adapter."

---

### ARCH-2 — SSR list path fetches all rows and filters in JS **[DEFECT, perf]**

`lib/data/db-recipes.ts:84 listRecipesFromDb` selects every non-deleted row for the user, then calls `filterAndSortRecipes` in memory. `app/(app)/page.tsx:16-20` calls it **twice** (once for `library`, once for `archive`) and concatenates — so the full table is fetched twice per page load, filtered twice, then shipped in full to the client anyway.

Meanwhile `0001_search.sql` builds a generated `tsvector` column and a GIN index that this path never touches.

Largely subsumed by ARCH-1, but flagged separately because the double-fetch in `page.tsx` is independently wasteful.

---

### ARCH-3 — No `error.tsx` / `not-found.tsx` / `loading.tsx` **[DEFECT, low severity]**

None exist anywhere under `app/`. Consequences:

- Any throw in a server component (e.g. `getUserPrefs` when `DATABASE_URL` is briefly unreachable — though note several call sites already `try/catch` to defaults) surfaces the default Next.js error page.
- `notFound()` is called in `app/(app)/recipes/[id]/page.tsx:23` and `app/r/[slug]/page.tsx:283` with no custom `not-found.tsx`, so a bad share link renders the stock 404 rather than anything branded — a slightly odd experience for a link you deliberately shared with someone.
- Every page is `force-dynamic` with no `loading.tsx`, so navigation has no streaming skeleton.

---

### ARCH-4 — `updateUserPrefs` is read-modify-write with no concurrency control **[DEFECT, low severity]**

`lib/recipes/queries.ts:543` reads current prefs, merges, writes the whole `prefs` jsonb. Three writers exist: `PUT /api/prefs`, `learnCategoriesFromLabels` (called per-recipe inside the sync loop at `run.ts:419`), and `learnCategoriesFromUserRecipes`.

During a sync run with a Settings tab open, a category learned mid-loop can be clobbered by a prefs save, or vice versa. Low real-world impact (single user, small window, worst case is a lost custom chip) but it is a genuine lost-update.

**Ask:** either a `jsonb_set`-style partial update for the learned-category path, or accept it explicitly given the single-user model.

---

## 3. Testing

### TEST-1 — Coverage is inverted: the pure helpers are tested, the risky code is not **[DEFECT]**

59 tests across 10 files, all on pure functions. Untested:

| File | Lines | Contains |
|---|---|---|
| `lib/recipes/queries.ts` | 610 | every ownership predicate — `owned()`, `revokeShare` forbidden path, `getSharedRecipeBySlug` notes-stripping, `deleteRecipe` tombstone write |
| `lib/sync/run.ts` | 748 | the entire pipeline |
| `lib/crypto.ts` | 63 | token encryption round-trip |
| `lib/data/*`, `lib/search.ts` | ~150 | the SSR read path |
| all 15 API routes | — | authz, 400/401/403/404 |
| all 12 components | — | — |

`decisions.test.ts`, `categories.test.ts`, `format.test.ts` etc. are good tests of code that was already unlikely to break. The security-relevant predicates have zero coverage.

The highest-value additions, in order:

1. **Cross-user authorization.** Seed two users, assert user A gets 404/403 on B's recipe for GET / PATCH / DELETE / archive / restore / verify / share, and on `DELETE /api/share/:slug` for B's slug. This is the test suite you'd most regret not having.
2. **`lib/crypto.ts` round-trip** — encrypt → decrypt → equals, plus both key formats (64-hex and base64), plus the `Invalid ciphertext` path. ~15 lines, no infra.
3. **`getSharedRecipeBySlug`** — asserts `notes === null` and `verified === false` for a recipe that has both set. Guards a privacy property that a future refactor could silently drop.

For (1), `pglite` or a per-run Neon branch would let these be real integration tests rather than mocks. Mocking Drizzle would test the mock.

**Ask:** commit to (2) and (3) now (cheap, no infrastructure decision needed), and give a position on (1) — including whether the infra cost is worth it for a private app.

---

### TEST-2 — CI runs tests but has no database **[JUDGMENT]**

`.github/workflows/ci.yml` runs `npm test` → `npm run lint` → `npm run build` on Node 22. Clean and correct for what it covers. It cannot cover anything in TEST-1 without a DB service. Related to the TEST-1 decision; noted so it isn't overlooked when answering.

---

## 4. LLM extraction pipeline

> The reviewer loaded Anthropic's current API reference before writing this section rather than relying on recalled knowledge. Two claims below correct assumptions the reviewer initially held.

### LLM-1 — `claude-sonnet-4-6` is fine; structured outputs are the real win **[JUDGMENT]**

First, a correction the reviewer wants on record: `claude-sonnet-4-6` is **not** deprecated or invalid. It is an active model. No urgency to change it for its own sake.

The substantive point is different. `lib/extract/index.ts` hand-rolls a JSON-reliability layer:

- a 3-attempt retry loop (`index.ts:66-88`)
- `extractJsonObject` — strips markdown fences, then slices between the first `{` and last `}` (`schema.ts:35-46`)
- `buildRetryPrompt` — feeds the failed output back with the validation error (`prompt.ts:112`)
- explicit `stop_reason === "max_tokens"` truncation handling with a "return compact JSON" retry
- a `SYSTEM_PROMPT` that spends its first block on "CRITICAL OUTPUT RULES: Return ONLY one JSON object. No markdown fences, no preamble…"

All of this exists to work around unconstrained generation. **Structured outputs (`output_config.format` with a JSON schema) make malformed output structurally impossible**, which would delete essentially all of the above — roughly 100 lines plus a chunk of the prompt — and remove the retry API calls entirely (currently up to 3× cost on a bad parse).

**The catch, and why this is a real tradeoff rather than free:** structured outputs are supported on Fable 5, Opus 5, Opus 4.8, Sonnet 5, and Haiku 4.5 — **not on Sonnet 4.6**. Adopting it means moving to `claude-sonnet-5` (or `claude-opus-5`). Migration notes if you do:

- Sonnet 5 uses a **new tokenizer, ~30% more tokens for the same text**. Transcripts are long; re-baseline `max_tokens` (currently 8192 at `index.ts:21`) with `count_tokens` rather than assuming it still fits.
- Adaptive thinking is **on by default** on Sonnet 5 when `thinking` is omitted, and `max_tokens` caps thinking + output together. A budget sized for output alone can truncate.
- `temperature`/`top_p`/`top_k` are rejected — you don't set them, so no action.
- `effort` defaults to `high`; `medium` on Sonnet 5 is roughly Sonnet 4.6 at `high`. Worth a sweep for cost.

**Ask:** a position on whether this migration is worth it. "Not now, Sonnet 4.6 output quality is fine and the retry loop rarely fires" is a legitimate answer — but if so, please share whether you have data on how often the retry loop actually fires, because that number decides it. If it fires often, the cost case is strong.

---

### LLM-2 — Prompt caching would **not** help here, contrary to expectation **[UNVERIFIED — please verify before acting]**

The reviewer's initial instinct was "add `cache_control` to `SYSTEM_PROMPT`, get ~90% off the system prompt on every video." **That instinct appears to be wrong for this codebase, and the failure would be silent.**

`SYSTEM_PROMPT` is 3,870 characters ≈ **968 tokens** (chars/4 estimate). The minimum cacheable prefix on Sonnet 4.6 and Sonnet 5 is **1,024 tokens**. Below the minimum, a `cache_control` breakpoint does nothing at all — no error, just `cache_creation_input_tokens: 0` forever. The prompt sits ~5% under the line.

And there is no other shared prefix: the transcript in the user turn is unique per video, so nothing after the system block is reusable.

Consequences for planning:

- On Sonnet 4.6 / Sonnet 5 today: caching is not worth implementing.
- On `claude-opus-5` the minimum drops to **512 tokens**, so it would work there — a second, independent reason the LLM-1 migration might pay off.
- If you ever grow the system prompt past ~1,024 tokens on a Sonnet model, caching becomes viable and should be revisited.

**Ask:** this is estimated, not measured. Please verify with `client.messages.count_tokens()` against the actual `SYSTEM_PROMPT` before treating either the "don't bother" or the "it would work on Opus 5" conclusion as settled. If the real count is above 1,024, the reviewer is wrong and caching is worth adding immediately.

---

### LLM-3 — No cost or token telemetry on extraction **[JUDGMENT]**

`sync_runs.detail` records `needTranscript` and `errors`, but nothing records `usage` from the Anthropic response. There is therefore no way to answer "what does a sync run cost" or "how often does the retry loop fire" — which is exactly the number LLM-1 hinges on.

**Ask:** record `msg.usage` (input/output tokens) and the attempt index per extract into `sync_runs.detail`. Cheap, and it converts LLM-1 from a guess into a decision.

---

### LLM-4 — Ingredient `group` labels are discarded on export **[DEFECT, minor]**

`SYSTEM_PROMPT` spends ~25 lines specifying culinary grouping (`prompt.ts:44-70`), `ingredientSchema` makes `group` required (`schema.ts:8`), and `IngredientsList` renders the groups. But `lib/export/markdown.ts:29-32` emits a flat list and drops `group` entirely.

The most-engineered part of the prompt is invisible in the export.

---

## 5. Code quality

### CQ-1 — `RecipeDetail.tsx` is 1,556 lines with 17 `useState` **[JUDGMENT, strong]**

Single largest file in the repo. State spans view mode, edit draft, notes autosave, video open, share dialog, share slug, share busy, copy feedback, confirm dialog, remove mode, busy, error.

Reviewer is not going to argue "big file bad" as a rule. The concrete argument is that at 17 co-located `useState` values the invalid-state space is enormous, and there are zero tests. Suggested seams: `RecipeView` / `RecipeEditor` (draft + patch) / `RecipeNotes` (autosave) / share dialog (already partly `SharePanel.tsx`).

**Ask:** agree/disagree, and if you agree, whether it's worth doing before or after ARCH-1.

---

### CQ-2 — 382 inline style objects vs 219 classNames, with magic pixel values **[DEFECT — against the project's own spec]**

Counts across `app/` + `components/`: 382 `style={{`, 219 `className=`. Recurring literals: `"13.2px"` ×19, `"12.5px"` ×14, `"13.5px"` ×13, `"17.6px"` ×6, plus bare `26.4`, `13.2`, `22`, `70`.

This is flagged as DEFECT rather than JUDGMENT because `docs/plans/v1-implementation.md` states as a Global Constraint:

> Port `_ds/.../styles.css` as the design system; **no hard-coded hex/spacing the tokens already define.**

`styles/organic.css` defines the token ramps. The implementation bypasses them at scale. Secondary effect: every inline object is a fresh allocation per render, defeating memoization on the list.

**Ask:** was the constraint consciously abandoned (and why), or did it erode? Either answer is fine; the reviewer wants to know which, since it determines whether a migration is worth proposing.

---

### CQ-3 — Tailwind 4 is installed, wired into PostCSS, and completely unused **[DEFECT]**

`package.json` has `tailwindcss@^4` and `@tailwindcss/postcss@^4`; `postcss.config.mjs` loads the plugin. But **nothing imports Tailwind** — no `@import "tailwindcss"`, no `@tailwind` directives in `app/globals.css` or `styles/organic.css` — and there is not a single utility class in the codebase.

So the build runs the Tailwind PostCSS pass on every compile for zero output.

**Ask:** remove both dependencies and the PostCSS plugin, or adopt Tailwind and use it to fix CQ-2. Reviewer has no strong preference between the two, but the current state is the worst of both.

---

### CQ-4 — Google Fonts loaded via CSS `@import` instead of `next/font` **[DEFECT, perf]**

`styles/organic.css:2`:

```css
@import url('https://fonts.googleapis.com/css2?family=Caprasimo…&family=Figtree…&display=swap');
```

A CSS `@import` to a third-party origin is render-blocking and serialized behind the stylesheet — the browser cannot discover it until `organic.css` parses. `next/font/google` self-hosts, eliminates the extra origin round-trip, and generates `size-adjust` fallbacks to cut CLS. This is a several-hundred-millisecond LCP item on a cold mobile load, on an app explicitly designed to be used in a kitchen.

There is no `next/font` usage anywhere in the repo.

---

### CQ-5 — Raw `<img>` for recipe thumbnails **[JUDGMENT]**

`components/library/RecipeCard.tsx:63` and `components/library/LibraryClient.tsx:292`. Sources are `i.ytimg.com` `hqdefault.jpg` (480×360) rendered into small cards — so every card downloads a full-size JPEG with no responsive `srcset`, no AVIF/WebP negotiation, and no lazy-loading beyond the browser default. On a library of 100 recipes that's ~100 unoptimized images on the main screen.

`next/image` with a `remotePatterns` entry for `i.ytimg.com` fixes all of it. Counter-argument the reviewer acknowledges: it adds Vercel image-optimization cost, and YouTube thumbnails are already reasonably compressed.

---

### CQ-6 — `thumbnail_blob` column exists but is never read or written **[DEFECT]**

`lib/db/schema.ts:69` declares `thumbnailBlob`. Repo-wide, the only other occurrence is `lib/recipes/map.test.ts:17` setting it to `null` in a fixture. It is never written, never read, never surfaced.

It traces to a Global Constraint in the plan:

> Dead videos: keep recipe, disable links, **cache thumbnails at sync.**

That was not implemented. The observable bug: when `video_status` becomes `"gone"`, `recipeThumbnailUrl()` (`lib/format.ts:47`) falls back to `https://i.ytimg.com/vi/{id}/hqdefault.jpg`, which for a deleted video serves a placeholder or 404. So the "video no longer available" card — the exact case the constraint was written for — shows a broken image.

**Ask:** implement the cache (Vercel Blob is the natural fit) or drop the column and the constraint. Either is fine; a dead column plus a broken fallback is not.

---

### CQ-7 — Six environment variables are undocumented **[DEFECT, minor]**

Read by code, absent from `.env.example`:

| Var | Read at |
|---|---|
| `SYNC_ALLOW_CLOUD` | `app/api/sync/route.ts:32` |
| `YOUTUBE_COOKIES` | `lib/youtube/transcript.ts:80` |
| `SYNC_MAX_NEW` | `lib/sync/run.ts:61` |
| `FORCE_STATUS_CHECK` | `lib/sync/run.ts:498` |
| `ROUX_DATA` | `lib/data/recipes.ts:29` |
| `ROUX_SYNC_EMAIL` | `scripts/sync-local.ts:49` |

`YOUTUBE_COOKIES` in particular is the documented remedy for `auth_blocked` (`scripts/sync-local.ts:209` tells the user to set it) but a fresh clone has no idea it exists.

Separately: `ROUX_DATA` is read but its only branch (`=== "live"`) returns the same value the fallback already returns — it appears to be vestigial.

---

## 6. UI / UX / accessibility

### UX-1 — Accessibility has not been passed over **[DEFECT, needs measurement]**

Across ~5,000 lines of TSX: 49 `onClick`, 32 `aria-*` (most of them `aria-hidden` on decorative SVGs), 9 `role=`, 8 `aria-label`.

Specific concerns:

- Icon-only buttons in `CookMode.tsx` (lines 161, 182, 301, 315) — the SVGs are correctly `aria-hidden`, which means the button has no accessible name unless there is adjacent text. Please verify each.
- The share dialog and delete-confirm in `RecipeDetail` — no `role="dialog"`, no focus trap, no focus restore, no Escape handler visible.
- Cook mode is the screen most likely to be used hands-busy/eyes-away and is the one that most needs keyboard and screen-reader support.

**Ask:** run `axe` (or Lighthouse a11y) on Library / Recipe / Cook / Settings and report the actual violation count. The reviewer is asserting "not audited," not "N violations" — the number should come from a tool, not from either of us.

---

### UX-2 — `useLivePrefs` refetches on every mount **[JUDGMENT]**

`lib/prefs/client.ts` fetches `/api/prefs` in a mount effect on every consumer — `LibraryClient`, `RecipeDetail`, `CookMode`. The server already resolved prefs and passed them as props (`app/(app)/page.tsx:31`), so this is a redundant round-trip on every navigation, and it can cause a visible flash when the fetched value differs from the prop.

The docstring says it exists "so Settings changes apply even if RSC cache is stale" — a real problem. But `revalidatePath("/")` from the prefs PUT, or `router.refresh()` after a Settings save, solves it without a fetch per mount.

**Ask:** was the RSC staleness observed in practice, or defensive? If observed, what was the repro? That determines whether the cheaper fix actually works.

---

### UX-3 — Library ships the entire dataset to the client **[JUDGMENT]**

`app/(app)/page.tsx:16-20` loads library + archive, concatenates, and passes the whole array to `LibraryClient`, which filters/sorts client-side via `filterAndSortRecipes`. No pagination, no virtualization, no windowing.

Genuinely the right call at ~100 recipes — instant filtering, no request per keystroke. It stops being right somewhere around 500–1,000 (payload size, and 100+ unoptimized `<img>` per CQ-5).

**Ask:** just state the intended ceiling. If the answer is "this is my personal cookbook, it will never exceed 300," this is WON'T FIX and correct.

---

### UX-4 — `alt=""` on recipe thumbnails **[JUDGMENT]**

Both thumbnails use `alt=""`. Defensible as decorative — the card has a visible title adjacent, and a screen reader would otherwise hear the recipe name twice. Flagged only to confirm it was deliberate rather than a placeholder. If deliberate, WON'T FIX.

---

## 7. Priority ordering (reviewer's opinion — argue with it)

| # | ID | Why this order |
|---|---|---|
| 1 | **ARCH-1** | Live divergence, and it makes every other change riskier while it exists |
| 2 | **SEC-1, SEC-2** | Small diffs, real failure modes, no design debate needed |
| 3 | **TEST-1** (items 2 & 3) | Crypto round-trip + share-privacy test are ~30 lines total, no infra |
| 4 | **CQ-3, CQ-7** | Pure deletions/documentation, zero risk |
| 5 | **TEST-1** (item 1) | Cross-user authz — needs the pglite/Neon-branch decision first |
| 6 | **LLM-3 → LLM-1** | Add telemetry, *then* decide the model migration from data |
| 7 | **CQ-1** | Do after ARCH-1, not before |
| 8 | **CQ-2 / CQ-3** | Design-system decision; largest diff, lowest urgency |
| 9 | **CQ-4, CQ-5, ARCH-3** | Perf/polish batch |
| 10 | **CQ-6** | Implement or delete |

---

## 8. Questions the reviewer could not answer from the code

Please answer these — several findings above may change based on your response.

1. **Is `lib/data/recipes.ts`'s fixture fallback load-bearing?** If the app must render without `DATABASE_URL`, ARCH-1's recommendation changes from "delete the module" to "unify the mappers, keep the adapter."
2. **How often does the extract retry loop actually fire?** Decides LLM-1 entirely.
3. **Was the design-token constraint (CQ-2) consciously dropped?** Determines whether a migration is worth proposing at all.
4. **Is there a reason `/api/sync` (SEC-2) skips `resolveAppUserId`,** or is it an oversight from when that helper was introduced?
5. **What is the intended recipe-count ceiling?** (UX-3, ARCH-2, CQ-5 all scale off this.)
6. **Is cloud sync considered permanently dead,** or is a residential-proxy / relay approach on the roadmap? This is the app's biggest operational constraint — "you must run `npm run sync` on your laptop" — and it shapes how much the `/api/sync` and cron code paths are worth maintaining.

---

## 9. Things the reviewer deliberately did not flag

Listed so their absence isn't read as an oversight:

- **`console.log`/debug noise** — none found.
- **Secrets in git** — `.gitignore` covers `.env*`; `git ls-files` confirms none tracked.
- **SQL injection** — all dynamic SQL is parameterized, including the raw `plainto_tsquery` fragment at `queries.ts:129`. `escapeLike` correctly escapes `%`, `_`, and `\`.
- **The `db` Proxy in `lib/db/index.ts`** — unusual, but the lazy-singleton rationale (don't throw at import during build/typecheck) is sound and documented.
- **SSE implementation** (`components/sync/sse.ts`) — correctly handles CRLF, multi-line `data:`, comments, and trailing partial events. Better than most hand-rolled SSE parsers.
- **`next.config.ts` being empty** — fine; nothing needs configuring yet. (Will need `images.remotePatterns` if CQ-5 is addressed.)

---

---

## 10. Collaboration protocol

### 10.0 The honest constraint, stated first

**Neither agent can be notified.** Claude and Grok are both CLI agents invoked by the repo owner (`huozhe`) in a terminal. Neither has a GitHub account, neither can be `@`-mentioned into existence, and neither polls. Any protocol that assumes "Grok tags Claude and Claude wakes up" is fiction.

What is real:

- Both agents run on the owner's machine and **both can use the authenticated `gh` CLI** (verified: `gh auth status` → logged in as `huozhe`, scopes include `repo`).
- Both can therefore **read** the full PR thread and **write** comments, reviews, and commits without the owner copy-pasting anything.
- The owner is the **scheduler**. He decides when each agent runs. That is the only missing piece, and it is a feature: it keeps a human in the loop between rounds.

So: **GitHub is the shared memory; the owner is the transport.** `@`-handles in this protocol are *addressing conventions* that tell a human which agent should be invoked next and tell the agent which comments are directed at it. They trigger nothing by themselves.

> **Optional upgrade — real async for Claude.** Anthropic ships a GitHub App (`/install-github-app` inside Claude Code) that installs a workflow so `@claude` in a PR comment genuinely triggers Claude via GitHub Actions. If the owner installs it, Claude's side becomes fully async and the owner only has to schedule Grok. This requires an Anthropic API key in repo secrets and bills to the API, separately from a Claude subscription. The reviewer does not know whether xAI ships an equivalent for Grok — **Grok, please state in your first response whether you have any GitHub App / Actions trigger available.** Until confirmed, assume manual scheduling for both.

---

### 10.1 Addressing convention

| Handle | Means | Who acts |
|---|---|---|
| `@claude-reviewer` | Addressed to Claude (author of this review) | Owner invokes Claude Code in the repo |
| `@grok-builder` | Addressed to Grok (author of the app) | Owner invokes Grok in the repo |
| `@owner` | Needs a human product/cost/risk decision | `huozhe` |

Every comment **must** end with a `NEXT:` line naming exactly one handle, so the owner can see at a glance who to run next without reading the thread:

```
NEXT: @grok-builder — 4 findings CONTESTED, awaiting counter-evidence on ARCH-1.
```

A comment with no `NEXT:` line is treated as an incomplete turn.

---

### 10.2 Two PRs, distinct purposes

**Deviation from the owner's initial suggestion, flagged deliberately:** the suggestion was for Grok to open a "comm PR." The reviewer proposes inverting the authorship and using the review document itself as the diff. Rationale:

1. A PR requires a diff. An empty "communication PR" is an awkward artifact; this document is a *natural* diff that needs to land in the repo anyway.
2. GitHub's **line-anchored review comments give per-finding threading for free.** Grok comments directly on the `### SEC-1` line; Claude replies in that thread. Twelve findings become twelve independent conversations with zero manual quoting. A flat issue thread cannot do this.
3. Merging the Review PR permanently records the consensus next to the code it describes.

If the owner prefers Grok to open it, the protocol is unchanged apart from who runs `gh pr create` — swap freely.

#### PR #1 — Review PR (the debate)

| | |
|---|---|
| Branch | `review/2026-07-31-external-review` |
| Diff | this document only — **no source changes, ever** |
| Opened by | `@claude-reviewer` |
| Title | `review: external code review 2026-07-31 (debate thread — do not merge until consensus)` |
| Purpose | Reach a per-finding verdict. Nothing is implemented here. |
| Merged when | Every finding has a terminal status (§10.3) and the ledger is complete |

#### PR #2 — Fix PR (the implementation)

| | |
|---|---|
| Branch | `fix/review-round-1` |
| Opened by | `@grok-builder`, **only after** PR #1 reaches consensus |
| Scope | **`AGREED` findings only.** Nothing else. |
| Reviewed by | `@claude-reviewer` |
| Merged when | Claude approves and CI is green |

Splitting debate from implementation is the point: it prevents the argument and the diff from contaminating each other, and it means a rejected finding costs zero code churn.

---

### 10.3 Finding status machine

Every finding carries exactly one status. Terminal statuses are marked ✅.

| Status | Meaning | Next actor |
|---|---|---|
| `OPEN` | Awaiting Grok's first response | `@grok-builder` |
| `AGREED` | Both agree it's real and in scope for the Fix PR | `@grok-builder` |
| `CONTESTED` | Grok disagrees; Claude must counter or concede | `@claude-reviewer` |
| `WONTFIX` ✅ | Claude accepted Grok's defense. Closed, no work. Rationale recorded. | — |
| `DEFERRED` ✅ | Agreed real, out of scope this round. **Requires a tracking issue.** | — |
| `BLOCKED-OWNER` | Needs a human product/cost/risk call | `@owner` |
| `FIXED` | Implemented in the Fix PR, awaiting verification | `@claude-reviewer` |
| `VERIFIED` ✅ | Claude confirmed the fix does what it claims | — |

**Deadlock rule.** If a finding is still `CONTESTED` after **two** full exchanges (Grok disagrees → Claude counters → Grok disagrees again), it automatically becomes `BLOCKED-OWNER`. Two AI agents can be indefinitely polite at each other; this rule exists to stop that. The owner's decision is final and gets recorded verbatim in the ledger.

---

### 10.4 Consensus ledger

`@claude-reviewer` maintains this table in the **PR #1 description** (not a comment — the description, so it's always visible at the top) and updates it after every round.

```markdown
| ID | Tag | Status | Round | Note |
|----|-----|--------|-------|------|
| ARCH-1 | DEFECT | OPEN | 0 | |
| SEC-1  | DEFECT | OPEN | 0 | |
| ...    |        |      |   | |
```

The ledger is the single source of truth for "where are we." If a comment thread and the ledger disagree, the ledger is wrong and Claude must fix it.

---

### 10.5 Rules of engagement

Binding on both agents.

1. **Evidence or it didn't happen.** Any claim about runtime behavior cites `file:line`, or a command with its actual output. "I believe X" is not a response; `git log -S`, `rg`, a test run, or a `count_tokens` result is.
2. **Verify `[UNVERIFIED]` findings before acting on them.** LLM-2 (prompt caching) explicitly must not be implemented *or* dismissed until someone runs `count_tokens`. Report the number.
3. **Answer §8.** The six open questions gate several findings. Grok's first response must address all six, even if the answer is "don't know."
4. **Conceding is a valid, respected move.** Claude is expected to write `WONTFIX — Grok is right` where Grok is right. That is a successful outcome, not a loss. The goal is a correct ledger, not a high fix count.
5. **No silent scope expansion.** The Fix PR contains `AGREED` items only. Drive-by refactors, reformatting, and "while I was in there" changes are rejected on sight — open a separate PR.
6. **One commit per finding**, message ending in the ID:
   `fix(sync): resolve app user id in sync route [SEC-2]`
   This makes `git log --grep='\[SEC-2\]'` the audit trail and makes reverting a single disputed fix trivial.
7. **Every `[DEFECT]` fix ships a test**, or an explicit one-line justification for why it isn't testable. `[JUDGMENT]` fixes don't require one.
8. **CI green is table stakes**, not an achievement worth reporting. `npm test && npm run lint && npm run build` must pass before requesting review.
9. **Don't regress §0.** Those items were called out as good specifically so they survive this process.
10. **Stay in your lane.** Claude does not push code to the Fix PR; it reviews. Grok does not edit this review document; it responds to it.

---

### 10.6 Round sequence

```
Round 0  @claude-reviewer  Open PR #1 (this doc) + seed ledger, all findings OPEN
Round 1  @grok-builder     Line comment per finding (verdict/reasoning/commitment)
                           + top-level comment answering all six §8 questions
Round 2  @claude-reviewer   Reply in each thread; concede or counter with evidence
                           Update ledger. Findings settle to AGREED / WONTFIX /
                           DEFERRED / BLOCKED-OWNER, or stay CONTESTED
Round 3  @grok-builder     Respond to remaining CONTESTED only
                           (2nd disagreement ⇒ auto BLOCKED-OWNER per §10.3)
Round 4  @owner            Rule on BLOCKED-OWNER items
         @claude-reviewer   Finalize ledger → merge PR #1
Round 5  @grok-builder     Open PR #2 implementing AGREED items only
Round 6  @claude-reviewer   Review PR #2 per §10.7
Round 7  @grok-builder     Address review; iterate until approved
```

---

### 10.7 Fix PR review contract

Claude's review of PR #2 reports, per finding:

```
[SEC-2] VERIFIED — resolveAppUserId now used at app/api/sync/route.ts:16.
        Test covers the non-UUID session path. Matches AGREED scope.

[CQ-3]  REJECTED — AGREED scope was "remove tailwind deps + postcss plugin."
        Diff also rewrites globals.css (out of scope, rule 5). Split it.
```

Verdicts: `VERIFIED` / `INCOMPLETE` (partial) / `REJECTED` (wrong or out of scope) / `REGRESSION` (breaks something in §0).

Claude approves only when every finding in the PR is `VERIFIED`.

---

### 10.8 Exact commands

**Claude — open PR #1 (Round 0):**

```bash
git checkout -b review/2026-07-31-external-review
git add docs/reviews/2026-07-31-external-code-review.md
git commit -m "review: external code review 2026-07-31"
git push -u origin review/2026-07-31-external-review
gh pr create \
  --title "review: external code review 2026-07-31 (debate thread — do not merge until consensus)" \
  --body-file docs/reviews/.pr-body.md
```

> Historical. The seed file `docs/reviews/.pr-body.md` was deleted when the repo
> went public: its ledger froze with every finding at `OPEN`, which read as a
> list of live vulnerabilities long after all 26 were discharged.

**Grok — read the review and respond (Round 1):**

```bash
gh pr list                                  # find the Review PR number
gh pr view <N> --comments                   # read doc + full thread
gh pr diff <N>                              # read the review as a diff

# Per-finding line comment (anchor on the "### SEC-1" heading line):
gh api repos/huozhe/roux/pulls/<N>/comments \
  -f body='Verdict: DISAGREE
Reasoning: ...
Commitment: WON'"'"'T FIX

NEXT: @claude-reviewer' \
  -f commit_id="$(git rev-parse HEAD)" \
  -f path='docs/reviews/2026-07-31-external-code-review.md' \
  -F line=<line-of-that-heading> -f side=RIGHT

# Top-level comment for the §8 answers:
gh pr comment <N> --body-file /path/to/section-8-answers.md
```

**Either agent — reply inside an existing thread (keeps per-finding threading intact):**

```bash
gh api repos/huozhe/roux/pulls/<N>/comments/<COMMENT_ID>/replies -f body='...'
```

**Grok — open PR #2 (Round 5):**

```bash
git checkout -b fix/review-round-1
# ... one commit per finding, each message ending in [ID] ...
gh pr create --title "fix: review round 1 — AGREED findings" \
  --body "Implements AGREED items from #<N>. Ledger: <link>.

Per-finding commits:
- [SEC-1] ...
- [SEC-2] ...

NEXT: @claude-reviewer"
```

**Owner — schedule a turn.** In the relevant agent's terminal:

> `Read PR #<N> on huozhe/roux with gh, follow §10 of docs/reviews/2026-07-31-external-code-review.md, and take your turn.`

---

### 10.9 Fallback if `gh` is unavailable to Grok

If Grok's environment cannot reach `gh` or the network, degrade to file-based exchange in-repo — same IDs, same statuses, same rules:

- Grok writes `docs/reviews/responses/round-1-grok.md`
- Claude writes `docs/reviews/responses/round-2-claude.md`
- The owner commits both; the ledger moves to `docs/reviews/LEDGER.md`

Strictly worse (no threading, manual anchoring) but preserves the protocol. **Grok: state in your first response which mode you can support.**

---

*End of review. Respond on the Review PR per §10, not in chat. Disagreement with reasoning is more useful than agreement without it.*
