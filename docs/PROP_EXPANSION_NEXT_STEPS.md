# Prop Expansion — Next Steps

Status: audit only · 2026-05-27 · no code changes in this doc

## Goal

Lay out which prop markets we already support end-to-end, which are partially supported, and which require new model + grader work — so the next prop-expansion PR can be scoped narrowly without surprises.

The user has asked for richer prop coverage:

- **NBA**: Points, Rebounds, Assists, 3-pointers made, Steals, Blocks
- **MLB**: Hits, Total bases, Runs, RBIs, Home runs (HR longshot section), Strikeouts

## Current state — what already ships

| Market | Sport | Fetched (Odds API) | Projected | Settled | Audited | Optimizer-eligible | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| Points (PTS) | NBA | ✅ `player_points` | ✅ | ✅ `nba_api` | ✅ | ✅ all 4 lanes | Default Odds market |
| Rebounds (REB) | NBA | ✅ `player_rebounds` | ✅ | ✅ | ✅ | ✅ all 4 lanes | Default Odds market |
| Assists (AST) | NBA | ✅ `player_assists` | ✅ | ✅ | ✅ | ✅ all 4 lanes | Default Odds market |
| 3PM (player_threes) | NBA | ⚠️ Odds API supports it but `ODDS_MARKETS` default omits it | ⚠️ Model uses recent_3pm but no projector wiring | ⚠️ `nba_api` returns it (FG3M) but no settler row | ⚠️ Audit ID `3PM` reserved | ❌ Not in `mlb_allowed_markets` (NBA equivalent doesn't exist) | **Closest to ready.** Two changes: add to `ODDS_MARKETS`, add a thin projector wrapper, add settler field. |
| Steals (STL) | NBA | ⚠️ Odds API: `player_steals` | ❌ no projector | ❌ no settler | ❌ | ❌ | High variance. Needs model + audit. |
| Blocks (BLK) | NBA | ⚠️ Odds API: `player_blocks` | ❌ no projector | ❌ no settler | ❌ | ❌ | High variance + position-dependent. |
| Hits | MLB | ✅ `batter_hits` | ✅ | ✅ `mlb_stats_api` | ✅ | ✅ **all 4 lanes** | Strongest MLB cohort (~62% hit rate on 5/25). |
| Total Bases | MLB | ✅ `batter_total_bases` | ✅ | ✅ | ✅ | ✅ Balanced / Aggressive / Star Power | Demoted on 5/25 audit. |
| Strikeouts | MLB | ✅ `pitcher_strikeouts` | ✅ | ✅ | ✅ | ✅ Aggressive only | Worst MLB cohort (43.6%). Aggressive-only after audit. |
| H+R+RBI | MLB | ✅ `batter_hits_runs_rbis` | ✅ | ✅ | ✅ | ✅ Aggressive only | Weight 0.80; thin sample, audit when N≥100. |
| Runs | MLB | ⚠️ Odds API: `batter_runs_scored` | ❌ no projector | ❌ no settler | ❌ | ❌ | Single-event; low signal. |
| RBIs | MLB | ⚠️ Odds API: `batter_rbis` | ❌ no projector | ❌ no settler | ❌ | ❌ | Single-event; low signal. |
| Home Runs | MLB | ⚠️ Odds API: `batter_home_runs` | ❌ no projector | ❌ no settler | ❌ | ❌ | **Structural negative EV** at most offered prices. **Longshot-only**, must be quarantined visually. |

## Per-market gating requirements

For any new market to ship as **officially tracked**, ALL of the following must be true:

1. **Odds API support.** Verify the exact market key + plan tier covers it. Verify cost-per-event delta.
2. **Projection model present.** Numeric expected value with a believable distribution. Not a constant. Not a copy of a sibling market.
3. **Settler present.** Pulls the actual stat from `nba_api` / `mlb_stats_api`. Handles DNP, partial games, and stats-unavailable honestly.
4. **Audit row plumbing.** Market appears in `audit_daily` `_NBA_MARKETS` / `_MLB_MARKETS` and the `byMarket` rollup.
5. **≥ 100 settled rows in shadow** before going live in any official lane. The audit `byMarket` should display a weight before we put it in front of users.
6. **Audit policy threshold tuned.** A new market with no track record shouldn't immediately fire `market_<NEW>_weak`. The first 100 rows establish the baseline.

Until all five are true, the market either (a) does not exist in the optimizer at all, or (b) appears only behind a "shadow / experimental" flag with no official slip placement.

## Recommended order

### 1. NBA 3-pointers (3PM) — **closest to ready, lowest risk**

Estimated work: small (1-2 PRs)

- **PR A — odds fetch + projector.** Add `player_threes` to `ODDS_MARKETS`. Wire a thin projector using recent3PM data already available on player rows. **+~1 credit/event** (single new market across the same events). Shadow only.
- **PR B — settler.** `nba_api` already returns `FG3M`. Add to settled_leans output. Shadow grader.
- **PR C — official.** After ≥ 100 shadow settled rows (≈ 5 typical-slate days), add to `_NBA_MARKETS` in `audit_daily`, add to `MARKET_STABILITY_WEIGHT`, and let it enter Aggressive / Star Power lanes.

### 2. MLB Total Bases — **already ships, just needs ranking tweak**

Already shipped. The audit on 5/25 demoted it (47.9% on ~250 picks). No PR needed; let the audit/policy loop handle further adjustment.

### 3. NBA Steals / Blocks — **defer until 3PM is bedded in**

Both are high-variance and position-dependent. Adding them without a proper model risks degrading the lane composition. Defer at least 2-3 weeks after 3PM lands.

### 4. MLB Home Runs — **Longshot-only, separately scoped**

HR is structurally negative-EV at typical bookmaker prices and produces 3-4 hits per slate of 60+ HR-line bets. Treat as its own lane with:

- Own visible pill: "HR Longshot" (high variance)
- Never in Conservative / Balanced / Star Power
- Excluded from default homepage visible slots
- Explicit "high variance" warning copy
- Always collapsed by default
- Excluded from any "recommended" surface

Requires a separate model — HR projections need park factors, pitcher handedness, weather, and game-script awareness. **At minimum 2 PRs** (fetch+projector, settler+grader+UI). Recommend deferring until after the UI/UX revamp lands so the Longshot lane has its own visual identity.

### 5. MLB Runs / RBIs — **defer indefinitely**

Single-event stats with low signal. Don't add unless a user-driven request rises.

## Credit cost analysis

The Odds API charges per `(event × market × region)` call. Currently we fetch 3 NBA markets × 1 region = 3 credits/event. Adding 3PM = 4 markets = +1 credit per NBA event. Typical NBA slate during regular season is ~8 events → +8 credits/day. Negligible.

MLB is 4 markets × 4 credits/event already; adding HR would be +1 = 5 credits/event × 15 events = +15 credits/day. Not negligible — budget for it before flipping the switch.

## Out of scope for this doc

- Specific projector model implementations.
- UI for new prop chips (covered in `UI_UX_AUDIT_2026-05-27.md`).
- WNBA prop scaffolding (separate doc).

## Decision needed

Before opening any prop-expansion PR, confirm:
1. Which market is next (recommendation: NBA 3PM).
2. Whether we ship shadow-first (recommended) or directly to official lanes.
3. Whether the HR Longshot lane is in scope for the next 2 weeks or deferred.

Then the first PR is a 1-file change to `pipeline/config.py` adding `player_threes` to `ODDS_MARKETS`, plus shadow capture wiring.
