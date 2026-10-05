# Forecast Ledger — historical coverage report (Session 13 · Phase G · M7)

Built 2026-10-05 from a dry run of `main` `8943cb6c65` (owners as committed; includes the Weeks 1–2 NFL props from #968,
which the next nightly appends to the committed ledger). Every row is a published forecast read from its owner — never
a re-prediction, never reconstructed from a final.

**Totals:** 10,801 published forecast observations · 19 forecast types · 5 competitions. Unresolved (left out, never
guessed): NFL Weeks 1–2 names with no unique roster match **7**; EPL player rows with no exact published event id **0**.

| Sport | Family | Rows | Settled | Void | Unmeasured | Pending | Withdrawn | Measured % | Recoverability | First → last |
|---|---|---|---|---|---|---|---|---|---|---|
| EPL | epl_1x2 | 46 | 46 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 46 | 2026-08-21 → 2026-09-20 |
| EPL | epl_anytime_goalscorer | 2258 | 1212 | 1046 | 0 | 0 | 0 | 53.7% | OWNER_GRADED_LOG 2258 | 2026-08-21 → 2026-09-20 |
| EPL | epl_over_2_5 | 46 | 46 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 46 | 2026-08-21 → 2026-09-20 |
| EPL | epl_shots_on_goal_over_0_5 | 2258 | 1212 | 1046 | 0 | 0 | 0 | 53.7% | OWNER_GRADED_LOG 2258 | 2026-08-21 → 2026-09-20 |
| LIGUE_1 | ligue1_1x2 | 18 | 18 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 18 | 2026-09-11 → 2026-09-20 |
| MLB | mlb_homer_nukes | 225 | 191 | 0 | 32 | 2 | 0 | 84.9% | OWNER_SETTLED_UNFROZEN 225 | start not recorded |
| MLB | mlb_moneyline | 799 | 799 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 799 | 2026-07-24 → 2026-10-04 |
| MLB | mlb_run_line | 799 | 799 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 799 | 2026-07-24 → 2026-10-04 |
| MLB | mlb_total | 794 | 759 | 35 | 0 | 0 | 0 | 95.6% | OWNER_GRADED_LOG 794 | 2026-07-24 → 2026-10-04 |
| NFL | anytime_td | 870 | 709 | 43 | 118 | 0 | 0 | 81.5% | EXACT_FROZEN 634, OWNER_GRADED_LOG 236 | 2026-09-10 → 2026-10-04 |
| NFL | nfl_game_margin | 111 | 76 | 0 | 0 | 35 | 0 | 68.5% | EXACT_FROZEN 111 | 2026-08-13 → 2026-10-05 |
| NFL | nfl_game_total | 111 | 76 | 0 | 0 | 35 | 0 | 68.5% | EXACT_FROZEN 111 | 2026-08-13 → 2026-10-05 |
| NFL | nfl_game_winner | 111 | 74 | 2 | 0 | 35 | 0 | 66.7% | EXACT_FROZEN 111 | 2026-08-13 → 2026-10-05 |
| NFL | nfl_team_score | 222 | 152 | 0 | 0 | 70 | 0 | 68.5% | EXACT_FROZEN 222 | 2026-08-13 → 2026-10-05 |
| NFL | player_pass_yds | 151 | 112 | 10 | 29 | 0 | 0 | 74.2% | EXACT_FROZEN 112, OWNER_GRADED_LOG 39 | 2026-09-10 → 2026-10-04 |
| NFL | player_reception_yds | 733 | 615 | 19 | 99 | 0 | 0 | 83.9% | EXACT_FROZEN 560, OWNER_GRADED_LOG 173 | 2026-09-10 → 2026-10-04 |
| NFL | player_receptions | 733 | 615 | 19 | 99 | 0 | 0 | 83.9% | EXACT_FROZEN 560, OWNER_GRADED_LOG 173 | 2026-09-10 → 2026-10-04 |
| NFL | player_rush_yds | 456 | 325 | 25 | 106 | 0 | 0 | 71.3% | OWNER_GRADED_LOG 99, EXACT_FROZEN 357 | 2026-09-10 → 2026-10-04 |
| UFC | ufc_winner | 60 | 60 | 0 | 0 | 0 | 0 | 100.0% | OWNER_GRADED_LOG 60 | start not recorded |

## Reading it

- **Settled** = measured against the official result. **Void** = the subject did not play, a push or a tie (never a
  miss). **Unmeasured** = the official result has no line for it (e.g. a player with no stat row at FINAL, a Homer Nukes
  pick absent from the box score). **Pending** = not settled by its owner yet.
- **NFL game pending 35 events**: 14 games of 2026-10-04/05 (settle on the next event-window run), 16 Week 2 games that
  the experimental settlement never graded (fixed forward by #959 — they settle from the official box score on the
  next event-window run), 5 preseason games with no official final on file (stay pending; never guessed).
- **EPL player measured 53.7%**: 1,046 of 2,258 rows per family are VOID — projected players who did not play. That is
  the owner's rule (a non-appearance is not a miss), not missing data.
- **Recoverability**: EXACT_FROZEN = an immutable pre-start receipt the owner graded; OWNER_GRADED_LOG = the owner's
  append-only grade log naming the pre-start forecast it graded (NFL Weeks 1–2: values as printed, ids by exact roster
  crosswalk); OWNER_SETTLED_UNFROZEN = settled by its owner, but the published day file was overwritten (Homer Nukes).

## Not in the ledger (published, never measured by an owner)

NFL score shape · MLB projected score / simulation-median total · EPL BTTS, clean sheet, double chance, scorelines · UFC
method and round · MLB player-prop leans (RESEARCH — every market demoted, so not public history) · NBA (SHADOW).
Each needs a settlement owner before it can be measured; none is reconstructed after the fact.
