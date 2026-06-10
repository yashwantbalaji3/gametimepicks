# World Cup Feature Manifest

_2026-06-10. Human-readable summary; machine-readable source of truth:
`app/public/data/model/features/world-cup-feature-manifest-latest.json`._

Status legend: **active** = computed AND consumed · **partial** = computed, not a primary
driver · **pending** = data in repo, not wired · **provider-needed** = needs a provider
not connected · **intentionally-deferred** = deliberately not built yet.

World Cup is **fail-closed** — no projection features are active.

## Active (structural, display only — no model)
- Schedule / fixtures (104 matches).
- Teams (48) / groups (12).
- `readiness-latest.json`: scheduleReady/teamsReady=true; everything else false.

## Provider-needed (all model factors)
Team strength (FIFA/Elo/xG) · match + player-prop odds · starting XI / projected minutes
/ set-piece + penalty takers · per-90 attacking & defensive · tactical · referee
tendencies · player-vs-player matchups · goalkeeper metrics.

## Intentionally deferred
Advancement-vs-90-minute market separation + knockout extra-time/penalty logic — built
only once real match markets + stats exist.

See `docs/methodology/world-cup-model-methodology-latest.md` and
`docs/research/world-cup-provider-plan-latest.md`.
