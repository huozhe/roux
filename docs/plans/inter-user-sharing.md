# Inter-user recipe sharing — design

**Status:** draft for review (round-2 item 3 on #3)  
**Date:** 2026-08-01  
**Author:** @grok-builder  
**Reviewer:** @claude-reviewer · product calls: @owner  

This doc gates implementation. **No share schema or route changes land until this is accepted.**

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

| Viewer | Can read R? | Notes / verified |
|---|---|---|
| A (owner) | Yes | Full |
| B with active grant | Yes | **Stripped** (same as public) |
| B without grant | No (404) | — |
| Anon with valid slug | Yes via `/r/[slug]` | Stripped |
| Anon without slug | No | — |

Strip rule reuses `stripRecipeForPublicShare` (already tested).

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
- Optional: deep link `/recipes/shared/[grantId]` or `/recipes/[id]` with authz that allows owner **or** grantee.

**Recommendation for URL:** keep `/recipes/[id]` for both; `getRecipe` becomes `getRecipeForViewer(viewerId, id)` that succeeds if owner **or** active grantee. Library home still lists only owned rows; “Shared with me” uses `listGrantedToMe(viewerId)`.

### 4.3 API sketch

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/recipes/:id/grants` | Body `{ email }` or `{ userId }`. Owner only. Creates grant. 404 if not owner; 404 if recipient unknown (no user enumeration via different errors — use same 404 for unknown email). |
| `GET` | `/api/recipes/shared` | List grants to me (recipe summary, owner name). |
| `DELETE` | `/api/recipes/:id/grants/:grantId` | Owner revokes. |
| `GET` | `/api/recipes/:id` | Owner or grantee; grantee payload stripped. |

Existing:

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/recipes/:id/share` | Public slug (unchanged). |
| `DELETE` | `/api/share/:slug` | Revoke public slug. |
| `GET` | `/r/[slug]` | Public page (unchanged). |

### 4.4 Authz predicates (must be in pglite suite)

```
canReadRecipe(viewer, recipe) :=
  recipe.user_id = viewer
  OR exists grant (recipe_id, recipient=viewer, revoked_at is null)
  OR (public slug path — separate, no session)

canWriteRecipe(viewer, recipe) :=
  recipe.user_id = viewer   -- grants never write

canManageGrants(viewer, recipe) :=
  recipe.user_id = viewer
```

**Cross-user tests to add when implementing:**

- A grants B → B can `getRecipe`, A still full notes  
- B cannot patch/archive/delete/verify A’s recipe  
- A revokes → B getRecipe null  
- C cannot use B’s grant  
- List “shared with me” only B’s grants  
- Unknown email on create → same 404 shape as not-owner (no oracle)

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

## 5. Invite / recipient resolution (open product call)

v1 recommendation: **recipient must already have a Roux account** (row in `roux.users` from Google sign-in).

| Approach | Pros | Cons |
|---|---|---|
| **Existing users only (v1)** | Simple, no email infra | A must tell B to sign in first |
| Email invite + pending grant | Better UX | Needs email provider, token, abuse controls |
| Share by Google `sub` / email claim | Aligns with Auth.js | Still need user row for FK |

**Ask @owner:** Is “recipient must already use Roux” acceptable for first ship?

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
| 2 | Query layer: create/list/revoke grant, `getRecipeForViewer`, strip for grantee | + pglite authz tests |
| 3 | API routes + rate limits | thin |
| 4 | UI: share dialog “Share with…”, Shared shelf, read-only detail | after 2–3 |
| 5 | Optional: SEC-5 8-hex for new public slugs | small, can ride with 3 |

Do **not** start multi-user onboarding / admin until grants work.

---

## 8. Explicit decisions to confirm

| # | Decision | Proposal | Owner |
|---|---|---|---|
| D1 | Model | Separate `recipe_grants` table | review |
| D2 | Recipient v1 | Existing Roux users only | **@owner** |
| D3 | Permission | Read-only for recipient | review |
| D4 | Library UX | Separate “Shared with me” shelf | review |
| D5 | Public slugs | Keep optional; raise entropy on next touch | review |
| D6 | Notes/verified | Never to grantee or public | already product law |
| D7 | Collaborative edit | Out of scope v1 | review |

---

## 9. Out of scope reminders

- Sharing is not a substitute for multi-tenant extract billing (still one Anthropic key — SEC-4 soft limits remain).  
- ARCH-2 (SQL library path) is independent but more important once libraries grow; still next after this doc ships.  
- CQ-1 (split RecipeDetail) should land **before or with** the share dialog expansion to avoid another 500 lines in one file.

---

## 10. Acceptance of this doc

This design is accepted when:

1. @claude-reviewer has no blocking objections (or they are resolved in-thread).  
2. @owner confirms **D2** (existing users only vs email invite).  
3. Checklist in §8 is either agreed or explicitly overridden.

Then implementers open PRs per §7 only.

---

NEXT: @claude-reviewer + @owner — confirm D1–D7, especially D2.
