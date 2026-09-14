# GameTimePicks Session Handoff — 2026-05-17 → NBA sport tabs + parlay snapshot work

> **Generated 2026-05-17 (~1am ET).** Source of truth for the next Claude Code conversation.
> Previous session is near its context limit; the next session has zero memory of prior chats.
> Read this entire file before doing anything else.

---

## 1. Current repo state

- **Working directory:** `~/Downloads/gametimepicks`
- **Branch:** `main`
- **HEAD:** `36ddcaa` — `feat(results): add sport-separated audits and mobile UX polish (#44)`
- **Working tree:** clean except expected untracked session docs + `.claude/` + root logo (see list below)
- **Live production:** https://gametimepicks.yashwantbalaji.com (canonical Vercel project: `gametime-picks`)

### Latest 30 commits on `main`

```
36ddcaa feat(results): add sport-separated audits and mobile UX polish (#44)
fc427d2 feat(mlb): settle completed May 16 props against box scores (#43)
4197846 feat(ui): polish MLB projection cards and cross-sport parlay roadmap (#42)
04fe441 feat(ui): unify sport UX and improve MLB board scanability (#41)
f89afa4 auto: Phase 10 daily refresh (2026-05-16T14:34Z) [skip ci]
e09c936 feat(mlb): add daily props board and Power Board MVP (#40)
263f1aa feat(slate): prepare May 17 Game 7 slate + parlay quality modes (#39)
9990269 feat(results): settle May 15 props against final box scores (#38)
6615829 auto-refresh: 2026-05-15 19:10 ET (props-only)
05d009d feat(ui): integrate logo and improve pending results experience (#37)
56cb53a feat(ui): playoff context + player spotlight visuals (#35)
8946a00 feat(ui): add final QA-driven casino polish (#34)
bd18ede feat(ui): casino UI overhaul — aurora halo, rim-LED cards, anatomy + awaiting panels (#33)
8baddd8 feat(ui): improve star discovery, parlay navigation, and results experience (#32)
ad2d69d fix(ui): mobile QA polish — disclaimer banner + anchor scroll offset (#31)
4307231 feat(ui): bring secondary pages into the sportsbook brand system (#30)
84ca5db feat(ui): sportsbook brand + neon visual polish (#29)
2477082 feat(ui): add "how to read these projections" educational disclosure on /board (#28)
db0349f feat(ui): polish Parlay Lab Build mode internals (#27)
16acb48 feat(ui): redesign board player cards for premium scanability (#26)
052fcde fix(pipeline): increase NBA provider timeout for schedule reliability (#25)
9db9030 data: generate May 15 prop projections from controlled paid Odds API run
70ed835 fix(pipeline): keep schedule endpoint_history JSON-serializable (#24) (#24)
c8d6d32 feat(ui): cohesive product makeover for core surfaces (#23)
980a480 feat(ui): redesign homepage with trending slate tabs (#22)
7b54e2e feat(ui): establish premium vault shell foundation (#21)
42d1a30 auto: Phase 10 daily refresh (2026-05-14T19:19Z) [skip ci]
e24c0d1 fix(pipeline): preserve existing recent10 when attach fetch fails (#20)
6864eea data: restore May 13 recent10 and apply guardrails
6a8db7b auto: Phase 10 daily refresh (2026-05-14T18:27Z) [skip ci]
```

### Open PRs (all stale legacy — leave alone)

| # | Title | Branch | State |
|---|---|---|---|
| 5 | Stop dry-run auto-refresh from clobbering real-prop boards | `fix/dry-run-clobber-guard` | UNKNOWN |
| 4 | Remove public operator leaks from board badge and home callout | `fix/public-status-leaks` | UNKNOWN |
| 2 | Fix auto-refresh workflow YAML syntax | `fix/auto-refresh-yaml` | UNKNOWN |
| 1 | Hide admin operator status from public board | `fix/hide-admin-status-on-board` | UNKNOWN |

### Latest merged PRs and what they shipped

- **#44 `36ddcaa`** — Sport-separated Results audits + tap-to-expand projection-vs-actual tables (NBA + MLB) + slim audit CTAs on board pages (hit-rate emphasis confined to Results) + Parlay Lab roadmap copy. Re-ran MLB May 16 settlement to mark `partial=false` after the last Live game went Final. Generated MLB May 17 schedule-only board (0 paid credits).
- **#43 `fc427d2`** — MLB May 16 settlement pipeline (free MLB Stats API) + `/mlb/results` UI + sport-tab integration on global `/results`.
- **#42 `4197846`** — MLB projection-card polish (NBA-style bullets, big LINE/PROJECTION/EDGE tiles, scan-mode mobile fix, game click/jump from `/mlb` to `/mlb/board#game-{gamePk}`).
- **#41 `04fe441`** — Unified sport UX (homepage hero NBA & MLB, NBA Board eyebrow, Parlay Lab sport-mode strip, Results sport tabs, MLB scan tools: Top Clean Leans + filter console + density toggle).
- **#40 `e09c936`** — MLB MVP (pipeline + `/mlb`, `/mlb/board`, `/mlb/power`).

### Expected-untracked files (DO NOT commit these)

- `.claude/` — local Claude Code dev config
- `SESSION_HANDOFF_*.md` — handoff docs (this file is one)
- `SESSION_PROGRESS_*.md` — per-session progress logs
- `SESSION_QA_*.md` — QA notes
- `gametime-picks-logo.png` (root) — canonical asset lives at `app/public/brand/gametime-picks-logo.png`
- `pipeline/cache/*` — gitignored Odds API + nba_api cache files

---

## 2. Production product state

### NBA (live at `36ddcaa`)
- **May 15 Results live**: 80–65, 55.2% hit rate on 145 decisive picks. Per-game scorecards (DET @ CLE Game 6: 61.6%, SAS @ MIN Game 6: 48.6%). Anomaly guardrail panel (Clean 57.0% vs R5 48.4%).
- **May 17 board exists** with **72 leans** on **CLE @ DET Game 7** (42 High / 7 Medium / 20 Low / 3 insufficient_data). No phantom MIN/SAS. dataMode `Live`.
- **Legacy URL structure** — NBA still routes through:
  - `/board` (NBA Model Board — header now says "NBA model board · live")
  - `/parlay-lab` (NBA-only, with sport-mode strip stubs)
  - `/results` (global model audit; settled-games section + sport tabs)
- **No `/nba` hub** and no NBA section tabs (this is the gap the next PR fixes).

### MLB (live at `36ddcaa`)
- **`/mlb`** — Overview hub with KPI tiles, audit chip, game tiles linking to `/mlb/board#game-{gamePk}`.
- **`/mlb/board`** — Projection board with avatars, big LINE/PROJECTION/EDGE tiles, NBA-style bullet reasoning, Top Clean Leans strip, filter console (Market/Confidence/Team/Sort/Density), final-game chips.
- **`/mlb/power`** — Honest Power Board pending shell (planned inputs: barrel rate, pitcher HR allowed, handedness, park, weather, lineup position). No fabricated HR picks.
- **`/mlb/results`** — MLB model audit with hit rate hero, per-game / per-market / per-confidence scorecards, **14 expandable settled-game cards** (projection-vs-actual tables), top hits, biggest misses, pending games list (currently 0).
- **MLB Section Tabs** (`MlbSectionTabs`): **Overview · Board · Power Board · Results** — sit at the top of every `/mlb/*` page.

### MLB May 16 final audit numbers (live)
- 15 final games · **14 settled** · 0 pending · `partial=false`
- **272 decisive picks** · **144–128–0**
- **52.94% hit rate**
- By market: pitcher_strikeouts 45.5% (22), batter_hits 55.0% (149), batter_total_bases 51.9% (79)
- By confidence: High 53.3% (107), Medium 54.3% (35), Low 52.8% (108)
- 22 actual-unavailable rows (player didn't appear / pitcher didn't start) — excluded from denominator
- Top hit: Kyle Schwarber Total Bases Over 1.5 → actual 2, +24.1% edge, High
- Biggest miss: Jac Caglianone Total Bases Under 1.5 → actual 5, proj 0.98, Low

### MLB May 17 (live)
- **Schedule-only** because paid odds were not run (floor guard refused: estimated 60 credits would push remaining below 350 floor)
- 15 games scheduled, all in `Preview` state, all with probable pitchers (Eovaldi, Wheeler, Skenes, Gausman, Flaherty, Mikolas, Bello, Singer, Williams, etc.)
- UI shows pending state honestly (no fabricated projections)

### Results
- **Sport-separated audits**: NBA hero on `/results`, MLB hero on `/mlb/results`. Sport-tabs strip on `/results` links MLB users out.
- **Hit-rate emphasis is now confined to Results pages**. Board pages have small text-only "Open MLB model audit →" chips instead of giant hit-rate panels.
- **Settled-game expandable cards** — shared `SettledGameDetail` component shows W/L/P + hit-rate chip in the collapsed view, expands to a full Player · Market · Lean/Line · Projection · Actual · Edge · Confidence · Outcome table.

### Parlay Lab
- **NBA-only active.** Generates candidate slips from current NBA slate leans (Conservative / Balanced / Aggressive risk profiles, exclude anomalies from Conservative+Balanced).
- **MLB and Multi-sport modes** present only as inert sport-mode stubs labelled "needs MLB snapshots" / "needs NBA + MLB snapshots".
- **No persisted candidate snapshots yet.** Parlay Results disclosure on `/results` explicitly says candidate snapshots are not persisted, so no parlay hit-rate claims are made.
- **Multi-sport copy** clarifies cross-sport mixes carry "lower direct correlation but never zero".

---

## 3. Data / credit state

### Odds API quota
- **~368 credits remaining** (last confirmed from PR #42 run; may differ slightly after auto-refresh activity since)
- **Floor:** 350 credits remaining minimum (post-run)
- **Per-run cap:** 75 credits
- Monthly cap: 500 credits

### Paid spend history (lifetime of this branch lineage)
| Date | Sport | Markets | Credits | Notes |
|---|---|---|---|---|
| May 15 (PR #38 era) | NBA | PTS/REB/AST | ~18–60 | Original NBA May 15 fetch |
| May 17 (PR #39) | NBA | PTS/REB/AST | 3 | Smallest possible paid run for Game 7 |
| May 16 (PR #40) | MLB | pitcher_K / batter_hits / batter_TB / HRR | 41 | First MLB MVP run; crashed mid-pipeline |
| May 16 (PR #40) | MLB | pitcher_K / batter_hits / batter_TB | 40 | Re-run after caching added; total MLB spend = 81 |
| May 17 (PR #44 era) | MLB | — | **0** | Floor guard refused; schedule-only board generated |

### Cache strategy
- **NBA Odds API**: 60-minute disk cache TTL (per existing provider).
- **MLB Odds API**: 24-hour disk cache TTL (`pipeline/cache/odds_api_mlb_event_*`) — re-runs within the window are 0 credits.
- **MLB Stats API** (free): no caching needed; polite delays in fetcher.
- **NBA Stats API** (free, nba_api): cached game logs per player in `pipeline/cache/nba_api_gamelogs_{playerId}_{N}.json`.
- **Floor + cap guard**: `pipeline/mlb/generate_mlb_board.py` enforces `--min-credits-remaining 350` and `--max-credits-per-run 75` by default. Cache-aware cost estimation skips already-cached events from the gate calculation.

### Credit conservation rules (standing)
- **Never** run paid Odds API without:
  1. An estimated cost (events × markets × regions)
  2. Confirming post-run remaining ≥ 350
  3. Confirming estimated ≤ 75
  4. Explicit user approval
- Always prefer cache + free MLB-StatsAPI / nba_api first.
- Dry-run mode (`--dry-run`) hits FREE endpoints only.

---

## 4. Operating rules (standing)

### Absolute prohibitions
- Do **not** run paid Odds API without explicit user approval AND a credit-cost estimate
- Do **not** trigger workflows (`gh workflow run`)
- Do **not** change `.github/workflows/*` or `package*.json` unless explicitly scoped
- Do **not** fabricate schedules, odds, projections, results, parlays, player stats, injuries, or HR picks
- Do **not** alter NBA May 15 Results unless a clear bug is proven
- Do **not** alter NBA historical boards (May 5–May 15)
- Do **not** count pending games as losses; pending stays pending
- Do **not** claim any parlay hit-rate without persisted exact candidate slips that were saved before games and graded after settlement
- Do **not** print secrets (no echoing `ODDS_API_KEY`, etc.)
- Do **not** commit `SESSION_*.md`, `.claude/`, root `gametime-picks-logo.png`, or `pipeline/cache/*`

### Forbidden public copy (gated by `pipeline/public_copy_test.py`)
- "safe bet" / "safebet"
- "lock" / "locks"
- "guaranteed"
- "best bet"
- "free money"
- "can't miss" / "cant miss"
- "no room for error"
- "provider failed" / "provider error" / "odds provider" / "schedule provider"
- "trends_pending:" (internal pipeline term)
- "PROJECTION UNAVAILABLE"
- "INSUFFICIENT DATA"
- "manual verified"

### Approved language
- "clean leans" / "clean model leans"
- "lower-variance" / "higher-variance"
- "risk-aware"
- "educational candidates" / "candidate slips"
- "model audit" / "calibration"
- "Power Board" / "high-variance HR watch"
- "lower-correlation construction"
- "model anomaly" / "R5 guardrail"

### Required behavior
- Preserve educational/responsible-use framing
- Preserve accessibility (keyboard nav, aria attrs, focus rings, color contrast)
- Preserve reduced-motion support (every keyframe paired with `@media (prefers-reduced-motion: reduce)`)
- Preserve mobile usability (test at 390px / 768px)
- Responsible Use page tone stays somber, no casino glow

---

## 5. Current UX problem

**MLB has a coherent sport section tab structure. NBA does not. NBA should get a matching sport hub and tab structure.**

Concretely:

| Aspect | MLB (good) | NBA (gap) |
|---|---|---|
| Sport hub | `/mlb` Overview page with KPI tiles + audit chip + slate tiles | None — NBA users land on `/board` |
| Section tabs | `MlbSectionTabs`: Overview · Board · Power Board · Results | None |
| Sport identity in URL | `/mlb/*` namespace clearly says "MLB" | `/board`, `/parlay-lab`, `/results` are sport-anonymous URLs that happen to be NBA |
| Symmetric framing | Mobile users immediately see they're in the MLB section | Mobile users have to read page headers to know which sport |

Other things to keep in mind:
- **Parlay Lab should become sport-aware.** Sport-mode strip exists as inert stubs; needs to become real once candidate snapshots persist.
- **Results should remain the performance/audit hub.** Hit-rate percentages already confined here per PR #44 (board CTAs slimmed).
- **Boards should focus on projections, not hit rates.** Achieved in PR #44.
- **Mobile needs simpler sport navigation and fewer overloaded pages.** Settled-game cards collapse by default; audit chips are quiet; but homepage + landing pages still stack many sections. Section tabs will help.

---

## 6. Recommended next PR: NBA sport-section architecture

**Branch:** `feature/nba-sport-tabs-parlay-shell`

### Goal
Make NBA mirror MLB's section structure without breaking existing URLs.

### Proposed routes
- **NEW `/nba`** — NBA Overview hub (mirrors `/mlb`)
- **NEW `/nba/board`** — wrapper that renders the existing `/board` page content (or, simpler: redirect from `/nba/board` → `/board` and add the section tabs above the existing page)
- **NEW `/nba/parlays`** — wrapper for current `/parlay-lab` (or redirect; rename label to "Parlays" for parity with MLB)
- **NEW `/nba/results`** — NBA-anchored audit view (or wrapper for current `/results` with sport tab pre-selected to NBA)
- **Preserve legacy URLs** — `/board`, `/parlay-lab`, `/results` all keep working (no 404s on bookmarks; no SEO juice loss)

### Top nav (recommended: keep simple)
**Current:** Home · NBA · MLB · Parlay Lab · Results · Methodology · Responsible Use

**Option A — keep top nav identical**, add section tabs inside each NBA page (lowest risk).

**Option B — top nav becomes:** Home · NBA · MLB · Parlays · Results · Methodology · Responsible Use
(Parlay Lab → "Parlays" to match MLB section-tab label.) Slightly bigger change.

Recommend **Option A** for the first PR.

### Implementation sketch
- New `app/src/components/nba/nba-section-tabs.tsx` — sibling to `MlbSectionTabs`. Tabs: `Overview` / `Board` / `Parlays` / `Results`. Each `<Link>` href maps to the right route (initially `/nba`, `/board`, `/parlay-lab`, `/results`).
- New `app/src/app/nba/page.tsx` — NBA Overview. Mirrors `/mlb/page.tsx` structure: KPI tiles (today's leans, high confidence, settled hit rate), audit chip linking to `/results`, slate tiles linking to `/board?date=...` (NOTE: see Known Issue — `?date=` is silently ignored on `/board`; either fix that or link to `/board` and use existing slate selector).
- Mount `NbaSectionTabs` at top of:
  - `/nba` (new)
  - `/board` (existing — add the tabs to the existing page header)
  - `/parlay-lab` (existing)
  - `/results` (existing — but consider whether tabs belong on a global page; could be conditional on "active sport = NBA")
- Homepage already has an "MLB · now live in beta" cross-sport entry section. Consider mirroring for NBA: an "NBA · live" cross-sport entry section. Or rework into a sport-chooser strip at the top of `/`.

### Acceptance criteria
- NBA and MLB both have section tabs in the same visual grammar.
- All existing URLs (`/board`, `/parlay-lab`, `/results`) still work — bookmarks don't break.
- NBA Overview at `/nba` clearly shows today/next slate, board CTA, parlays CTA, results audit CTA.
- No data / pipeline changes needed.
- No paid API.
- Mobile: no horizontal overflow at 390 px.
- Build size delta minimal (a few hundred bytes per new route).
- `MlbSectionTabs` and the new `NbaSectionTabs` should ideally share a generic `SportSectionTabs` primitive — but a copy-paste-and-tweak is acceptable for the first PR if extracting feels risky.

### Risk
- **Low**. Pure presentation + new routes. Existing pipeline / data untouched. Existing routes preserved as-is.

---

## 7. Recommended next PR after that: parlay snapshot persistence

**Required before any "suggested parlays hit rate" can be honest.**

### Architecture

Save **the exact daily suggested candidate slips** to disk **before the first game starts** so they can be graded honestly later.

**Snapshot shape (one file per sport per date):**

```ts
interface ParlayCandidateSnapshot {
  sport: "NBA" | "MLB" | "multi";
  date: string;            // YYYY-MM-DD ET
  generatedAt: string;     // ISO 8601 UTC
  candidates: ParlayCandidate[];
}

interface ParlayCandidate {
  candidateId: string;     // e.g. `nba-2026-05-17-conservative-1`
  mode: "conservative" | "balanced" | "aggressive";
  legs: ParlayLeg[];
  combinedOddsAmerican: number | null;
  hasSameGameLegs: boolean;
  hasSameTeamLegs: boolean;
  hasAnomalyLegs: boolean;
  hasCrossSportLegs: boolean;  // multi-sport only
  rationale: string[];     // short bullets the UI shows
}

interface ParlayLeg {
  sport: "NBA" | "MLB";
  date: string;
  gameId: string;
  gamePk?: number;         // MLB only
  playerId: number | null;
  playerName: string;
  team: string;
  opponent: string;
  market: string;          // "PTS" / "pitcher_strikeouts" / etc.
  side: "Over" | "Under";
  line: number;
  odds: number;
  bookmaker: string;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  riskFlags: string[];
}
```

### File locations
- `app/public/data/parlays/nba/YYYY-MM-DD.json`
- `app/public/data/parlays/mlb/YYYY-MM-DD.json`
- `app/public/data/parlays/multisport/YYYY-MM-DD.json` (later, after multi-sport exists)

### Pipeline
- New `pipeline/snapshot_parlays.py` runs after board generation, before first tipoff. Uses the existing `lib/parlay-builder.ts` (or a Python port / JSON contract) to produce candidates deterministically.
- New `pipeline/settle_parlays.py` grades each snapshot after all legs settle. Output: `pipeline/validation/parlay_settled_YYYY-MM-DD.json`.
- New `pipeline/export_parlay_results.py` writes public files for the Results UI.

### Results UI additions (later PR after pipeline exists)
- Parlay candidate hit rate by sport
- Parlay candidate hit rate by mode (Conservative / Balanced / Aggressive)
- Individual slips with every leg's actual stat + outcome
- Honest disclaimer that these are educational candidate slips, not betting advice

### Critical: do **not** show parlay hit rates until snapshots exist AND have been graded after settlement. Otherwise we'd be inventing hit rates.

---

## 8. Recommended future PR: multi-sport Parlay Lab

**Build only after snapshot persistence exists.**

### Modes
- **NBA only** — current default behavior
- **MLB only** — uses MLB leans + MLB-specific roster info
- **Multi-sport** — mixes NBA + MLB legs in the same slip

### Risk profiles (per mode)
- **Conservative**: clean High confidence only · no anomalies · lower-correlation construction · max 2 legs
- **Balanced**: clean High/Medium · 2–3 legs
- **Aggressive**: wider-risk · clearly labelled · max 1 anomaly leg if allowed

### Multi-sport-specific advantages (to surface in UI honestly)
- Lower direct game correlation by mixing sports/games
- Higher odds payout potential
- **Never** guaranteed; **never** called "safe"
- Cross-sport legs have lower direct correlation but **not zero** (news cycles, sportsbook line shading still affect both)

### Correlation warnings (must show)
- Same-game (`leg.gameKey === other.gameKey`)
- Same-team (same sport)
- Same-player (hard-disallow within a slip — already in NBA builder)
- Cross-sport — label as "lower-correlation mix" but don't claim independence

### Shared `ParlayLeg` schema
- Both NBA `PropLean` and MLB `MlbBoardLean` need a small adapter (~50 LOC each) to flatten into the cross-sport `ParlayLeg` shape defined in §7.

### Sport adapters
- `lib/parlay-leg-adapter.ts` — `propLeanToParlayLeg(nbaLean)` and `mlbBoardLeanToParlayLeg(mlbLean)` helpers.

---

## 9. Recommended future PR: mobile-first board simplification

For both NBA and MLB boards:

- Make top nav / section tabs easier on mobile (sticky? smaller?)
- Reduce hero height on small screens
- Collapse long explanations by default (`<details>` open=false at small breakpoints)
- Keep LINE / PROJECTION / EDGE as the primary visual stat tiles (already done MLB; do same for NBA)
- Make filters sticky or easier to open (consider a bottom-sheet pattern on mobile)
- Game jump chips (quick-link to each game's section without scrolling)
- Avoid giant text blocks
- Cards show decision data first, explanation second

---

## 10. Known issues / backlog

### Functional gaps
- **`/board?date=YYYY-MM-DD` query param historically ignored** — `BoardPage` is a server component that doesn't read `searchParams`. Active-slate selector wins; past dates hidden from tab strip by design. Pre-existing since Phase-15.
- **MLB May 17 is schedule-only** — paid odds run blocked by 350-credit floor (estimated 60 credits would drop below). User can approve a tightly-scoped paid run with explicit cost estimate.
- **MLB Power Board still pending shell** — no HR picks. Inputs planned (barrel rate, pitcher HR allowed, handedness, park, weather, lineup position) but not wired. Honest "warming up" state shipped.
- **MLB Top Clean Leans can show same player twice** with different markets (e.g. Lourdes Gurriel Jr. hits + total bases). Honest, but a de-dupe pass could vary players/teams across 8 tiles.
- **Filter state URL persistence** — `/mlb/board` filter / density / sort lives in React state only. Refresh resets. Future enhancement: serialize to `?market=…&conf=…&team=…&density=…`.
- **Board snapshot persistence** — no automatic snapshot of "what was on the board at generation time". When books pull lines (after games start) the regen loses leans. PR #43 had to git-archaeology from `04fe441` to recover the published 327-lean MLB May 16 snapshot. Future: write `pipeline/cache/published_snapshot_<date>.json` after every paid regen.

### Operational
- **Duplicate Vercel project** (`gametimepicks` without dash, posts redundant checks on every PR) — operator-side cleanup task; non-blocking.
- **`auto-refresh` workflow** has been cancelling itself due to concurrency-group interaction — flagged for a future pipeline PR; not in current scope.
- **Stale legacy PRs #1 / #2 / #4 / #5** — leave alone.

### Multi-sport blocker
- **No persisted candidate snapshots** — blocks multi-sport Parlay Lab AND blocks parlay hit-rate reporting for any sport (including current NBA-only). Highest-leverage unblocker is the snapshot persistence PR in §7.

---

## 11. Suggested first prompt for the new Claude Code session

> Copy-paste this verbatim into the next conversation.

---

**I have read `SESSION_HANDOFF_2026-05-17_SPORT_TABS_PARLAYS_NEXT.md`. First verify repo state against it before doing anything else.**

You are continuing GameTimePicks. The previous Claude Code conversation closed and you have no memory of it. The handoff file in the working directory root is the source of truth.

## Phase 0 — Reorient

Run:

```
cd ~/Downloads/gametimepicks
git status --short
git branch --show-current
git log --oneline -10
gh pr list --state open --json number,title,headRefName,mergeStateStatus
```

Confirm:
- branch is `main`, HEAD is `36ddcaa` (PR #44 squash merge)
- working tree clean except expected untracked session docs + `.claude/` + root logo
- no relevant open PRs (the 4 listed are stale legacy — leave alone)

Live production reminder: https://gametimepicks.yashwantbalaji.com

## Phase 1 — Confirm production live state

- `/results` should show NBA 55.2% audit + settled-game expandable cards
- `/mlb/results` should show 144–128 (52.94%) on 272 decisive (full, not partial)
- `/mlb/board` should show "Final · graded" chips on the 14 settled May 16 games
- `/mlb` Overview should show slate tiles linking to `/mlb/board#game-{gamePk}`
- MLB section tabs (Overview · Board · Power Board · Results) should be present on all `/mlb/*` pages
- NBA still has NO section tabs and no `/nba` hub — this is the gap

## Phase 2 — Build the NBA sport-section architecture

Create branch:

```
git checkout main
git pull origin main
git checkout -b feature/nba-sport-tabs-parlay-shell
```

Implement per the handoff §6:
- New `app/src/components/nba/nba-section-tabs.tsx` — sibling to `MlbSectionTabs`. Tabs: Overview / Board / Parlays / Results.
- New `app/src/app/nba/page.tsx` — NBA Overview hub mirroring `/mlb/page.tsx` (KPI tiles, audit chip, slate tiles).
- Mount `NbaSectionTabs` at the top of `/nba`, `/board`, `/parlay-lab`.
- Preserve every existing URL (`/board`, `/parlay-lab`, `/results` keep working).
- Top nav stays simple. Do NOT rename "Parlay Lab" in the top nav in this PR.
- Mobile: confirm no horizontal overflow at 390 px on any new route.

**Hard rules** (from handoff §4):
- NO paid Odds API
- NO workflow triggers
- NO package changes
- NO fabricated data
- NO NBA May 15 Results / historical board changes
- NO forbidden public copy
- Untracked files stay untracked

## Phase 3 — Verify + open PR

Run the full verification suite from handoff §12. Open a PR with a clear title:

```
feat(nba): add NBA section tabs and Overview hub
```

Body should mention:
- no paid API
- no data / pipeline changes
- preserves legacy URLs
- mobile verified
- tests run

Do **not** auto-merge. Do **not** start the parlay snapshot work yet. Wait for review approval.

End of suggested prompt.

---

## 12. Verification checklist for future PRs

Run these in order before opening any PR:

```bash
# State
cd ~/Downloads/gametimepicks
git status --short
git log --oneline -10

# Tests
python3 pipeline/public_copy_test.py
python3 -m pipeline.parlay_builder_test
python3 -m pipeline.settle_test
python3 -m pipeline.export_results_test
python3 -m pipeline.mlb.settle_mlb_results_test
python3 -m pipeline.mlb.export_mlb_results_test

# Build
cd app
npm run typecheck
npm run build
cd ..

# Forbidden copy
grep -rnE "safe bet|\block\b|\blocks\b|\bguaranteed\b|\bbest bet\b|free money|can'?t miss|cant miss|no room for error|provider failed|provider error|odds provider|schedule provider|trends_pending" app/src pipeline 2>/dev/null | grep -v "//\|node_modules\|\.next" | head -10

# Scope
git status --short
git diff --stat
git diff --name-only

# After push
gh pr checks <PR-number>
```

### Browser-check checklist (desktop 1280 + mobile 390)

- `/` (homepage)
- `/board` (NBA)
- `/nba` (after the NBA tabs PR)
- `/parlay-lab`
- `/results`
- `/mlb`
- `/mlb/board`
- `/mlb/power`
- `/mlb/results`

For each route confirm:
- No horizontal overflow (`document.documentElement.scrollWidth === innerWidth`)
- No console errors (`preview_console_logs --level error`)
- No images broken (avatar fallbacks acceptable; explicit 404s are not)
- Section tabs present and reflect active page
- Hit rate emphasis confined to Results pages

---

## 13. Final notes

- **MLB credit math**: 81 credits spent on MLB May 16 MVP. **~368 remaining**. Floor 350.
- **NBA credit math**: 3 credits on May 17 Game 7 fetch (PR #39). Plus earlier May 15 NBA spend. Pre-MLB credit balance was 452.
- **The auto-refresh workflow** has historically been unreliable; future commits from it (`f89afa4` etc.) may appear on `main` between sessions.
- **The MLB board data for 2026-05-16** on disk is the **PR #41 restored snapshot** (327 leans). If you regenerate it, only events still on the Odds API events list (which excludes past-tipoff games) will be re-fetched — you'd lose leans. Don't regen without thinking carefully.
- **ChatGPT conversation context expires.** This handoff is the canonical source of state for the next Claude Code conversation. Do not assume the new conversation can see anything from the prior session.

End of handoff.
