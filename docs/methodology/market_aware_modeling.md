# Market-Aware Modeling (canonical)

_`ModelMode` in `app/src/lib/methodology/types.ts`._

## Three model modes
- **`no_market_model`** — projects purely from features; ignores the betting line. Used to find
  independent edges and to avoid anchoring.
- **`market_aware_model`** — uses the market line as one informative feature (it encodes a lot).
- **`market_residual_model`** — models the *residual* between the no-market projection and the
  market, i.e. where we disagree with the line.

## The edge target
```
edge = model_probability − market_implied_probability   (percentage points)
```
`market_implied_probability` is the **no-vig** implied probability (two-sided when both sides are
known). Positive edge = the model thinks the outcome is more likely than the price implies.

## Snapshot discipline (anti-leakage)
Market features must use a snapshot **at or before `prediction_time`** (`market_snapshot_time`).
Never use closing odds if the prediction was made earlier — `validateLeakage()` fails that. Track
`opening_line`, `current_line`, `line_movement`, `odds_movement` only up to prediction time.

## Why a winning pick can still be low-confidence / rejected
The market can move against a stale projection; a volatile line raises the risk score. Bank Builder
V2 may reject a market favorite (e.g. a moneyline) that *would* win, because its survival profile
(no draw cover, single-outcome fragility) is weaker than a double-chance — survival ≠ outcome.
