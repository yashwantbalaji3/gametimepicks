# Current-Live June-4 Data Quality (auto-generated)

> `app/scripts/audit-current-live-june4-quality.mjs --write-report` · READ-ONLY · deterministic · no paid API.
> Integrity checks on the active-slate MLB board + optimizer. No data/model/UI change.

## Slate 2026-06-04 — overall: PASS

Board: 9 games · 397 actionable leans (Over/Under) · 29 Pass (model-declined, excluded) · 426 total · generatedAt 2026-06-04T16:36:32.914002+00:00

### Integrity checks
| level | check | detail |
|-------|-------|--------|
| ✅ pass | playerId | 397/397 leans have playerId (missing 0) |
| ✅ pass | gameId | 397/397 leans have gameId (missing 0) |
| ✅ pass | two-way-odds | 397/397 leans have two-way odds (de-vig requires both sides) |
| ✅ pass | implied-prob | 397/397 leans have impliedOver/Under |
| ✅ pass | recentSeries | 397/397 leans have recentSeries |
| ✅ pass | model-prob | 397/397 leans have model probability |
| ✅ pass | line-plausibility | 0 leans with missing/implausible line |
| ✅ pass | odds-plausibility | 0 leans with implausible American odds (|o|<100 or >20000) |
| ✅ pass | duplicates | 0 duplicate (player|market|line|side) rows |
| ✅ pass | supported-markets | all markets supported |
| ✅ pass | freshness | board generatedAt=2026-06-04T16:36:32.914002+00:00 (slate 2026-06-04) — same-day |

### Market coverage
- pitcher_strikeouts: 13
- batter_hits: 151
- batter_hits_runs_rbis: 151
- batter_total_bases: 82

### Optimizer
- totalSlips 64 · legPool 279 · generatedAt 2026-06-04T16:37:00+00:00
- risk sections (all / nba / mlb / multi):
  - low: 4 / 0 / 4 / 0
  - medium: 4 / 0 / 4 / 0
  - high: 4 / 0 / 4 / 0
  - longshot: 4 / 0 / 4 / 0
- All ≥ each child (union) holds: yes ✅

*Read-only; no public/model/data change.*
