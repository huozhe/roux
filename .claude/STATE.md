# Claude Session State — Roux

**Date:** 2026-07-31
**Role in this repo:** external reviewer. Claude did **not** build this app (Grok did) and does **not** write app code. Claude reviews; Grok implements. See §10.5 rule 10 of the review doc.

---

## Current objective

Run the review→consensus→fix cycle defined in `docs/reviews/2026-07-31-external-code-review.md` §10, against commit `45027b0`.

## Next concrete step

Check the Review PR for Grok's Round 1 response:

```bash
gh pr list
gh pr view <N> --comments
```

Then reply per finding, update the ledger in the PR description, and end with a `NEXT:` line.

## Key context to load

- **The review + protocol:** `docs/reviews/2026-07-31-external-code-review.md` (711 lines, 26 findings, protocol in §10)
- **Ledger:** the Review PR *description* is authoritative. `docs/reviews/.pr-body.md` is a one-time seed — do not read it for current status.
- **Grok's own state file:** `.grok/STATE.md`
- `gh` is authenticated as `huozhe`, scope `repo`. No Claude GitHub App installed — deliberately (see below).

---

## Why this file exists

The review doc and PR thread capture *what* was found and *what* was decided. They do not capture Claude's **confidence calibration** — which findings it would concede fastest, which it would defend hardest, and what it never verified. That is the part a fresh session would lose and could not reconstruct from the PR.

Everything below is reviewer-private reasoning. **It is not in the review doc and must not be pasted into the PR** — publishing "here's where I'm weakest" would distort the debate rather than inform it. Use it to decide how hard to push, not as an argument.

---

## Confidence calibration

### Defend hardest — evidence is direct and checkable

| ID | Why it's solid |
|---|---|
| **ARCH-1** | Not theoretical. `map.ts:33` (`row.ingredients ?? []`) vs `db-recipes.ts:69` (`asIngredients(row.ingredients)`) is a live behavioral divergence between the SSR and API read paths. Anyone can diff the two functions. This is the strongest finding in the document. |
| **SEC-2** | Purely factual: `app/api/sync/route.ts:16` uses `session?.user?.id`; every sibling route calls `resolveAppUserId`. No interpretation involved. |
| **CQ-3** | Verified by absence — no `@import "tailwindcss"`, no `@tailwind`, zero utility classes, yet the PostCSS plugin is loaded. Not arguable. |
| **CQ-6** | `thumbnail_blob` appears exactly twice repo-wide: the schema declaration and a `null` in a test fixture. Traceable to an unimplemented Global Constraint in the plan. |

### Expect to concede — Grok probably has the better argument

| ID | Anticipated defense (likely correct) |
|---|---|
| **UX-3** | "It's my personal cookbook, ~100 recipes, client-side filtering is instant and correct at this scale." That is a *better* engineering answer than pagination. Concede quickly. |
| **SEC-4** | "Private single-user app, authenticated routes, one user's own quota." Valid. Tagged JUDGMENT for exactly this reason. |
| **SEC-5** | Slug readability was almost certainly deliberate — `mapo-tofu-a3f9` is a nicer share link than 8 random hex. Concede if stated as intent. |
| **UX-4** | `alt=""` on a card whose title is adjacent is arguably *correct* a11y — avoids double announcement. Concede if deliberate. |
| **TEST-2** | Downstream of the TEST-1 infra decision; not independently actionable. |

### Genuinely uncertain — do not push without new evidence

- **LLM-2 (prompt caching).** The ~968-token figure is `chars/4`, **not measured**. If real `count_tokens` output exceeds 1024, the finding inverts and caching becomes worth doing immediately on Sonnet 4.6. Rule 2 of §10.5 exists to stop either side acting before this is measured. Do not defend the current conclusion; defend the *requirement to measure*.
- **UX-1 (a11y).** The claim is "not audited," not "N violations." Counting `aria-*` and `onClick` occurrences is a proxy, not an audit. If Grok runs axe and reports a low number, accept it.
- **ARCH-4 (prefs lost update).** Real race, but the window is small and impact is a lost custom chip on a single-user app. Do not oversell.

### Where Grok may have context Claude lacks

- **`lib/data/recipes.ts` fixture fallback.** If rendering without `DATABASE_URL` is a supported mode, ARCH-1's fix changes from "delete `db-recipes.ts`" to "unify the mappers, keep the adapter." §8 Q1 asks this directly. **Read that answer before pressing ARCH-1.**
- **CQ-2 (inline styles).** Escalated to DEFECT only because `docs/plans/v1-implementation.md` names it as a Global Constraint. If Grok says the constraint was consciously dropped for a stated reason, it downgrades to JUDGMENT and a migration may not be worth proposing.
- **UX-2 (`useLivePrefs`).** The docstring cites RSC staleness. If that was *observed* with a repro, the cheaper fix (`revalidatePath` / `router.refresh()`) may not actually work and the current design is justified.

---

## Self-corrections already made — do not re-introduce

1. **`claude-sonnet-4-6` is NOT deprecated or invalid.** It is an active model. An earlier draft implied otherwise; corrected on the record in LLM-1. Do not resurrect "you're on an old model" as a criticism — the real argument is structured outputs, which requires Sonnet 5+.
2. **Prompt caching is probably NOT a win here.** Initial instinct was "add `cache_control`, save 90%." Wrong: the system prompt sits just under the 1024-token minimum, so it would silently no-op. See uncertainty note above.

Both corrections came from loading Anthropic's current API reference rather than relying on recall. **Do the same before making any further model/pricing/caching claim.**

---

## Not verified — flag if it becomes load-bearing

- Nothing was run against the live Neon DB or a real sync. Findings are static-analysis + test/lint/build only.
- `npm test` (59 pass), `npx tsc --noEmit` (clean), `npm run lint` (clean) at `45027b0`.
- No browser session; UI findings are read from source, not observed. UX-1 especially.
- Vercel deployment config beyond `vercel.json` + `.github/workflows/ci.yml` not inspected.

---

## Process reminders

- **Conceding is a success.** §10.5 rule 4. The goal is a correct ledger, not a high fix count. A reviewer who never concedes is miscalibrated.
- **Deadlock rule is automatic:** 2 failed exchanges on one finding → `BLOCKED-OWNER`. Do not argue a third time.
- **Claude never pushes app code.** Review only. The Fix PR is Grok's.
- **Do not regress §0** of the review doc — those items were named as good so they survive the process.
- **No GitHub App installed, deliberately.** The Actions runner would be a cold Claude with none of this calibration. Revisit at Round 5 (Fix PR verification), where the ledger fully specifies the job and cold context is fine.

## Verification

```bash
gh pr view <N> --comments        # Grok responded?
gh pr view <N> --json body       # ledger current?
npm test && npm run lint && npm run build
```
