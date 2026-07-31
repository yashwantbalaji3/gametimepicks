# July 30, 2026 — The First Clean Daily Cycle

**Program:** 076–079 · **Status: PROVEN.** The full loop — pregame generation → official settlement through the lineage-gated path → closed accounting → corpus append → diagnostics → public contract → publish — completed for a single slate for the first time since the integrity architecture was built.

## The cycle, with evidence

| Stage | Evidence |
|---|---|
| Pregame board | sha256 `dddce12d407273ee…`, generated 2026-07-30 11:45 ET — 25 minutes before the 12:10 first pitch; 425 leans, 10 games, gamePk join injective (10 distinct) |
| Official finals | MLB StatsAPI: all 10 games Final (last: SEA@LAD, ~01:00 ET 07-31); nothing graded before its final |
| Settlement | canonical `nightly-settle` run 30606475026 — grades from the exact committed pregame board; ledger +385 rows (22,660 → 23,045, exact) |
| **Closed accounting** | **425 generated = 385 decisive (162W–206L) + 0 pushes + 2 unavailable + 38 no-play · gap 0 · 0 pending · partial=false** |
| Integrity states | 2026-07-28 still Withheld; 2026-07-29 still Not produced — neither entered any denominator |
| Corpus + diagnostics | calibration export `2026-07-30.jsonl` (+385), index asOf 2026-07-30; learning audit + comparison report regenerated in-run |
| Public contract | terminal-summary / system-status / daily-brief rebuilt in-run; `/results` transitions from In progress to Complete with denominator + interval |
| Money | `affe6b21…` / `cb80473f…` unchanged through the whole cycle |

## What the day's data said (one slate — evidence, not a trend)

Hit rate **42.08%** (162/385; small-sample flag set by the report itself). Per market: strikeouts 9–8 · hits 66–73 · H+R+RBI 59–80 · total bases 28–45 (research-only; never ranked). A below-coin-flip day is **consistent with the standing conclusion** that the model does not out-predict the de-vigged market; no parameter, calibrator, threshold or market policy was changed in response, per the daily-learning contract. Operational lesson recorded below; data-quality lesson: 2 unavailable rows (players with no stat line), correctly bucketed rather than dropped.

## The failure the first attempt surfaced — and why that is the system working

The first settlement dispatch (run 30606318692) **failed correctly**: the NBA settler exited non-zero on "no leans for 2026-07-30" — an off-season *absence* misclassified as a failure — and the post-pipefail orchestrator refused to publish a partly-red run, discarding nothing but time. The fix (`f8bf3d7d`) distinguishes the two conditions that had collapsed into one exit code: an empty date is a truthful no-op (exit 0, "nothing to do"); a *missing leans log* remains loudly non-zero. Pinned by a child-process regression in the settlement runner (88 assertions, was 85). The retry succeeded end to end.

Chain worth noticing: pipefail (Program 049/066) surfaced a dormant misclassification the moment it stopped being swallowed; the health gate refused to publish around it; the alert fired — into the run log only, because `OPS_WEBHOOK_URL` is still unset. Every layer did its job; the last mile to a human remains one founder secret.

## Exceptions open after closure

- **Lineage stamping on the settled rows: 0/385 (NOT_YET_STAMPED)** — the July 30 board predates the native-stamping deploy, so this is expected and honest. The first stamped-and-settled slate is July 31, settling August 1.
- Prediction-history freshness *sentinel* lagged the corpus it describes by one run (the corpus itself was current); the observer now trusts the newer artifact when the two disagree.
