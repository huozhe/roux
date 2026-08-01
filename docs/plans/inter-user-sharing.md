# Inter-user recipe sharing — design

**Status:** **ACCEPTED** (2026-08-01) — implementation may proceed on §7  
**Date:** 2026-08-01  
**Author:** @grok-builder  
**Reviewer:** @claude-reviewer · product calls: @owner  

Design accepted after PR #7 review. Owner rulings and reviewer addenda are folded into §§4, 8, and 10 below.

---

## 1. Problem

Today Roux has **public-by-slug** sharing only:

```
share_links: { slug PK, recipeId, createdAt, revokedAt }
GET /r/[slug]  → anyone with the URL (noindex, notes stripped)
```

That is a **link**, not a **share with a person**. The owner’s next phase needs **multiple users and real sharing between users inside the app** — a different product:

| | Public slug (today) | Inter-user share (needed) |
|---|---|---|
| Who can read | Anyone with URL | Named recipient(s) only |
| Auth | None | Signed-in app user |
| Discovery | Out-of-band URL | In-app inbox / library surface |
| Authz | “slug exists + not revoked” | `recipient_user_id = session` (or equivalent) |
| Revoke | Kill slug | Remove grant (and optionally kill slug if kept) |

**SEC-5** (4-hex slug entropy) is **subsumed** by this design: if primary sharing is recipient-based, public slug entropy is a secondary concern for the optional link path only.

---

## 2. Goals / non-goals

### Goals (v1 of inter-user share)

1. Owner **A** can grant recipe **R** to user **B** (by email / account already in `roux.users`).
2. **B** can open **R** while signed in — ingredients, steps, timestamps, video metadata.
3. **Notes and verified** stay private to the owner forever (same as public page).
4. Owner can **revoke** the grant; B immediately loses access.
5. Grants are **read-only** for the recipient (no edit of owner’s recipe, no re-share in v1).
6. Authz is tested with the **pglite suite** (query + preferably route layer when routes land).

### Non-goals (v1)

- Collaborative editing / shared notes / co-owned recipes  
- Groups, families, or “share with anyone @domain.com”  
- Push notifications / email invites to non-users (see open questions)  
- Copy-on-write fork into B’s library as a first-class “claim” (optional later)  
- Shopping lists, collections, multi-recipe packs  

---

## 3. Options considered

### A — Extend `share_links` with `recipientUserId`

Add nullable `recipient_user_id`. Null = public slug; set = private grant.

**Pros:** one table, one revoke column.  
**Cons:** conflates two products; slug still required for grants; awkward uniqueness; public and private code paths entangle.

### B — New `recipe_grants` table (recommended)

Keep `share_links` for optional public links. New table for person-to-person grants.

```text
roux.recipe_grants (
  id            uuid PK
  recipe_id     uuid NOT NULL → recipes
  owner_user_id uuid NOT NULL → users   -- denormalized for fast “my outgoing”
  recipient_user_id uuid NOT NULL → users
  created_at    timestamptz NOT NULL
  revoked_at    timestamptz NULL
  UNIQUE (recipe_id, recipient_user_id) WHERE revoked_at IS NULL
    -- or app-level: one active grant per (recipe, recipient)
)
```

**Pros:** clean authz predicate; public slug optional and independent; SEC-5 only applies to public path.  
**Cons:** two concepts in UI (“Link” vs “Share with…”).

### C — Copy recipe into recipient’s library

On share, insert a recipe row for B pointing at same video / frozen extract.

**Pros:** B’s library UX is uniform.  
**Cons:** sync/ownership/verified/notes semantics explode; double extract risk; not what “share” means for a living source.

**Recommendation: B.**

---

## 4. Proposed model (option B)

### 4.1 Data

| Entity | Role |
|---|---|
| `recipes` | Owned by exactly one `user_id` (unchanged). |
| `share_links` | Optional **public** link. Keep v1 behavior; increase entropy when touching (SEC-5). |
| `recipe_grants` | **Private** grants to signed-in users. |

**Visibility matrix for a recipe row R owned by A:**

| Viewer | R active | A archives R | A soft-deletes R |
|---|---|---|---|
| A (owner) | Full (notes/verified) | Still full (in archive view) | Gone |
| B with active grant | Stripped read | **No access** (grant row stays; unarchive restores) | **No access** |
| B without grant | No | No | No |
| Anon + valid public slug | Stripped read | **Still readable** (link = publish, not live library) | No |
| Anon without slug | No | No | No |

**Deliberate asymmetry (pinned):** public slug does **not** filter `archived_at` (current `getSharedRecipeBySlug` behavior — keep). Grants **do** hide archived recipes. Rationale: a public link is *published* (breaking an already-sent URL is surprising; archive means “declutter my library”). A grant is a *live view into my library*, so archive withdraws it. **Do not “fix” this inconsistency without reopening this doc.**

- **Archive is hide, not revoke.** Leave `recipe_grants` row active (`revoked_at` null). Unarchive restores grantee access without re-granting. Test: grant → archive → grantee 404 → unarchive → grantee reads again.
- **Soft-delete** (`deleted_at`): grant path filters it (same as slug path). Prefer cascade/cleanup of grants on hard delete via FK.
- Strip rule reuses `stripRecipeForPublicShare` (already tested) for grantees and public.

**Read API shape (reviewer #1):** add **`getRecipeForViewer(viewerId, id)`** as a **new** function. Keep **`getRecipe` owner-only** (current `owned()` predicate) so write paths that “get then mutate” cannot silently pick up grantee rows. Greppable and opt-in at each call site.

### 4.2 Product surfaces

**Owner (A)**

- Recipe detail: **Share** dialog gains:
  - **Copy public link** (existing slug flow)
  - **Share with person** — input: email of an existing Roux user (v1); create grant
  - List of active grants + revoke
- Settings “Shared links” can list public slugs; grants can live there or under the recipe only (prefer recipe-local for v1).

**Recipient (B)**

- New library section or tab: **Shared with me** (not mixed into “My recipes” by default — avoids sync confusion).
- Opens recipe detail in **read-only** mode (no edit / archive / verify / notes write).
- Cook mode allowed (read-only steps + timestamps).
- URL: keep `/recipes/[id]` for both; detail uses **`getRecipeForViewer`**. Library home lists **only owned** rows; “Shared with me” uses **`listGrantedToMe(viewerId)`** (must also filter archived + deleted).

**List / export (reviewer #3):** `GET /api/recipes` and library export remain **owner-only**. Granted recipes are not “my cookbook.” Do not “fix” list/export to include grants without reopening this doc — detail-read vs list-own is intentional.

### 4.3 API sketch

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/recipes/:id/grants` | Body `{ email }` or `{ userId }`. Owner only. Creates grant. 404 if not owner; 404 if recipient unknown (no user enumeration via different errors — use same 404 for unknown email). |
| `GET` | `/api/recipes/shared` | List grants to me (recipe summary, owner name). |
| `DELETE` | `/api/recipes/:id/grants/:grantId` | Owner revokes. |
| `GET` | `/api/recipes/:id` | Via `getRecipeForViewer`; owner full / grantee stripped; 404 if archived for grantee. |

Existing:

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/recipes/:id/share` | Public slug (unchanged). |
| `DELETE` | `/api/share/:slug` | Revoke public slug. |
| `GET` | `/r/[slug]` | Public page (unchanged). |

### 4.4 Authz predicates (must be in pglite suite)

```
canReadRecipeAsViewer(viewer, recipe) :=
  recipe.deleted_at is null
  AND (
    recipe.user_id = viewer                                    -- owner: archive ok via own views
    OR (
      exists grant (recipe_id, recipient=viewer, revoked_at is null)
      AND recipe.archived_at is null                           -- grantee: no archived
    )
  )

canWriteRecipe(viewer, recipe) :=
  recipe.user_id = viewer AND deleted_at is null   -- grants never write; use getRecipe/owned()

canManageGrants(viewer, recipe) :=
  recipe.user_id = viewer
```

Public slug path stays separate (sessionless); does not use `canReadRecipeAsViewer`.

**Cross-user tests to add when implementing:**

- A grants B → B `getRecipeForViewer` ok (stripped); A still full notes via `getRecipe`  
- B cannot patch/archive/delete/verify A’s recipe  
- A revokes → B null  
- A archives (grant intact) → B null; A unarchives → B reads again  
- A soft-deletes → B null  
- Public slug still reads archived R (asymmetry test)  
- C cannot use B’s grant  
- `listGrantedToMe` excludes archived/deleted  
- List/export endpoints never return granted rows  
- Unknown email on create → **same 404** as not-owner (no enumeration oracle)

### 4.5 SEC-5 (public slug)

When we next touch `makeShareSlug` / share creation:

- Bump to **8 hex** (or 128-bit random) for **new** public links.
- Do not rewrite existing slugs.
- Prefer unguessable random over title-prefixed if product allows uglier URLs; otherwise `title-slug + 8hex`.

Inter-user grants **do not use slugs** for authz — no enumeration surface there.

### 4.6 Rate limits (SEC-4)

Add when routes land:

- `POST .../grants` — tight per-user (e.g. 30/hour) to limit spam grants  
- List endpoints — normal authenticated limits optional  

---

## 5. Invite / recipient resolution — **DECIDED**

**D2 (owner, 2026-08-01): Existing Roux users only.** No email invites, no pending grants, no mail dependency for v1.

Create-grant resolves email → `users` row. If none: **same 404 as not-owner** (no user-enumeration oracle). Owner tells recipient to sign in with Google first if needed.

(Email-invite / pending-grant designs may be revisited later; not in v1 scope.)

### If revisited — the shape, adapted to the shipped grant model

Recorded so a v2 does not re-derive it. Originally worked out in the closed
alternative design (PR #8) against a copy-on-accept model; restated here for
`recipe_grants` as actually built.

1. **Make the recipient nullable, add an email column.**
   `recipient_user_id` becomes nullable; add `recipient_email text`, with
   `CHECK (recipient_user_id IS NOT NULL OR recipient_email IS NOT NULL)`.

2. **Re-key the partial unique index** so a pending email invite and a real
   grant share one uniqueness rule:
   ```sql
   CREATE UNIQUE INDEX recipe_grants_active_unique
     ON roux.recipe_grants (recipe_id, COALESCE(recipient_user_id::text, lower(recipient_email)))
     WHERE revoked_at IS NULL;
   ```
   Keeps "one active grant per (recipe, recipient)" while allowing a re-invite
   after revoke.

3. **Claim on first sign-in.** In the Auth.js `signIn` callback, after the
   `users` upsert, set `recipient_user_id` and clear `recipient_email` for every
   pending row matching `lower(recipient_email) = lower(profile.email)`. Do it
   there rather than lazily on read, so `listGrantedToMe` needs no email branch.

4. **Read paths stay unchanged.** `getRecipeForViewer` and `listGrantedToMe`
   match on `recipient_user_id`, so an unclaimed invite is simply invisible
   until claimed — no second authorization path to keep in sync.

**Watch:** email normalization. `users.email` is stored verbatim from Google and
its unique constraint is case-sensitive, so any invite matching must go through
`lower()` on both sides — or normalize on insert first (see the note on
`createRecipeGrant` in the #10 review).

**Also needed, and absent today:** an outbound mail dependency, an abuse/rate
story for inviting arbitrary addresses, and a decision on whether an invite to a
non-user leaks that the *recipe* exists. v1 sidesteps all three by requiring an
existing account.

---

## 6. UX defaults (proposal)

1. **Shared with me** is a separate shelf/tab on Library — not interleaved with owned recipes (owned rows participate in sync; grants do not).  
2. Recipe page for grantee: no Edit / Notes write / Verify / Remove; keep Cook + timestamps per prefs.  
3. Public link remains available for WhatsApp-to-non-users; inter-user grant is for people who cook in Roux.  
4. Revoking a grant does **not** auto-revoke public slug (and vice versa).

---

## 7. Implementation plan (after approval)

| Step | Work | PR shape |
|---|---|---|
| 1 | Migration `recipe_grants` + Drizzle schema + pglite DDL + drift note | one PR |
| 2 | Query layer: create/list/revoke grant, **new** `getRecipeForViewer` (keep `getRecipe` owner-only), `listGrantedToMe` filters archive/delete | + pglite authz tests |
| 3 | API routes + rate limits | thin |
| 4 | UI: share dialog “Share with…”, Shared shelf, read-only detail | after 2–3 |
| 5 | Optional: SEC-5 8-hex for new public slugs | small, can ride with 3 |

Do **not** start multi-user onboarding / admin until grants work.

---

## 8. Decisions — **settled**

| # | Decision | Ruling | Source |
|---|---|---|---|
| D1 | Model | Separate `recipe_grants` table | accepted |
| D2 | Recipient v1 | **Existing Roux users only** (no email invite) | **@owner** |
| D3 | Permission | Read-only for recipient | accepted |
| D4 | Library UX | Separate “Shared with me” shelf | accepted |
| D5 | Public slugs | Keep optional; raise entropy on next touch | accepted |
| D6 | Notes/verified | Never to grantee or public | product law |
| D7 | Collaborative edit | Out of scope v1 | accepted |
| D8 | Archived + grant | **Hidden from grantees**; grant row not revoked | **@owner** |
| D9 | Archived + public slug | **Still readable** (asymmetry intentional) | review + @owner |
| D10 | Read helper | `getRecipeForViewer` new; `getRecipe` stays owner-only | @claude-reviewer |
| D11 | List/export | Owner-only; grants not included | @claude-reviewer |

---

## 9. Out of scope reminders

- Sharing is not a substitute for multi-tenant extract billing (still one Anthropic key — SEC-4 soft limits remain).  
- ARCH-2 (SQL library path) is independent but more important once libraries grow; still next after this doc ships.  
- CQ-1 (split RecipeDetail) should land **before or with** the share dialog expansion to avoid another 500 lines in one file.

---

## 10. Acceptance — **met (2026-08-01)**

1. @claude-reviewer: no blocking objections (PR #7).  
2. @owner: D2 existing users only; archived hidden from grantees.  
3. §8 settled including D8–D11.

Implementers open PRs per §7. **CQ-1 (split RecipeDetail) before or with share-dialog UI** (step 4).

---

NEXT: @grok-builder — §7 step 1 (migration + schema + pglite DDL).
