# UX-1 residual — Lighthouse a11y (2026-08-01)

Tool: Chrome DevTools MCP → Lighthouse (accessibility category). Fixture-mode local app (`AUTH_*` unset, no `DATABASE_URL`) so Library / Recipe / Cook / Settings render without OAuth. Login audited both local and production (`roux-green.vercel.app`).

## Scores (desktop, after fixes)

| Route | Before | After |
|---|---|---|
| `/login` (prod) | **93** | — (token fix ships with PR; recheck on deploy) |
| `/login` (local) | 93 | **100** |
| `/` Library | 96 | **100** |
| `/recipes/r1` | 94 | **100** |
| `/recipes/r1/cook` | — | **100** |
| `/settings` | 98 | **100** |

Mobile `/login` local: **100**.

## Failures found (before)

1. **color-contrast** (systemic) — brand accent `#c67139` and muted 55% mix (~`#807a71`) on `--color-bg` `#f5ead8` were ~3.0–3.6:1 (need 4.5:1). Also primary buttons (cream on accent), active segs, nav current, tag-outline, card meta, inline `neutral-500/600` labels.
2. **landmark-one-main** — login page had no `<main>`.
3. **heading-order** — `h1` → `h4` section titles skipped levels (recipe Ingredients/Steps/Notes, library shelves, settings sections).

`:focus-visible` already present in `organic.css` (static half of UX-1).

## Fixes

- Text/link/primary fills use **accent-700** / **neutral-700** for AA on page bg; decorative accent hex kept for focus rings / radio fills.
- Login wraps content in `<main>`.
- Section headings `h4` → `h2` (visual size preserved via `fontSize: 20` where needed).

## Out of scope

- Full authenticated prod run (OAuth). Fixture UI matches component chrome.
- Bulk CQ-2 token migration of inline styles (unchanged).
