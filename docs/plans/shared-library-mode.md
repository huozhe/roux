# Shared library mode — whole-library guest links

**Status:** **SHIPPED** (2026-09-07)
**Author:** @claude
**Product calls:** @owner

Third sharing product in Roux, alongside two that already existed:

| | Public slug `/r/[slug]` | Inter-user grant | **Guest link `/s/[token]`** |
|---|---|---|---|
| Scope | One recipe | One recipe | **Whole library** |
| Who | Anyone with the URL | A named Roux user | **A named guest, no account** |
| Auth | None | Signed-in session | **Token in the URL** |
| Revoke | Kill the slug | Remove the grant | **Cut off one guest** |

## 1. Decisions

- **No account, no cookie, no session.** The token is the whole credential and
  lives in the URL path, so every guest URL is deep-linkable and revocation is
  a single `UPDATE`. Nothing to expire, nothing to log out of.
- **128-bit token** (`randomBytes(16).toString("hex")`), no title prefix. The
  8-hex `makeShareSlug` used for `/r/` was flagged as SEC-5; a link that opens
  a whole library gets full entropy.
- **One row per guest**, with a display label ("Mum"). Cutting off one guest
  leaves every other link working.
- **Guests see the live shelf**: non-archived, non-deleted recipes, ordered
  newest-first. New recipes appear as sync adds them.
- **Notes and verified never travel** — reuses `stripRecipeForPublicShare`,
  the same guarantee the public page and grants already make.
- **Archive stays private.** It is the owner's holding pen, not the cookbook.

## 2. Schema

`roux.library_shares` (migration `0005_library_shares.sql`):

```text
token       text PK          -- 32 hex chars = 128 bits
user_id     uuid NOT NULL → roux.users ON DELETE CASCADE
label       text NOT NULL DEFAULT ''   -- display only, capped at 60 chars
created_at  timestamptz NOT NULL
revoked_at  timestamptz NULL
INDEX (user_id)
```

Deliberately absent: expiry and last-viewed. Neither was asked for, and both
add a write or a cron to a table whose whole job is one indexed lookup.

## 3. Surface

**Guest** (public in `proxy.ts`, `robots: noindex`, `referrer: no-referrer` so
the token never rides along to YouTube in a `Referer` header):

- `/s/[token]` — the shelf: search, cuisine/main filters, sort
- `/s/[token]/recipes/[id]` — recipe, read-only
- `/s/[token]/recipes/[id]/cook` — cook mode

**Owner** (session required):

- `POST /api/library-shares` `{label?}` → `{token, label, createdAt}` — rate
  limited to 20/hour per user
- `GET /api/library-shares` — active links
- `DELETE /api/library-shares/:token` — 403 for a link you do not own

## 4. Reuse

`LibraryClient`, `RecipeDetail`, `CookMode` and `RecipeCard` all took two new
optional props rather than being forked: `basePath` (URL prefix, `""` for the
owner) and a read-only flag. `RecipeDetail`'s existing `isGrantee` became
`isReadOnly` now that two roles are read-only; `role` gained `"guest"`.

Guests get no export or download — the owner's call. Nothing on a guest page
writes, and no unauthenticated endpoint serves recipe data.

## 5. Tests

- `lib/recipes/library-shares.integration.test.ts` (13, pglite): token shape
  and uniqueness, notes stripped, archived/deleted/other-owner recipes hidden
  by shelf *and* by direct link, revoke isolation and idempotency, cross-user
  revoke refused.
- `lib/recipes/library-shares.route.integration.test.ts` (10, pglite): 401 on
  every handler without a session, cross-user `DELETE` → 403, unknown token →
  404, per-user rate limit.
- `lib/db/test/ddl-drift.integration.test.ts` covers the new table.

## 6. Deploy

Run `0005_library_shares.sql` (or `npm run db:push`) before deploying — the
Settings card and every `/s/` route need the table.

## 7. Known limits

- Anyone the guest forwards the link to gets the same access. That is the
  nature of a bearer link; the fix is to cut the guest off and mint a new one.
- The rate limiter is in-process, so it is soft under multi-isolate serverless
  — same caveat as every other limit in `lib/rate-limit.ts`.
