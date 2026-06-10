# NBA Factor Coverage Audit
_2026-06-10. Requested NBA factors vs `pipeline/score_model.py` + `pipeline/build_features.py`._

## Active (computed + consumed)
- Projection = 0.45·last5 + 0.35·last10 + 0.20·window-baseline + 0.30 home/away blend.
- σ (recent dispersion) → Normal-CDF P(over); edge vs de-vigged implied.
- Confidence: High edge≥5pp & ≥8 games; Medium ≥2.5pp & ≥5 games; else Low.
- 10 games/player via ESPN gamelog (leakage-safe; latest = night before slate).

## Partial
- Minutes (last5/last10/season + minutes_trend) computed in features; informs context but
  is not a direct projection multiplier.

## Pending (data in repo, not yet wired into player props)
- Game markets: spread / total / team implied total / blowout risk (`game-markets/<date>` is fetched).
- Rest days / back-to-back (derivable from ESPN schedule).

## Provider-needed (NOT computed)
- **Projected minutes, usage rate, pace** (the top NBA inputs) — only historical minutes exist.
- Injuries / vacated usage / projected bumps · opponent defensive rating / position
  allowance / primary defender · 3PM/3PA (ESPN GameLog used carries pts/reb/ast/min only).

## Guidance honored
Projected minutes flagged as the most important missing input; defense-vs-position kept
secondary; no fabrication — matchup factors are provider-needed placeholders. The working
ESPN board is unchanged (this audit added no code to the board).
