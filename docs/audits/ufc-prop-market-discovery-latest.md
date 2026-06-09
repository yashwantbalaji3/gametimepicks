# UFC prop-market discovery (June 9, live probe)

**Confirmed via a real OddsAPI probe (2 credits): The Odds API MMA exposes `h2h`
(moneyline) ONLY. No prop markets are available.**

| Market probed | Returned? |
|---|---|
| h2h (moneyline) | ✅ yes |
| totals | ❌ no |
| method_of_victory | ❌ no |
| fight_result_method | ❌ no |
| fight_to_go_distance | ❌ no |
| go_the_distance | ❌ no |
| rounds | ❌ no |

## Consequence (honest, per "do not invent")
- **Moneyline/winner:** supportable (7/7 internal projections already built);
  public still gated on backtest.
- **Method / distance / round-total props:** **cannot be built** — there are no
  real OddsAPI odds to anchor a model, and we do not fabricate odds or invent a
  market. `distancePropsReady`, `methodPropsReady`, `roundPropsReady` are hard-false;
  `propMarketsAvailable` records the probe result.

## What would unlock props
A provider that actually exposes MMA method/distance/round markets (a paid prop
feed, or a future The-Odds-API expansion). The discovery probe
(`pipeline/ufc/build_prop_odds.py --discover` via `ufc-prop-discovery.yml`) can be
re-run to detect that automatically. Until then, props stay absent — not faked.

## Methodology readiness
The prop METHODOLOGY (decision/finish/method-share/duration factors) is documented
for the day odds exist, but no prop feature/model/grading code is shipped, because
with no odds there is nothing to anchor or grade — building it now would be
speculative. Moneyline remains the sole real market.
