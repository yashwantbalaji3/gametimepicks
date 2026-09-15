# MLB game totals — overconfidence diagnosis plan (P313-R, drafted 2026-09-15)

**Status:** PLAN ONLY. Nothing here is registered, scored or adopted. The live-record gate keeps the over/under call paused
(`mlb_total` BREACHED: n 576, log loss +0.034 vs a coin flip, 95% [0.012, 0.055]; hit 48.8% while the shown probability
averaged 58.7%). Grading continues; the pause lifts itself if the record recovers.

## What is known, and what is not

- Known: the call lands about half the time while claiming about six in ten. Calibration-in-the-large is off by ~10 points
  on the shown side. The moneyline family shows a smaller version of the same gap (49.9% vs 57.2%, WATCH), the run line does
  not (65% vs 60%, HOLDING).
- Not known: whether the gap is a **level** defect (the simulated total distribution is centred wrong relative to the
  posted line), a **dispersion** defect (the simulated run distribution is too tight, so the mass beyond the line is
  overstated), or a **selection** defect (the pick is the larger of P(over)/P(under), so noise in the tail is always
  chosen — a winner's-curse that inflates the shown probability even for a well-calibrated distribution).
- ⚠ The 2026 graded record is SEEN (the scorecard, /results and this note read it). Any candidate scored on it is a
  second look and must say so. The clean population is forward: games from the registration date on.

## Diagnosis steps (dev-only, no bar chosen from held-out)

1. **Where variance enters.** Trace `lib/mlb/full-game/simulate.ts` → `plate-appearance.ts` / `engine.ts`: per-PA outcome
   sampling, lineup/pitcher inputs, run count. Record the simulated total's SD per game and the realised-total SD across
   games on the same slate (dev window: 2026-06-01 → 2026-08-31 graded artifacts).
2. **Level vs shape, separately.** Per game: (realised total − simulated median). Mean of that = level; its SD vs the
   simulation's own SD = dispersion. Report both before any remap is considered (P299 lesson: guard the property, not
   its proxy — "too skewed" was a level defect).
3. **Selection effect.** Re-grade with the pick fixed to OVER (and separately UNDER) regardless of probability. If the
   fixed-side reliability is fine and only the chosen side is off, the defect is the max-of-two selection, not the
   distribution.
4. **Reliability views.** Ten-bin reliability of P(over) against realised over on the dev window; PIT histogram of the
   realised total under the simulated distribution (uniform ⇒ well-specified; U-shaped ⇒ too tight; hump ⇒ too wide).
5. **Proper scores.** Log loss and Brier of P(over) vs (a) coin, (b) the book's no-vig over probability, (c) a
   "shrunk" P(over) = 0.5 + k·(P − 0.5) at dev-fit k, reported for diagnosis only.

## Candidates to preregister (only after step 1–5 on dev)

- **C1 dispersion remap:** widen the simulated total by a dev-fit scale on the run distribution (one constant), re-derive
  P(over) from the widened distribution. Structural, not a probability squash.
- **C2 line-relative shrink:** P(over) = 0.5 + k·(P − 0.5), k fit on dev. A calibrated remap; adoption would label the
  call as remapped.
- **C3 selection guard:** publish the call only when |P − 0.5| exceeds a dev-fit threshold, else "no lean". Reduces n,
  fixes the winner's curse if step 3 shows it.

Bars (to freeze in the registration): reliability ECE ≤ 0.05 on P(over) over the forward population; level |mean shown −
mean hit| ≤ 3 points; log loss below the coin flip with the bootstrap upper bound < 0; minimum 200 forward games. Every
candidate scored ONCE on the forward population; a REJECTED candidate is not retried by tweaking it.

## Where the discipline lives

`data/internal/research/mlb/reports/` (registration + receipt), the health scorecard (`mlb_total`) stays the alarm, the
live-record gate stays the only thing that pauses or lifts the public call. No candidate changes `lib/mlb/prediction/*`
without a founder-approved adoption step with a paired forward test.
