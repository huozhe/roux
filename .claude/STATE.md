# Claude Session State — Roux

**Date:** 2026-08-01
**Role in this repo:** external reviewer. Claude did **not** build this app (Grok did) and does **not** write app code. Claude reviews; Grok implements.

---

## Current status: review round 1 COMPLETE

The full review→consensus→fix cycle defined in `docs/reviews/2026-07-31-external-code-review.md` §10 ran to completion against `45027b0`.

| | |
|---|---|
| PR #1 — review + debate | **MERGED** · 26 findings, 4 rounds, 0 deadlocks |
| PR #2 — 10 AGREED fixes | **MERGED** · 10/10 `VERIFIED` |
| Issue #3 — 10 DEFERRED | **OPEN** — the live backlog |
| `main` | 69 tests pass · tsc clean · lint clean · prod verified healthy |

Both branches deleted. Per-finding commit history (`[SEC-1]`, `[ARCH-1]`, …) preserved on `main` — `git log --grep='\[ARCH-1\]'` is the audit trail.

**Outcome:** 10 `AGREED` (shipped) · 10 `DEFERRED` (issue #3) · 6 `WONTFIX` (closed decisions).

## Next concrete step

**Run `npm run sync` locally.** Highest-value single action. LLM-3 telemetry shipped but has recorded nothing, so `sync_runs.detail.extracts` is empty. One run unblocks two deferred findings:

- **LLM-1** — `attempts > 1` across extracts = the retry-fire rate. The entire structured-outputs / Sonnet-5 decision is gated on this number. **"Stay on `claude-sonnet-4-6`" is a legitimate outcome** — do not treat migration as the default.
- **LLM-2** — `cache_read_input_tokens > 0` on videos 2..N confirms prompt caching actually engages. Currently theory backed by a token count, not observation.

Then: issue #3, in its stated order. One item needs the owner, not the reviewer: `TEST-1` item 1 infra (pglite vs. Neon branch) — infra cost is optional for a private single-user app.

---

## ⛔ Do not re-litigate

A future session re-flagging any of these will be wrong and will waste Grok's time. All were settled with evidence in PR #1.

### Reviewer was wrong — corrected on the record

1. **`claude-sonnet-4-6` is NOT deprecated.** Active model. Never resurrect "you're on an old model" as a criticism.
2. **Prompt caching WORKS here.** `SYSTEM_PROMPT` = **1063 tokens** (measured `countTokens`: withSys 1071 − noSys 8), above the 1024 Sonnet minimum. An early `chars/4` estimate said 968 and was wrong — actual ratio is **3.64 chars/token**, not 4.0. `cache_control` shipped in `a6c7fe1`.
3. **`RecipeDetail.tsx` has 14 `useState`, not 17.** The 17 came from `grep -c useState` counting mentions, not calls.
4. **The SSR/API *search* divergence is NOT user-visible.** `GET /api/recipes` has exactly one caller — `components/settings/ExportButtons.tsx` — and it passes only `view=`, never `q`/`cuisine`/`main`/`sort`. The search box feeds `filterAndSortRecipes` client-side. Only the *mapper* half of ARCH-1 was reachable (via export), and that shipped.

### Settled `WONTFIX` — decisions, not omissions

`SEC-4` no rate limiting (trusted private user) · `SEC-5` 4-hex share slugs (readability chosen deliberately) · `ARCH-4` prefs lost-update (explicit risk acceptance) · `CQ-5` raw `<img>` (correct at ~160 recipes) · `UX-3` full library to client (ceiling ~200–400; pagination would be worse) · `UX-4` `alt=""` (avoids double announcement).

### Where Grok had context the code did not show

- **UX-2** — `useLivePrefs`'s mount fetch was defensive after a *real observed* staleness bug (Settings saved, SSR props stale until hard refresh), not speculative hardening. Current design justified; the cheaper `revalidatePath`/`router.refresh()` fix is an untested hypothesis.
- **CQ-2** — the design-token constraint eroded under ship pressure, was not consciously rescinded. Go-forward rule agreed: new UI prefers `organic.css` tokens. Recorded `DEFERRED`, not `WONTFIX`.
- **§8 Q1** — the fixture fallback in `lib/data/recipes.ts` is load-bearing for the no-DB path, which is why ARCH-1 became "unify mappers, keep adapter."

---

## Measured facts worth not re-deriving

- `SYSTEM_PROMPT`: **3870 chars = 1063 tokens** on `claude-sonnet-4-6` (3.64 chars/token).
- Prompt-cache minimum 1024 tok = **3728 chars**. Guard in `lib/extract/prompt-cache.test.ts` set to **3800** (~1047 tok, ~2% margin) — *not* 3728, because trimming prose leaves the denser JSON-schema block and pushes the ratio up. A 3700 floor was rejected in review: it measured 1021 tok, i.e. it would have passed while caching silently no-op'd.
- Caching saves ~3,561 tok/run at `maxNew=5` ≈ **$0.011/run**. Real but small; the transcript dominates input.
- Recipe library: **~160** today, owner's ceiling **~200–400**.

## ⚠️ Carried into ARCH-2 (issue #3)

The SQL filter path in `queries.listRecipes` and the `recipes_search_gin` index from `0001_search.sql` **have never executed against real data** — no caller reaches them. When ARCH-2 promotes that path to the only path, it runs in production for the first time. That is "delete the duplicate **and validate the survivor**," not a mechanical swap. Ship it with tests.

## Not verified — flag if it becomes load-bearing

Review was static analysis + test/lint/build + a live prod smoke check (`/`, `/login` 200; unauth `/api/recipes` → JSON 401). No sync was run against live Neon, no browser session, no a11y tooling. `UX-1` explicitly awaits an axe run — **reviewer withdraws that finding if axe comes back clean.**

---

## Process notes for a future cycle

- **Protocol lives in §10** of the review doc — status machine, deadlock rule (2 failed exchanges → `BLOCKED-OWNER`), evidence rule, `gh` commands. It worked; reuse it.
- **The load-bearing rule was §10.5 #1 (evidence or it didn't happen).** Every correction in both directions came from someone running a command instead of asserting. The status fields were bookkeeping.
- **Grok corrected Claude 3×, Claude corrected Grok 1×.** All four stood up. If a future cycle has Claude never conceding, Claude is miscalibrated — see §10.5 #4.
- **Known gap: both agents act as GitHub user `huozhe`**, so GitHub blocks Approve / Request-changes on own PRs. Verdicts had to land as Comment reviews labeled as such. A second identity for one agent would restore real review semantics.
- **No Claude GitHub App installed, deliberately** — an Actions runner is a cold Claude with none of this context. Fine for mechanical Fix-PR verification; bad for the debate phase.
- **The owner is the scheduler.** Neither agent polls or receives notifications; rounds advance only when the owner invokes one of them.

## Verification

```bash
gh issue view 3                  # deferred backlog
git log --grep='\[ARCH-1\]'      # per-finding audit trail
npm test && npm run lint && npm run build
```
