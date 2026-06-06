# Feature Leakage-Safety Audit — 2026-06-05 (auto-generated)

> `audit-feature-leakage-safety.mjs --write-report` · READ-ONLY · no paid API · no data/model/grading change.
> Confirms predictive inputs use only before-game info; flags stale/missing recent form.

## Verdict: WARN (fails=0, warns=1)

### Failures (leakage)
- none

### Warnings (staleness / missing provenance)
- NBA: 38 leans have stale recent form (latest game > 21d before slate) — Low Risk fails closed

### Info
- MLB: 15 games · 635 actionable leans · generatedAt 2026-06-05T16:12:11.690000+00:00
- MLB: no post-game outcome fields on leans ✅
- MLB: no recentGames dated on/after slate ✅
- MLB: 12 leans have <10 recent values (L10 not computable → not Low-eligible)
- NBA: 1 games · 89 actionable leans · generatedAt 2026-06-05T16:11:20+00:00
- NBA: no post-game outcome fields on leans ✅
- NBA: no recentGames dated on/after slate ✅
- NBA: latest recentGames date across leans = 2026-06-03

*Read-only. FAIL = future-game/outcome leakage; WARN = stale/missing form (Low Risk fails closed).*