# Two-plus TD and first-TD scorer — out-of-sample evaluation (PRIVATE_RESEARCH, 2026-11-15)

Neither market is publishable. Scripts in `scripts/` (01–07, run in order); large row files (replay rows 2014–2025,
pbp first-TD order, 2026 forward rows) are regenerable by 01–03 and are not committed. Lower log loss is better.

## Two-plus TDs (baseline BUCKET = P(2+ | anytime-probability bin), fit on earlier seasons only)
| population | candidate | n | log loss | level | Δ vs BUCKET [95% CI] |
|---|---|---|---|---|---|
| 2015–25, 3,028 games | Poisson from official P(anytime) | 49,377 | 0.15115 | 1.116 | +0.00150 [+0.00080, +0.00219] |
| 2026 official rows, 120 games | Poisson | 1,950 | 0.15230 | 1.134 | +0.0031 [−0.0004, +0.0066] |
| 2026 sim-v2, 73 games | sim-v2 twoPlusTd | 1,624 | 0.10965 | 0.842 | +0.0005 [−0.0025, +0.0037] |

- The Poisson mapping is mis-shaped: at P(anytime) ≥ 0.6 it predicts 0.323 against 0.194 observed. Verdict: defective.
- sim-v2 twoPlusTd: insufficient evidence (73 games; level 0.84). P(2+) ≤ P(anytime) holds on every row.
- BUCKET is the only calibrated option; it is a candidate for a forward test against sim-v2 (founder decision).

## First TD scorer (2015–25, 3,028 games)
- Competing-risks race from the official anytime chain: multinomial log loss 2.7729 vs 2.7434 for "normalised anytime".
  Δ +0.0295 [+0.0072, +0.0533], so it is worse. Verdict: defective.
- A post-hoc variant with historical class shares: Δ −0.0047 [−0.0094, +0.000005]. Insufficient evidence.
- sim-v2 firstTdScorer: defective as published. 73 of 74 receipts of record are @2, with no DEF/ST first-TD outcome,
  which is 5.7% of games historically. Only @2.2 receipts carry the row.
- 2026 cannot be graded: no committed source has scoring order. ESPN `scoringPlays` name the scorer only in prose
  (`athletesInvolved` is empty), so a parser and its validation are a prerequisite.

## Leakage
Every official row was frozen at least 2.5 days before that week's first kickoff. Every sim-v2 receipt of record
precedes kickoff (median lead 17.7 h). All baselines are fit strictly on earlier seasons.
