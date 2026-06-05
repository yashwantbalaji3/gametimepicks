# Current-Live Data Quality (auto-generated)

> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · deterministic · no paid API.
> Integrity checks on the active-slate MLB + NBA boards + optimizer + snapshot. No data/model/UI change.

## Slate 2026-06-05 — overall: PASS

MLB board: 15 games · 635 actionable leans (Over/Under) · 52 Pass (model-declined, excluded) · 687 total · generatedAt 2026-06-05T16:12:11.690000+00:00

### MLB integrity checks
| level | check | detail |
|-------|-------|--------|
| ✅ pass | playerId | 635/635 leans have playerId (missing 0) |
| ✅ pass | gameId | 635/635 leans have gameId (missing 0) |
| ✅ pass | two-way-odds | 635/635 leans have two-way odds (de-vig requires both sides) |
| ✅ pass | implied-prob | 635/635 leans have impliedOver/Under |
| ✅ pass | recentSeries | 635/635 leans have recentSeries |
| ✅ pass | model-prob | 635/635 leans have model probability |
| ✅ pass | line-plausibility | 0 leans with missing/implausible line |
| ✅ pass | odds-plausibility | 0 leans with implausible American odds (|o|<100 or >20000) |
| ✅ pass | duplicates | 0 duplicate (player|market|line|side) rows |
| ✅ pass | supported-markets | all markets supported |
| ✅ pass | freshness | board generatedAt=2026-06-05T16:12:11.690000+00:00 (slate 2026-06-05) — same-day |

### Slate structural checks
| level | check | detail |
|-------|-------|--------|
| ✅ pass | optimizer-exists | optimizer present for slate date |
| ✅ pass | snapshot-exists | snapshot present for slate date |
| ✅ pass | graded-absent | graded absent (correct — active/pending) |

### MLB market coverage
- pitcher_strikeouts: 27
- batter_hits: 245
- batter_hits_runs_rbis: 245
- batter_total_bases: 118

### NBA summary
- 1 game(s), 89 actionable leans (scheduleSource=espn_scoreboard, oddsSource=the_odds_api)
- provider endpoint errors (non-fatal if fallback worked): scoreboardv2

### Optimizer
- totalSlips 120 · legPool 533 · generatedAt 2026-06-05T16:13:12+00:00
- risk sections (all / nba / mlb / multi):
  - low: 4 / 4 / 4 / 4
  - medium: 4 / 0 / 4 / 4
  - high: 4 / 0 / 4 / 4
  - longshot: 4 / 0 / 4 / 4
- All ≥ each child (union) holds: yes ✅

*Read-only; no public/model/data change.*
