# Restricted-Market Player-Consistency Gates (latest)

> Replaces #306/#307's blanket market exclusion with conditional, per-player
> eligibility. Market reliability sets the BURDEN OF PROOF; the individual
> player's exact-market recent form decides eligibility. Future-slate logic
> (does not alter settled data or any already-generated slate).

## Why blanket exclusion was too blunt
#306 disabled / high-risk-only'd whole markets (batter_total_bases, NBA AST,
pitcher_strikeouts) because the AGGREGATE market is sub-break-even. But that
also removed the legs of players who ARE hitting that market consistently. The
user correctly pushed back: judge the player, not just the market.

## New status model (`market_suggested_status`)
| wilsonLo | status | meaning |
|---|---|---|
| ≥ 0.50 | `allowed` | eligible everywhere (subject to normal gates) |
| 0.35–0.50 | `restricted` | publishes ONLY when the player passes the consistency gate |
| < 0.35 | `disabled` | catastrophic / no usable signal → never |

So batter_total_bases (0.40), NBA AST (0.41), pitcher_strikeouts (0.42),
batter_hits_runs_rbis (0.47) are now **restricted, not disabled** — admittable
per-player. batter_hits / NBA PTS / REB stay `allowed`.

## Player-consistency gate (`is_consistency_eligible_volatile_market`)
Uses only real fields: the leg's own recentSeries → last-10 / last-5 hit rate vs
its line (the player's exact-market consistency), recent sample size, and
freshness. Missing/insufficient data → excluded (never assumed good).

**Backtest-calibrated bar (Jun 5-7):** restricted legs by L10 band —
L10 ≥ 80% hit **52%**; 70-80% and 60-70% bands hit **~46%** (below break-even).
So looser tier bars reintroduced the failure mode. The gate therefore requires
**ELITE consistency in every tier: L10 ≥ 80% AND L5 ≥ 80%** (sample ≥ 5,
non-stale). Tiers differ only in their OTHER gates (Low = negative odds;
High/Longshot allow plus-money).

## How each market is handled now
- **batter_total_bases** — restricted; admitted only for L10 ≥ 80% players.
- **NBA AST** — restricted; same per-player gate (shared code path).
- **pitcher_strikeouts** — restricted; same gate.
- Truly unsupported / no-form markets stay disabled.

## Low / Bank Builder stay conservative
- **Low**: allowed market OR restricted+elite consistency, AND the existing Low
  gates (L10 ≥ 80%, negative odds, non-stale).
- **Bank Builder (strictest)**: allowed by default; a restricted market only with
  L10 ≥ 85% (and L5 ≥ 80%) + heavy favorite + low non-market volatility. The
  consistency gate "vets" the market-volatility component for that player.

## Backtest result (admitted restricted legs, Jun 5-7)
Under the tightened gate: **37/71 = 52%** overall (HRR 55%, total_bases 50%,
strikeouts 1/4 noisy). Above break-even, far better than the ~42% market average
and the ~46% loose-gate — important markets recovered for elite-form players
WITHOUT reintroducing the June-7 sub-50% failure mode. (reference: allowed
batter_hits Low = 65%.)

## Honesty
No fabricated hit rates; only real recentSeries. Weak legs stay out; sections are
not padded. No "safe/lock/guaranteed/edge/V2" copy.
