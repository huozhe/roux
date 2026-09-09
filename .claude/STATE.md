# Claude Session State — Roux

**Role:** external reviewer by default — Grok implements, Claude reviews. Protocol: §10 of `docs/reviews/2026-07-31-external-code-review.md`. The owner can override per task (they did for shared library mode); ask if it's ambiguous.

## Current status

July external code review fully discharged; issue #3 closed. Round 2 (multi-user) complete.

**Shared library mode is shipped** — PRs #23 and #24 merged, head `aa8a217`, deployed 2026-09-08, migration `0005_library_shares.sql` applied to Neon and verified. Guests open `/s/<token>` and read the owner's whole library with no account: search, filters, sort and cook mode; no export. Design and known limits: `docs/plans/shared-library-mode.md`. Claude implemented this one at the owner's direction, so it has had **no independent review**.

The **local ASR design** (`docs/plans/local-asr-whisper.md`) is **ACCEPTED** but nothing is implemented.

## Next up

Implement local ASR from **§7 step 2** of `docs/plans/local-asr-whisper.md` (`lib/asr/` pure module + unit tests, no binaries). Two items that are easy to lose:

- The candidate-loop gate at `lib/sync/run.ts:249` drops the `no_captions` backlog before ASR sees it — §4.7 has the fix and the `listCaptionSkipVideoIds` → kinds signature change.
- `getVideosMeta` requests `part=snippet,status`; the 45-min cap needs `contentDetails` or it's dead code.

## Resume

```bash
git rev-list -1 main            # expect aa8a217
npm test                        # 163 pass
gh pr list                      # expect empty
```

## Known issues

- **`rtk` proxy mangles git output here.** `git log --oneline` has printed wrong SHAs and `wc -l` returned 0 for a non-empty file. Use `git cat-file` / `git rev-list` / `node -e` when history or counts matter.
- **Vercel stopped writing GitHub deployment records** (last one 2026-08-01). `gh api .../deployments` looks stale and is not evidence of a missing deploy — read `gh api repos/huozhe/roux/commits/<sha>/statuses` instead. Unauthenticated probes of the prod URL only hit Vercel SSO protection, so they prove nothing about deployed code.
- **Both agents push as GitHub user `huozhe`**, so GitHub blocks Approve / Request-changes on their own PRs. Verdicts land as Comment reviews labelled as such. Branch protection, if ever enabled, must require **zero** approvals.
- **`main` has no server-side protection** — needs GitHub Pro on a private repo (403). The `.githooks` pre-push hook is the stand-in; it needs `git config core.hooksPath .githooks` per clone and `--no-verify` bypasses it.

## Reviewer calibration

Contrast ratios, token counts and index/DDL equivalence are computable locally — try before claiming something needs a browser or a DB. Read the file; grep-and-infer on multi-line JSX produced several wrong findings. Conceding when the implementer is right is a success (§10.5 rule 4).
