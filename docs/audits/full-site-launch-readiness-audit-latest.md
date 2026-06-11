# Full-Site Launch-Readiness Audit (latest)

## Current routes (public)
`/` (home), `/today` (NEW — daily board), `/projections`, `/parlay-lab`, `/bank-builder`,
`/results`, `/events` (Sports), `/world-cup` (+schedule/groups/teams), `/mlb`, `/nba`, `/ufc`,
`/methodology`, `/responsible-use`, `/about`, plus `/board`, `/trends`, `/ipl`, `/nhl`.

## What's live (data)
- World Cup: 8 projection views, 76 player props (pre-lineup, photos), 5 suggested cards, market
  matrix, double chance. Sticky section nav on `/world-cup`.
- MLB June 11: 8 games, 384 leans. NBA Finals board (201 leans). UFC moneyline. Bank Builder
  $728.76, Step 3, target $2,000.

## Problems
1. No single daily landing board → **fixed this PR with `/today`**.
2. Suggested cards lacked an interactive stake input → **fixed this PR (StakePayoutInput)**.
3. Nav labels fragmented (Projections/Parlay Lab/Sports) → Today added; full restructure pending.
4. Sport pages inconsistent (only World Cup has the tabbed feel) → pending shared SportShell.
5. Text density high on some pages → pending methodology-hub move + chips.

## Final site map (target)
Today · Picks · Build · Bank Builder · Results · Sports (World Cup/MLB/NBA/UFC) · Methodology ·
About. Each sport: Overview · Games · Projections · Player Props · Cards · Results · Methodology.

## Sequenced PRs (low-regression — never break NBA/MLB/UFC/Bank-Builder)
1. **This PR:** `/today` daily board + interactive StakePayoutInput + Today in nav + this audit.
2. `publicVisibility.ts` + `normalizeProjections/Cards/Sports.ts` (shared contracts).
3. Shared UI: SportShell/SportTabs/SuggestedCard/ProjectionCard/PlayerPropCard/StatusChip.
4. `/picks` unified card lobby (+ `/parlay-lab` alias) and `/build` betslip.
5. Daily mixed-sport card generation (`pipeline/daily/build_mixed_sport_cards.py`).
6. Uniform sport shells (World Cup full tab switcher → MLB → NBA → UFC).
7. Global nav + mobile bottom nav restructure (Today/Picks/Build/Sports/Bank), old-route aliases.
8. `/methodology` hub + text reduction. Visual/typography polish. Daily runbook + workflows.
Each ships behind tests + production verification.

## Launch rebuild progress
- Step 1 — `/today` daily board + interactive StakePayoutInput + Today in nav. ✅
- Step 2 — public-visibility filters + normalized contracts + shared UI kit. ✅
- Step 3 — MLB/NBA/UFC adapters + `/picks` unified card lobby. ✅
- Step 4 — `/build` custom paper-card builder (eligible legs only). ✅
- Step 5 — daily mixed-sport suggested cards (`pipeline/daily/build_mixed_sport_cards.py`). ✅
- Step 6 — `/world-cup` as a uniform tabbed SportShell. ✅
- Step 7 — `/mlb` as a uniform tabbed SportShell (shared kit). ✅
- Next: NBA shell → UFC shell → global nav + `/methodology` hub + visual polish.
