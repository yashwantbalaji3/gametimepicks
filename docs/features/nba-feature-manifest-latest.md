# NBA Feature Manifest

_2026-06-10. Human-readable summary; machine-readable source of truth:
`app/public/data/model/features/nba-feature-manifest-latest.json`._

Status legend: **active** = computed AND consumed · **partial** = computed, not a primary
driver · **pending** = data in repo, not wired · **provider-needed** = needs a provider
not connected · **intentionally-deferred** = deliberately not built yet.

A feature is **active only if the code actually computes it and the model consumes it.**

## Active (computed + consumed)
- Recent form: last-5 (0.45) + last-10 (0.35) game stat (PTS/REB/AST).
- Baseline: window mean ≤10–12 games (0.20) — NOT a true full-season average.
- Matchup: home/away split (0.30 blend).
- Risk: variance σ (dispersion) → Normal-CDF P(over).
- Market: line / implied / de-vig / edge (The Odds API).
- Risk: confidence + min-games gate (High ≥5pp & ≥8g; Medium ≥2.5pp & ≥5g).

## Partial
- Role: minutes last5/last10/season + minutes_trend (computed; context, not a direct multiplier).

## Pending (data in repo, not yet wired into player props)
- Game markets: spread / total / team implied / blowout risk (`game-markets/<date>`).
- Rest days / back-to-back (derivable from ESPN schedule).

## Provider-needed (not computed)
Projected minutes / usage / pace (top NBA inputs) · injuries / vacated usage / projected
bumps · opponent defensive rating / position allowance / primary defender · 3PM/3PA
(ESPN GameLog used carries pts/reb/ast/min only).

See the JSON manifest for per-feature detail fields.
