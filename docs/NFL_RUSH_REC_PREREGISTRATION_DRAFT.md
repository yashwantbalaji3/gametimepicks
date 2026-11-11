# NFL rushing and receiving v0: pre-registration DRAFT (not approved; founder to complete)

This is a draft. Nothing in it is approved, and the grader refuses to score any real outcome until the founder fills every item marked **FOUNDER TO SET**, approves the final file, and its sha256 and approval timestamp are recorded in `RUSH_REC_APPROVED_PREREG_SHA256` and `RUSH_REC_PREREG_APPROVED_AT` (`app/src/lib/sports/nfl/rush-rec-grade.mjs`). Any edit after approval changes the sha256 and makes a new registration.

## 1. Source of the bars

The bars below are copied from the 2026-11-09 market review (`~/gtp-evidence/market-review-other-sports-2026-11-09.md`), §3 item 2:

> NFL rushing/receiving yards. Reuse role shares; n>=400 lines per family (about 4 weeks, ~150/wk); bar ECE<=0.03 plus MAE vs positional baseline.

Everything that sentence does not fix is left to the founder (§5).

## 2. Families, statuses and model

- **Families:** rushing attempts, rushing yards, rushing TDs, receptions, receiving yards, receiving TDs (`rushAtt`, `rushYds`, `rushTd`, `rec`, `recYds`, `recTd`).
- **Status:** all six are `IMPLEMENTED_EXPERIMENTAL` (`RUSH_REC_MARKET_STATUS`, a frozen constant). Only `VALIDATED_OFFICIAL` may feed official picks, the same three distinct statuses as the QB props registration. A status moves only by a reviewed commit after its gate.
- **Model distribution:** the sim-v2 receipt of record (the latest shadow receipt generated strictly before kickoff), from its exact run counts (`simulation-receipt@2.3`, `exactCounts`, 1-yard / 1-count resolution, negative yards kept). For the TD families the count PMF of @2.1 receipts is also accepted. A row with neither has no model score: it is counted, never approximated from quantiles. Receipts before @2.3 carry exact counts only for the TD families, so the other four families have model rows only from receipts written after this change merges.
- **Conservation:** inside every simulated game, Σ player rushing attempts / yards / TDs = the team's, Σ receptions = completions, Σ receiving yards = passing yards, Σ receiving TDs = passing TDs, and a quarterback's rushing is counted once (`sim-v2/rush-rec-conservation.test.mjs`, 1,000 seeded games per split and every committed receipt).
- **Display:** none in this registration (product B's task).

## 3. Rows, actuals and baseline

- **One row, one outcome:** a row is a distinct (eventId, team, playerId) player-game for one family. A repeated key refuses the grade. Rows are the receipt's named players at QB, RB, FB, WR or TE who recorded the family's stat in some run; the OTHER bucket is never graded.
- **Actual:** the verified final's box score (player-events-v1, ESPN game summary), only for games the settlement source records FINAL and whose team passing yards agree with it. A player in the box with no line for the family recorded 0; a player absent from the box did not play and is excluded and counted.
- **Positional baseline (as proposed; the market review names it, the definition is this draft's):** the mean of the family over every earlier player-game of the same season (strictly earlier week, so same-week games never enter) by players at the same position (position from the receipts' role shares) who had at least one opportunity: a carry for the rushing families, a target for the receiving families. Fewer than 2 such player-games means no baseline (counted).
- **Metrics per family:** n; model MAE (|actual − model median|); positional MAE on the same rows; the paired difference (model − positional) with a game-clustered 95% bootstrap interval (2,000 resamples, seed 20261110); ECE of the model's P(over) at the lines in §5 (10 equal-width bins).

## 4. Window

- **Confirmatory:** a row whose kickoff is after the founder's approval timestamp and outside 2026 weeks 5–10.
- **Exploratory forever:** 2026 weeks 5–10 (`RUSH_REC_SEEN_WEEKS`).
- **Blind until approval:** before approval the only output is forward counts from receipts alone (`rushRecForwardCounts`): rows per family and rows with a model distribution, never joined to a final. Tests use synthetic rows only (`rush-rec-grade.test.mjs`).

## 5. FOUNDER TO SET

| Item | Value |
|---|---|
| n per family | ≥ 400 (copied from the market review) |
| ECE bar | ≤ 0.03 (copied from the market review) |
| MAE bar | model MAE below the positional baseline's (copied; the comparison rule is below) |
| ECE lines per family (`eceLines`) | **FOUNDER TO SET** |
| MAE comparison rule (`maeComparisonRule`), for example "the paired 95% game-clustered interval of (model − positional) MAE lies below 0" | **FOUNDER TO SET** |
| Whether ECE and MAE are both required for MET (`eceAndMaeBothRequired`) | **FOUNDER TO SET** |
| Positional baseline definition (§3) | founder to confirm or replace |
| Single look: the decision is taken once per family when n first reaches the bar, then frozen (as in the QB props registration) | founder to confirm |

## 6. Challenger: MKT-02 yardage split

- **What:** `nfl-sim-v2-mkt02-yardage-split@1.0.0` (`app/src/lib/sports/nfl/sim-v2/yardage-split.mjs`). The incumbent splits each drive's net yards in a way that leans to the run: simulated team passing yards are biased low and rushing yards high. The challenger multiplies each completion's sampled gain by α before the split, with the same seed, inputs and calibration as the incumbent receipt, so run i is the incumbent's run i with only the split moved. Scores, attempts, carries, TDs and total yards per run are unchanged.
- **Fit:** walk-forward and mechanical, with no tuning. α solves S(α) = R, where R is the league pass share (Σ passing / Σ passing + rushing yards) over every team-game from 2015 strictly before the target week, and S is the simulated league pass share over 2,000 seeded league-average games, solved by bisection on [0.5, 3] to 1e-4.
- **Use:** graded beside the incumbent on the same rows and reported, never able to change a status by itself. It feeds nothing public. Its receipts are written only by `build-nfl-sim-v2-shadow.mjs --challenger mkt02-yardage-split`, which no workflow runs yet.

## 7. Disclosure

The author of this draft has not seen any graded rushing or receiving result for these families. The MKT-02 fit target is a team-level pass share computed from historical team-games, an input to the challenger, not a graded outcome of any receipt. The fit has been run once on the committed history for 2026 week 11 (α ≈ 1.54, incumbent pass share 0.623 against 0.679 actual), and that figure appears here only to show the direction of the defect.

## 8. Approval

| Field | Value |
|---|---|
| Founder approval (written) and timestamp | ________ |
| sha256 of the final file as approved | ________ (also recorded in `RUSH_REC_APPROVED_PREREG_SHA256`, with the timestamp in `RUSH_REC_PREREG_APPROVED_AT`) |
