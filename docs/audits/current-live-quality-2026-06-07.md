# Data Quality & Slate Completeness (auto-generated)

> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · no paid API.

- **Active slate:** 2026-06-07 · overall **PASS**
- **MLB:** 15 games, 632 actionable leans (+69 model-declined Pass), markets: pitcher_strikeouts, batter_hits, batter_hits_runs_rbis, batter_total_bases
- **Two-way odds:** 632/632 leans have two-way odds (de-vig requires both sides)
- **playerId/gameId:** 632/632 leans have playerId (missing 0); 632/632 leans have gameId (missing 0)
- **recentSeries / model prob:** 632/632 leans have recentSeries; 632/632 leans have model probability
- **Freshness:** board generatedAt=2026-06-07T15:26:45.270536+00:00 (slate 2026-06-07) — same-day
- **Optimizer:** 64 slips; union holds: yes
- **NBA:** no NBA games (off-day or no slate) (provider errors: scoreboardv2, leaguegamefinder)
- **Snapshot:** snapshot present for slate date
- **Graded:** graded absent (correct — active/pending)

No data integrity blockers found that are fixable without paid API/fabrication.
