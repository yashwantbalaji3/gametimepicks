# Recent-Form Quality Signal + Confidence-Calibration Finding

> Evidence-backed, bounded selection improvement on settled data. No paid
> credits. No settled-slate regeneration. Affects FUTURE generation ranking
> only (Low's hard gates unchanged).

## Finding 1 — recent form is predictive; the score didn't use it
Settled MLB last-5 hit rate is monotonic: **5/5 = 59.4%** · 4/5 51.9% · 3/5
50.5% · 2/5 46.2% · ≤1/5 ~45% (same shape on L10). But `_sgp_leg_quality` only
rewarded recent10 **fullness** (whether 10 games of data exist), not whether the
leg has actually been **hitting its line**.

**Change:** add a bounded recent-form term — `+10 · clamp(recentHitRate − 0.5,
±0.30)` for the leaned side, preferring the stabler L10 and falling back to L5,
zero when no series exists. It's a ranking tiebreaker (comparable to the
fullness term), never overrides a much stronger edge (tested), and Low's hard
gate (L10 ≥ 80%) is unchanged — so this just prefers the **strongest-form**
eligible legs in every section. 5 new tests.

## Finding 2 — model "confidence" is NOT predictive (documented; not yet acted on)
Settled hit rate by the model's own confidence label is flat-to-inverse:
- **MLB:** High **48.6%** (n=2846) < Low 50.4% < Medium 51.3%
- **NBA:** High **51.1%** (n=1682) < Low 55.9% < Medium 56.0%

High-confidence picks do **not** grade better — yet `_sgp_leg_quality` multiplies
edge by a confidence weight (High 1.0 / Med 0.7 / Low 0.4), over-rewarding a
non-predictive label. This is a real calibration gap.

**Decision:** documented now; **not** changed in this PR. Recalibrating the
confidence weight is a core scoring change best validated against a freshly
generated slate (June 7 isn't generated yet). Recommended next step: flatten the
confidence weight (or replace it with the predictive recent-form + reliability +
odds signals) and validate on the next real slate before merging. Stacking it
with the reliability + recent-form changes unvalidated would be reckless.

## What's now in the quality score (all bounded, settled-evidence-backed)
`edge × confidence + 5·fullness + reliability(±1.2) + recentForm(±3.0)`
- reliability: prefers reliable markets (hits, REB, PTS) over weak (total_bases, AST)
- recentForm: prefers legs hitting their line lately

## Validation
- pipeline `parlay_optimizer_test` **116** (5 new) + py_compile ✓
- No change to hard gates, risk-bucket bands, exposure caps, or settled data.

## Honesty
Recent form and market reliability are *associations on settled data*, not
guarantees — every parlay can still lose. This improves selection toward
historically better-grading legs; it does not make any card "bound to win."

*Free settled-data signal. No paid API, no projection/grading-math change to
past results.*
