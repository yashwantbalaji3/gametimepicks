# Methodology — Current State (latest)

> Internal honest description of how legs are selected and published as of main
> `a7828f7`. No guarantees; no public V2/new-model/edge claims; educational/paper.

## Pools (nested, each stricter)
1. **Generated/internal pool** — all projected legs (full tracking; not all shown).
2. **Suggested-parlay eligible** — passes the market quarantine: disabled markets
   never publish; high-risk-only only High/Longshot; downweighted never Low.
3. **Low-risk** — allowed market + non-stale form + L10 ≥ 80% + negative odds.
4. **Bank Builder** — strictest: allowed market + heavy favorite (≤ -150) +
   strong full-sample L10 + lowest volatility; else no card.

## Signals used (settled-evidence-based, leakage-free)
Market reliability (Wilson lower bound, sample-floored, shrunk) drives quarantine
+ ranking. Recent form (L5/L10, NBA includes playoff games). Odds band (favorites
> plus-money). Volatility score (odds/stale/sample/edge/L5-L10-disagreement).

## Signals DE-emphasized or flagged
Model edge is penalized above ~10% (overprojection). Confidence label is not
trusted (settled-inverted). Stale/missing form and unknown data RAISE volatility
and fail-close the strict gates — never a silent confidence boost.

## Context availability (honest)
NBA: recent playoff form + market reliability used; **series score, injuries,
projected minutes, implied totals are NOT in the data** and are not used. MLB:
recent form + reliability + odds used; **lineup/PA, platoon, park, weather,
bullpen are missing** and not faked. UFC: schedule-only, fail-closed, no picks.

## Honesty posture
If a slate produces few/no eligible legs, we publish fewer or none. We do not pad.
We do not hide losses. We do not claim guarantees.
