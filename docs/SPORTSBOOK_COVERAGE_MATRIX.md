# Sportsbook Coverage Matrix — what this repo actually has

> Generated and hand-verified 2026-07-27 (Sprint 027 · Phase 1). Regenerate with:
> ```bash
> cd app && npx tsx scripts/audit-sportsbook-coverage.mjs --today $(TZ=America/New_York date +%F)
> ```
>
> **This document reports MEASURED artifact contents, not schema or grep results.** A field that
> exists in a type, in one June artifact, or in a provider's docs is not coverage. Every number
> below was read out of the newest committed artifact.

## How the instrument was verified

Per the tool-trust rule, `audit-sportsbook-coverage.mjs` was checked against hand-measured cases
*before* its output was used to justify anything:

| Check | Expected (hand-measured) | Tool | Verdict |
|---|---|---|---|
| known-positive: `mlb/team-markets` 07-26 | 15 games, 15 with `noVigProb`, 15 with `total.line` | 15 rows, noVigProb 100% | ✅ agrees |
| known-negative: `nba/game-markets` | newest 2026-06-10 → must NOT read as current | `STALE`, age 47d | ✅ agrees |
| suspicious 0%: player-prop `team` | independently counted 0 of 2088 non-null | `teamIdentity=0%` | ✅ real, not a probe bug |
| suspicious 0 rows: `team-market-lines` | file self-reports `gameCount: 0`, `lines: []`, `status: "unavailable"` | `rows=0` | ✅ tool was right; my doubt was wrong |

The last row is worth keeping: I suspected the instrument and the instrument was correct. Distrust
cuts both ways — verify, don't assume the tool is the problem either.

## The matrix

| Source | Sport | Verdict | Newest | Rows | Book / source | Notes |
|---|---|---|---|---|---|---|
| `mlb/team-markets` | MLB | **LIVE** | 2026-07-26 | 15 games | `draftkings` via `odds_api` | moneyline / run_line / total |
| `mlb/player-props` | MLB | **LIVE** | 2026-07-26 | 2,088 props | `the-odds-api` | 8 market families |
| `mlb/home-run-props` | MLB | **LIVE** | 2026-07-26 | 737 | `the-odds-api` | subset view of `batter_home_runs` |
| `mlb/game-markets` | MLB | STALE | 2026-06-10 | 13 | — | 47 days old; legacy |
| `nba/game-markets` | NBA | STALE | 2026-06-10 | 1 | — | 47 days old; consistent with NBA `HISTORICAL_ONLY` |
| `internal/mlb/team-market-lines` | MLB | STALE / empty | 2026-07-21 | 0 | derived from committed team-markets | self-reports `status: "unavailable"` |
| UFC / World Cup / cricket / IPL / NFL / NHL / WNBA / MLS / EPL | — | **ABSENT** | — | — | — | no dated sportsbook market series exists |

**Headline: the only current sportsbook market data in this repo is MLB.** Everything else is
either frozen history or absent. Any Market Center must be built on that truth.

## Field-level population (newest artifacts)

| Field | `mlb/team-markets` | `mlb/player-props` |
|---|---|---|
| line / point | 100% | 100% |
| price (American odds) | 100% | 100% |
| book / provider identity | 100% (`draftkings`) | 100% (provider string) |
| event start time | 100% (`commenceTime`) | 100% (`startTimeUtc`) |
| **row-level capture timestamp** | **0%** | **0%** |
| implied probability | 100% | — (not precomputed) |
| **no-vig probability** | **100%** | — |
| **team identity on the row** | n/a (home/away explicit) | **0% — `team` is null on all 2,088** |

Two consequences follow directly and constrain later phases:

1. **Freshness can only be file-level.** There is no per-market `capturedAt`; the only timestamp is
   the artifact's `generatedAt`. Freshness must be reported per *artifact*, and no per-market
   "updated N min ago" claim is supportable.
2. **No snapshot history exists.** One artifact per date, overwritten in place — no second capture of
   the same market. Therefore **no opening line and no market movement can be shown**, and the
   earliest capture may only ever be called "first captured", never "opening".

## Game market families

| Family | Available? | Evidence |
|---|---|---|
| moneyline | ✅ | `marketsCovered: ["moneyline","run_line","total"]`, odds + impliedProb + noVigProb per side |
| run line (spread) | ✅ | `runLine.line` + per-side odds + `coverNoVigProb` |
| total (game) | ✅ | `total.line` + over/under odds + `noVigProb` |
| **team total** | ❌ | **not in `marketsCovered`; no `teamTotal` key on any of the 15 games** |

Team totals must not be offered as a sportsbook comparison — the book data does not contain them.

## Player prop families — provider vs model

This is the reconciliation that decides which comparisons are legitimate.

| Provider family | Rows (07-26) | Modeled? |
|---|---|---|
| `batter_home_runs` | 737 | ❌ not modeled |
| `batter_total_bases` | 399 | ✅ modeled |
| `batter_hits` | 300 | ✅ modeled |
| `batter_rbis` | 274 | ❌ not modeled |
| `batter_runs_scored` | 270 | ❌ not modeled |
| `pitcher_outs` | 39 | ❌ backtested and REJECTED → market-context only |
| `pitcher_strikeouts` | 39 | ✅ modeled |
| `pitcher_earned_runs` | 30 | ❌ not modeled |
| — | — | `batter_hits_runs_rbis` is **modeled but the book does not offer it** |

- Modeled families: 4 (`pitcher_strikeouts`, `batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`)
- Provider families: 8
- **Legitimate pairings: 3** — `pitcher_strikeouts`, `batter_hits`, `batter_total_bases`
- That is **738 of 2,088 rows (35%)** of the provider's prop volume.

⚠️ Even those three are **demoted**: `lib/mlb/model-calibration-status.ts` records
`modelBeatsMarket = false` for all four modeled families. So a model-vs-market pairing is
*context*, never a claim that the model out-predicts the book. See
[[gtp-modeled-markets-demoted]].

## What must NOT be built from this data

Directly implied by the measurements above:

- ❌ market movement / line history / "movers" — no repeat snapshots exist
- ❌ "opening line" — nothing marks any capture as an opening price
- ❌ per-market "as of" freshness — no row-level timestamp
- ❌ team-total comparisons — the book data has no team totals
- ❌ model-vs-market for HR, RBI, runs, ER, outs — no corresponding modeled distribution
- ❌ any non-MLB sportsbook surface presented as current
- ❌ attributing a player prop to a team from the prop row alone — `team` is null on every row
  (it must be joined via `gameId` → board/schedule, and that join needs its own confidence state)

## Consumers today

`mlb/team-markets` is read through `lib/mlb-team-markets.ts` (`getMlbGameCenter`) and by
`build-mlb-product-settlement.mjs` for grading. `mlb/player-props` feeds the board/props pipeline.
No consumer currently parses provider payloads directly in a component, which is the property the
canonical market layer (Phase 2) must preserve.
