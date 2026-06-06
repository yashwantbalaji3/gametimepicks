# Feature Leakage-Safety Audit — 2026-06-06 (auto-generated)

> `audit-feature-leakage-safety.mjs --write-report` · READ-ONLY · no paid API · no data/model/grading change.
> Confirms predictive inputs use only before-game info; flags stale/missing recent form.

## Verdict: WARN (fails=0, warns=1)

### Failures (leakage)
- none

### Warnings (staleness / missing provenance)
- NBA: generatedAt 2026-06-05T16:11:20+00:00 != slate 2026-06-06

### Info
- MLB: board absent
- NBA: 0 games · 0 actionable leans · generatedAt 2026-06-05T16:11:20+00:00
- NBA: no post-game outcome fields on leans ✅
- NBA: no recentGames dated on/after slate ✅

*Read-only. FAIL = future-game/outcome leakage; WARN = stale/missing form (Low Risk fails closed).*