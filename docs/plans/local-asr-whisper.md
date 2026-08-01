# Local ASR for caption-less videos (whisper.cpp)

**Status:** **ACCEPTED** (2026-08-01) — implementation may proceed on §7  
**Date:** 2026-08-01  
**Author:** @grok-builder  
**Reviewer:** @claude-reviewer · product calls: @owner  

Related: `lib/youtube/transcript.ts`, `lib/youtube/videos.ts`, `lib/sync/caption-skips.ts`, `lib/sync/run.ts`, extract path (`CaptionCue[]` → Claude).

**Review history:** PR #21 · Claude D1/D2 · owner product · re-review **ACCEPTED** + D12 duration plumbing · owner: unknown duration still attempts ASR; CJK miss OK with override.

---

## 1. Problem

Sync already distinguishes caption failures:

| Kind | Meaning | Current behavior |
|---|---|---|
| `auth_blocked` | YouTube LOGIN_REQUIRED / cookies/IP | Skip + `caption_skips`; fix with local sync / cookies |
| `no_captions` | Playable video; **uploader has no tracks** (manual + ASR off) | Skip + `caption_skips`; **no path forward** |
| `unavailable` / etc. | Dead / empty body | Skip |

**Product reality (owner):** a large share of library videos are **`no_captions`**, still have **audio**, and are **Chinese**. Uploaders explicitly disabled captions/ASR. There is no YouTube track to fetch; audio ASR is the only way to feed the existing recipe extract pipeline.

**Scale today:** on the order of **~55** `no_captions` skips already stored — the feature exists to clear that backlog, not only newly discovered videos (see §4.7 / Claude D1).

Roux’s extract is already caption-agnostic: it only needs timed text:

```ts
type CaptionCue = { text: string; start_seconds: number };
extractRecipe(cues, { videoTitle })
```

So ASR is a **transcript acquisition** problem, not a new extract architecture.

---

## 2. Goals / non-goals

### Goals (v1)

1. When YouTube returns **`no_captions`**, optionally produce `CaptionCue[]` from **audio** and continue the normal extract path.
2. Run **only on the local sync machine** (same constraint class as “no `YOUTUBE_COOKIES` on Vercel” / residential network). **Never** on Vercel serverless.
3. Support **Chinese** speech well enough for cooking narration (Mandarin primary); language selection per §4.3.
4. **Zero paid ASR API** for the default path — **whisper.cpp** (or equivalent local Whisper) is free after model download.
5. **Idempotent:** do not re-download + re-transcribe the same `(videoId, engine, model, lang)` every sync.
6. Preserve cook-mode usefulness: cues must carry **timestamps** (Whisper segments are enough; not frame-perfect).
7. Clear progress UX so multi-minute Whisper is not mistaken for a hang.
8. **Backlog-capable:** existing `caption_skips` rows with `kind = no_captions` must be eligible when ASR is on (not only brand-new playlist items).

### Non-goals (v1)

- Cloud ASR (OpenAI Whisper API, Deepgram, etc.) as default  
- Multimodal “watch the video with Claude/Gemini” as primary path  
- Cantonese-optimized models (Mandarin first; Cantonese best-effort)  
- Shipping whisper.cpp binaries inside the Next.js deploy  
- Replacing caption fetch when tracks **exist** (captions remain preferred)  
- Auto-ASR for `auth_blocked` (wrong fix — fix cookies/local fetch first)  
- Perfect ingredient spelling without the Claude extract step  
- Separate `--asr-backfill` queue (v1 uses the same `maxNew` budget — see §4.7)

---

## 3. Options considered

### A — OpenAI Whisper API (or other hosted STT)

**Pros:** simple ops, good Chinese.  
**Cons:** per-minute cost; still need local audio download; conflicts with free local preference.

### B — Multimodal LLM on video/audio

**Cons:** expensive; weaker timed step map; not free.

### C — Local **yt-dlp** audio + **whisper.cpp** → `CaptionCue[]` (**recommended**)

```
no_captions → yt-dlp -x → whisper.cpp → cues → extractRecipe (unchanged)
```

**Pros:** $0/video after model install; Chinese works; timestamps; laptop sync; extract untouched.  
**Cons:** user installs deps; CPU time; disk cache; YT download fragility.

### D — Do nothing

**Cons:** permanent hole for CN channels that disable captions.

**Recommendation: C.**

---

## 4. Proposed design (option C)

### 4.1 Placement in the stack

```
                    ┌─────────────────────┐
  YouTube tracks    │ fetchTranscript     │
  exist? ─────────►│ (existing)          │──► CaptionCue[] ──► extractRecipe
       │            └─────────────────────┘
       │ no_captions
       ▼
  ASR enabled? ──no──► caption_skips (unchanged)
       │ yes
       ▼
  duration ≤ max? ──no──► skip (asr_too_long); keep/record skip
       │ yes
       ▼
  ┌─────────────────────┐
  │ asrFromAudio(videoId)│  local only · execFile args array
  │  yt-dlp + whisper   │
  └─────────┬───────────┘
            ▼
       CaptionCue[] + source: "asr"
            ▼
       extractRecipe (same)
```

**Invariant:** cloud `/api/sync` and cron **never** call ASR. Only `npm run sync` with ASR flag/env may.

### 4.2 Runtime dependencies (local machine)

| Tool | Role | Notes |
|---|---|---|
| **yt-dlp** | Download best audio for `video_id` | User-installed |
| **whisper.cpp** | Speech → timed segments | Free; Metal on Apple Silicon |
| **Model** | `ggml-medium` default; `large-v3-turbo` optional | Free download |

Detection: if binaries/models missing and ASR requested → **fail fast at sync start** with install instructions.

**Subprocess safety (Claude Q3):** shell out via **`execFile` / `spawn` with an argument array only** — never interpolate `videoId` into a shell string. Engine stays pluggable (faster-whisper / mlx-whisper later) behind the same `asrFromAudio` interface.

### 4.3 Language — **@owner ruling**

| Case | Behavior |
|---|---|
| **Default** | If title or channel contains **CJK** → **`zh`**; else **`auto`** (Whisper detect) |
| Override | Env `ROUX_ASR_LANGUAGE=zh\|en\|auto` or `--asr-lang=` (forces all videos) |
| Translate mode | **Not** used in v1 (`-tr` off). Keep source language text; extract prompt structures into English recipe when practical |

CJK check: any codepoint in common CJK ranges in `videoTitle` or `channelTitle` (playlist item metadata already available in sync).

### 4.4 Cue mapping

Whisper segment → cue:

```ts
{ text: segment.text.trim(), start_seconds: Math.floor(segment.t0Seconds) }
```

Drop empty segments. Optional: merge sub-second fragments.

### 4.5 Caching (idempotency) — **Claude D2**

ASR is slow. Cache on the sync machine (v1 — no DB migration):

```
$ROUX_ASR_CACHE_DIR/   # default: ~/.cache/roux/asr/
  {videoId}.json       # single file per video; body includes identity fields
  {videoId}.m4a        # optional if ROUX_ASR_KEEP_AUDIO=1
```

**Cache file body:**

```ts
{
  videoId: string;
  engine: "whisper.cpp";  // or later engines
  model: string;          // e.g. "medium", "large-v3-turbo"
  language: string;       // resolved lang used for the run: "zh" | "en" | ...
  cues: CaptionCue[];
  createdAt: string;      // ISO
}
```

**Lookup rule (preferred over filename triple):**

1. Read `{videoId}.json` if present.  
2. If `engine`, `model`, and `language` all match the **current** run config → **hit**.  
3. Else → **miss** (re-run ASR; overwrite file).  

This keeps one visible file per video while avoiding silent wrong-language reuse.

Default model id for cache identity: whatever CLI/`ROUX_ASR_MODEL` selects (default `medium`).

### 4.6 When ASR runs

| Condition | ASR? |
|---|---|
| Caption fetch **ok** | No |
| `auth_blocked` / captcha | **No** |
| `unavailable` | No |
| `empty_body` | **No** in v1 |
| `no_captions` + ASR enabled + (duration ≤ 45 min **or duration unknown**) | **Yes** |
| Already in `caption_skips` as **`no_captions`** + ASR enabled | **Yes** (backlog — see §4.7) |
| `no_captions` + duration **known and > 45 min** | No; record `asr_too_long` |

**Enablement — @owner ruling:** **opt-in only**

- `ROUX_ASR=1` or `npm run sync -- --asr`  
- **Off by default** (even if binaries exist)  
- When off, behavior identical to today  

**Max duration — @owner ruling:** **45 minutes** when duration is **known**.

**Duration plumbing required (Claude D12):** today `getVideosMeta` requests `part=snippet,status` only — **`contentDetails.duration` is not fetched**, and `VideoMeta` has no duration field. Without this, `durationKnown` is always false and the 45‑minute cap is **dead code** (a 3‑hour video would still download + Whisper).

**Impl (quota-free):** add `contentDetails` to `videos.list` `part` in `lib/youtube/videos.ts` (still **1 unit** per call regardless of parts); parse ISO-8601 (`PT12M34S`) onto `VideoMeta`; use it in the §4.7 guard. Meta is already loaded for candidates before transcript/ASR.

**If duration unknown** (API miss / parse fail) — **@owner:** **still attempt ASR** (do not block backlog). Cap applies only when duration is known and **> 45 min**.

### 4.7 Sync integration (`lib/sync/run.ts`) — **Claude D1 (critical)**

#### Candidate-loop gate (today vs required)

**Today** (~`:249`):

```ts
if (captionSkipSet.has(item.videoId)) continue;
```

This **drops the entire `no_captions` backlog** before transcript/ASR. As drawn in the first draft, ASR would only fire for *new* caption-less videos — silent “no change” for the 55 already skipped.

**Required:** `listCaptionSkipVideoIds` (or a sibling) must expose **kind**, not only id. e.g. `Map<videoId, CaptionSkipKind>` or `listCaptionSkips` already returns kinds — use that in the candidate loop:

```ts
const skipKind = captionSkipById.get(item.videoId);
if (skipKind) {
  const allowAsrBacklog =
    asrEnabled && skipKind === "no_captions";
  if (!allowAsrBacklog) continue;
}
// else: new item or eligible no_captions backlog → proceed
```

`auth_blocked` / `unavailable` skips **still** short-circuit (never ASR).

**Signature change to name in impl:** prefer reusing `listCaptionSkips` → build `Map`, or change `listCaptionSkipVideoIds` to return `{ videoId, kind }[]`. Do not keep an id-only set if ASR is enabled.

#### After caption fetch

```ts
const transcript = await fetchTranscriptDetailed(videoId);
if (transcript.ok) {
  cues = transcript.cues; source = "youtube";
} else if (transcript.kind === "no_captions" && asrEnabled) {
  if (durationKnown && durationMin > ASR_MAX_MINUTES) {
    // skip; detail asr_too_long; upsert caption_skip no_captions
    continue;
  }
  const lang = resolveAsrLanguage(videoTitle, channelTitle, langOverride);
  const asr = await asrFromAudio(videoId, { language: lang, model });
  if (!asr.ok) { /* detail; keep no_captions skip */ continue; }
  cues = asr.cues; source = "asr";
} else {
  // existing skip + caption_skips path
  continue;
}
// extractRecipe(cues) unchanged
```

For **backlog** items that were skip-gated through without re-fetching captions: when `allowAsrBacklog`, either:

- **(A)** skip YouTube caption re-fetch and go straight to ASR (faster; captions rarely appear once marked `no_captions`), or  
- **(B)** still call `fetchTranscriptDetailed` first in case tracks were added later.

**Proposal: (B)** one cheap caption attempt, then ASR — keeps “captions preferred” invariant. If caption re-fetch is too slow for 55 items, switch to (A) later.

#### Budget and scale — **Claude small delta #2**

- Caption *fetch failures* still **must not** burn `maxNew`.  
- ASR *success* → extract **does** count toward `maxNew` (default **5**/run).  
- **@owner:** no separate `--asr-backfill` cap in v1 — same `maxNew` as extract.  

**Expectation (document in README + sync start log):**

> ~55 `no_captions` × default `maxNew=5` ⇒ **≥11 successful ASR+extract runs**, each video also costing minutes of Whisper. First enablement is a **multi-session backfill**, not one command.

Progress stages: `Downloading audio…` / `Transcribing (whisper, ~N min video)…` / `Writing up…`.

#### caption_skips after success — **Claude small delta #1 + @owner**

Deleting the skip row on success is only safe if the recipe will not re-enter extract next run.

**@owner ruling:** delete `caption_skips` row **only if the written recipe is verified** (either `syncMarkVerified: true` or the row’s `verified` is true after write).

| After ASR+extract | caption_skips action |
|---|---|
| Recipe **verified** | **Delete** skip row for `videoId` |
| Recipe **unverified** | **Keep** `no_captions` skip (or set a non-blocking note in detail only) so the next sync does **not** re-ASR |

With keep-on-unverified: the recipe exists; `canWriteExtract` may still want re-extract if unverified — **must not** re-run Whisper. So if skip is kept, candidate loop must treat “recipe already exists” via normal `canWriteExtract` before ASR. Order remains: decision helpers first (skip if verified/archived); only missing/unverified-without-cues paths hit transcript/ASR. **Impl detail:** if an unverified recipe already exists from a prior ASR run, re-extract should reuse **filesystem ASR cache** (same videoId+model+lang) rather than calling Whisper again — cache hit makes re-extract cheap even if captions still fail.

Simplest invariant:

1. Always write ASR cues to fs cache on success.  
2. Delete DB skip only when `verified`.  
3. On later runs, caption fail + cache hit → use cache without Whisper (even if skip row still present / re-fetched `no_captions`).

### 4.8 Data / product semantics

| Field | Proposal |
|---|---|
| Recipe row | No schema change in v1 |
| `sync_runs.detail` | `{ videoId, source: "youtube"\|"asr", asrModel?, asrLang?, durationMs? }` |
| UI badge / `transcript_source` column | **Defer** (Claude Q5) |
| Confidence | Unchanged from Claude extract |

### 4.9 Security / compliance

- Audio stays on owner machine; only **text cues** go to Claude.  
- **`execFile` argv only** — no shell string building with `videoId`.  
- No model weights/audio in git.  
- Personal library / local sync use (same class as caption scrape).

### 4.10 Failure modes

| Failure | Behavior |
|---|---|
| yt-dlp missing / fails | Skip; `asr_download_failed`; leave `no_captions` skip |
| whisper / model missing | **Fail fast** at sync start if ASR enabled |
| Empty ASR text | Skip; `asr_empty` |
| Duration known and > 45 min | Skip; `asr_too_long` |
| Duration **unknown** | **Attempt ASR** (@owner) |
| OOM / killed | No incomplete cache write; retry next run |
| Cache identity mismatch | Treat as miss; re-ASR |

---

## 5. Chinese-specific notes

- whisper.cpp supports Chinese; when lang resolves to `zh`, pass `-l zh`.  
- Prefer **`medium`** minimum; `large-v3-turbo` if ingredient quality is weak.  
- Mandarin >> Cantonese; Cantonese best-effort.  
- ASR-sourced Chinese transcripts are the long-transcript samples LLM-1 still lacks (prior telemetry n=1 English).  

---

## 6. UX / CLI surface (v1)

```bash
ROUX_ASR=1 npm run sync
# or
npm run sync -- --asr

# optional overrides
ROUX_ASR_LANGUAGE=zh          # force all
ROUX_ASR_MODEL=medium
ROUX_ASR_MAX_MINUTES=45       # default
ROUX_ASR_CACHE_DIR=~/.cache/roux/asr
```

On start when ASR enabled, log: tool versions, model path, max minutes, maxNew, and  
`caption_skips no_captions eligible: N (≈ ceil(N/maxNew) runs at current budget)`.

---

## 7. Implementation plan (after ACCEPTED)

| Step | Work | Verify |
|---|---|---|
| 1 | This design **ACCEPTED** | done |
| 2 | **`VideoMeta` duration (D12):** `part=snippet,status,contentDetails`; parse ISO-8601 onto meta; tests | `npm test` |
| 3 | `lib/asr/`: types, CJK language resolve, cache read/validate/write, cue map + unit tests | `npm test` |
| 4 | Shell adapter: `execFile` yt-dlp + whisper.cpp; parse JSON segments | manual 1 CN video |
| 5 | `caption-skips`: kinds in candidate loop; conditional gate when ASR on | unit/integration |
| 6 | Wire `run.ts`: opt-in, backlog, **duration cap when known**, progress, detail, verified-gated skip delete | local sync |
| 7 | README: install whisper.cpp + model, env vars, multi-run backfill expectation | — |

---

## 8. Decisions — **settled**

| # | Decision | Ruling | Source |
|---|---|---|---|
| D1 | Engine | whisper.cpp default; pluggable later | accepted |
| D2 | Where | Local sync only; never Vercel | accepted |
| D3 | Trigger | Only `no_captions` + explicit opt-in | accepted |
| D4 | Language | **CJK in title/channel → `zh`, else `auto`**; override via env/flag | **@owner** |
| D5 | Cache | Fs cache; **validate engine+model+lang on read** (miss if mismatch) | Claude D2 |
| D6 | Extract | Unchanged `CaptionCue[]` path | accepted |
| D7 | Cost | Free local; no hosted ASR in v1 | accepted |
| D8 | Default on/off | **Opt-in** `ROUX_ASR=1` / `--asr` only | **@owner** |
| D9 | Auth-blocked | Never ASR | accepted |
| D10 | Backlog gate | Candidate loop must **not** drop `no_captions` when ASR on; need **kinds** not id-only set | Claude D1 |
| D11 | Subprocess | `execFile`/`spawn` argv array; no shell interpolation | Claude Q3 |
| D12 | Max duration | **45 min when known**; requires `contentDetails` on `VideoMeta` | **@owner** + Claude D12 |
| D12b | Duration unknown | **Still attempt ASR** | **@owner** |
| D13 | Budget | Same `maxNew` as extract; document multi-run backfill | **@owner** |
| D14 | Skip row after success | **Delete only if recipe verified**; always cache cues; re-extract uses cache | **@owner** + Claude |
| D15 | `transcript_source` on recipes | Defer | Claude Q5 |
| D16 | CJK miss (EN title/channel, CN speech) | Accept `auto` + `ROUX_ASR_LANGUAGE` override | **@owner** |

---

## 9. Open questions — **closed**

| Q | Answer |
|---|---|
| Q1 language default | CJK → zh, else auto (**@owner**) |
| Q2 max length | 45 min (**@owner**) |
| Q3 shell vs binding | shell out + `execFile` argv (Claude) |
| Q4 delete skip on success | only if verified (**@owner**) |
| Q5 recipe column | defer (Claude) |

---

## 10. Acceptance criteria — **met**

1. @claude-reviewer: no blocking design objections (re-review **ACCEPTED** + D12 duration plumbing named).  
2. @owner: language, max length, opt-in, budget, skip-delete, unknown-duration policy, CJK edge case.  
3. §8 settled including D12 / D12b / D16.  
4. Implementation may start at **§7 step 2** (`VideoMeta` duration), then steps 3+.

---

## 11. Success metrics (post-ship)

- Share of `no_captions` → written recipes with ASR on  
- Median wall time per ASR video  
- Extract `attempts` on ASR Chinese transcripts (LLM-1)  
- Manual: 3 CN caption-disabled cooking videos → usable step timestamps  
- Backlog: eligible `no_captions` count decreases across successive `--asr` syncs  
- Watch: ASR quality when language fell back to `auto` (EN title / CN speech) — use `ROUX_ASR_LANGUAGE=zh` if weak  

---

NEXT: @grok-builder — implement §7 (start with `VideoMeta` duration / step 2).
