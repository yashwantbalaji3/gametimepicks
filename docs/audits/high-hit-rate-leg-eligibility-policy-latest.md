# High-Hit-Rate Leg Eligibility Policy (latest)

> Four nested eligibility tiers, all built from existing fields + settled
> reliability (leakage-free). Generated/internal pool stays broad; what we
> PUBLISH is filtered. If few legs pass, we publish fewer or none — never padded.

## Tiers (each stricter than the last)
1. **Generated/internal pool** — all projected legs (unchanged; full tracking).
2. **Suggested-parlay eligible** (`is_suggested_parlay_eligible` = #306 market
   quarantine): disabled markets never; high-risk-only only High/Longshot;
   downweighted never Low. Ranking de-prefers overprojected (high-edge) legs and
   ignores the (inverted) confidence label.
3. **Low-risk eligible** (`low_risk_leg_eligible`): allowed market + Over/Under
   with line + non-stale form + L10 ≥ 80% + negative odds (heavy-fav ≥80% L10 /
   favorite ≥90% / near-even needs 5/5 L5). Plus-money never Low.
4. **Bank-Builder eligible** (`is_bank_builder_eligible`, STRICTEST): all of (3)
   **plus** heavy favorite (≤ -150), ≥80% L10 on a near-full sample (≥8),
   lowest volatility (≤0.5). Else Bank Builder shows no responsible card.

## Volatility score (`leg_volatility_score`, 0 = steadiest)
Adds risk for: quarantine status (downweighted/high-risk/disabled), plus-money /
near-even odds, stale form, small/missing recent sample, overprojection (edge
>15%), and L5/L10 disagreement (≥0.40). Used as a tiebreaker (prefer steadier
legs) and the Bank-Builder gate. Unknown/missing data raises volatility — never
silently treated as good.

## Validated leg hit rates (settled Jun 5-7)
all legs **46.2%** → Low-eligible **65.5%** → Bank-Builder-eligible **65.0%**.
The gates select ~65% legs vs a 46% baseline — that is the whole point.

## Non-negotiables
No fabrication; no target-game data; no padding; fewer/empty is acceptable and
honest; no "guaranteed/safe/lock" copy.
