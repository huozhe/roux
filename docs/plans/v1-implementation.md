# Roux v1 Implementation Plan

> **For agentic workers:** Execute as a **parallel DAG** (tracks + merge points), not a single linear queue. Use git worktrees when ≥2 agents write at once. Spec: `prototype/HANDOFF.md` + `prototype/Recipe App.dc.html`.

**Goal:** Ship a private web app that turns YouTube cooking playlists into a searchable recipe library (ingredients, numbered steps, video timestamps), matching the Organic design system and prototype screens.

**Architecture:** Next.js App Router monolith on Vercel. Postgres for recipes/playlists/sync. Auth.js Google (YouTube readonly + refresh token). Vercel Cron every 6h + on-demand SSE sync. Claude extracts structured recipes from captions. Design tokens/components from `prototype/_ds/.../styles.css` ported as-is.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Organic CSS (no shadcn), Auth.js v5, Drizzle ORM + Neon Postgres, Vercel Cron, Anthropic Claude API, Lucide icons (stroke 2.75).

**Execution model:** Parallel wherever file ownership does not overlap. Serial only at explicit **merge points (M\*)**.

---

## Global Constraints

- UI spec = prototype screens; do not invent layouts/copy.
- Port `_ds/.../styles.css` as the design system; no hard-coded hex/spacing the tokens already define.
- Google sign-in only; email/password button visible but disabled.
- Notes + verified/confidence never on public share page.
- Never overwrite `verified` recipes on re-extract.
- Dead videos: keep recipe, disable links, cache thumbnails at sync.
- Mobile first-class: collapsed video by default, cook controls 64px bottom, hit targets ≥44px.
- Out of scope: email auth, shopping lists, serving scaling, cooked log, collection shares, custom domain, per-playlist library filter.
- Repo starts greenfield (only `prototype/` today).
- **Extractor:** Claude (Anthropic). Keep `lib/extract/` interface swappable later.

---

## Parallel execution rules

### When to use worktrees

| Situation | Worktree? |
| --- | --- |
| ≥2 agents **writing** at the same time | **Yes** — `isolation: "worktree"` or manual `git worktree add` |
| One agent writing; others read-only (review/explore) | No |
| Serial handoff (finish track → merge → next) | No |
| Two tracks with **disjoint owned paths** | Still **Yes** if both write — package.json/lockfile collisions still happen; merge carefully |

### File ownership (critical)

Each parallel track owns exclusive paths. **Do not edit another track’s paths** until the merge point. Shared files (`package.json`, `app/layout.tsx`, `middleware.ts`) only change on the track marked **owner**, or in a dedicated merge PR.

| Path prefix | Owner track |
| --- | --- |
| `styles/`, `app/(auth)/`, root scaffold, `.env.example`, `vercel.json` skeleton | **T0** (serial bootstrap) |
| `lib/db/`, `lib/crypto.ts`, `lib/auth.ts`, `app/api/auth/`, `middleware.ts` | **T1 Platform** |
| `lib/types/`, `lib/categories.ts`, `lib/format.ts`, `lib/fixtures/` | **T2 Contracts** (shared types/fixtures — land early) |
| `lib/extract/`, `tests/extract/` | **T3 Extract** |
| `lib/youtube/`, `app/api/playlists/`, `components/settings/PlaylistPicker*` | **T4 YouTube** |
| `lib/sync/`, `app/api/sync/`, `app/api/cron/`, `components/sync/` | **T5 Sync** |
| `app/(app)/page.tsx`, `components/library/`, `lib/search.ts`, `app/api/recipes/` (list) | **T6 Library UI** |
| `app/(app)/recipes/`, `components/recipe/`, `components/cook/`, `app/api/recipes/[id]/` | **T7 Recipe + Cook UI** |
| `app/r/`, `app/api/share/`, `app/api/export/`, `app/api/prefs/`, share/export settings UI | **T8 Share + Export + Prefs** |
| README, deploy, mobile polish, rate limits | **T9 Ship** |

**Conflict-prone files** (single writer only):

- `package.json` / lockfile → T0 creates; later tracks add deps in their PR with rebase
- `app/layout.tsx`, `app/(app)/layout.tsx` → T0 creates shell; T1 may add session provider; UI tracks only add imports via merge PR if needed
- `lib/db/schema.ts` → **T1 only**; other tracks consume types, never reshape columns without a schema PR

### Shared contracts (land first so UI can mock)

After M0, **T2** should merge ASAP so parallel UI tracks share one source of truth:

```ts
// lib/types/recipe.ts — canonical client/server shapes
type Ingredient = { qty: string; name: string; inferred: boolean };
type Step = { n: number; text: string; t_seconds: number };
type Recipe = {
  id: string;
  video_id: string;
  title: string;
  video_title: string;
  channel_title: string;
  thumbnail_url: string | null;
  cuisine: string | null;
  main_ingredient: string | null;
  cook_minutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
  verified: boolean;
  video_status: "ok" | "gone" | "off_playlist";
  uploaded_at: string | null;
  added_at: string;
  archived_at: string | null;
};
type UserPrefs = {
  layout: "single" | "split";
  timestamps: boolean;
  newShelf: boolean;
  customCuisines?: string[];
  customMains?: string[];
};
type ExtractedRecipe = {
  title: string;
  cuisine: string | null;
  main_ingredient: string | null;
  cook_minutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: { text: string; t_seconds: number }[];
  confidence: "high" | "medium" | "low";
};
```

`lib/fixtures/recipes.ts` — port prototype `RAW` sample data so T6/T7/T8 build UI without DB.

UI tracks use a **data adapter**:

```ts
// lib/data/recipes.ts — swap implementation at M3
export async function listRecipes(params): Promise<Recipe[]>
export async function getRecipe(id): Promise<Recipe | null>
```

- Pre-M3: fixture adapter  
- Post-M3: API/DB adapter  

### Merge points

| ID | Name | Unblocks | Gate |
| --- | --- | --- | --- |
| **M0** | Bootstrap | All tracks | `next dev` runs; Organic CSS loaded; empty app shell |
| **M1** | Contracts | T3–T8 typed against shared shapes | `lib/types/*` + fixtures + categories merged |
| **M2** | Platform | T4, T5 need auth token + DB | Google login works; schema migrated; refresh token stored |
| **M3** | Data plane | Live library | Playlists selectable + sync writes ≥1 real recipe |
| **M4** | Product loop | Share polish optional | Library + recipe + cook work on live data |
| **M5** | v1 ship | — | Share, export, prefs, mobile, prod deploy |

### DAG (who runs when)

```
                    ┌──── T0 Bootstrap ────┐
                    │         M0           │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   T2 Contracts       │  (fast; merge first)
                    │         M1           │
                    └──────────┬───────────┘
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌────────────┐      ┌────────────┐      ┌────────────┐
    │ T1 Platform│      │ T3 Extract │      │ T6 Library │
    │   (auth+db)│      │ (Claude)   │      │ UI+fixtures│
    └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
          │ M2                │                  │
          │                   │            ┌─────┴──────┐
          │                   │            ▼            ▼
          │                   │     ┌────────────┐ ┌────────────┐
          │                   │     │ T7 Recipe  │ │ T8 Share   │
          │                   │     │ + Cook UI  │ │ Export Prefs│
          │                   │     └─────┬──────┘ └─────┬──────┘
          ▼                   │           │              │
    ┌────────────┐            │           │              │
    │ T4 YouTube │◄───────────┘           │              │
    │ playlists  │   (uses ExtractedRecipe│types only)   │
    └─────┬──────┘                        │              │
          │                               │              │
          ▼                               │              │
    ┌────────────┐                        │              │
    │ T5 Sync    │◄── needs T1+T3+T4      │              │
    │ + cron     │                        │              │
    └─────┬──────┘                        │              │
          │ M3                            │              │
          └───────────────┬───────────────┴──────┬───────┘
                          ▼                      │
                   wire fixtures → live API      │
                          │ M4                   │
                          └──────────┬───────────┘
                                     ▼
                              ┌────────────┐
                              │ T9 Ship    │
                              │    M5      │
                              └────────────┘
```

**Max parallel after M1:** up to **4 agents** — T1, T3, T6, and (after T6 page shells exist or independently) T7/T8 with fixtures.  
**After M2:** T4 can join; T5 waits for T1+T3+T4.  
**T7 and T8** may start right after M1 on fixtures (parallel with T1/T3).

### Recommended agent waves

| Wave | Parallel tracks | Worktrees | Merge to main |
| --- | --- | --- | --- |
| **W0** | T0 alone | No | M0 |
| **W1** | T2 alone (or same agent as T0) | No | M1 |
| **W2** | T1 ∥ T3 ∥ T6 ∥ T7 ∥ T8 | **Yes** (one worktree per track) | Each track PR; rebase on main |
| **W3** | T4 (after M2) ∥ continue unfinished UI | Yes | — |
| **W4** | T5 alone (or with UI polish that doesn’t touch `lib/sync`) | Optional | M3 |
| **W5** | Integration: replace fixture adapter with live APIs | **One** agent | M4 |
| **W6** | T9 ship | No | M5 |

**Do not** run T5 in parallel with T1 schema edits.  
**Do not** let two agents edit `package.json` without sequential rebase.

---

## Product snapshot (from prototype)

| Screen | Route (app) | Key behavior |
| --- | --- | --- |
| Login | `/login` | Google CTA; stub email |
| Library | `/` | Search, cuisine/main chips, sort+dir, Library/Archive, optional Newly added shelf, cards |
| Recipe | `/recipes/[id]` | Single scroll \| ingredients pinned; edit→verified; share; archive; cook; video expand; notes |
| Cook mode | `/recipes/[id]/cook` | One step @ 34px, progress dots, wake lock, 64px back/next |
| Sync | `/sync` | Watching playlists, last/next, Sync now + live stages, counters, history table |
| Settings | `/settings` | Account, multi-playlist select, prefs, disappear policy (copy only), shares kill list, export, categories |
| Public share | `/r/[slug]` | SSR, no auth, no notes/flags, attribution, noindex |

---

## Stack (locked)

| Decision | Choice |
| --- | --- |
| Hosting | Vercel |
| DB | Neon Postgres |
| ORM | Drizzle |
| Auth | Auth.js v5 + Google (`youtube.readonly`, offline refresh) |
| Sync | Cron + on-demand SSE; resume-friendly per-video extract |
| LLM | Claude (Anthropic Messages API) |
| Transcripts | Timed caption cues (youtubei.js or equivalent) |
| UI | Organic CSS + Lucide 2.75 |

Alternatives: Inngest if bulk extract hits serverless timeouts; Grok later via extract interface.

---

## Target repo layout

```
app/
  (auth)/login/page.tsx
  (app)/layout.tsx
  (app)/page.tsx
  (app)/recipes/[id]/page.tsx
  (app)/recipes/[id]/cook/page.tsx
  (app)/sync/page.tsx
  (app)/settings/page.tsx
  r/[slug]/page.tsx
  api/auth/[...nextauth]/route.ts
  api/recipes/...
  api/playlists/route.ts
  api/sync/...
  api/prefs/route.ts
  api/export/route.ts
  api/share/[slug]/route.ts
  api/cron/sync/route.ts
  api/cron/purge/route.ts
components/
  library/  recipe/  cook/  sync/  settings/  nav/
lib/
  types/          # T2 — shared contracts
  fixtures/       # T2 — prototype sample data
  data/           # adapter (fixtures → live)
  db/  auth.ts  crypto.ts
  youtube/  extract/  sync/
  search.ts  categories.ts  format.ts
styles/organic.css
middleware.ts
drizzle.config.ts
vercel.json
```

---

## Data model (T1 owns; match HANDOFF)

Tables: `users`, `playlists`, `recipes`, `share_links`, `sync_runs`, `recipe_tombstones` (preferred on purge).

Recipe: `ingredients` / `steps` jsonb, `confidence`, `verified`, `video_status`, `archived_at`, generated `search` tsvector + GIN, unique `(user_id, video_id)`.

User `prefs` jsonb: `{ layout, timestamps, newShelf, customCuisines?, customMains? }`.

Encrypt `refresh_token` AES-GCM with `TOKEN_ENCRYPTION_KEY`.

---

## API contract

```
GET    /api/recipes?q=&cuisine[]=&main[]=&sort=added|uploaded|time&dir=asc|desc&view=library|archive
GET    /api/recipes/:id
PATCH  /api/recipes/:id
POST   /api/recipes/:id/verify | archive | restore | share
DELETE /api/recipes/:id
DELETE /api/share/:slug
GET|PUT /api/playlists
POST   /api/sync          # SSE
GET    /api/sync/history
PUT    /api/prefs
GET    /api/export?format=json|markdown
GET    /r/:slug
```

Session required except public share. Cron: `Bearer CRON_SECRET`.

---

## Sync pipeline (T5; uses T3 + T4)

1. `playlistItems.list` paginated; early stop when known ids (full crawl first run).
2. Skip tombstone/archive `video_id`; else extract path.
3. No transcript → skip + count in `sync_runs.detail` (not in library until success).
4. Claude JSON; step timestamps from cues; `inferred` qtys.
5. Never overwrite verified.
6. Reconcile `off_playlist` / `gone`; never auto-delete recipe.
7. Cache thumbnail URL at write.
8. Purge archived >30d → tombstone so sync won’t resurrect.
9. Quota batching; `result = 'quota hit'` on failure.

SSE stages match prototype copy.

---

## UI notes

- Organic CSS port; Lucide stroke 2.75.
- Layouts: `single` | `split` (sticky ingredients).
- Inferred qty → brackets in UI.
- Cook wake lock API; 64px bottom controls.
- Gone video: disable watch; plain-text old timestamps.
- Share slug `{title}-{4hex}`; never reuse after revoke.
- Export includes notes; public page never does.

---

## Tracks (detail)

### T0 — Bootstrap (serial)

**Owns:** scaffold, `styles/organic.css`, root layout, login static shell, `.env.example`, `vercel.json` skeleton.

**Done when (M0):** `next dev` shows Organic login page matching prototype structure.

- [ ] `create-next-app` (TS, App Router)
- [ ] Copy DS `styles.css` → `styles/organic.css`; import in root layout
- [ ] Static `/login` (Google button wired later by T1)
- [ ] `.env.example` with all keys
- [ ] Commit → merge M0

### T2 — Contracts + fixtures (serial, fast; right after M0)

**Owns:** `lib/types/`, `lib/fixtures/`, `lib/categories.ts`, `lib/format.ts` (time labels, slug helper pure fns), `lib/data/` adapter interface + fixture impl.

**Done when (M1):** other tracks can import `Recipe`, fixtures, categories without inventing shapes.

- [ ] Types as above
- [ ] Port prototype RAW → fixtures (3–9 recipes incl. gone/off_playlist cases)
- [ ] `formatQty`, `youtubeStepUrl`, `slugifyTitle` pure helpers + unit tests
- [ ] Commit → merge M1 **before** large W2 fan-out

### T1 — Platform: auth + DB

**Depends:** M0, ideally M1  
**Parallel with:** T3, T6, T7, T8  
**Owns:** `lib/db/*`, `lib/auth.ts`, `lib/crypto.ts`, `app/api/auth/*`, `middleware.ts`, Settings account card only

**Done when (M2):** Google login; user row; encrypted refresh token; middleware guards app routes.

- [ ] Drizzle schema + migrate all tables
- [ ] Auth.js Google offline + youtube.readonly
- [ ] Middleware: guest → `/login`; authed `/login` → `/`
- [ ] Sign out on Settings account row
- [ ] Commit PR → M2

### T3 — Extract (Claude)

**Depends:** M1 (types)  
**Parallel with:** T1, T6–T8  
**Owns:** `lib/extract/*`, `tests/extract/*`, fixture transcript files  
**Does not need:** live YouTube or DB

**Done when:** `extractRecipe(transcriptCues) → ExtractedRecipe` validates with Zod; tests green on fixtures.

- [ ] Prompt + Messages API call
- [ ] Zod schema for `ExtractedRecipe`
- [ ] Retry once on invalid JSON
- [ ] Unit tests with canned caption cues
- [ ] Commit PR (merge anytime after M1)

### T4 — YouTube playlists

**Depends:** M2  
**Parallel with:** unfinished UI; **before** T5  
**Owns:** `lib/youtube/*`, `app/api/playlists/*`, Settings playlist picker UI pieces

**Done when:** list user playlists; multi-select persists in `playlists` table.

- [ ] OAuth token refresh → Data API client
- [ ] `GET/PUT /api/playlists`
- [ ] Settings multi-select matching prototype
- [ ] Commit PR

### T5 — Sync engine

**Depends:** M2 + T3 merged + T4 merged  
**Parallel with:** UI polish only if paths disjoint  
**Owns:** `lib/sync/*`, `app/api/sync/*`, `app/api/cron/*`, Sync page live wiring

**Done when (M3):** Sync Now writes ≥1 real recipe; history row; cron routes exist.

- [ ] Pipeline + `sync_runs`
- [ ] Transcript fetch → T3 extract → insert
- [ ] Reconcile status + thumbnail URL
- [ ] POST SSE stages; GET history
- [ ] Cron sync + purge
- [ ] Tests: tombstone skip, verified no-overwrite
- [ ] Commit PR → M3

### T6 — Library UI (fixtures first)

**Depends:** M1  
**Parallel with:** T1, T3, T7, T8  
**Owns:** `app/(app)/page.tsx`, `components/library/*`, list query UI, Archive view UI, New shelf UI  
**Uses:** fixture adapter until M3/M4

**Done when:** Library matches prototype against fixtures (search, chips, sort, archive empty/full).

- [ ] Filters + sort + dir
- [ ] RecipeCard grid
- [ ] Newly added shelf (prefs prop)
- [ ] Archive list UI (restore/delete handlers stubbed or local state pre-M4)
- [ ] Commit PR

### T7 — Recipe + Cook UI (fixtures first)

**Depends:** M1  
**Parallel with:** T1, T3, T6, T8  
**Owns:** `app/(app)/recipes/**`, `components/recipe/*`, `components/cook/*`

**Done when:** Detail both layouts, edit mode, notes, video expand, cook mode + wake lock on fixtures.

- [ ] Recipe header, ingredients, steps, timestamps
- [ ] Edit → local verified state (wire API at M4)
- [ ] Cook mode UI + wake lock
- [ ] Gone video presentation
- [ ] Commit PR

### T8 — Share, export, prefs UI (+ public page)

**Depends:** M1  
**Parallel with:** T1, T3, T6, T7  
**Owns:** `app/r/[slug]`, share panel, Settings prefs/export/shares/categories sections, later `app/api/prefs|export|share`

**Done when:** Public page correct stripping on fixture recipe; export generators pure functions; prefs UI; kill-link UI.

- [ ] Public SSR page layout (can mock data fetch until M4)
- [ ] Share panel UI
- [ ] Prefs segmented controls
- [ ] Export JSON/MD pure builders + tests
- [ ] Categories + Add chip UI
- [ ] API routes can land in same track **after M2** or in integration wave
- [ ] Commit PR(s)

### Integration wave (M3 → M4)

**One agent** (or carefully sequenced):

- [ ] Point `lib/data/*` at live APIs
- [ ] Wire Library/Recipe/Cook mutations (PATCH, archive, share)
- [ ] Wire Sync page to SSE
- [ ] Wire Settings playlists/prefs/shares to APIs
- [ ] Drop fixture-only paths from prod entry (keep fixtures for Story/tests)
- [ ] E2E manual: login → playlist → sync → cook → share → revoke
- [ ] Commit → M4

### T9 — Ship (M5)

- [ ] Mobile pass vs `Recipe App Mobile.dc.html`
- [ ] Empty/error/quota states
- [ ] Manual sync concurrency lock
- [ ] README + prod env + Vercel cron verified
- [ ] Commit → M5 (v1 done)

---

## PR sequence (merge order, parallel-aware)

| PR | Track | Title | Depends | Parallel with |
| --- | --- | --- | --- | --- |
| 1 | T0 | Scaffold + Organic + login shell | — | — |
| 2 | T2 | Shared types + fixtures + helpers | 1 | — |
| 3a | T1 | Auth + Drizzle schema | 2 | 3b–3e |
| 3b | T3 | Claude extract + tests | 2 | 3a, 3c–3e |
| 3c | T6 | Library UI (fixtures) | 2 | 3a, 3b, 3d, 3e |
| 3d | T7 | Recipe + Cook UI (fixtures) | 2 | 3a–3c, 3e |
| 3e | T8 | Share/export/prefs UI (+ pure export) | 2 | 3a–3d |
| 4 | T4 | YouTube playlists API + Settings picker | 3a | leftover UI |
| 5 | T5 | Sync engine + cron + SSE | 3a, 3b, 4 | UI polish only |
| 6 | integ | Wire fixtures → live APIs | 5 + 3c–3e | — |
| 7 | T9 | Polish + deploy | 6 | — |

PRs **3a–3e** are the main parallel fan-out (worktrees).

---

## Env & external setup (can run in parallel with W0–W1)

- [ ] Google Cloud OAuth + YouTube Data API v3
- [ ] Neon database
- [ ] Anthropic API key
- [ ] Vercel project
- [ ] Secrets: `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`

Human/ops task — not blocked by code tracks.

---

## Testing strategy

| Layer | Owner |
| --- | --- |
| Extract unit tests | T3 |
| format/slug/search pure tests | T2 / T6 |
| Sync logic unit tests | T5 |
| Export builders | T8 |
| Integration E2E manual | Integration wave |
| Visual vs prototype | T6–T8 + T9 |

**v1 done when:**

1. Google sign-in; refresh token stored  
2. Playlist select + Sync Now → real recipes with timed steps  
3. Library search/filter/sort  
4. Edit sets verified; re-sync does not clobber  
5. Cook mode + wake lock  
6. Share public, no notes; kill → 404  
7. Gone video keeps recipe  
8. Mobile ~412px usable  

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Parallel PR conflicts | Strict path ownership; rebase; one writer for schema/package.json |
| Fixture/live shape drift | T2 types mandatory; adapter single boundary |
| Vercel timeout bulk extract | Per-video steps + resume; Inngest later |
| No captions | Skip + Sync counter |
| Two agents edit layout | Only T0/T1 touch root layouts |

---

## Open decisions (defaults)

1. Drizzle + Neon  
2. Claude for extract  
3. No-transcript → not in library  
4. Thumbnail URL only (no blob host) v1  
5. Parallel max ~4 worktrees in W2  

---

## Spec coverage

| HANDOFF | Track(s) |
| --- | --- |
| Login Google | T0 shell, T1 live |
| Library | T6 → integ |
| Recipe / cook | T7 → integ |
| Sync | T5 + Sync UI |
| Settings | T1 account, T4 playlists, T8 prefs/export/shares |
| Public page | T8 → integ |
| Data model | T1 |
| Extract | T3 |
| Sync algorithm | T5 |

---

## Prototype assets

| Asset | Use |
| --- | --- |
| `HANDOFF.md` | Spec |
| `Recipe App.dc.html` | Desktop UI |
| `Recipe App Mobile.dc.html` | Mobile |
| `_ds/.../styles.css` | Production CSS |
| `android-frame.jsx`, `support.js` | Discard |

Do **not** port dc-runtime — reimplement in React/Next.

---

## How to kick off parallel implementation

1. Run **T0 → M0**, then **T2 → M1** (one agent, main branch).  
2. Spawn up to **4–5 worktree agents** for **T1, T3, T6, T7, T8** with this plan + path ownership pasted into each prompt.  
3. Merge PRs as they pass; keep `main` green.  
4. After **M2**, run **T4**, then **T5**.  
5. Single integration agent for **M4**, then **T9**.

If only one agent available: order T0 → T2 → T1 → T3 → T4 → T5 → T6 → T7 → T8 → integ → T9 (still valid; parallel is optional acceleration).
