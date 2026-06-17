# Audit — End-to-End Parlay Engine, Extractor Parity, Today's Slate & Conditional Launch

_2026-06-17. Branch `end-to-end-parlay-engine-v1` off main `072c0bf`._

## Scope decision (incremental, backend-first)
This is a 16-phase epic. The task itself mandates it be done "safely, honestly, incrementally" and
orders the UI revamp (Phases 12–14) **after** backend contracts are stable. This PR therefore
delivers the **backend engine** end-to-end in dry-run — extractor parity, the eligible-leg pool, leg
quality, the correlation engine, daily + same-game parlay generators, suggested-parlay tracking, the
dual Bank Builder lane selector, today's projection, and the conditional launch command — all pure TS,
fully tested, **nothing published, no Bank Builder launched**. The UI/UX revamp (12–14) is the
explicit next PR; the route + component scaffolding for it already exists (below).

## Data reality on 2026-06-17 (what the slate actually supports)
| Sport | Source today | Extractor plan | Today's qualified candidates |
|-------|--------------|----------------|------------------------------|
| **MLB** | `mlb/boards/2026-06-17.json` — 626 leans, real | already wired; reuse | **Yes**, but many midday games are already `In Progress`/`Warmup`/`Suspended` → leakage rejects those; only pre-game leans qualify |
| **NBA** | board empty (season over) | wire extractor → `wired_no_candidates` | **No** (honest empty) |
| **UFC** | last event UFC Freedom 250 on 2026-06-15 (past); H2H moneyline only, props provider not connected | wire extractor vs `projections-latest.json` (moneyline); method/round props `not_available` | **No** today (no upcoming event; 06-15 is past → leakage rejects) |
| **World Cup** | `schedule.json` has 4 matches today (POR-COD, ENG-CRO, GHA-PAN, UZB-COL); **but** projections/odds only exist through 2026-06-16 | wire extractor vs `projections/latest.json` (team) + `player-projections/latest.json` | **No** odds-backed candidates for 06-17 (schedule-only); extractor validated against the 06-16 shape |

**Honest conclusion:** today's qualified slate is effectively **MLB-only** (pre-game leans), with NBA,
UFC, and World Cup reporting **No Qualified Candidates** for 2026-06-17. The dual Bank Builder will
almost certainly evaluate to **No Qualified Launch** (single-sport pool, started games, correlation
limits) — which is the correct, honest output, not a failure.

## Source shapes (for the extractors)
- **MLB lean**: `gameId, commenceTime, playerRole(pitcher|batter), marketKey/marketLabel, line,
  oddsOver/oddsUnder, projection, sigma, samples, recentSeries/recentGames, lean(Over|Under),
  modelProbOver/Under, edgePct, riskFlags`. Board `generatedAt` = prediction time. Games carry
  `status` (`Scheduled|Pre-Game|Warmup|In Progress|Suspended`).
- **World Cup team** (`projections/latest.json`): `matchId, homeTeam/awayTeam, homeCode/awayCode,
  group, kickoffUtc, market(moneyline_90|double_chance|match_total_goals|btts|draw_no_bet), pick,
  americanOdds, modelProbability, marketProbability, edgePct, confidence, riskTier, regulationOnly,
  settlementSupport("regulation_90"), outcomes[]`. **No `marketScope`/advancement field exists** →
  map `marketScope = "90_minutes"` from `regulationOnly`/`settlementSupport`; advancement markets are
  absent (never fabricated). Player props: `player_goal_scorer_anytime, player_shots_on_target,
  player_shots, player_assists`, `lineupStatus("not_posted")`, `dataQuality("limited")`.
- **UFC** (`projections-latest.json`): `boutId, fighter, opponent, oddsPrice,
  marketImpliedProbability, modelProbability, edge, dataQuality`; odds `commenceTime` in
  `odds-latest.json`. **Props (method/round/distance) provider not connected** → `not_available`.

## Existing contracts to build on (do NOT mutate)
- Methodology: `methodology/types.ts` (`PredictionOutput`), `adapter.ts` (`runMethodology`,
  `adaptMlbLean`, `liveFeatures`, `surfacedContextFlags`), `validation.ts`, `confidence.ts`,
  `risk.ts`, registries.
- Math: `projection-framework.ts` (`noVigTwoWay`, `edgePoints`, `dataQualityTier`,
  `parlayEligibility`, `concentrationScore`).
- **Protected (read-only)**: `data-bank-builder-v2.ts`, `data-bank-builder.ts`,
  `data-dual-bank-builder.ts` and all `public/data/bank-builder/*`, `public/data/parlays/*`,
  `public/data/**/boards/*`, settled/results JSON. The new dual Bank Builder selector is a **new
  dry-run evaluation layer** under `app/src/lib/parlays/` — it never writes those paths.

## Banned public copy (must stay clean)
`lock, safe, safest, guaranteed, guarantee, sure thing, free money, risk-free, can't miss,
cant miss, easy win, easy money, no-brainer, no brainer, sharp money, safety`. Enforced by
`methodology-content.test.mjs`, `build-a-parlay-config.test.mjs`, `bank-builder-*.test.mjs`. 97 app
test files baseline — all must stay green.

## UI surface (for the deferred Phase 12–14 revamp)
Routes already present: `/today /sports /mlb /nba /ufc /world-cup /games /parlay-lab /bank-builder
/results /methodology /build /picks`. Nav: `nav.tsx` + `mobile-bottom-nav.tsx`. Asset components
already present: `team-logo`, `player-avatar`, `flag-badge`, `team-badge`, `game-card`,
`curated-projections-card`, `parlay-ticket-card`, etc. **The revamp is refinement of existing
scaffolding**, not greenfield — deferred to the next PR.

## Launch gates (this PR implements + records, never forces)
1. extractor wired + validated for the sport · 2. ≥ N eligible legs after leakage/No-Bet/stale/missing
filtering · 3. ≥ 2 distinct games for two lanes · 4. low/neutral correlation between selected legs ·
5. event not started · 6. valid market scope. If any fail → `no_qualified_launch` with reasons; never
a forced pick.
