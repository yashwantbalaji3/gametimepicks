# v1.7 — Selector preregistration (Phase B)

**Frozen:** 2026-09-21, before any replay was run. **Prior looks:** none on these policies. The Phase A audit
(`docs/V17_BANK_BUILDER_MOONSHOT_FORENSIC_AUDIT.md`) was read before writing this; no policy below was tuned on
any outcome. Any change to this file after the replay must be recorded in §7 as a new look.

## 1. Hypotheses (each is a claim to test, not an assumption)

| # | Hypothesis | Falsified if |
|---|---|---|
| H1 | MLB-only pool causes slate forcing: on thin slates the products place cards whose market-implied joint p sits below the slate-normal p. | replayed joint p on ≤6-game slates is not lower than on ≥12-game slates |
| H2 | A no-play discipline (declining a card when the best qualifying construction's joint p is below a preregistered floor) raises per-step survival without collapsing publication frequency below 50% of eligible days. | survival does not rise, or publication days fall below 50% |
| H3 | A cross-sport eligible pool (MLB + NFL + UFC where public owners permit) raises the best available joint p at the rung price on days those sports play. | best joint p with cross-sport ≤ MLB-only on the same days |
| H4 | Moonshot with a two-leg cap has fewer weak-link failures than 3+ legs at equal price. | per-leg hit rate at equal odds bucket is not higher for two-leg slips |
| H5 | The current concentration handling (distinct games only) is insufficient: same-team / opponent / overlapping-time relationships appear in placed cards. | zero placed cards carry a relationship other than same-game |
| H6 | A five-step ladder at the current rung prices is structurally ~1% to complete under the market's own probabilities; a 3-step or 4-step ladder with the same seed and goal has a materially higher completion probability per attempt at the same expected drawdown per cycle. | replayed completion rate / cycle for 3–4 steps is not higher |
| H7 | Lane B's +200..+700 band lowers Lane B survival versus a safest-fit Lane B at the rung's own price. | Lane B safest-fit survival is not higher |

## 2. Frozen candidate policies

All candidates are pure functions of `(eligible legs at publication instant, ladder position)`; no results,
no lookahead. Ranking uses only fields the leg contract owns. Where the only probability is market-derived
the policy says so and never calls it a model probability.

### BB-LEGACY (control)
The live selector exactly (`bank-builder@1` as executed): favourites, Lane A safest-fit 2–4 legs, Lane B
+200..+700 value band, 1 leg/game, rung prices +100/+250/+100/+150/+186, always place when the price is reached.

### BB-C1 "safest-fit both lanes, no band"
Same as legacy but Lane B uses safest-fit at the rung's own price (tests H7). Everything else identical.

### BB-C2 "safest-fit + no-play floor"
BB-C1 plus: decline the day (`NO_QUALIFYING_PLAY`) when the best qualifying card's joint p < **0.42** at step 1,
**0.30** at any later step (floors frozen here; chosen from the ladder arithmetic, not from outcomes: a +100
two-leg card at joint 0.42 is the median market card, a +250 card cannot exceed ≈0.33). Reason codes:
`INSUFFICIENT_CANDIDATES`, `PRICE_UNAVAILABLE`, `CONCENTRATION_TOO_HIGH`, `MODEL_STATUS_INELIGIBLE`,
`SLATE_QUALITY_BELOW_THRESHOLD`.

### BB-C3 "cross-sport eligible pool"
BB-C2 over the ProductEligibleLeg universe (MLB + any sport whose public owner permits a product leg on that
date). No sport quota; sport diversity is not a tie-break (tests H3 in isolation from H2).

### BB-C4 "3-step ladder"
BB-C2 with rungs `[100→300, 300→1500, 1500→10000]` (required ≈ +200, +400, +567). Tests H6. **Founder gate
before adoption** (§29.6 of the program charter: changes the public concept).

### BB-C5 "4-step ladder"
BB-C2 with rungs `[100→250, 250→900, 900→3200, 3200→10000]` (≈ +150, +260, +256, +212). Tests H6. Same gate.

### MS-LEGACY (control)
`moonshot@2` exactly: both sides, 2 legs, distinct games, max joint p s.t. price ≥ rung (+300/+300/+150).

### MS-C1 "two legs + no-play floor"
MS-LEGACY plus decline when best joint p < **0.20** on day 1/2 and < **0.32** on day 3.

### MS-C2 "three legs allowed at equal price"
MS-C1 but the construction may use 2 or 3 legs; rank by joint p, tie → fewer legs. Tests H4.

### MS-C3 "cross-sport"
MS-C1 over the ProductEligibleLeg universe; correlation classes must be recorded on every card.

### MS-C4 "selected-card cadence"
MS-C1 but at most one placement per rolling 3 days per lane (a card is placed only if it is the best qualifying
construction seen in the window — decided at publication from the window's *prior* days only, never the future).
Tests F5.

## 3. Correlation / concentration policy (all candidates)

Relationship keys recorded on every card: `same_event`, `same_team`, `same_entity`, `same_market_family`,
`opponent`, `same_sport`, `cross_sport`, `overlapping_start` (starts within 30 min). Constraints frozen:
- `same_event` forbidden (already live);
- `same_team` and `opponent` forbidden across legs of one card;
- `same_market_family` allowed, recorded;
- `cross_sport` recorded, **never treated as zero correlation**.
No numeric penalty is used: the repo has no calibrated joint-probability owner, and the legacy
`correlationPenalty = 0.08` is an unmeasured constant (renamed "same-game deduction" wherever it survives).

## 4. Odds requirements
A leg needs an owned price for its side captured **before** the publication instant, from the sport's authorized
receipt. No synthesized odds. Legs with no price are `PRICE_UNAVAILABLE`, not zero.

## 5. Settlement semantics (unchanged, restated)
won → carry real payout; lost → seed; void/push → same rung, same stake; pending → held. Pending is never a loss.

## 6. Evaluation plan
- **Windows:** development = 2026-08-15 → 2026-09-05 (team-market files exist, receipts exist, but placements are
  sparse: 6 receipt lane-days); assessment = 2026-09-06 → 2026-09-20 (30 decided lane-days per product).
  This is **too small for a sealed holdout to carry an adoption decision**; the preregistered adoption gate is
  therefore forward shadow (Phase H), and the replay is used to *reject* candidates that are worse than the control,
  not to *adopt* any.
- **Metrics:** BB — per-step survival, cycle completion per attempt, mean furthest step, no-play frequency,
  expected-vs-actual under the published p. MS — leg-count distribution, near-miss distribution, all-leg
  completion, published price distribution, joint-p distribution.
- **Time-lock:** pool = `team-markets/<date>.json` games with `capturedAt ≤ generatedAt` of the day's actual
  publication (S7), plus the cross-sport contract's dated artifacts under the same rule. Rung position from
  receipts strictly before the date.
- **Rejection rule:** a candidate is rejected if its decided-lane-day survival is below the control's by more than
  one standard error on the assessment window, or if it publishes on fewer than 50% of eligible days.
- **Adoption rule (forward):** ≥ 20 decided lane-days per product in shadow with survival ≥ control and no
  guard failures; the adoption receipt lists sample, what did and did not improve, uncertainty.

## 7. Looks
1. 2026-09-21 — preregistered (this file). No replay run yet.
