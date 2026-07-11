# Queued postmortem — May 25 optimizer parlay performance

> Note: untracked file, never committed. Captures the partial-state read I
> took at ~22:45 ET on 5/25 + the user's deeper questions to investigate
> after the 5/26 03:00 ET cron finishes 5/25 settlement.
>
> If this file should not survive across sessions, delete it.

## Partial-state read (before full settlement)

Measured 22:45 ET 5/25 after manual run of `settle_results` + `settle_mlb_results`
+ `grade_optimizer --all`. **NOT committed / deployed** — reverted before
shipping. The cron at 5/26 03:00 ET will produce the official numbers.

- Overall: **4W · 51L · 0P · 15 pending** · 55 decisive · 7.3% hit rate
- Conservative: 1W · 7L · 7 pending (12.5%)
- Balanced: 0W · 11L · 5 pending (0%)
- Star Power: 3W · 19L · 2 pending (13.6%) — **best lane**
- High Variance: 0W · 14L · 1 pending (0%)
- NBA-only: 1W · 7L (12.5%); MLB-only: 3W · 19L (13.6%); Mixed: 0W · 25L (0%)
- All-star slips: 4W · 30L (11.8%)

Pending breakdown:
- 5 truly blocked by live games (COL@LAD, SEA@ATH) — Ohtani, Mookie Betts
- 10 DNP-blocked (Soto, Ruiz, Bauers, Schroder didn't appear in box score)

Winning slips:
1. Brunson + Harden REB Under (NBA stack, Star Power) — Knicks blowout helped
2. PCA + Carroll + Steer (Star Power MLB hits)
3. Edwards + Wood + Baty (Star Power MLB hits)
4. Carroll + Steer (Conservative MLB hits)

## Postmortem questions to investigate after cron

After the 5/26 03:00 ET cron produces the official settled file:

1. **Why did the optimizer parlays perform so poorly?** Especially Balanced
   (0/11) and High Variance (0/14). Was it the night's slate (NY blowout +
   Mookie/Ohtani live-game) or a systemic edge-vs-hit-probability gap?

2. **Which leg types killed the most slips?** From the partial read:
   - Mitchell AST Over 4.5 (he had 1 assist) — sank 3 Star Power slips
   - Harden PTS Over 18.5 (he scored 12) — sank multiple
   - KAT REB Under 11.5 (he grabbed 14) — sank 1
   - All NBA props on the CLE/NY blowout were affected — Knicks ran away
     so usage flattened on both sides

3. **Did Star Power actually help?** Yes — 13.6% vs 7.3% overall. But not
   conclusive on one slate. Need 4-6 settled slates to read a real signal.

4. **Did NBA same-game stacks hurt or help?** The one Star Power win was
   Brunson + Harden same-game. But Mitchell AST + KAT PTS-same-game
   slips lost. With 1 NBA game tonight, same-game is unavoidable for
   NBA-only Star Power.

5. **Did MLB hits underperform?** MLB-only Star Power 3/19 (15.8%) is
   actually OK on a 0.5-line market. Comparable to the audit's 51.9%
   single-leg hit rate (3-leg parlay theoretical ~14%).

6. **Did the blowout context destroy NBA props?** Yes — CLE was blown out
   130-93. Volume props (Mitchell AST, Harden PTS) cratered. Defensive
   props (Mobley REB) also stayed below line. Possible signal: when
   pregame total/spread implies a blowout risk, downweight NBA volume
   leans.

7. **Are we overfitting to model edge instead of actual hit probability?**
   Likely. Edge clipped at 20pp + market stability weight gives the
   optimizer's `leg_score` an edge-heavy bias. The calibration overlay
   pulls some of that back but maybe not enough on Low-confidence rows.

8. **Should homepage emphasize fewer slips / only the best 1 per lane?**
   Worth testing. The current 3-per-lane (best + 2 alternates) gives
   24% more surface area for losses to show. A single hero card per
   lane with "alternates" tucked behind a tap might read more confidently
   in long losing streaks.

9. **Should we hide High Variance or move it lower?** Long-run audit says
   4.5% hit rate, so 0/14 isn't surprising. But surfacing 3 HV cards on
   the homepage means HV losses dominate the visible record. Options:
   - Move HV below the custom builder
   - Show only 1 HV card by default
   - Add an explicit "longshot — not for the timid" badge

10. **Conservative/Balanced recent-form floor?** Possible new rule:
    every Conservative/Balanced leg must have ≥5 recent-form data
    points AND the model's projection must sit on the same side as
    the recent-10 average. That would have killed several losing
    Conservative legs tonight (e.g., Mobley REB Over 8.5 — recent
    average 9.4 supports the lean, this one would have stayed, but
    other slips might have been pruned).

## Suggested follow-up workflow

After 5/26 03:00 ET cron commits the official settlement:

1. Pull main, confirm the auto-commit landed
2. Re-read this file
3. Run a deeper analysis script across the 5/25 settled rows to test
   each of the hypotheses above quantitatively
4. Open an issue or new PR with proposed model/UI tweaks
