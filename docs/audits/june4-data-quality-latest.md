# June-4 Data Quality & Slate Completeness (auto-generated)

> `app/scripts/audit-current-live-june4-quality.mjs --write-report` · READ-ONLY · no paid API.

- **Active slate:** 2026-06-04 · overall **PASS**
- **MLB:** 9 games, 397 actionable leans (+29 model-declined Pass), markets: pitcher_strikeouts, batter_hits, batter_hits_runs_rbis, batter_total_bases
- **Two-way odds:** 397/397 leans have two-way odds (de-vig requires both sides)
- **playerId/gameId:** 397/397 leans have playerId (missing 0); 397/397 leans have gameId (missing 0)
- **recentSeries / model prob:** 397/397 leans have recentSeries; 397/397 leans have model probability
- **Freshness:** board generatedAt=2026-06-04T16:36:32.914002+00:00 (slate 2026-06-04) — same-day
- **Optimizer:** 64 slips; union holds: yes
- **NBA:** absent — 2026-06-04 is a genuine NBA off-day (ESPN: 0 events; games Jun 3 & Jun 5).
- **June-4 graded:** absent (correct — slate is active/pending, not settled).

No data integrity blockers found that are fixable without paid API/fabrication.
