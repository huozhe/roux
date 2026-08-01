# Local ASR for caption-less videos (whisper.cpp)

**Status:** **DRAFT** — awaiting @claude-reviewer  
**Date:** 2026-08-01  
**Author:** @grok-builder  
**Reviewer:** @claude-reviewer · product calls: @owner  

Related: `lib/youtube/transcript.ts`, `lib/sync/caption-skips.ts`, `lib/sync/run.ts`, extract path (`CaptionCue[]` → Claude).

---

## 1. Problem

Sync already distinguishes caption failures:

| Kind | Meaning | Current behavior |
|---|---|---|
| `auth_blocked` | YouTube LOGIN_REQUIRED / cookies/IP | Skip + `caption_skips`; fix with local sync / cookies |
| `no_captions` | Playable video; **uploader has no tracks** (manual + ASR off) | Skip + `caption_skips`; **no path forward** |
| `unavailable` / etc. | Dead / empty body | Skip |

**Product reality (owner):** a large share of library videos are **`no_captions`**, still have **audio**, and are **Chinese**. Uploaders explicitly disabled captions/ASR. There is no YouTube track to fetch; audio ASR is the only way to feed the existing recipe extract pipeline.

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
3. Support **Chinese** speech well enough for cooking narration (Mandarin primary).
4. **Zero paid ASR API** for the default path — **whisper.cpp** (or equivalent local Whisper) is free after model download.
5. **Idempotent:** do not re-download + re-transcribe the same `video_id` every sync.
6. Preserve cook-mode usefulness: cues must carry **timestamps** (Whisper segments are enough; not frame-perfect).
7. Clear UX: user can see “written from audio ASR” vs YouTube captions; confidence defaults remain honest.

### Non-goals (v1)

- Cloud ASR (OpenAI Whisper API, Deepgram, etc.) as default  
- Multimodal “watch the video with Claude/Gemini” as primary path  
- Cantonese-optimized models (Mandarin first; Cantonese best-effort)  
- Shipping whisper.cpp binaries inside the Next.js deploy  
- Replacing caption fetch when tracks **exist** (captions remain preferred)  
- Auto-ASR for `auth_blocked` (wrong fix — fix cookies/local fetch first)  
- Perfect ingredient spelling without the Claude extract step  

---

## 3. Options considered

### A — OpenAI Whisper API (or other hosted STT)

Upload audio → timed transcript.

**Pros:** simple ops, good Chinese.  
**Cons:** per-minute cost; still need **local audio download** from YouTube; API key + data leave machine; conflicts with “local-only free” preference.

### B — Multimodal LLM on video/audio

Send media to Claude/Gemini; ask for recipe or transcript.

**Pros:** one vendor for extract.  
**Cons:** expensive for full cooking videos; weaker timed step map; different failure modes; still need media fetch; not free.

### C — Local **yt-dlp** audio + **whisper.cpp** → `CaptionCue[]` (**recommended**)

```
no_captions → yt-dlp -x → whisper.cpp -l zh → cues → extractRecipe (unchanged)
```

**Pros:** $0/video after model install; Chinese works (`-l zh`, medium/large models); timestamps from segments; fits laptop sync; extract/prompt untouched.  
**Cons:** user installs deps; CPU/GPU time; disk for models + cache; YouTube download ToS/fragility (same class as caption scrape).

### D — Do nothing; leave `caption_skips`

**Pros:** zero work.  
**Cons:** permanent hole for CN cooking channels that disable captions — large % of owner’s library.

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
  ┌─────────────────────┐
  │ asrFromAudio(videoId)│  local only
  │  yt-dlp + whisper   │
  └─────────┬───────────┘
            ▼
       CaptionCue[] + source: "asr"
            ▼
       extractRecipe (same)
```

**Invariant:** cloud `/api/sync` and cron **never** call ASR. Only `npm run sync` (or a dedicated local CLI) with ASR flag/env may.

### 4.2 Runtime dependencies (local machine)

| Tool | Role | Notes |
|---|---|---|
| **yt-dlp** | Download best audio for `video_id` | Already the de-facto local YT tool; user-installed |
| **whisper.cpp** | Speech → timed segments | Free; Metal on Apple Silicon |
| **Model** | `ggml-medium` default; `large-v3` / `large-v3-turbo` optional | Free download; medium is CN cooking sweet spot |

Detection: if binaries/models missing and ASR requested → clear error (“install yt-dlp + whisper.cpp + model”), not silent skip.

**Alternatives allowed later without redesign:** faster-whisper / mlx-whisper as drop-in **engines** behind the same `asrFromAudio` interface, as long as output is `CaptionCue[]`.

### 4.3 Language

| Case | Behavior |
|---|---|
| Default for owner library | **`zh`** (product: large % Chinese, captions off) |
| Override | Env `ROUX_ASR_LANGUAGE=zh|en|auto` or sync flag `--asr-lang=` |
| `auto` | Whisper language detect (slower / less reliable for short intros) |

**Do not** default to English Whisper translate mode (`-tr`) in v1. Keep Chinese (or detected) text; existing extract prompt already asks for English recipe content when practical.

### 4.4 Cue mapping

Whisper segment → cue:

```ts
{ text: segment.text.trim(), start_seconds: Math.floor(segment.t0) }
// or t0 in seconds from whisper.cpp json output
```

Drop empty segments. Optional: merge sub-second fragments. Cap total cue text if needed (extract already handles long transcripts via MAX_TOKENS / retries).

### 4.5 Caching (idempotency)

**Problem:** ASR is slow (minutes per video). Must not re-run every sync.

**Recommended: filesystem cache on the sync machine** (v1 — simple, no migration):

```
$ROUX_ASR_CACHE_DIR/   # default: ~/.cache/roux/asr/
  {videoId}.json       # { cues, language, model, engine, createdAt }
  {videoId}.m4a        # optional: keep audio only if ROUX_ASR_KEEP_AUDIO=1
```

Sync flow:

1. Cache hit → load cues, skip download/ASR  
2. Cache miss → yt-dlp → whisper → write cache → cues  

**Optional later (v1.1):** persist `transcript_source` + cue blob in Postgres so multi-machine sync shares work — **not required** for single-owner laptop sync.

### 4.6 When ASR runs

Strict gate so we don’t burn CPU on the wrong failures:

| Condition | ASR? |
|---|---|
| Caption fetch **ok** | No |
| `auth_blocked` / captcha | **No** (fix access first) |
| `unavailable` | No |
| `no_captions` + ASR enabled | **Yes** |
| `empty_body` with tracks listed | **No** in v1 (ambiguous; log; may revisit) |
| Video already in `caption_skips` as `no_captions` + ASR enabled | **Yes once** (or “retry ASR” CLI) — success removes skip / writes recipe |

**Default ASR enablement (proposal for owner):**

- Env `ROUX_ASR=1` or CLI `npm run sync -- --asr`  
- **Off by default** so CI/dev without models don’t hang  
- When off, behavior identical to today  

### 4.7 Sync integration (`lib/sync/run.ts`)

Pseudo-flow at the current `fetchTranscriptDetailed` call site:

```
const transcript = await fetchTranscriptDetailed(videoId);
if (transcript.ok) { cues = transcript.cues; source = "youtube"; }
else if (transcript.kind === "no_captions" && asrEnabled) {
  const asr = await asrFromAudio(videoId, { language });
  if (!asr.ok) { skip + maybe asr_failed detail; continue; }
  cues = asr.cues; source = "asr";
  // do not leave no_captions skip blocking forever if ASR succeeded
} else { existing skip path }
// extractRecipe(cues) unchanged
```

**Budget:** ASR videos **do** count toward `maxNew` / extract budget (they spend Anthropic). Caption *fetch* failures still must not burn extract budget; ASR *success* then extract is a normal write.

**Progress UI:** stages like `Downloading audio…` / `Transcribing (whisper)…` so a 10‑minute silent wait is not mistaken for a hang.

### 4.8 Data / product semantics

| Field | Proposal |
|---|---|
| Recipe row | No schema change required in v1 |
| `sync_runs.detail` | Record `{ videoId, source: "youtube"\|"asr", asrModel?, asrLang?, durationMs? }` next to extracts |
| Confidence | Unchanged from Claude; optionally bias default lower only if we add a product rule later — **not required v1** |
| UI badge | Optional later: “From audio” on detail — nice-to-have, not blocking |

Verified / notes rules unchanged. ASR is only another way to get cues.

### 4.9 Security / compliance

- Audio stays on the owner’s machine by default (no upload to Anthropic as audio — only **text cues** go to Claude, same as captions).  
- yt-dlp + private playlist access must use the same identity story as local sync today (cookies / logged-in network as user already does).  
- Do not commit model weights or audio caches to git.  
- Document that this is for **personal library** use (same as local caption scrape).

### 4.10 Failure modes

| Failure | Behavior |
|---|---|
| yt-dlp missing / fails | Skip video; detail reason `asr_download_failed`; do not upgrade caption_skip kind over `no_captions` incorrectly |
| whisper missing / model missing | Fail fast at sync start if `--asr` set |
| Empty ASR text | Skip; `asr_empty` |
| Partial long video | v1: full audio; optional later `--asr-max-minutes=N` |
| OOM / killed | Leave no cache; retry next run |

---

## 5. Chinese-specific notes

- whisper.cpp **supports Chinese**; force `-l zh` for this library.  
- Prefer **`medium`** minimum; `large-v3-turbo` if quality issues on ingredients.  
- Mandarin >> Cantonese quality; accept Cantonese as best-effort.  
- Ingredient names will still be messy → Claude extract remains the structure layer (same as bad CN captions).  
- Long Chinese transcripts already motivated `MAX_TOKENS = 8192` and extract retries (LLM-1 telemetry still thin for truncation case — ASR will generate more of those samples).

---

## 6. UX / CLI surface (v1)

```bash
# Opt-in local ASR for no_captions only
ROUX_ASR=1 ROUX_ASR_LANGUAGE=zh npm run sync

# Or
npm run sync -- --asr --asr-lang=zh
```

Optional later:

- Settings toggle “Transcribe caption-less videos (local Whisper)” — only meaningful on machines that run local sync; **skip in v1** if CLI/env is enough.  
- Sync UI list of caption skips with “Retry with audio” button → still needs local agent; hard on pure Vercel. Prefer CLI v1.

---

## 7. Implementation plan (after approval)

| Step | Work | PR shape | Verify |
|---|---|---|---|
| 1 | Design accepted (this doc) | docs PR | review |
| 2 | `lib/asr/` module: types, cue map, cache read/write, pure path helpers + unit tests (no binary) | small | `npm test` |
| 3 | Shell adapter: detect yt-dlp + whisper.cpp, run download/transcribe, parse JSON → cues | local-only; skip in CI | manual smoke on 1 CN video |
| 4 | Wire `run.ts`: gate `no_captions` + `ROUX_ASR`; progress strings; detail telemetry | thin | local sync |
| 5 | Docs: README “Local ASR setup” (install models, env vars, disk) | docs | — |
| 6 | (Optional) `--asr-max-minutes`, engine switch mlx/faster-whisper | later | — |

Do **not** block on schema migration in v1.

---

## 8. Decisions — **proposed** (for review)

| # | Decision | Proposal | Needs |
|---|---|---|---|
| D1 | Engine | whisper.cpp default; pluggable later | review |
| D2 | Where | Local sync only; never Vercel | review |
| D3 | Trigger | Only `no_captions` + explicit opt-in | review |
| D4 | Language default | `zh` | **@owner** confirm |
| D5 | Cache | Filesystem under `~/.cache/roux/asr` | review |
| D6 | Extract | Unchanged `CaptionCue[]` path | review |
| D7 | Cost | Free local; no hosted ASR in v1 | review |
| D8 | Default on/off | **Off** unless `ROUX_ASR=1` / `--asr` | review |
| D9 | Auth-blocked | Never ASR; fix captions access | review |

---

## 9. Open questions

1. **@owner:** Default language always `zh`, or auto when title/channel has CJK?  
2. **@owner:** Max video length before skip (e.g. 45 min)?  
3. **@claude-reviewer:** Prefer shelling out to whisper.cpp vs requiring a Node binding? (Proposal: shell out — fewer native build issues.)  
4. Should successful ASR **delete** the `caption_skips` row for that video? (Proposal: **yes**, or set kind that doesn’t block re-fetch — so a later YouTube caption appearance can win.)  
5. Store `transcript_source` on `recipes` row for UI badge? (Proposal: **defer**; sync detail is enough for v1.)

---

## 10. Acceptance criteria (to mark ACCEPTED)

1. @claude-reviewer: no blocking design objections (or AGREED with written deltas folded in).  
2. @owner: language default + opt-in vs always-on for local sync.  
3. §8 decisions settled.  
4. Implementation may start at §7 step 2 only after status → **ACCEPTED**.

---

## 11. Success metrics (post-ship)

- Share of `no_captions` videos that become written recipes with ASR enabled  
- Median wall time per ASR video (download + whisper)  
- Extract `attempts` distribution on ASR-sourced Chinese transcripts (feeds LLM-1)  
- Manual: 3 Chinese cooking videos, captions disabled → recipes with usable step timestamps  

---

NEXT: @claude-reviewer
