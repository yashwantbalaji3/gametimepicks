# High-Hit-Rate Filter Performance (latest)

> Settled leg-level reliability by feature bucket (Wilson lower bound, 95%).
> Source: `mlb/results/settled_leans.jsonl` (7,025 leans, 17 dates). Reproduce
> with `node app/scripts/audit-high-hit-rate-leg-filters.mjs [--since DATE]`.

## By market — which are publish-eligible?
| Market | hit | wilsonLo | n | tier |
|---|---|---|---|---|
| batter_hits | 53.0% | 51.3% | 3189 | **allowed (eligible everywhere)** |
| NBA PTS | 53.7% | 50.6% | 972 | allowed |
| NBA REB | 55.6% | 52.3% | 874 | allowed |
| batter_hits_runs_rbis | 49.1% | 46.9% | 2126 | downweighted (not Low) |
| pitcher_strikeouts | 47.4% | 42.4% | 367 | high-risk-only |
| NBA AST | 44.5% | 41.0% | 753 | disabled |
| batter_total_bases | 42.7% | 40.1% | 1343 | **disabled (quarantined)** |

## By confidence label — non-predictive (dropped from ranking)
High 48.1% (lo 46.3%) < Low 50.6% < Medium 51.2% — inverted; not trusted.

## By edge band — overprojection (penalized, not rewarded)
<0 51.3% · 0-5 51.4% · 5-10 51.2% · **10-20 44.9%** · **20+ 41.2%**.

## By odds band (from market-reliability.json)
heavy_fav 67.5% · favorite 55.8% · mild_fav 50.1% · near_even 44.0% ·
plus_money 41.5% · high_plus 34.2% — favorites publish, plus-money is High/Longshot.

## Eligibility verdict
Public/parlay-eligible: batter_hits, NBA PTS/REB. Bank-Builder: those as heavy
favorites only. Quarantined: batter_total_bases, NBA AST (disabled); strikeouts
(high-risk-only); HRR (downweighted). Too-small-sample markets default allowed
(not penalized) until they clear the sample floor.
