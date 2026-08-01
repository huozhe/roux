# Claude Session State — Roux

**Role:** external reviewer. Claude does **not** write app code — Grok implements, Claude reviews. Protocol: §10 of `docs/reviews/2026-07-31-external-code-review.md`.

## Current status

The July external code review is fully discharged: all 26 findings shipped, deferred with recorded reasoning, or closed as decisions. Issue #3 (umbrella tracker) is **closed**, zero open items. Round 2 (multi-user) also complete — cross-user authz tested at query *and* route layers via pglite, rate limiting with global + per-user caps, inter-user grants shipped end-to-end (design → schema → queries → routes → UI), DDL drift guarded, CI typechecking. No open PRs; `main` at `6cb9a05`, 139 tests.

The **local ASR design** (`docs/plans/local-asr-whisper.md`) is **ACCEPTED** — reviewed, owner rulings folded in, no blocking objections. Nothing implemented yet.

## Next up

Implement local ASR starting at **§7 step 2** of `docs/plans/local-asr-whisper.md` (`lib/asr/` pure module + unit tests, no binaries). Steps and acceptance criteria are in that doc; don't restate them here. Two things carried in from review that are easy to lose:

- The candidate-loop gate at `lib/sync/run.ts:249` drops the `no_captions` backlog before ASR can see it — §4.7 has the fix and the `listCaptionSkipVideoIds` → kinds signature change.
- `getVideosMeta` requests `part=snippet,status`; the 45-min cap needs `contentDetails` added or it's dead code.

## Resume

```bash
git log --oneline -3            # main should be 6cb9a05
npm test                        # 139 pass
gh pr list                      # expect empty
```

## Known issues

- **`rtk` proxy mangles git output in this environment.** `git log --oneline` printed the wrong SHA for a commit during PR #15 review, and `wc -l` returned 0 for a non-empty file. When history or counts matter, use `git cat-file` / `git rev-list` / `node -e`, not `git log` or `wc`.
- **Both agents push as GitHub user `huozhe`**, so GitHub blocks Approve / Request-changes on their own PRs. Verdicts land as Comment reviews labelled as such. If branch protection is ever enabled, it must require **zero** approvals or every PR becomes unmergeable.
- **`main` has no server-side protection** — branch protection and rulesets both need GitHub Pro on a private repo (403). A client-side `pre-push` hook is the stand-in; it requires `git config core.hooksPath .githooks` per clone and is bypassable with `--no-verify`.

## Reviewer calibration

Contrast ratios, token counts, and index/DDL equivalence are all computable locally — don't claim something "needs a browser" or "needs a DB" before trying. Several findings this cycle were wrong because of grep-and-infer on multi-line JSX; read the file. Conceding when the implementer is right is a success, not a loss (§10.5 rule 4) — it happened repeatedly and the ledger is better for it.
