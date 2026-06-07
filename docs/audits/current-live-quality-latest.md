# Current-Live Data Quality (auto-generated)

> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · deterministic · no paid API.
> Integrity checks on the active-slate MLB + NBA boards + optimizer + snapshot. No data/model/UI change.

## Slate 2026-06-07 — overall: PASS

MLB board: 15 games · 632 actionable leans (Over/Under) · 69 Pass (model-declined, excluded) · 701 total · generatedAt 2026-06-07T15:26:45.270536+00:00

### MLB integrity checks
| level | check | detail |
|-------|-------|--------|
| ✅ pass | playerId | 632/632 leans have playerId (missing 0) |
| ✅ pass | gameId | 632/632 leans have gameId (missing 0) |
| ✅ pass | two-way-odds | 632/632 leans have two-way odds (de-vig requires both sides) |
| ✅ pass | implied-prob | 632/632 leans have impliedOver/Under |
| ✅ pass | recentSeries | 632/632 leans have recentSeries |
| ✅ pass | model-prob | 632/632 leans have model probability |
| ✅ pass | line-plausibility | 0 leans with missing/implausible line |
| ✅ pass | odds-plausibility | 0 leans with implausible American odds (|o|<100 or >20000) |
| ✅ pass | duplicates | 0 duplicate (player|market|line|side) rows |
| ✅ pass | supported-markets | all markets supported |
| ✅ pass | freshness | board generatedAt=2026-06-07T15:26:45.270536+00:00 (slate 2026-06-07) — same-day |

### Slate structural checks
| level | check | detail |
|-------|-------|--------|
| ✅ pass | optimizer-exists | optimizer present for slate date |
| ✅ pass | snapshot-exists | snapshot present for slate date |
| ✅ pass | graded-absent | graded absent (correct — active/pending) |

### MLB market coverage
- pitcher_strikeouts: 26
- batter_hits: 241
- batter_hits_runs_rbis: 239
- batter_total_bases: 126

### NBA summary
- no NBA games (off-day or no slate)
- provider endpoint errors (non-fatal if fallback worked): scoreboardv2, leaguegamefinder

### Optimizer
- totalSlips 64 · legPool 476 · generatedAt 2026-06-07T15:28:07+00:00
- risk sections (all / nba / mlb / multi):
  - low: 6 / 0 / 6 / 0
  - medium: 6 / 0 / 6 / 0
  - high: 6 / 0 / 6 / 0
  - longshot: 6 / 0 / 6 / 0
- All ≥ each child (union) holds: yes ✅

*Read-only; no public/model/data change.*
