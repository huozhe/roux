# Multi-user sharing — design proposal

**Status:** proposal, not agreed
**Author:** Claude (reviewer) · **For review by:** Grok (implementer) · **Decisions by:** owner
**Tracks:** issue #3 round-2 item 3 · supersedes part of SEC-5

> This is deliberately written by the *reviewer* rather than the implementer, to keep an independent check on the design the same way code has had one. **Challenge it.** The sections marked **OWNER DECISION** are product calls that aren't mine to make; the sections marked **RECOMMEND** are mine and are meant to be argued with.

---

## 1. Goal

Let a Roux user share a recipe with another Roux user, inside the app.

**Non-goals for v1** (call them out now so they don't creep in): public discovery/browse, comments, following, real-time collaborative editing, sharing whole playlists or collections, and re-sharing (B forwarding A's recipe to C).

---

## 2. Why the current mechanism doesn't extend

```ts
share_links = { slug PK, recipeId → recipes CASCADE, createdAt, revokedAt }
```

Three properties make this a *publishing* mechanism, not a *sharing* one:

1. **No recipient.** Authorization is "possession of the URL." There is nowhere to record who it was shared with, so there's nothing to revoke per-person and nothing to render as "shared with you."
2. **Anonymous read.** `getSharedRecipeBySlug` takes no `userId` and is reachable unauthenticated at `/r/[slug]`.
3. **Deliberately lossy.** It strips `notes` and forces `verified: false` — correct for a public link, but it means the mechanism can never carry owner-private context even when we might want it to.

**RECOMMEND: keep it, unchanged, alongside the new model.** It solves a real and different problem — sending a recipe to someone who has no account. Retiring it would break existing links for no benefit.

*This also resolves SEC-5.* The 4-hex slug stays low-entropy, but it stays attached to the *low-stakes* public-publishing path, while genuinely private sharing moves to an authenticated model with no guessable identifier. SEC-5 can close as "superseded" rather than being fixed.

---

## 3. The central choice: reference vs. copy

Everything else follows from this, so decide it first.

### Option A — Reference

A row in `recipe_shares` grants user B read access to user A's `recipes` row. One copy of the data.

- Owner edits propagate instantly. Storage stays flat.
- **Every read predicate must change.** `owned()` at `queries.ts:83` becomes "owned OR shared-to-me," and the 8 `eq(recipes.userId, …)` sites plus 16 `userId`-taking functions need auditing. That's the entire authz surface the pglite suite was just written against.
- Owner deletes → recipient loses it with no warning.
- "Whose is this?" becomes a live question in every query, every export, every sync pass.

### Option B — Copy-on-accept **← RECOMMEND**

Accepting a share **inserts a new `recipes` row owned by B**, with provenance columns pointing back.

- **Every existing query stays correct, untouched.** `owned()` still means what it says; the pglite authz matrix keeps holding; ARCH-2's SQL path doesn't need re-derivation. This is worth a great deal — the ownership model is the thing we just spent a round hardening.
- B can edit, annotate, archive, and delete freely without touching A's copy. Matches the mental model of a cookbook: you copy a recipe into *your* book.
- Owner deleting theirs doesn't yank B's.
- **Cost:** no propagation. If A fixes a typo after sharing, B keeps the old text. And storage duplicates (~2–5 KB of jsonb per recipe — negligible at this scale).

**Why B despite losing propagation:** the codebase's single strongest property is that *everything* is `userId`-scoped — `recipes`, `playlists`, `sync_runs`, `recipe_tombstones`, `caption_skips`, prefs. Option A breaks that invariant everywhere at once, in the exact layer that just got its first security tests. Option B preserves it and confines the new surface to one table plus one accept path.

Propagation is also not obviously wanted: if B has adjusted quantities, A's later edit overwriting them is a *bug*, not a feature.

> **OWNER DECISION:** if live propagation is a hard requirement, say so now — it changes the whole design and roughly triples the authz work.

---

## 4. Data model (assuming Option B)

```sql
CREATE TABLE roux.recipe_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     uuid NOT NULL REFERENCES roux.recipes(id) ON DELETE CASCADE,
  from_user_id  uuid NOT NULL REFERENCES roux.users(id)   ON DELETE CASCADE,
  to_user_id    uuid          REFERENCES roux.users(id)   ON DELETE CASCADE,
  to_email      text,                    -- invite before the recipient has an account
  message       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  declined_at   timestamptz,
  revoked_at    timestamptz,
  accepted_recipe_id uuid REFERENCES roux.recipes(id) ON DELETE SET NULL,
  CONSTRAINT recipient_present CHECK (to_user_id IS NOT NULL OR to_email IS NOT NULL)
);

CREATE UNIQUE INDEX recipe_shares_pending
  ON roux.recipe_shares (recipe_id, COALESCE(to_user_id::text, lower(to_email)))
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;
```

Plus provenance on `recipes`:

```sql
ALTER TABLE roux.recipes
  ADD COLUMN shared_from_user_id uuid REFERENCES roux.users(id) ON DELETE SET NULL,
  ADD COLUMN shared_from_recipe_id uuid,   -- intentionally no FK: survives owner deletion
  ADD COLUMN shared_at timestamptz;
```

Notes on specific choices:

- **`to_email` for invites.** `users.email` is unique and everyone is a Google account, so email is a natural handle and lets you share with someone who hasn't signed up yet. Claim on first sign-in by matching `lower(email)`.
- **Partial unique index** prevents duplicate pending invites without blocking a legitimate re-share after decline or revoke.
- **`shared_from_recipe_id` has no FK** on purpose — provenance should survive the owner deleting their copy. A dangling id is the correct outcome; a `SET NULL` cascade would erase history.
- **No new columns on `recipes` are read by existing queries**, so `SELECT *` paths and `rowToRecipe` keep working. Add them to the mapper only where the UI needs them.

---

## 5. Authorization rules

**RECOMMEND, and I'd like these stated as invariants the tests assert, not as prose:**

1. **Creating a share requires ownership.** `shareToUser(fromUserId, recipeId, …)` must resolve the recipe through the existing `owned()` predicate. Anything else lets A share B's recipe.
2. **Reading a *pending* share requires being the recipient.** Recipient is `to_user_id = me` OR `lower(to_email) = lower(my email)`. Never slug-guessable, never anonymous.
3. **Accepting is the only path that writes a recipes row for B**, and the row it writes is `userId = B` — no exceptions, no admin path.
4. **Writes never widen.** Read access via share grants *nothing* on the source row. `patchRecipe`, `archiveRecipe`, `deleteRecipe`, `verifyRecipe` stay owner-only, unchanged.
5. **`notes` never crosses users.** The copy starts with `notes = NULL`. Consistent with `stripRecipeForPublicShare`, and notes are the one field explicitly framed as private throughout.
6. **`verified` does not cross.** The copy starts `verified = false` — A's verification is A's judgement about A's copy.
7. **Revoking a pending share** makes it unreadable. Revoking an **accepted** share does nothing to B's copy — it's B's row now. This must be explicit in the UI or it's a privacy surprise.

### The collision case that will bite

`recipes` has `UNIQUE (user_id, video_id)`. If B already has a recipe for that video, accept **cannot** insert.

> **OWNER DECISION.** Options: (a) reject with "you already have this recipe" — simplest, honest; (b) accept as a duplicate under a relaxed constraint — I'd avoid, it breaks sync's assumption of one row per video per user; (c) offer to overwrite B's copy — destructive, needs a confirm.
> **RECOMMEND (a).**

### The sync interaction that will bite

B accepts a share for video X. Later X appears in B's own playlist. Sync sees an existing row for `(B, X)` and applies `canWriteExtract`: the copy is `verified = false`, so **sync will overwrite the shared copy with a fresh extraction.**

> **RECOMMEND:** treat `shared_at IS NOT NULL` as skip-worthy in `shouldSkipVideo`/`canWriteExtract`, *or* set `verified = true` on accept. The first is more honest — it says "this row came from a human, don't regenerate it." Either way this needs a test, because the failure is silent data loss of the thing that was shared.

---

## 6. Open questions — **OWNER DECISION**

1. **Does an accepted recipe land in the main library, or a separate "Shared with me" surface?** Affects UX-3's payload argument and whether `listRecipes` needs a filter.
2. **Invite by email only, or also a display-name/handle search?** Email is simplest and avoids building a user-directory (which is its own privacy surface).
3. **Notification?** In-app badge only, or email? Email means an outbound mail dependency the app doesn't currently have.
4. **Can B re-share A's recipe to C?** Non-goal above, but if it's wanted the provenance chain needs designing now, not later.

---

## 7. What I'll review against

So the bar is known before implementation, not after:

- Every rule in §5 has a test in the pglite suite, extending `authz.integration.test.ts`
- Specifically: A cannot share B's recipe · non-recipient cannot read a pending share · accept writes a row owned by the acceptor and nobody else · accepted copy has `notes = NULL` and `verified = false` · revoke-after-accept leaves B's row intact · duplicate-video accept behaves per the owner's choice, deterministically
- The sync-overwrite case in §5 is covered by a test, not an assumption
- No new `any` in the authz path
- New routes call `requireUserId` — and given TEST-1's known gap (query-layer coverage only), **this is the feature where route-level tests should finally be added**
- Rate limiting on the invite endpoint (it's an outbound-notification and user-enumeration surface — SEC-4's pattern applies)
- `.env.example` updated if any new config appears

---

## 8. Rollout

1. Migration `0004`: `recipe_shares` + provenance columns. Additive only — no existing column changes, so it's safe to apply ahead of the UI.
2. Query layer + authz tests **before** any UI. The pglite suite makes this cheap now.
3. Routes, then UI.
4. `.claude/STATE.md` and `docs/reviews/…` unchanged — this doc is the spec of record.

---

## 9. What this deliberately does *not* solve

Live propagation of owner edits · group/team sharing · re-sharing · public discovery. All are compatible with this model later; none should be smuggled into v1.
