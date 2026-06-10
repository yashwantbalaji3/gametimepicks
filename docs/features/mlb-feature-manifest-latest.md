# MLB Feature Manifest

_2026-06-10. Human-readable summary; machine-readable source of truth:
`app/public/data/model/features/mlb-feature-manifest-latest.json`._

Status legend: **active** = computed AND consumed · **partial** = computed, not a primary
driver · **pending** = data in repo, not wired · **provider-needed** = needs a provider
not connected · **intentionally-deferred** = deliberately not built yet.

A feature is **active only if the code actually computes it and the model consumes it.**
Provider-needed/pending features are honest placeholders — never fabricated.

## Active (computed + consumed)
- Recent form: pitcher last-3-starts K, batter last-10-games stat (H/TB/HR).
- Baseline: pitcher/batter season-to-date mean.
- Risk: variance σ (season stdev + market floor) → Normal-CDF P(over).
- Market: line, implied probability, edge (The Odds API).
- Risk: confidence + small-sample gate (insufficient_data <3 games; R5 anomaly ≥20pp).

## Provider-needed (not computed)
Lineup spot / expected PA / confirmed-lineup flag · expected innings / pitch-count
projection / days rest · handedness / platoon / batter-vs-pitcher · pitch mix · Statcast
(xwOBA/barrel/hard-hit/EV/LA/ISO) · park / weather / wind / umpire · bullpen fatigue.

See the JSON manifest for per-feature source, artifact path, freshness, leakage risk,
current-game-excluded, sample-size flag, missing/stale flag, and model-consumption fields.
