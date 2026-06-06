# Feature Leakage-Safety Audit — 2026-06-06 (auto-generated)

> `audit-feature-leakage-safety.mjs --write-report` · READ-ONLY · no paid API · no data/model/grading change.
> Confirms predictive inputs use only before-game info; flags stale/missing recent form.

## Verdict: PASS (fails=0, warns=0)

### Failures (leakage)
- none

### Warnings (staleness / missing provenance)
- none

### Info
- MLB: 15 games · 634 actionable leans · generatedAt 2026-06-06T16:04:12.913113+00:00
- MLB: no post-game outcome fields on leans ✅
- MLB: no recentGames dated on/after slate ✅
- MLB: 23 leans have <10 recent values (L10 not computable → not Low-eligible)
- MLB: latest recentGames date across leans = 2026-06-05
- NBA: 0 games · 0 actionable leans · generatedAt 2026-06-06T15:46:35+00:00
- NBA: no post-game outcome fields on leans ✅
- NBA: no recentGames dated on/after slate ✅

*Read-only. FAIL = future-game/outcome leakage; WARN = stale/missing form (Low Risk fails closed).*