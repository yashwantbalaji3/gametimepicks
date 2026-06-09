# Hit-rate improvement roadmap + simulations — June 5–8 data

Evidence-ranked. **Nothing here is implemented yet** (per Phase 8 — analysis
first). Simulations are leg-level on the settled universe (June 1–8); card-level
impact is inferred via parlay math from the simulated leg rate.

## Simulated candidate selection rules (universe leg hit rate)
| Rule | Leg hit rate |
|---|---|
| baseline (all settled) | 48.5% |
| batter_hits only | **52.5%** |
| batter_hits + edge 0–10% | **53.0%** |
| batter_hits + edge <5% | 51.9% |
| any market + edge <5% | 49.7% |
| edge in [0,10) | 50.2% |
| **edge ≥15% (what to AVOID)** | **41.1%** |
| batter_hits + Medium conf | 50.9% |
| June-8 published (gates+form, actual) | **56.4%** |

The actual June-8 gated selection (56%) beat every universe rule (≤53%) because
it *also* applies the recent-form L10/L5≥80% gate — so **market + edge-cap + form**
together are the winning stack. The job now is to convert that into card wins.

## A. Immediate fixes for the next slate (highest leverage first)
1. **Shorten cards.** Low = **2 legs**, Bank Builder = **2 legs single card**,
   Medium = 2–3, High/Longshot = 3. At 56–64% legs this lifts Low card rate from
   ~0–20% toward ~30–41%. *Biggest single lever.*
2. **Hard edge cap.** Exclude edge ≥15% from Low/Medium (41% hit), down-weight
   10–15% in High/Longshot only. Edge is inverted above ~10% — stop treating big
   model edges as good.
3. **Drop confidence from ranking.** It's non-predictive (High 48 ≈ Low 48 ≈
   Medium 51). Rank by market reliability + recent form + odds tier instead.
4. **Odds-band gating.** Low requires odds ≤ −130 (favor heavy favorites, 60%);
   no plus-money in Low/Bank (plus-money = 35%).
5. **Exposure caps.** Max 1 restricted-market leg per card; max same player/market
   appears in ≤2 cards/slate; cap same-game legs per card.
6. **Keep market discipline.** batter_hits primary; total_bases/PTS/AST stay
   excluded unless a player clears the elite-consistency gate (validated: 29%/24%/0%).

## B. Short-term data fixes (unlock coverage + accuracy)
1. **NBA stats provider** — upgrade BallDontLie key to a tier including `/stats`
   (resolver already works, #319), OR wire SportsDataIO (`SPORTSDATA_API_KEY`).
   Without it NBA can't publish at all.
2. **MLB context not yet used:** confirmed starting lineups (scratch risk),
   pitcher handedness/splits, ballpark + weather (wind for total_bases/HRR),
   batting-order slot. These directly attack the overprojection problem.
3. **Player availability / role** confirmation before lock.

## C. Model / calibration fixes
1. **Replace projected-gap ranking with expected hit probability** calibrated
   per market (the gap is overprojected at the top end).
2. **Per-market Wilson lower bound** as the reliability prior (already partly in
   #306) — extend with per-market error distributions.
3. **Miss-margin-aware scoring** — penalize markets/legs with fat-tailed misses.
4. **Cap or invert the edge signal** above ~10% (data says it's anti-signal).
5. **Recalibrate or retire confidence** — current labels carry no information.

## D. Product fixes
1. Publish **fewer, shorter** cards (quality over volume) — empty tiers are fine.
2. Keep **honest empty states** (NBA "model picks unavailable — lines only").
3. Internal **data-quality badges** (form freshness, sample size) feeding gates.
4. Results transparency: keep showing losses + leg-level hit rate.

## Recommended first implementation PR (after review, separately)
**Card-length + edge-cap + odds-band tightening** — the three changes the data
most supports, each behind the existing gate functions:
- Low/Bank → 2 legs; Medium → ≤3; exclude edge≥15 from Low/Med; Low requires
  odds ≤ −130; max 1 restricted leg/card; ≤2 cards per player-market.
- Simulate on June 5–8 before merge (the disciplined pattern that caught the
  over-permissive consistency tiers earlier).

Expected effect (parlay math on observed leg rates): Low card hit rate from
~10% → ~30–40%; fewer but materially stronger cards. NBA remains blocked until a
stats provider is wired (Track B1).
