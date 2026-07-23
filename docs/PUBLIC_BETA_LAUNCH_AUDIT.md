# Public Beta Launch Audit

_Date: 2026-07-22 · base commit 87797f00 (+ nightly bot d46e4f9b) · money md5 `affe6b21071f2b3be96bb2774eb347c3`_

Audit of all public routes for launch defects across 9 categories: stale dates, missing simulations / empty
states, broken links, mobile/desktop overflow, OpenGraph/canonical metadata, internal-research leakage,
unsupported prediction claims, World Cup-as-active-product, and Bank Builder / Moonshot shown as live money.

## Verdict

**No BLOCKING defect.** The shared chrome (nav, footer, command-rail, mobile-bottom-nav, disclaimer) is clean:
every internal link resolves, there is no active World Cup product link, Bank Builder / Moonshot are consistently
paper / $0, and no research internals (`BLOCKED` / `INSUFFICIENT` / raw obs counts / `data/internal`) leak onto a
public page. Two themes needed fixing before launch — **shareability** (no OpenGraph image) and **language
discipline** (residual "edge / EV / value" advantage vocabulary). Both are addressed below.

## Findings & disposition

Severity: BLOCKING = misleading claim / research leak / WC-as-active / real-money implication / broken core route.
HIGH = wrong metadata on a primary shareable route, forbidden advantage claim, dead primary link. MEDIUM =
secondary polish. LOW = cosmetic.

### HIGH — all FIXED

| # | Cat | Location | Defect | Fix |
|---|-----|----------|--------|-----|
| H1 | 5 | `layout.tsx` (all routes) | No OpenGraph/Twitter image anywhere — every share link had no preview | Added default `openGraph.images` + `twitter.card: summary_large_image` (brand logo 1672×941) in the root layout → inherited by every route |
| H2 | 7 | `home/featured-simulations.tsx`, `games/simulate-lobby.tsx` | "+N% **edge**" advantage badge on home + /simulate | Relabelled to "+N% **model gap**" |
| H3 | 7 | `methodology/page.tsx` | Explicitly-forbidden "**positive-EV**" | Reworded to "large model gap but low win probability" |
| H4 | 9 | `methodology/page.tsx` | "**activates for real money**" on a paper-only product | Reworded to "stays paper-only; a future live version would first require…" |

### MEDIUM — FIXED

| # | Cat | Location | Defect | Fix |
|---|-----|----------|--------|-----|
| M1 | 5 | `methodology`, `responsible-use` | No `metadata` export (inherited generic title) | Added per-page `metadata` (title + description + article OG) |
| M2 | 8 | `learn/page.tsx` | World Cup listed **first** as an active covered sport | Reordered (MLB first); WC moved last and marked **Archived** |
| M3 | 8 | `methodology/page.tsx` | WC/Soccer present-tense "**are live**" | Changed to past-tense + "the World Cup is now archived" |
| M4 | 1 | `page.tsx` | Hardcoded fallback "resumes Jul 17" (today 07-22) | Replaced with a non-dated fallback |
| M5 | 1 | `mlb/page.tsx` | Stale `DEFAULT_DATE = "2026-05-16"` board fallback | Falls back to `currentEtDate()` |
| M6 | 1 | `learn/page.tsx` | Hardcoded "(June 12)" in a heading | Removed the parenthetical |
| M7 | 7 | `learn/page.tsx` | "Edge" concept + "EV" term list | Renamed concept to "Model gap"; dropped "EV" |

### LOW — FIXED (cheap) / NOTED

| # | Cat | Location | Defect | Disposition |
|---|-----|----------|--------|-------------|
| L1 | 5 | `picks/page.tsx` | Title "Parlay Lab" vs page "Picks Lab" | **Fixed** → "Picks Lab · GameTimePicks" |
| L2 | 7 | `board/page.tsx` | "a 200% edge" in a scale explainer | **Fixed** → "200% gap" |
| L3 | 6 | `research/page.tsx` | Milestone names the "30 dates" gate threshold | **Kept** — a forward-looking target, not the raw "1/30"/"BLOCKED"/"INSUFFICIENT" gate math; reads as progress |
| L4 | 3 | nav "Game Reports" → `/games` → client-redirect `/simulate` | Label lands on Simulate | **Kept** — intentional alias, not a dead link |
| L5 | 2 | `games/[sport]/[gameId]` | MLB games show the generic "build your own" fallback cards (engine cards only built for `world_cup`) | **Noted** — the fallback CTA is honest; per-game MLB card mapping is future work, not a launch defect |

## Categories that came back CLEAN

- **Cat 3 — broken links:** every `href="/…"` in `src/app` + `src/components` resolves to an existing route.
- **Cat 4 — overflow:** no fixed pixel widths > 375px on in-scope pages; dense nav strips use `overflow-x-auto`;
  page shells use `overflow-x-hidden`.
- **Cat 6 — research leakage:** no public in-scope page reads `data/internal` or renders gate/blocker/count
  strings. (`/ops`, `/preview/*` are `noindex` and pruned from `out/` — out of the public audit scope.)
- **Cat 8 — WC as active product:** no active nav/rail/footer/homepage/product-card link to a live WC product
  (only historical / methodology / negation mentions remain, now consistently past-tense).
- **Cat 9 — BB/Moonshot as live money:** consistently framed paper / $0 / educational; the one "real money"
  wording (H4) is fixed.

## Follow-ups (not launch blockers)

- Per-route canonical URLs. A global `alternates.canonical` was intentionally **not** added — inherited by every
  non-overriding page it would wrongly canonicalize the whole site to `/`. Per-page canonicals are future work.
- Per-game OpenGraph images (a stable default now covers every route; a game-specific image contract is future work).
