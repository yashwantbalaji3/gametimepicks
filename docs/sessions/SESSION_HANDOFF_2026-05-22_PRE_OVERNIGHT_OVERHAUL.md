# SESSION HANDOFF · 2026-05-22 · PRE-OVERNIGHT PRODUCT OVERHAUL

> **Audience:** the next Claude Code session that will run the overnight product-overhaul autonomous loop.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state:** clean `main`. No open WIP PRs. Last merged PR #80 landed parlay UI + automation wiring.
> **Date written:** 2026-05-22 (post midnight ET).

This handoff is intentionally **long and detailed**. It preserves the architectural state, recent reasoning, methodology context, and product strategy so a fresh session can continue at full speed. Do not skim — every section is load-bearing.

---

## 1. CURRENT PRODUCTION STATE

| | Value |
|---|---|
| Production URL | `https://gametimepicks.yashwantbalaji.com` (Vercel-fronted custom domain) |
| Repo | `yashwantbalaji3/gametimepicks` |
| Current `main` SHA | **`68523ee3bd42662c4a8721e2c98e61ae22756e42`** (`68523ee`) |
| Last 10 merged PRs | #80 → #79 → #78 → #77 → #76 → #75 → #74 → #73 → #72 → (auto nightly settle) → #71 |
| Open PRs | only legacy `fix/*` PRs #1, #2, #4, #5 — pre-existing operator stuff; **leave alone** |
| Active branches | `main` only (last working branch `feature/parlay-persistence-ui-automation` merged + deleted) |
| Vercel canonical projects | `gametimepicks` (primary) + duplicate `gametime-picks` (cleanup pending — non-blocking) |
| Odds API balance | **260 / 1000** · used 240 |
| Standing credit floor | 300 (no session override active) |
| Standing per-run cap | 75 credits (`MAX_PER_RUN`) |
| Working tree | **clean** — no uncommitted changes; only untracked SESSION_*.md handoffs and the `.claude/` dir |
| Latest auto-deploy state | last nightly settle ran `aecb8c1 auto: nightly settle 2026-05-21 06:28 ET` |

### Recent merged PRs (newest first)
- **#80** — `feat(parlays): surface saved slip tracking and automate grading` (parlay UI banner + `/results/parlays` rebuild + snapshot wired in `automation_projections.sh` + grading wired in `automation_settle.sh`)
- **#79** — parlay persistence DATA LAYER (`pipeline.snapshot_parlays` + `pipeline.grade_parlays` + tests + results attribution defensive test)
- **#78** — May 21 NBA settlement (CLE @ NY 109-93) + sport-aware "Run line" label on MLB matchup card
- **#77** — MLB design parity (ESPN logos, market chips, probable pitcher collapse, MLB `game-markets` artifact for 2 May 21 games — 6 credits)
- **#76** — official ESPN logos + NBA/MLB headshots via `TeamLogo` + `PlayerAvatar`
- **#75** — `TonightMatchupCard`, big-card homepage rail, Parlay Lab 4-step pill row, Results methodology collapsed
- **#74** — Parlay Lab "Tomorrow" date bug fix (used `dayLabelFor(date, buildTimeToday)` instead of stale `slate.days[].dayLabel`) + WC removed from primary rail + legacy sport sub-tabs neutralized
- **#73** — paid MLB May 21 props (309 leans, 28 credits) + Parlay Lab subnav removed + bigger H1
- **#72** — player-centric `/results/date/[date]` view + future-date-graded homepage fix
- **#71** — primary nav reduced to 5 tabs (Home · Projections · Parlay Lab · Results · About) + `/projections` hub + `/about`

### No unmerged WIP
The last working branch (`feature/parlay-persistence-ui-automation`) was merged via PR #80 and deleted from remote. There is **no stale WIP** to resume.

---

## 2. PRODUCT STATE SUMMARY

### Homepage (`/`)
**Live state:**
- Big `HomepageCommandHero` (H1 at clamp(40-72px))
- Compact "Latest results" pill (only renders when a real settled date exists)
- "Tonight on GameTimePicks" rail with two big `TonightMatchupCard`s (NBA + MLB) when projections are live
- Slim "PendingTile" row for NHL / IPL when schedules exist but no projections
- World Cup teaser tile (only when no WC match today)
- "How it works" 3-step strip below

**What still feels amateur:**
- Hero subtitle is generic ("Sports projections made simple")
- The compact pill is a single small chip — easily overlooked
- The "Tonight on GameTimePicks" eyebrow is the only thing tying it together; no big "12 hours to tipoff" / "tonight's top edge" emotional hook
- Default empty state ("No live slate") is functional but uninspiring
- No personalization, no leaderboard, no "your followed teams"

### Projections hub (`/projections`)
- Tonight-first: 4 sport tiles (NBA · MLB · NHL · IPL) + a "Coming soon" section housing World Cup
- Each tile shows projection count, last-settled record, status badge
- Status copy is clean ("Live projections" / "Lines pending" / "Schedule only" / "Coming soon")

**Still feels amateur:**
- The cards are uniform-sized — NBA with 71 live projections looks the same as NHL with 0
- No visual differentiation for "most active" sport tonight
- "What the status badges mean" footnote is small but takes vertical space

### NBA board (`/nba/board`)
- Date rail at the top
- `TeamGameProjectionCard` (matchup hero + 3-cell market grid: Spread · Moneyline · Total)
- "Model PTS sum vs market total" comparison block
- Per-player projection cards below grouped by game
- "How to read this" disclosure collapsed

**Strengths:** real ESPN logos via `TeamLogo`, NBA Stats CDN headshots via `PlayerAvatar`, market lines preserved.
**Pain:** card density gets heavy on multi-player nights; "data quality flag" copy still visible on some configurations.

### MLB board (`/mlb/board`)
- Same date rail pattern
- Top: probable pitchers (currently visible) + market lines if available
- Per-game leans below

**Major performance + UX issue (user-flagged):**
- **Page feels laggy** — board renders 309 leans across 7 games all at once
- Probable pitchers still take prominent visual space
- No accordion / progressive disclosure
- Market chips only render for 2 of 7 games (the others started before the Odds API fetch window)

### Parlay Lab (`/parlay-lab`)
- Big "Build tonight's slips." H1
- 4-step pill row: ① Pick sport · ② Pick games or players · ③ Choose risk · ④ Review tickets
- Sport chips with emoji (🏀 NBA · ⚾ MLB · ⚽ World Cup)
- **New** "Saved slip tracking" banner (PR #80) — grey/amber/green by state
- Builder client below: existing `ParlayLabModeTabs` with NBA-only candidates
- Collapsed "How this works" details

**Still feels amateur:**
- Candidate slips render as plain cards — no "ticket" treatment, no payout visualization, no shareable design
- No actual suggested parlays curated from today's slate; users have to drive the builder themselves
- No multi-sport support yet (NBA-only)
- "Live preview vs saved snapshot" distinction not surfaced inline

### Results (`/results`)
- Big hero hit-rate (52.43% on 1253)
- Hit-rate trend sparklines (Overall / NBA / MLB)
- Per-sport summary cards
- Calibration trend strip (every settled date as a chip)
- Methodology disclosure (collapsed)
- ModelLessonsCard
- Parlay disclosure CTA

**Still feels technical:** "audit" framing visible in lesson cards; per-confidence breakdowns; "decisive picks" wording.

### `/results/date/[date]`
- Big hero with date label
- BigCallsRow (top hits + biggest misses)
- **Player-centric cards** (PR #72) — 15 player cards on May 20 grouping (player, market) with hit/miss color
- Per-game expandable bookmaker breakdown below
- Prev/next date navigation

**Strengths:** real player headshots via `PlayerAvatar`, color-coded hit/miss, dedupe of DK + FD duplicates.
**Pain:** `L · P · A` shorthand columns inside the per-market rows are dev-style — non-bettor readers find this cryptic.

### `/results/parlays`
- Data-driven, rebuilt in PR #80
- Honest empty state ("Saved slip history starts here.") — currently the live state
- Will render hit-rate hero, latest graded slate cards, and by-date strip once the first snapshot exists and is graded
- No fake history claimed

### `/world-cup` + sub-routes
- Schedule + groups + 48 team detail pages (PR #69)
- "Projections coming soon" framing
- `/results/world-cup` not built (out of scope until projection model lands)

### Mobile UX (the biggest weakness right now)
- All pages render at 390 px without horizontal overflow (verified across PRs)
- BUT: cards feel too zoomed-in, padding is generous, single-column layouts mean users see 1–2 cards above the fold
- Vertical rhythm is too tall — tighter spacing would let users see more at once
- TonightMatchupCard is gorgeous on desktop but eats too much vertical space on mobile

### Automation + pipelines
- `scripts/automation_projections.sh` runs morning: probe → estimate → NBA generate + recent10 → MLB generate → snapshot parlays
- `scripts/automation_settle.sh` runs nightly: settle NBA → settle MLB → export → model_audit → grade parlays
- Both have non-fatal failure handling on the new parlay steps
- GitHub Actions workflows: `nightly-settle.yml` (3 AM ET cron) and `morning-projections.yml` (9:30 AM ET cron) call these scripts

### Logos + headshots
- `TeamLogo` component (PR #76) uses ESPN CDN URLs by NBA/MLB team abbr; falls back to `TeamBadge` monogram on 404
- `PlayerAvatar` uses NBA Stats CDN (`https://cdn.nba.com/headshots/...`) or MLB Stats CDN (`https://content.mlb.com/images/...`) by playerId; falls back to gold-ring initials disc
- Fallback chain has never broken; verified across all merged PRs

### Persistence + grading
- Data paths live at `app/public/data/parlays/{snapshots,graded}/<date>.json` + `summary.json`
- **Currently empty** — no snapshots exist yet because last session deliberately refused to backfill May 21 (games were already over)
- Automation will create the first snapshot on the next morning-projections run

---

## 3. ALL MAJOR CHANGES COMPLETED THIS SESSION

The session spanned PRs #72 → #80 (9 merged PRs). High-level architecture decisions worth preserving:

### Trust-critical fixes
- **PR #72**: homepage `findLatestScoredBoardOnDisk()` and `findLatestScoredBoard()` now filter against `getAvailableSettlementDates()` from the settlement manifest. Future projection boards (May 21+ when they were unsettled) can never again show as "graded".
- **PR #74**: `/parlay-lab` reads `dayLabelFor(date, buildTimeToday)` directly instead of `slate.days[].dayLabel`. The latter is generated by the pipeline at midnight ET and goes stale; the former is honest to the build time.
- **PR #79**: `pipeline.results_attribution_test` added — locks the invariant that every entry in a date's `bestCalls`/`largestMisses` matches a real row in `settled_leans.jsonl` for that date.

### UX architecture decisions
- **Primary nav reduced to 5 tabs** (Home · Projections · Parlay Lab · Results · About) — PR #71. The 21 sport-page legacy "Overview · Model Board · Power Board · Parlays" sub-tabs were neutralized in PR #74 by making `SportSectionTabs` return `null` — single change, all imports stay valid.
- **`TonightMatchupCard`** replaces small sport tiles on the homepage — large team badges, market chips, projection count. Sport-aware "Spread"/"Run line" label.
- **Player-centric `/results/date/[date]`** dedupes by `(player, market)` with max-|edge| representative; full per-bookmaker breakdown stays below.
- **Parlay persistence** uses stable SHA-256-derived slip IDs so reruns are idempotent.

### Visual identity decisions
- **No team logos hotlinked from random sources.** Everything is either an explicit local fallback or a publicly stable CDN URL with documented source.
- **No fake player photos.** Initials avatars use team-color ring + gold accent.
- **Emoji sport icons** (🏀 ⚾ 🏒 🏏 ⚽) chosen because they're font-native and don't require licensed assets.

### Mobile decisions
- All cards use `clamp()` for typography
- Touch targets ≥ 36 px
- No fixed-width tables; everything responsive
- BUT we did **not** do a comprehensive mobile density pass — that's the overnight priority

### Performance decisions
- Static export build with Next.js 14.2.15
- 48 World Cup team detail pages SSG'd at build time
- 6 settled NBA dates pre-rendered for `/results/date/[date]`
- MLB board is the bottleneck — 309 leans rendered in one pass, no progressive disclosure

### File-level summary (all session)
- `pipeline/fetch_game_markets.py` (extended to MLB)
- `pipeline/snapshot_parlays.py` (new)
- `pipeline/grade_parlays.py` (new)
- `pipeline/results_attribution_test.py` (new)
- `pipeline/snapshot_parlays_test.py` (new)
- `pipeline/grade_parlays_test.py` (new)
- `app/src/lib/data-parlays.ts` (new)
- `app/src/components/tonight-matchup-card.tsx` (new)
- `app/src/components/team-logo.tsx` (new)
- `app/src/components/player-avatar.tsx` (new)
- `app/src/components/player-results-cards.tsx` (new in PR #72, refined later)
- `app/src/components/hit-rate-sparkline.tsx` (new)
- `app/src/app/parlay-lab/page.tsx` (rewritten hero + status banner)
- `app/src/app/results/parlays/page.tsx` (rewritten from placeholder)
- `app/src/app/projections/page.tsx` (new in PR #71, refined)
- `app/src/app/about/page.tsx` (new in PR #71)
- `app/src/components/homepage-sports-rail.tsx` (rewritten around `TonightMatchupCard`)
- `app/src/components/sport-section-tabs.tsx` (neutralized — returns null)
- `app/src/components/nav.tsx` (5-tab primary nav)
- `scripts/automation_projections.sh` (added snapshot step)
- `scripts/automation_settle.sh` (added grading step)

---

## 4. PARLAY SYSTEM STATE

### Architecture
```
pipeline/
  snapshot_parlays.py   # CLI to write pregame slip snapshots
  grade_parlays.py      # CLI to grade snapshots from settled rows
  snapshot_parlays_test.py  # 75 assertions
  grade_parlays_test.py     # 13 assertions

app/public/data/parlays/
  snapshots/<YYYY-MM-DD>.json   # pregame slips (status: pending)
  graded/<YYYY-MM-DD>.json      # postgame grading
  summary.json                  # lifetime aggregate

app/src/lib/data-parlays.ts     # safe loaders with empty-state fallbacks

app/src/app/parlay-lab/page.tsx   # status banner above builder
app/src/app/results/parlays/page.tsx  # saved-slip history page
```

### CLI commands
```bash
# Snapshot today's pregame candidates (writes empty payload if no leans)
pipeline/.venv/bin/python -m pipeline.snapshot_parlays --date YYYY-MM-DD
pipeline/.venv/bin/python -m pipeline.snapshot_parlays --date YYYY-MM-DD --dry-run

# Grade after settlement (honest no-op if no snapshot exists)
pipeline/.venv/bin/python -m pipeline.grade_parlays --date YYYY-MM-DD
```

### Slip-level grading rules (locked by tests)
- `win` = every leg `win`
- `loss` = ≥1 leg `loss`
- `push` = ≥1 leg `push` AND no losses AND no unresolved
- `pending` = ≥1 leg `unresolved` AND zero losses
- `void` = data integrity error

### Pending / push integrity
- **Pending slips never count as losses.** Locked in `grade_parlays_test.test_unresolved_leg_makes_slip_pending`.
- **Pushes excluded from the slip-level hit rate.** Locked in the summary aggregator.

### Builder rules (mirrors `app/src/lib/parlay-builder.ts` and `pipeline.parlay_builder_test`)
Three profiles, all driven by `PROFILE_RULES` in `snapshot_parlays.py`:
- **conservative**: High-confidence only, min edge 3pp, 2-3 legs, requires recent10, 1 leg per game, no anomalies
- **balanced**: High+Medium, min edge 2pp, 2-4 legs, 2 legs per game max, no anomalies
- **aggressive**: any confidence, min edge 1pp, 2-5 legs, 3 legs per game, ≤1 anomaly leg

### Automation wiring
- `automation_projections.sh` step 5/5: `pipeline.snapshot_parlays` (non-fatal)
- `automation_settle.sh` step 4/4: `pipeline.grade_parlays` (non-fatal)
- Both scripts use `set -e` but the new steps are wrapped in conditionals so failure → warning, not exit 2

### Current limitations
- **NBA-only.** The snapshot builder reads `app/public/data/boards/<date>.json` (NBA path); MLB candidates not yet plumbed. The persistence layer accepts a `sport` field per leg — it's the builder that needs an MLB code path.
- **No first snapshot exists yet.** Session deliberately refused to backfill. First snapshot will land on next morning-projections run (probably tomorrow's NBA slate if generated).
- **Builder client "Saved for this slate" interleaved view deferred.** The Parlay Lab status banner and `/results/parlays` cover the "is this saved?" question; surfacing saved-snapshot slips alongside live-preview slips in the builder is the next UI step.
- **Tipoff filter is best-effort.** Only fires if `tipoff` field is an ISO timestamp; "8:00 PM ET" text passes through.
- **No multi-sport candidates.** Cross-sport leg correlation not yet tested.

### What still needs UI work
1. Render saved snapshot slips inline in the builder when a snapshot exists for the active date
2. Show "live preview" vs "saved pregame" badges on each slip card
3. Add suggested-parlay curation surface (top X picks from the snapshot, not the entire pool)
4. Ticket-style visualization with payout calculator (no fake payouts — just American-odds combinatorics from stored `oddsForSide`)
5. Filter / sort controls inside `/results/parlays` once history grows

---

## 5. MODEL + METHODOLOGY STATE

### Current methodology
Static blend: **0.45 × last5 + 0.35 × last10 + 0.20 × season**, with a small home/away nudge.

After projection: `pipeline.confidence_guardrails` downgrades extreme-edge picks through R1–R5 cap chain:
- R1: thin recent10 sample → cap at Low
- R5: |edge| > 25pp NBA / 20pp MLB → anomaly flag + cap at Low

News overlays via `pipeline/overrides/news_signals.json` (currently empty).

### Edge logic
- `edgePct = ((projection - line) / line) × 100` for Over; flip sign for Under
- Confidence tier from `edgePct` magnitude + sample depth + bookmaker confidence
- "Stronger signals" UI label = confidence "High"

### Current per-market performance (lifetime, real settled data)

**NBA (671 decisive):**
| Market | W-L | Hit% |
|---|---|---|
| REB | 135-94 on 229 | **59.0%** ← strongest |
| PTS | 131-121 on 252 | 52.0% |
| AST | 98-92 on 190 | 51.6% |

**NBA by-confidence:**
| Confidence | W-L | Hit% | Sample |
|---|---|---|---|
| Medium | 47-32 on 79 | **59.5%** | thin |
| High | 255-218 on 473 | 53.9% | bigger pool |
| Low | 61-57 on 118 | 51.7% | controlled |

**MLB (582 decisive):**
| Market | W-L | Hit% |
|---|---|---|
| batter_hits | 191-186 on 377 | 50.7% |
| batter_total_bases | 82-80 on 162 | 50.6% |
| pitcher_strikeouts | 20-23 on 43 | **46.5%** ← weakest |

**MLB by-confidence:**
| Confidence | W-L | Hit% |
|---|---|---|
| High | 128-123 on 251 | 51.0% |
| Low | 128-127 on 255 | 50.2% |
| Medium | 37-39 on 76 | 48.7% |

### NBA per-date trend (5 settled playoff slates + 1 settled May 21)
| Date | W-L | Hit% | Notes |
|---|---|---|---|
| 05-15 | 80-65 on 145 | 55.2% | mixed slate |
| 05-17 | 41-20 on 61 | **67.2%** | small slate |
| 05-18 | 108-58 on 166 | 65.1% | WCF G1 |
| 05-19 | 50-98 on 148 | **33.8%** | NY OT, Brunson 38 (the collapse) |
| 05-20 | 50-30 on 80 | 62.5% | WCF G2 |
| 05-21 | 35-36 on 71 | 49.3% | ECF G2 |

### Known weak markets
1. **MLB `pitcher_strikeouts`** — 46.5% on 43 (small sample, but trending below coin flip). High volatility from pitch counts, early hooks, manager decisions.
2. **NBA PTS (52.0%)** — barely above coin flip on 252 decisive. Plagued by usage shifts, rotation compression, and OT games.
3. **NBA AST (51.6%)** — most context-sensitive market. Pace and lineup matchups dominate.

### Known strong markets
- **NBA REB (59.0% on 229)** — by far the most durable cohort. Stability comes from rate-stat consistency: minutes × rebound rate is easier to predict than touch-volume × shooting variance.

### Calibration concerns
- **High and Medium confidence tiers don't separate cleanly.** High 53.9% vs Medium 59.5% — the Medium sample is small (79) but if it holds it means tier ordering is inverted.
- **R5 anomaly cap is working** (Low tier at 51.7% — capped extreme-edge picks come out near coin flip as designed) but it caps too aggressively when applied to REB (where the model genuinely has signal).
- **Bias is small positive (~+0.46pp NBA AST, +0.75pp NBA PTS)** — model slightly over-projects scoring stats. Worth investigating whether projections need a small ~0.5 deflation factor.

### Overfitting concerns
- The 6 settled NBA dates are ALL playoff games. The model has not been tested on regular-season pace. Any tuning done now on playoff data risks overfitting to high-leverage, lineup-stable games.
- MLB sample is regular-season MLB (May 16, 18, 20, 21 — when settled).

### Where the model appears fragile
1. **Star players in elimination games** (May 19 was the canonical breakdown — Brunson 38 destroyed every NY Under)
2. **OT games** — projections are 48-minute baseline; OT adds variance
3. **Compressed playoff rotations** — backup minutes evaporate; model doesn't compress

### Where it appears strongest
1. **NBA REB** across the full 229-decisive sample
2. **Multi-day windows with stable lineups** (May 15, 18, 20 all clean)
3. **Medium-confidence picks** when the model has *some* signal but isn't betting heavily

### Methodology improvements that ARE safe
- **Add a market-specific edge floor.** E.g. NBA PTS needs ≥ 5pp edge to even get out of Low; REB can stay at 3pp. This is honest tightening based on real data.
- **Add an OT awareness flag.** Tag games whose lines were set assuming regulation; if an OT happens, mark those settled rows for separate review.
- **Add a usage-shift suppressor.** When a star is projected for >25% usage, widen the projection variance band and downgrade confidence one tier.
- **Add a "rotation tightening" feature** for playoff games — backup minutes get a hard discount.

### Methodology improvements that ARE NOT safe
- ❌ Retrain on the 6 settled dates — overfits to playoff context
- ❌ Add post-hoc filters that exclude May 19 — survivorship bias
- ❌ Claim 80% accuracy or even directional improvement without ≥ 20 more settled dates
- ❌ Touch scoring logic in `score_model.py` without explicit tests

### 80% target honesty
- Combined lifetime hit rate is **52.43% on 1253 decisive rows.** That's barely above coin flip on a substantial sample.
- **80% by June 1 is mathematically very unlikely without changing the product surface.** Specifically: even if every single new pick hit, the existing 657-596 baseline drags the lifetime number. To reach 80% lifetime from current state would need ~5000 new wins against ~0 new losses.
- **Realistic improvements toward 80% on a tighter sample** (e.g. "stronger signals only") could happen if:
  1. Strict filtering to REB Over only (current 59.0%) + Medium+ confidence
  2. Suppress all anomaly-flagged picks
  3. Wait for ≥ 100 more decisive picks in that filtered subset
- The user-facing narrative should emphasize "the model's strongest signals" not raw hit rate.

### Historical backtesting feasibility
- **Lines:** stored Odds API responses are cached for 60 minutes only — no historical line database
- **Box scores:** ESPN summary endpoint works for completed games (already used for settlement)
- **Player game logs:** nba_api and MLB Stats API both support historical lookups
- **Honest assessment:** a real historical backtest would require either:
  1. Paying for The Odds API historical endpoint (separate paid product)
  2. Scraping a sportsbook archive (terms-of-service risk)
  3. Building from a free source like SportsData.io's archive (may have gaps)
- For now, the only honest "backtest" is the forward audit on what we've already settled

---

## 6. UI/UX AUDIT

### Already improved (session win)
- ✅ Nav reduced from 10+ items to 5
- ✅ Legacy sport sub-tabs hidden
- ✅ Homepage hero is dominant
- ✅ TonightMatchupCard is visually exciting on desktop
- ✅ Real ESPN logos + headshots everywhere
- ✅ "Tomorrow as graded" bug fixed
- ✅ Player-centric Results view is much friendlier
- ✅ "Run line" / "Spread" labels are sport-aware
- ✅ Parlay Lab status banner gives clear "saved/pending/graded" signal
- ✅ `/results/parlays` has honest empty state

### Still needs major work
1. **Mobile density** — too zoomed in, too much whitespace
2. **MLB board lag** — 309 leans rendered at once, no accordion
3. **Results "L · P · A" shorthand** — needs friendly labels
4. **Parlay tickets** — flat cards, no "ticket" polish
5. **No suggested parlays** — user has to drive the builder
6. **Hero subtitles are generic** — need emotional hook
7. **Coming-soon sections feel like placeholders** — World Cup teaser is fine, but NHL/IPL "schedule only" tiles need more polish
8. **Methodology page** — exists but is wordy; needs visual diagrams

### Highest-impact opportunities (ranked)
1. **MLB accordion redesign** (performance + UX both unlock)
2. **Mobile density pass** (every page benefits)
3. **Results label cleanup** (1-day work, massive clarity gain)
4. **Suggested parlay surface** (retention driver)
5. **Hero copy + visuals** (first-impression gain)
6. **Parlay ticket polish** (emotional impact)

### Typography issues
- Inconsistent use of `font-mono` for all-caps eyebrows. Some use `font-mono`, some use `font-display`
- Letter-spacing varies (0.14em / 0.16em / 0.18em) without clear rules
- Body text alternates between 11px, 12px, 13px, 13.5px — needs a 4-step scale

### Consistency issues
- Some pages have `mt-8`, some `mt-10`, some `mt-12` for the same kind of section break
- Card border-radius varies: 5px / 6px / 8px / 10px / 12px — should standardize to 3 sizes
- Status pill styles differ between homepage and sport pages

---

## 7. MLB BOARD ANALYSIS

### Why MLB feels laggy
1. **All 309 leans render in a single pass** on first paint
2. **Each lean is a separate React element** with its own market chip + bookmaker row
3. **No virtualization** — all DOM nodes hydrated up front
4. **No lazy loading** for collapsed states
5. **Probable pitcher data** loads alongside lean data, doubling the data per game

### Current rendering structure
- Top: matchup + market chips (when game-markets fetched)
- Middle: probable pitchers (full names, headshots, team logos)
- Bottom: list of leans grouped by player, each with PTS/REB/AST-style rows BUT for MLB markets (Hits / Total Bases / Strikeouts / H+R+RBI)

### Why accordions are needed
- Default-collapsed game cards reduce initial DOM by ~80%
- Auto-open the first game only (matches sportsbook UX patterns)
- Collapsed state still shows headline info (matchup, time, projection count, market line)
- Expanded state hydrates leans on demand

### How to improve safely
1. **Wrap each game card in `<details>`** — native HTML, no JS state, zero perf cost
2. **Auto-open first game only** via `open` attribute on `details:first-child` (CSS) or runtime
3. **Hide probable pitchers behind a sub-disclosure** inside the expanded state
4. **Lazy-load player headshots** in collapsed cards (only fetch when expanded)
5. **Server-render the collapsed summary** for SEO + first paint

### Sportsbook reference patterns
- **DraftKings**: collapsed game header with logos + ML/spread/total, expand reveals all player props
- **FanDuel**: similar, with tabbed sport filter at top
- **Action Network**: card-per-game, tap-to-expand
- **Kalshi**: market list (not game-grouped), prediction-first

### Information currently overwhelming
- Probable pitcher names + headshots BEFORE the projections (should be after)
- Every bookmaker row visible by default (DK + FD doubling the visual weight)
- "Stats unavailable" placeholder rows (should be filtered out or grouped at bottom)

---

## 8. RESULTS PAGE ANALYSIS

### Current structure (`/results`)
1. Big hero with overall hit rate (52.4%) and W-L-P on decisive count
2. Sport tabs (Overview / NBA / MLB)
3. Small-sample warning if applicable
4. Overall KPIs (4 tiles)
5. Hit-rate trend section (3 sparklines)
6. Per-sport summary cards
7. CalibrationTrendStrip
8. ResultsModelAuditNotes
9. Methodology disclosure (collapsed)
10. ModelLessonsCard
11. ParlayResultsDisclosure
12. Footer

### Why it still feels too technical
- "Track record" and "audit" used interchangeably
- "Decisive picks" → casual users don't know what's decisive
- "Cohort" language in lessons cards
- ResultsModelAuditNotes copy: "R5 anomaly cap" / "edge quartile" / "per-bookmaker dispersion"
- Three sparklines all using same gold color — hard to distinguish

### User misunderstandings to expect
1. "Why is the hit rate 52% if you say the model is good?" — needs framing of "strongest signals" vs raw
2. "What's a 'push'?" — should be defined inline
3. "Why are some markets stronger than others?" — invites methodology questions

### Simplifications that work
- "Hit rate" stays
- "Settled projections" instead of "decisive picks"
- "Stronger signals" instead of "High confidence"
- "Watch" instead of "Medium"
- "High-variance" instead of "Low"
- Visual: one big number, one small chart, then "by sport" toggle

### Detail data that should stay collapsed
- per-bookmaker dispersion
- per-edge-quartile breakdown
- per-confidence vs per-market matrix
- detailed methodology

### What detail data should be promoted
- "Worst date" callout (May 19 33.8%) — honesty wins trust
- "Best market" callout (NBA REB 59.0%) — communicates real strengths

---

## 9. MOBILE ANALYSIS

### Why mobile feels too zoomed in
1. **Generous padding** — `px-4 sm:px-6 py-8 sm:py-12` puts ~32px gutters on a 390px screen → 326px content area
2. **Large font sizes** — clamp() targets the desktop max but doesn't scale down enough
3. **Single-column stacks** — every section is one column on mobile, so users scroll 5+ sections to see what's tonight
4. **Card padding** — many cards use 20-24px internal padding, eating ~50% of the card area on a 200px-wide card

### Spacing problems
- Vertical gaps `mt-8` to `mt-12` on small screens make sections feel like separate pages
- `gap-3` between cards is correct, but `gap-5` inside hero copy creates dead zones

### Layout problems
- Hero CTAs stack vertically on mobile (two buttons, one per row) → 2 rows worth of vertical space
- Track-record sparkline trio in `/results` stacks vertically (3 cards × full height) before user sees per-sport summary
- TonightMatchupCard's market chips wrap to a second row, then a third row, on narrow screens

### Content density issues
- First viewport (390 × 844) on `/` shows hero + first CTA only — no actual game info
- First viewport on `/projections` shows headline + sport-cards header, no actual cards
- First viewport on `/results` shows hero + sport tabs, no actual numbers

### Hierarchy issues on mobile
- Below-the-fold content is just as visually heavy as above-the-fold — no progressive de-emphasis
- "How it works" / "Methodology" / "Disclosures" eat the same vertical space as live games

### Concrete recommendations
1. **Reduce hero padding on mobile** from `py-8 sm:py-12` to `py-5 sm:py-10`
2. **Tighten card internal padding** to 14-16px on mobile (currently 20-24)
3. **Compress hero CTAs** to horizontal pills on narrow screens (use `flex-wrap`, not stacked)
4. **Half-height sparklines** on mobile (`height={64}` instead of `96`)
5. **Single-row market chips** with `overflow-x-auto` instead of wrapping
6. **Sticky bottom mini-nav** for the 5 primary tabs (already in scope — would unlock huge mobile usability)

---

## 10. VISUAL DESIGN ANALYSIS

### What currently feels premium
- Hero typography (clamp 40-72px gold gradient + `-0.02em` letter-spacing)
- Team logos via ESPN CDN (no monogram fallback when real logos exist)
- Player headshots via NBA Stats CDN
- Dark luxury background (deep navy with subtle texture)
- "Cinematic rise" stagger on hero elements

### What still feels amateur
- **Card borders are universally 1px solid `--vault-border`** — feels flat; sportsbook cards typically have subtle 2px+ border on the active state
- **No real motion on hover** — `vault-glow-hover` is a faint gold tint, not the lift+glow real sportsbook apps use
- **Status pills are all rectangle chips with 1px borders** — feels admin-ish
- **No "live" pulse on actual live game cards** — pulses exist on dot indicators but not on the card glow itself
- **Spacing inconsistency** breaks rhythm
- **Color palette is mostly gold + neutral grays** — needs more depth via blue/cyan for "data" elements vs gold for "primary CTA"

### Best inspirations to study
1. **DraftKings live game cards** — for the dense-but-readable matchup layout
2. **Stake.com** — for the dark luxury treatment with subtle accent glow
3. **Apple TV+ sports overlays** — for cinematic typography and large logo treatments
4. **Kalshi market cards** — for the simple "X% chance" outcome-first surface
5. **Action Network's pick-of-the-day** — for ticket-style polish

### Achieving luxury sportsbook feel
- **Layered cards**: 2-3 background gradients per card (base → soft → highlight)
- **Soft inner glow** on active/featured cards
- **Hover state**: 1px gold border + 4px outer glow + slight scale (1.01) + transition
- **Gradient text** for hero numbers (already used) — extend to "stronger signal" labels
- **Status colors with personality**: green should be "live-pulse green" with a `box-shadow` halo, not flat
- **Typography hierarchy of 4 levels**: hero / heading / body / caption — NO more

### Color/spacing/typography thoughts
- Standardize border-radius to 3 values: 6px (pill) / 10px (card) / 14px (hero card)
- Standardize spacing to: 8 / 12 / 16 / 24 / 36 / 56 px scale
- Body text scale: 11 / 13 / 15 / 18 / 22 / 28 / 40 / 56 / 72 px
- Letter-spacing: -0.02em for display, 0 for body, 0.14em for all-caps eyebrows

### Motion guidance
- Hover transitions: 150ms cubic-bezier(.2, .8, .2, 1)
- Active state press: 100ms transform scale(0.98)
- Pulse animation: 2s infinite, opacity 0.5 → 1 → 0.5
- Respect `prefers-reduced-motion` everywhere (already done)

### Card hierarchy recommendations
1. **Hero cards** (homepage matchup): 14px radius, layered gradient, soft glow on hover
2. **Game cards** (board): 10px radius, single gradient, 1px border
3. **Pills + chips**: 6px radius (rounded-full only for status dots)

---

## 11. DATA + PIPELINE STATE

### NBA pipeline
1. `pipeline.generate_daily_board --date YYYY-MM-DD` → reads ESPN/nba_api for schedule + game logs, hits paid Odds API for player props, runs `score_model.score_prop`, applies confidence guardrails, writes `app/public/data/boards/<date>.json`
2. `pipeline.attach_recent10 --date YYYY-MM-DD` → free nba_api/balldontlie fetch for last-10 game logs, rescues R1-suppressed leans
3. Cost: 3 markets × 1 region × ~1 event = **3 credits per playoff slate**

### MLB pipeline
1. `pipeline.mlb.generate_mlb_board --date YYYY-MM-DD --min-credits-remaining N` → reads free MLB Stats API for schedule + rosters + probables, hits paid Odds API for 4 player-prop markets, writes `app/public/data/mlb/boards/<date>.json`
2. Cost: 4 markets × 1 region × N events = **~4 credits per game**

### Game-markets pipeline (h2h/spreads/totals)
1. `pipeline.fetch_game_markets --date YYYY-MM-DD --sport {nba,mlb}` → writes `app/public/data/<sport>/game-markets/<date>.json`
2. Cost: 3 markets × 1 region × N events = **~3 credits per game**

### Odds API spend controls
- `pipeline.credit_guard` is the single source of truth
- Standing cap: **75 credits/run** (`MAX_PER_RUN`)
- Standing floor: **300 credits** (`MIN_REMAINING`)
- Session-only floor overrides are documented in PR descriptions

### Settlement flow
1. `pipeline.settle_results --date YYYY-MM-DD` (NBA) → ESPN summary path for 9-digit gameIds, nba_api boxscore fallback
2. `pipeline.mlb.settle_mlb_results --date YYYY-MM-DD` (MLB) → MLB Stats API per-player game stats
3. `pipeline.export_results` + `pipeline.mlb.export_mlb_results` → sanitize internal-only fields, write to `app/public/data/`
4. `pipeline.model_audit` → re-aggregate `model_audit.json` and `lifetime_summary.json`

### Automation scripts
- `scripts/automation_settle.sh` — nightly settle + export + audit + grade parlays (5 steps)
- `scripts/automation_projections.sh` — morning generate + recent10 + snapshot parlays (5 steps)
- Both are bash with `set -e` but new steps wrapped in conditionals so non-fatal failures don't abort

### Image / logo sourcing
- **ESPN team logos** via `https://a.espncdn.com/i/teamlogos/...` (stable CDN URLs)
- **NBA Stats headshots** via `https://cdn.nba.com/headshots/nba/latest/1040x760/<playerId>.png`
- **MLB Stats headshots** via `https://content.mlb.com/images/headshots/current/60x60/<playerId>@2x.png`
- All have local fallback to monogram badges / initials disc

### Known edge cases
- **`name_to_team` lookup fails** on roster fetch corruption → all leans get `team=""`, `homeAway="Home"`. Workaround via `pipeline.team_rosters.NBA_PLAYOFF_ROSTERS` static map.
- **9-digit vs 10-digit gameIds** — ESPN uses 9 digits; nba_api uses 10. Settlement path branches.
- **Anaconda numpy 2.x + bottleneck mismatch** — pandas crashes during nba_api on system Python. ALWAYS use `pipeline/.venv/bin/python` for pipeline commands that touch nba_api.

### Known stale-data risks
- **`slate.json` dayLabel** stamps "Today"/"Tomorrow" at generation time; goes stale after midnight ET. Mitigation: PR #74 made the UI compute live labels from `buildTimeToday`. **The artifact itself is still stale** — a follow-up could stop pre-stamping labels in the pipeline.
- **Future board shells** (May 22, 23 still on disk) — they have `propsAvailable: false` and 0 leans, so they don't pollute results, but they DO show up in `getAvailableBoardDates()`. PR #72's settlement-manifest filter handles the "future-graded" risk.

---

## 12. ALL KNOWN BUGS / RISKS

### Real bugs (low severity)
- **None known.** The future-date graded bug was fixed in PR #72; the Parlay Lab "Tomorrow" bug was fixed in PR #74. The Harden attribution concern from PR #78 turned out to be a false alarm (verified in PR #79).

### Suspected bugs (worth investigating)
- **MLB board occasional duplicate leans** — some games render the same player+market twice. Need to verify if it's a DK + FD duplication issue (expected) or a real dedupe bug.
- **`slate.json` byDate dayLabel** still stamps stale "Today"/"Tomorrow". UI bypasses but the artifact is wrong on disk.
- **Sparkline tooltip on `<circle>`** — template-literal fix landed in PR #72 but verify no React warnings appear in production logs.

### Architectural debt
- **`SportSectionTabs` returns null** — 21 files still import it. Should be deleted in a cleanup PR.
- **`pipeline.parlay_builder_test` rules are duplicated** in `pipeline.snapshot_parlays.PROFILE_RULES`. A shared `pipeline.parlay_rules` module would DRY this up.
- **`app/src/lib/data-mlb.ts` and `data-nhl.ts`** have similar shape but different import names — could be unified.
- **`app/public/data/boards/2026-05-22.json` + `2026-05-23.json`** untracked shells — auto-refresh writes them but they shouldn't ship to prod. They're git-ignored implicitly because they're untracked, but a cleaner pattern would be a `.gitignore` rule.

### Scaling concerns
- **MLB 309 leans per page is the current scaling ceiling** before noticeable lag. World Cup with 48 teams × 26-man squads × 5 markets/player = ~6,000 potential leans. Need progressive disclosure now.
- **Static export builds 48 + 6 + N team detail pages** at every deploy. Build time will grow.

### Performance concerns
- **No image lazy-loading.** Player headshots load on initial paint.
- **No code splitting for `/parlay-lab`'s builder client.** Heavy import even on mobile.
- **`getAvailableBoardDates()` reads every JSON file** on every page that uses it. Cacheable.

### Data integrity concerns
- **Snapshot idempotency relies on stable slip ID.** If `PROFILE_RULES` changes mid-day, a rerun could write different slips with different IDs. Mitigation: gate rule changes on settled-only data.
- **Grader uses `(playerId, market, side, line)` key.** If line moves between snapshot and settlement (rare in NBA, common in MLB), the leg becomes unresolvable. Need a "closest line within ±0.5" fallback.

### Future risks
- **Vercel preview auth-gate** blocks programmatic verification — preview URLs require login. Workaround: verify via the dev preview server before merge.
- **The Odds API quota resets monthly** on the 1st. Plan paid spend around month boundaries.
- **NHL/IPL "schedule only" surfaces** could be misleading once the season ends. Need an `inSeason` flag.

---

## 13. RECOMMENDED NEXT PRIORITIES

### Highest impact product work
1. **MLB accordion redesign** (performance unblocks UX trust)
2. **Suggested parlay surface** (retention driver — first thing a casual user wants)
3. **Mobile density pass** (every page improves)

### Highest impact UX work
1. **Results label cleanup** (drop "L · P · A" shorthand for friendly "Line / Projection / Actual")
2. **Parlay ticket polish** (visual hierarchy + shareable look)
3. **Homepage emotional hook** (subtitle change + featured matchup glow)

### Highest impact methodology work
1. **Market-specific edge floors** (NBA PTS needs ≥5pp, REB can stay ≥3pp)
2. **OT detection + retro flag** (track which settled rows came from OT games)
3. **Usage-shift suppressor** (when star projected at >25% usage, downgrade tier)
4. **Stronger-signals filter** for `/results` — surface the curated subset that actually performs

### Highest impact performance work
1. **Accordion-collapse the MLB board** (the lag complaint goes away)
2. **Lazy-load player headshots** (faster first paint on Results pages)
3. **Cache `getAvailableBoardDates()`** at module scope

### Highest impact retention work
1. **Daily suggested parlays** (snapshot-curated, no fake history)
2. **Newsletter follow-through** (existing signup component, but no actual email flow)
3. **"What's tonight?" mini-summary** on homepage (1-sentence editor's note from settled data)
4. **Persistent "track your slips" prompt** (UI nudge to bookmark `/results/parlays`)

### Highest impact monetization work (think strategically, don't implement fake paywalls)
1. **Premium "stronger signals" filter** that surfaces only ≥X% confidence picks
2. **Tracked picks** — let users follow a profile (conservative / balanced / aggressive) and see only those slips
3. **Tier-gated MLB game markets** — currently free; could justify a paid tier when coverage expands
4. **Daily email digest** — opt-in, free, builds the list for future paid features

---

## 14. OVERNIGHT SESSION RECOMMENDATIONS

Suggested roadmap, in order of dependency:

### Phase 1 — Mobile + performance unlocks (do first)
1. Mobile density pass: tighten padding/gaps across all pages
2. MLB accordion redesign: wrap each game in `<details>`, auto-open first, collapse probable pitchers inside
3. Lazy-load headshots on Results pages
4. Sparkline mobile sizing (height 64 on narrow screens)

### Phase 2 — UX clarity (depends on Phase 1)
5. Results page label cleanup ("Line · Projection · Actual" instead of "L · P · A")
6. Friendly confidence labels everywhere ("Stronger signal" / "Watch" / "High-variance")
7. Push "audit" terminology to deep-dive page only

### Phase 3 — Parlay product evolution (depends on Phase 2)
8. Daily suggested parlay surface on `/parlay-lab` (curated 3 slips per profile from current snapshot)
9. Ticket-style slip cards on `/results/parlays`
10. Saved-slip inline view in the builder ("Saved for this slate" section)

### Phase 4 — Visual overhaul (parallel to Phase 3)
11. Standardize border-radius (6/10/14)
12. Standardize spacing (8/12/16/24/36/56)
13. Add hover lift + glow to game cards
14. Sticky bottom nav on mobile (5 primary tabs)

### Phase 5 — Methodology improvements (separate PR, with tests)
15. Market-specific edge floors (gate behind test + benchmarking)
16. OT detection flag (settled rows tagged for separate review)
17. Add `pipeline.calibration_report` CLI that re-runs filters on settled data

### Phase 6 — Documentation + roadmap
18. Write `BACKTEST_PLAN.md` with realistic data-source roadmap
19. Update `/about` page with diagrams + plain-English methodology
20. Update `SESSION_HANDOFF_2026-05-23_POST_OVERNIGHT.md` with full report

### What to defer (low ROI right now)
- World Cup projection model (still 3 weeks out)
- NHL / IPL pipelines (no real demand signal)
- Real cross-sport parlay support (no usage data yet)
- User accounts / auth (premature without retention proof)

### Hard constraints for the overnight session
- **NO paid API spend** unless the user explicitly approves
- **NO scoring/model logic changes** without tests + benchmarking
- **NO fake claims** — every UI label must be backed by real settled data
- **NO retroactive parlay history** — empty state stays until first real snapshot grades

---

## 15. FINAL OPINION

### Current product quality
**B+ / A-.** The site is genuinely usable, honestly framed, and has real ESPN-quality team logos and player headshots. The structural problems are gone (no future-date bugs, no fake history, no broken images). Remaining issues are polish, density, and emotional impact — not correctness.

### Current trustworthiness
**A.** This is the strongest aspect. Every number on the site can be traced to a settled row or marked pending. Pushes excluded, pending never counts as loss, no fake parlay record, no fake hit rates. The defensive tests (PR #79's attribution lock) actively prevent regression. **This is the moat.**

### Current competitiveness
**B.** Against DraftKings/FanDuel: not competing (they're books). Against Action Network/Underdog: comparable on data depth but weaker on visual polish and addictive feel. Against PrizePicks: ahead on transparency, behind on emotional design. **Niche: "the honest sports projection site"** — there's no direct competitor doing both projections and a public, settled track record.

### Current UX maturity
**B.** Nav is clean (5 tabs), routes are sensible, no broken pages, no broken images. But density issues, mobile cramping, and dense Results page hold it back from A-territory.

### Current visual maturity
**B-.** Dark luxury aesthetic is consistent. Real logos + headshots + emoji sport icons all land. But card shadows are flat, hover states are timid, motion is restrained to the point of being invisible. Needs one more visual pass to hit "premium sportsbook" feel.

### Does the product have real potential
**Yes — significantly more than the current state suggests.**

The combination of:
- Real settled audit
- Public per-player results
- Trustworthy framing
- Already-built persistence + grading system
- ESPN/NBA/MLB official imagery

…is genuinely uncommon. Most "sports model" sites are either Twitter accounts (no auditability), Substack newsletters (no daily refresh), or sportsbooks (no transparency). GameTimePicks sits in a real gap.

### What separates it from generic betting tools
1. **Public settled record** — not hidden, not retroactively edited, exportable JSON
2. **Honest empty states** — never pretends data exists when it doesn't
3. **Real per-player results** — most tools show only "+5.2% ROI" without naming a single graded pick
4. **Refusal to fake history** — the parlay system explicitly waits for first real snapshot

### What could make it genuinely special
1. **Mobile-first sportsbook feel** — if mobile becomes the strongest surface, this beats Action Network
2. **Daily curated parlays** with real persistence — gives users a reason to return nightly
3. **"Why this pick hit"** post-mortems — short explainers on settled days (e.g. "REB hit because OKC outrebounded SA 56-39")
4. **Confidence calibration display** — show that High-confidence picks really hit at X% vs Medium at Y% across N picks
5. **A consistent visual identity** — the dark+gold direction is right; just needs more conviction

### Brutally honest summary
The product is *not* yet the cleanest and most addictive sports projection platform. But it IS the most honest one. The overnight session should not chase 80% hit rate — that's a vanity metric. It should chase emotional clarity (mobile, MLB performance, ticket polish) and retention hooks (suggested parlays, daily summaries) while preserving the honesty moat.

**The differentiator is not the model — it's the audit. Lean into that.**

---

## SESSION CONTEXT — KEY FACTS

- **Today's ET date** at handoff: post-midnight 2026-05-22
- **Last settled date**: 2026-05-21 (NBA only; MLB May 21 still has unsettled games per the partial-settle pattern)
- **Last successful prod deploy SHA**: `68523ee` (PR #80)
- **Odds API balance**: 260
- **Standing floor**: 300 (no override active — paid spend NOT authorized for overnight without explicit approval)
- **Working tree**: clean — no uncommitted changes
- **Working branch**: `main` (no WIP branches)

## CRITICAL DO-NOT-DO LIST FOR OVERNIGHT

- ❌ Do not snapshot past dates as "saved pregame"
- ❌ Do not claim parlay hit rate
- ❌ Do not retrain the model on the 6 settled dates
- ❌ Do not hit the paid Odds API without approval
- ❌ Do not touch `pipeline/score_model.py` or `pipeline/confidence_guardrails.py` without tests
- ❌ Do not promise 80% accuracy in copy
- ❌ Do not introduce forbidden phrases ("lock", "guaranteed", "safe bet", "free money", "can't miss", "best bet", "no room for error")
- ❌ Do not regress the 21 currently-passing pipeline test suites

## ROLLBACK COMMAND

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit 68523ee
git push origin main
# Vercel redeploys in ~1 min; custom-domain edges propagate in ~1-3 min
```

---

*End of handoff. If anything here conflicts with the live state, trust the live state and re-verify before acting. Good luck.*
