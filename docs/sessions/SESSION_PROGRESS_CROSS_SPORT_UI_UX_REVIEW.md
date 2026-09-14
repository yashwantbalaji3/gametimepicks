# Cross-Sport UI/UX Review — Final Report

**Date:** 2026-05-16
**Branch:** `main`
**HEAD:** `e09c936` (PR #40 MLB MVP merged + live at https://gametimepicks.yashwantbalaji.com/mlb)
**Scope:** Review + written proposal only. No code shipped from this session except possibly the small "Tiny fixes" subset in §11, and only after explicit approval.

---

## 1. Current state

| Surface | Route | Status |
|---|---|---|
| Homepage | `/` | NBA-locked hero copy; MLB section exists but lives below the fold |
| NBA Board | `/board` | Polished — filter console, headliner rail, full vault cards, sparklines, 16 player cards, R5 anomaly chips |
| Parlay Lab | `/parlay-lab` | NBA-only; no sport indicator; no MLB awareness |
| Results | `/results` | NBA-only; no sport tabs; "1 slate settled · 55.2%" applies only to May 15 NBA |
| MLB Hub | `/mlb` | Hero + 4 KPI tiles + 2 CTA cards + sub-nav · no top-leans preview, no headliner equivalent |
| MLB Board | `/mlb/board` | 15 game sections · 327 lean rows · avatars wired · **no filter console, no headliner rail, no sparklines** |
| MLB Power | `/mlb/power` | Honest "warming up" pending state · planned inputs listed · today's slate · no fabricated HR picks |

**Working tree:** clean except expected untracked session docs / `.claude/` / root logo.

**Paid Odds API:** 81 credits spent on this branch lifetime; 368 remaining; cache warm for the next ~18 hours.

---

## 2. Visual audit findings

### 2.1 Horizontal overflow

Only **the homepage** overflows the viewport:
- Desktop 1280 → docScrollW 1293 (13 px past viewport)
- Mobile 402 → docScrollW 419 (17 px past viewport)

Source: the hero section's decorative chrome (`vault-data-orbit` + `neon-corner-bracket` + `gtp-line-scan`) extends ~52 px past viewport on the right; the page-shell `overflow-x` is not clipping it. Already-shipped fix on MLB pages was to add `overflow-x-hidden` on the outer `vault-page-shell` div. Homepage doesn't have it.

### 2.2 Console & server health

- **0 browser console errors** across all 7 routes
- **0 server errors** in dev logs
- All 7 routes return HTTP 200 (with trailing-slash 308 redirects which Next.js handles)

### 2.3 Sport-context awareness (the big finding)

| Page | Tells user this is NBA? | Tells user MLB exists? | Allows pivot? |
|---|---|---|---|
| `/board` | ⚠️ No (header says "Model board · live", not "NBA Board") | ⚠️ No top-of-page MLB link (only buried in nav) | Via top nav only |
| `/parlay-lab` | ❌ Silently NBA-only | ❌ No mention | Via top nav only |
| `/results` | ❌ Silently NBA-only | ❌ No mention; "1 slate" phrasing implies cross-sport | Via top nav only |
| `/mlb/*` | ✓ Clear (MLB · educational analytics) | n/a | Via top nav + section tabs |

The NBA surfaces don't say they're NBA. They were built when NBA was the only sport. Now MLB is live but the NBA surfaces don't acknowledge it.

### 2.4 MLB board scan ergonomics

327 leans across 15 game sections is too many to read sequentially without:
- A "Top clean leans" strip above the games (NBA has Featured Headliners)
- A filter console (NBA has confidence / team / sort / min-edge / market)
- An anchor jump menu (NBA's Featured tiles double as scroll anchors)
- A sparkline per lean (NBA shows recent-form via vault-sparkline; MLB has `recentSeries` in the JSON but doesn't render it)

### 2.5 NBA homepage copy

Hero literally reads "Transparent model leans on **NBA player props**." Out of date now that MLB is live.

---

## 3. Biggest UX problems

Ranked by user impact:

1. **The product lies about being multi-sport.** Nav says "NBA · MLB" but Parlay Lab, Results, and homepage hero copy are NBA-only with no acknowledgement.
2. **MLB board doesn't scale to 327 leans.** No top strip, no filters, no scan mode. Users must scroll 15 game sections to find anything.
3. **MLB lean rows are visually dense.** Identity + market + reason + odds + chip cram into ~120 px of vertical space per row; even with the rewrite from the last polish PR, three rows feel "list-like" next to NBA's distinct cards.
4. **No projection-vs-line visualization on MLB.** NBA's `ProjectionVsLineTrack` (gap bar, capped fill) is the most scannable element on a card. MLB shows raw text `proj 0.93` next to `Under 1.5` — readers must compute the gap themselves.
5. **No recent-form sparkline on MLB** even though the data is present. NBA gets sparklines; MLB doesn't.
6. **Parlay Lab is mode-blind.** No NBA / MLB / Multi tabs even as disabled stubs to signal direction.
7. **Results page has no MLB pending state.** Reads "1 slate settled" — true for NBA but should also say "MLB results pending — first slate grades Sun May 17 evening" or similar.
8. **Homepage hero overflow** is a minor pixel-bleed but visible on mobile.

---

## 4. NBA / MLB consistency gaps (component-level)

| NBA primitive | MLB equivalent today | Gap |
|---|---|---|
| `vault-player-card` (deluxe + scan modes) | `mlb-lean-row` (single stacked row) | MLB has no card mode — only list rows |
| `featured-headliners` (star rail with anchors) | none | MLB is missing this |
| `vault-filters` (confidence / market / team / sort / min edge) | none | MLB board has zero filters |
| `vault-sparkline` / `trend-sparkline` | none | MLB has the data; doesn't render |
| `ProjectionVsLineTrack` (gap bar visualization) | text only | MLB readers compute by eye |
| `slate-tabs` (date strip across the top) | none on MLB | MLB only loads today |
| `sportsbook-status-board` hero panel | `mlb-summary-strip` (textual only) | MLB has no LED-style hero |
| Per-game scorecards on Results | NBA only | MLB has no Results entry yet |
| `anomaly-guardrail-panel` on Results | NBA only | MLB doesn't surface its R5 anomaly count beyond a lean-row chip |
| `parlay-builder-client` (Conservative / Balanced / Aggressive) | NBA only | No MLB lab; no Multi mode |
| `parlay-results-disclosure` (no fake hit rates) | n/a (no MLB results) | will need MLB-specific version |
| Logo, nav, footer, disclaimer banner | shared | ✓ already consistent |

---

## 5. Recommended navigation / routing architecture

I recommend **Option A (keep current URLs + add sport context)** for now, with a stub redirect plan that lets us migrate to Option C later if we want sport-namespace SEO.

### Comparison

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **A — keep `/board`, `/parlay-lab`, `/results` as NBA defaults; sport context within** | Zero broken URLs · No 301 hops · Matches current pattern · Cheapest path to launch | Locks the sport-default = NBA assumption into URL shape · `/board` ambiguous in nav after MLB scales | Low | S |
| **B — full sport namespaces (`/nba/board`, `/nba/parlay-lab`, `/nba/results`)** | Cleanest taxonomy · Each sport gets a clear home · Future sports drop in trivially | Breaks every existing bookmark + share link · Vercel preview comments rot · SEO juice on `/board` resets unless redirected | High | M |
| **C — hybrid: add `/nba/*` aliases as 308 redirects to current routes; new sports get their own namespace** | No broken URLs · Future sports use clean namespace · Easy to flip canonical later | Two paths render the same content for a while · Minor cognitive cost | Low-Med | S-M |

**My recommendation: ship A now and queue C later.** Concretely:

- Keep `/board` = NBA Board, `/parlay-lab` = NBA Parlay Lab (with Multi mode added under it), `/results` = global model audit with tabs.
- Add `(NBA)` or `(MLB)` chip on each page header where ambiguous.
- When we add a third sport (NHL? NFL?), revisit C and move to `/nba/*` with 308 redirects from the legacy paths.

### Nav labels — recommended

Keep what we have: **Home · NBA · MLB · Parlay Lab · Results · Methodology · Responsible Use**.

When Parlay Lab gets multi-sport, the label stays "Parlay Lab" (verb-noun, not sport-anchored). Inside the page, tabs become **NBA only · MLB only · Multi-sport**.

### In-section sub-nav

MLB already has Overview / Board / Power Board. **Add the same pattern to NBA** so the two sports feel symmetric:

- NBA: Overview / Board / Parlay Lab / Results
- MLB: Overview / Board / Power Board / Results (once it exists)

This is a small but high-value visual change.

---

## 6. Unified projection display design

The shared primitive I'm proposing is **`<ProjectionCard>`** — a sport-agnostic component that NBA and MLB both render to.

### Required props (sport-agnostic)

```ts
interface ProjectionCardProps {
  sport: "NBA" | "MLB";
  player: { id: number | null; name: string; team: string; opponent: string; role?: "pitcher" | "batter" };
  game: { id: string; tipoff: string; venue?: string; chip?: string };  // chip = "GAME 7", "DOUBLE-HEADER", etc.
  markets: Array<{
    key: string;                    // "PTS" / "REB" / "AST" / "pitcher_strikeouts" / etc.
    label: string;                  // "Points" / "Strikeouts"
    line: number;
    projection: number | null;
    sigma?: number | null;
    edgePct: number | null;
    confidence: "High" | "Medium" | "Low" | "insufficient_data" | "no_play";
    lean: "Over" | "Under" | "Pass" | "No Play";
    odds: { over: number; under: number; bookmaker: string };
    riskFlags?: string[];
    recentSeries?: number[];        // for sparkline
    reasonBullets?: string[];       // ["Last 5: 20.8", "Minutes trending down", ...]
  }>;
  mode?: "scan" | "detailed";       // compact 1-line vs full card
}
```

### Layout per row/card (unified)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [avatar]  Player Name                                  [HIGH chip]   │
│           TEAM vs OPP · role · venue · tipoff                        │
├─────────────────────────────────────────────────────────────────────┤
│ MARKET · Over 1.5  ─────[gap bar]─────  proj 1.5    edge +9.8%       │
│ (or compact: MARKET · Over 1.5 · proj 1.5 · edge +9.8%)              │
├─────────────────────────────────────────────────────────────────────┤
│ ▌ Last 10: 1.40 · Season: 1.60 · 43 games   [sparkline ▁▃▆▂▅▁▇]      │
│ ▌ +149 · draftkings                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

For multi-market players (NBA's grid of PTS/REB/AST or MLB batters with hits+TB), render markets as stacked sub-rows inside the same card with shared identity cluster.

### Scan vs Detailed mode

- **Detailed (default desktop, default mobile for top-3 leans):** as above with sparkline + reason bullets
- **Scan (default mobile after the top 10, optional desktop dense mode):** single-line `[avatar 24px]  Player · MKT · Over 1.5 · +9.8% · HIGH`

A toggle in the filter console: `Density: Detailed | Scan`.

### Insufficient-data treatment

Mute the row: faint border, no projection number ("Sample too small to project"), no edge, no gap bar. Keep the player + market visible so users still see what's posted — just don't pretend we have an opinion.

---

## 7. MLB board upgrade plan

In priority order:

### 7.1 Top-of-board scan tools (highest impact)

1. **Top Clean Leans strip** — mirror of NBA's `featured-headliners.tsx`. 6–10 highest-edge leans from `confidence ∈ {High, Medium}` with `riskFlags` empty. Tile = avatar + player + market + edge + jump-link to its game section.
2. **Pitcher Spotlight** — separate strip for the day's pitcher_strikeouts leans (sport-specific because batters appear in 3 markets each but pitchers in only 1). Helps a user say "show me only the K props."
3. **Filter console** — port `vault-filters` to MLB:
   - Market chips: All / Strikeouts / Hits / Total Bases
   - Confidence chips: All / High / Medium / Low / Insufficient
   - Team filter
   - Sort: Edge / Confidence / Tipoff
   - Min-edge slider
   - Density toggle (Detailed / Scan)
4. **Density toggle** — Scan mode collapses each lean to one line so users can sweep all 327 quickly.

### 7.2 Card upgrades

5. **Adopt `<ProjectionCard>` for MLB** with `mode="detailed"` for top leans, `mode="scan"` for the rest.
6. **Render the existing `recentSeries` as sparklines** (free — data is already on disk).
7. **Add the gap-bar projection-vs-line visualization** (sport-agnostic; same component NBA uses).
8. **Anomaly callout pattern** — when a row has `r5_model_anomaly`, surface a one-line "Why flagged" link next to the chip, matching how NBA expands risk notes.

### 7.3 Sectioning

9. **Pitcher Spotlight section** at the very top (above game sections), grouped by start time.
10. **Batter Board section** below — grouped by game, sorted within game by confidence × edge magnitude. Existing structure mostly works; just needs the upgrades above.

### 7.4 Power Board richer pending state

11. Add a single illustration / explainer card to `/mlb/power` showing "Here's how a power profile will look" using a clearly-labeled example with `data-mode="preview"`. Don't fabricate real picks. Mockup framing only.
12. Add a planned-input checklist with status: `Baseball Savant barrel rate · feasibility confirmed, not wired · Park factor · feasibility unknown · Weather · feasibility unknown · Pitcher HR allowed · feasibility confirmed`.

### 7.5 Game cards (already mostly there)

The current `mlb-game-section.tsx` is solid. After the avatar wiring last PR, only minor touches:

- Optional double-header indicator if `gamePk` collides on date+teams (rare but happens — already supported in MLB Stats data)
- Sortable game card by aggregate edge if filter mode = "sort by edge"

---

## 8. NBA consistency upgrade plan

These keep NBA from getting worse while MLB catches up:

1. **Header label**: change `/board` page header from "Model board · live" to "**NBA Board · live**" (matches MLB hub's "MLB · educational analytics" pattern).
2. **Homepage hero**: change "Transparent model leans on NBA player props" to something sport-neutral. Suggestion: "Transparent model leans on NBA & MLB player props." or rotate by primary slate.
3. **Add NBA section tabs** at top of `/board` and `/parlay-lab`: Overview / Board / Parlay Lab / Results. Mirrors MLB's Overview / Board / Power Board pattern.
4. **Add Results tabs** — `[NBA] [MLB pending]` with the MLB tab disabled but visible so users see it's coming.
5. **Add Parlay Lab pre-mode tab strip** — `[NBA only · active] [MLB only · soon] [Multi-sport · soon]`. Disabled stubs with a one-line "Coming soon" tooltip.
6. **Homepage MLB section** — already present from PR #40; consider raising it above the fold by tightening the headliner rail.

These NBA changes are pure copy + tab additions; no logic, no data changes, no regressions.

---

## 9. Multi-sport Parlay Lab architecture

The hard prerequisite from the original handoff still holds: **must persist candidate snapshots before we claim parlay hit rates.** Same constraint for NBA-only, MLB-only, and Multi-sport.

### 9.1 Sport-neutral leg schema

```ts
interface ParlayLeg {
  sport: "NBA" | "MLB";
  date: string;                    // YYYY-MM-DD ET
  gameId: string;                  // odds-API event id
  gameKey: string;                 // `${sport}:${gameId}` for cross-sport disambiguation
  player: { id: number | null; name: string; team: string; opponent: string };
  market: string;                  // raw market key: "PTS", "pitcher_strikeouts"
  marketLabel: string;             // pretty: "Points", "Strikeouts"
  side: "Over" | "Under";
  line: number;
  projection: number | null;
  edgePct: number | null;
  confidence: "High" | "Medium" | "Low" | "insufficient_data";
  riskFlags: string[];
  odds: { value: number; bookmaker: string };
}
```

Both NBA and MLB pipelines emit leans that map cleanly to this shape with a small adapter. Today's NBA `PropLean` and MLB `MlbBoardLean` need shims (~50 lines of code combined) to flatten into `ParlayLeg`.

### 9.2 Candidate generator

`buildCandidates(legs: ParlayLeg[], opts: BuilderOpts)` is the existing NBA function generalized. New `opts`:

```ts
interface BuilderOpts {
  mode: "nba_only" | "mlb_only" | "multi_sport";
  risk: "Conservative" | "Balanced" | "Aggressive";
  maxLegs: number;
  maxLegsPerGame: number;
  excludeAnomalies: boolean;
  maxAnomalyLegs: number;
  sportMix?: { nba?: number; mlb?: number };    // multi-sport only: min legs per sport
  crossSportPreferred?: boolean;                 // multi-sport only: penalize same-game/same-team correlation
}
```

Filtering by mode is trivial: `legs.filter(l => mode === 'multi_sport' || l.sport === modeSport)`.

### 9.3 Correlation logic (per leg pair)

- **Same-game** (`leg.gameKey === other.gameKey`): warn chip + cap to 1 leg per game in Conservative, up to 2 in Balanced
- **Same-team** (`leg.player.team === other.player.team` and same `sport`): soft warn ("multi-leg on same team")
- **Same-player**: hard disallow within the same parlay (already enforced for NBA; mirror for MLB)
- **Cross-sport** (`leg.sport !== other.sport`): low direct correlation; useful for Multi mode to reduce variance bundles. **Not zero correlation** (game outcomes can be loosely affected by news cycles, sportsbook line shading), so frame as "lower correlation" not "uncorrelated."

### 9.4 Risk profiles (extension of current NBA modes)

| Profile | NBA-only | MLB-only | Multi-sport |
|---|---|---|---|
| Conservative | 2 legs, High only, clean, 1 per game | 2 legs, High only, clean, 1 per game | 2 legs, High only, prefer one NBA + one MLB (cross-sport reduces variance bundle) |
| Balanced | 2–3 legs, High/Med, clean, up to 2 per game | 2–3 legs, High/Med, clean, up to 2 per game | 3 legs, High/Med, balanced sport mix |
| Aggressive | 3 legs, all tiers, ≤1 anomaly labelled | 3 legs, all tiers, ≤1 anomaly labelled | 3–4 legs, all tiers, ≤1 anomaly labelled |

### 9.5 Candidate snapshot persistence (the unlock)

Before any Parlay results UI can claim hit rates, we need:

1. **Snapshot at board generation time.** Right after `generate_daily_board` (NBA) and `generate_mlb_board` (MLB) write their boards, immediately run a `snapshot_candidates` step that:
   - Builds candidates for every (sport × risk × mode) combination using *that snapshot's* lean set
   - Writes to `app/public/data/parlays/{sport_or_multi}/{date}.json`
   - Locks in player IDs, market, line, lean, odds — so post-game grading can settle them
2. **Grade after all games finish.** A new `pipeline.settle_parlay_candidates` reads the snapshot, grades each leg against actual stats, marks the parlay won iff all legs won.
3. **Display.** Parlay Lab Results section shows per-mode hit rate, by-risk-profile breakdown, "biggest miss" / "best parlay" callouts. Same honest framing NBA Results uses today.

**Without snapshots, the Multi-sport Parlay Lab cannot have a Results tab.** Disclosure pattern stays: "Candidate snapshots not persisted — hit rate would require it. Coming next."

### 9.6 Public copy

- "Candidate slip" / "candidate parlay" — already in use
- "Cross-sport mix" — new for Multi mode
- "Lower-correlation construction" — for Conservative Multi
- "Same-game correlation chip" — existing, reuse
- **Never** "safe bet" / "lock" / "guaranteed" / "best bet" / "free money" / "can't miss" / "no room for error"

---

## 10. Prioritized PR roadmap

Each PR is independently shippable. Each lists files likely touched, risk, tests, acceptance, and rollback.

### PR A — Cross-sport navigation + shared sport headers (small, fast)

**Goal:** Make NBA/MLB feel like sibling products in the chrome.

- Files: `nav.tsx`, `app/page.tsx` (hero copy), `app/board/page.tsx` (page header), `app/parlay-lab/page.tsx` (page header), `app/results/page.tsx` (sport-pending banner). New: `components/sport-section-tabs.tsx` (generalize MLB section tabs to NBA too).
- Risk: Low. Cosmetic + tab additions only.
- Tests: typecheck, build, public_copy, NBA pipeline tests, browser visual at 1280 + 390.
- Acceptance:
  - NBA `/board` reads "NBA Board · live" in header
  - Homepage hero acknowledges both sports
  - All four sport-relevant pages (NBA Board, NBA Parlay Lab, NBA Results, MLB Hub) carry symmetric section tabs
  - Mobile + desktop overflow stays clean
- Rollback: `git revert`

### PR B — Homepage overflow fix + MLB section above the fold

**Goal:** Kill the 13px desktop overflow + raise MLB section higher.

- Files: `app/page.tsx` (add `overflow-x-hidden` on the page shell; reorder MLB section higher).
- Risk: Low.
- Tests: same as PR A.
- Acceptance: docScrollW == innerWidth on `/` at 1280 and 390.
- Rollback: `git revert`.

### PR C — Shared `<ProjectionCard>` primitive (medium)

**Goal:** Decouple the projection-card visual from NBA-specific data shape.

- Files: New `components/projection-card.tsx`, `components/projection-vs-line-track.tsx`, `components/recent-form-sparkline.tsx` (or rename existing sparkline). Refactor `vault-player-card.tsx` to render `ProjectionCard` internally for one path while keeping the existing 3-market grid for NBA's distinctive layout. Refactor `mlb-lean-row.tsx` to wrap `ProjectionCard`.
- Risk: Medium — NBA card has lots of state and could regress.
- Tests: full NBA regression visual diff at desktop + 390; MLB visual sweep; bundle-size delta should be tiny because primitives consolidate.
- Acceptance: NBA cards unchanged pixel-for-pixel; MLB cards adopt gap bar + sparkline + reason-bullet treatment.
- Rollback: `git revert`.

### PR D — MLB Board scan tools (large, highest user impact)

**Goal:** Make 327 leans navigable in seconds.

- Files: `app/mlb/board/page.tsx` (header upgrades), new `components/mlb/mlb-top-leans-strip.tsx`, new `components/mlb/mlb-pitcher-spotlight.tsx`, new `components/mlb/mlb-filter-console.tsx` (or generalize `vault-filters.tsx` to accept sport-specific market list). Touches `data-mlb.ts` to expose summary aggregates.
- Risk: Medium-High — most code change.
- Tests: typecheck, build, public_copy, mobile visual at 390, console-error sweep, anchor-jump scroll-margin verification.
- Acceptance:
  - Filter console works (market, confidence, team, sort, min edge, density)
  - Top Clean Leans strip shows 6–10 tiles anchor-linking into game sections
  - Pitcher Spotlight shows day's strikeout leans grouped by tipoff
  - Density toggle compresses lean rows to one line in Scan mode
- Rollback: `git revert`.

### PR E — Power Board richer pending state (small)

**Goal:** Make `/mlb/power` feel intentional, not empty.

- Files: `app/mlb/power/page.tsx`, optional new `components/mlb/mlb-power-preview-card.tsx` with `data-mode="preview"` mockup framing.
- Risk: Low.
- Tests: typecheck, build, public_copy.
- Acceptance: page reads as "warming up with a plan" not "warming up with nothing"; no fake HR picks.
- Rollback: `git revert`.

### PR F — MLB Results shell + settlement

**Goal:** Grade MLB props after they finish; surface on `/results` under an MLB tab.

- Files: new `pipeline/mlb/settle_results.py`, new `pipeline/mlb/export_mlb_results.py`, `app/results/page.tsx` (add sport tabs), new `components/mlb/mlb-anomaly-guardrail-panel.tsx`, `components/mlb/mlb-per-game-scorecard.tsx`.
- Risk: Medium — touches Results which is currently NBA-only.
- Tests: new Python test file `pipeline/mlb/settle_results_test.py`; NBA regression on `/results` (no NBA hit-rate changes).
- Acceptance: `/results` has `[NBA] [MLB]` tabs; MLB tab shows real settled rows after the first MLB slate finishes (Sunday May 17 evening); no fake MLB results; same honest disclosure language as NBA.
- Rollback: `git revert`.

### PR G — Candidate snapshot persistence (sport-by-sport)

**Goal:** Unlock parlay hit-rate reporting for NBA first.

- Files: `app/src/lib/parlay-builder.ts` (extract a stable serializer), new `pipeline/snapshot_candidates.py` (calls into TS lib via a small JSON contract or duplicates the builder in Python), new `app/public/data/parlays/nba/{date}.json` shape.
- Risk: Medium — builder must be deterministic.
- Tests: snapshot stability test (same lean set produces same candidates); grading test.
- Acceptance: snapshot file exists for each NBA slate; settlement step grades it; Parlay Lab Results section shows real per-mode hit rate (single-slate disclaimer remains).
- Rollback: `git revert`.

### PR H — Multi-sport Parlay Lab modes (requires PR C, F, G done)

**Goal:** Ship the user's headline ask: NBA-only / MLB-only / Multi-sport tabs in Parlay Lab.

- Files: `app/parlay-lab/page.tsx`, `parlay-builder-client.tsx` (mode tabs), `lib/parlay-builder.ts` (mode-aware filters + cross-sport correlation logic), new `lib/parlay-leg-adapter.ts` (flatten NBA + MLB leans to shared `ParlayLeg`).
- Risk: High — most behavior change.
- Tests: full test suite + new builder tests (cross-sport correlation, mode filtering).
- Acceptance:
  - Three mode tabs work; default is "NBA only" until MLB has settled history
  - Multi-sport mode produces ≥1 NBA + ≥1 MLB leg in Conservative
  - Same-game / same-team / same-player warnings work cross-sport
  - Results tab still honest about persistence (relies on PR G)
- Rollback: `git revert`.

### Suggested order

1. PR A (chrome consistency — fast wins)
2. PR B (homepage overflow — small)
3. PR D (MLB scan tools — biggest user-felt improvement)
4. PR C (shared ProjectionCard — refactor; safe after D is shippable)
5. PR E (Power Board polish)
6. PR F (MLB Results)
7. PR G (snapshot persistence)
8. PR H (Multi-sport Parlay Lab)

PRs A + B + D + E can all ship in a single overnight window if scoped tightly. F + G + H are the substantial follow-on work.

---

## 11. Tiny low-risk fixes worth doing *before* the bigger PRs

I found four tiny issues during the audit. Each is independently shippable in a small PR and improves the live product immediately without any architectural change. **Not implemented yet — proposing for your approval first.**

| # | Fix | Files | Lines | Risk |
|---|---|---|---|---|
| 1 | Add `overflow-x-hidden` to `app/page.tsx` page-shell (kills the 13 px desktop / 17 px mobile overflow) | `app/src/app/page.tsx` | 1 | Trivial |
| 2 | Change `/board` header label from "Model board · live" to "NBA Board · live" so it matches MLB hub framing | `app/src/app/board/page.tsx` | 1 | Trivial |
| 3 | Soften homepage hero copy from "...NBA player props" to "...NBA & MLB player props" (one word change) | `app/src/app/page.tsx` | 1 | Trivial |
| 4 | Add a small "Switch to MLB" link in the NBA `/board` sub-nav area (matching MLB Section Tabs but as a stub until PR A ships) | `app/src/app/board/page.tsx` | ~10 | Trivial |

These can all land as a single "polish" commit on a branch like `fix/cross-sport-chrome-polish`. Build size delta will be negligible. Total diff under 50 lines.

**I recommend doing #1 and #3 first** (the highest-visibility two — a measurable overflow and an outdated hero copy). #2 and #4 are good follow-on but pair more naturally with PR A.

---

## 12. Recommended next immediate PR

**PR A (cross-sport navigation + shared sport headers) bundled with the tiny fixes #1–4 from §11.**

Why this first:
- Smallest diff, biggest perception change — users immediately see NBA and MLB as siblings.
- Unblocks PR D (MLB scan tools) by giving us a shared sport-tabs component to reuse.
- Cleans up the only known horizontal-overflow bug.
- Zero data changes, zero pipeline changes, zero workflow changes, zero paid API.

Estimated effort: 3–4 hours of focused work; ships in one PR.

**Awaiting your approval. No code changes have been made.**

---

## Constraints I observed during the review

- No paid API calls (probed cached data only)
- No workflow triggers
- No package/dependency changes
- No fabricated data, projections, results, or photos
- All MLB headshots come from official `midfield.mlbstatic.com` CDN (already shipped)
- Public copy scan: clean across all reviewed routes (no forbidden phrases on the live UI)
- Working tree: clean except expected untracked session docs, `.claude/`, root logo
- Dev server stopped after browser sweep
