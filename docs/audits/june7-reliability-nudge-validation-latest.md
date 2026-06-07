# June-7 Reliability-Nudge Validation (latest)

> Does the settled-data market-reliability nudge actually affect curation?
> Honest answer: it's a GENTLE tiebreaker working as designed — meaningful but
> bounded, and correctly subordinate to the risk-bucket odds structure.

## Reliability ranking (shrunk, settled)
batter_hits 0.529 > batter_hits_runs_rbis 0.496 > pitcher_strikeouts 0.476 > batter_total_bases 0.432

## Published market distribution (June 7)
- Low: hits 5 · total_bases 4 · HRR 6 · K 1
- Medium: K 5 · HRR 5 · total_bases 7 · hits 1
- High: HRR 10 · hits 4 · K 3 · total_bases 7
- Longshot: HRR 14 · total_bases 17
- ALL published: total_bases 39% · HRR 39% · hits 11% · K 10%

## Interpretation (honest)
- The nudge is **±1.2** on a quality score where edge spans 5–25 — a tiebreaker,
  not a takeover (by design; over-weighting ~10 settled dates would overfit).
- total_bases is heavy overall because **High/Longshot need longer-odds markets**
  (total_bases/HRR) for payout — that's correct, not a defect; short-odds
  batter_hits structurally can't reach those tiers.
- In **Low** (conservative), total_bases legs survive only via the strict
  L10≥80% + negative-odds gate — i.e. strong-form legs in a weak market, which
  is legitimate (recent form, not market average, drives the leg).
- **No hard market exclusion** was added: it would remove genuinely strong-form
  legs and risk starving Low — overfitting market averages over leg-level form.

## Verdict
Nudge present + read by the optimizer; weak markets mildly de-emphasized;
reliable markets favored where odds permit; Low conservative; plus-money confined
to High/Longshot. Recommended next (validated) step: a leg-level reliability
conditioned on recent form, and the documented confidence recalibration — both
evaluated against a real slate before merge.
