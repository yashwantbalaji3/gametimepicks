# Data Quality & Slate Completeness (auto-generated)

> `app/scripts/audit-current-live-quality.mjs --write-report` · READ-ONLY · no paid API.

- **Active slate:** 2026-06-05 · overall **PASS**
- **MLB:** 15 games, 635 actionable leans (+52 model-declined Pass), markets: pitcher_strikeouts, batter_hits, batter_hits_runs_rbis, batter_total_bases
- **Two-way odds:** 635/635 leans have two-way odds (de-vig requires both sides)
- **playerId/gameId:** 635/635 leans have playerId (missing 0); 635/635 leans have gameId (missing 0)
- **recentSeries / model prob:** 635/635 leans have recentSeries; 635/635 leans have model probability
- **Freshness:** board generatedAt=2026-06-05T16:12:11.690000+00:00 (slate 2026-06-05) — same-day
- **Optimizer:** 120 slips; union holds: yes
- **NBA:** 1 game(s), 89 actionable leans (scheduleSource=espn_scoreboard, oddsSource=the_odds_api) (provider errors: scoreboardv2)
- **Snapshot:** snapshot present for slate date
- **Graded:** graded absent (correct — active/pending)

No data integrity blockers found that are fixable without paid API/fabrication.
