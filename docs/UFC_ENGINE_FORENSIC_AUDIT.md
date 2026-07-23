# UFC Engine — Forensic End-to-End Audit

**Date:** 2026-07-23 · **Scope:** read-only forensic trace of the UFC stack (routes, data, pipeline, workflows, tests, artifacts, public copy) · **Method:** artifacts opened and inspected (dates + fields verified inside), not inferred from filenames.

## Summary

The UFC stack is an unusually **comprehensive, well-guarded, fail-closed scaffold built on real reference data — but it contains no validated engine and has never produced a reproducible end-to-end result.** There is a genuine 2,695-fighter stats DB and a 1,519-bout, 3-year historical results corpus (both derived from the Greco1899/ufcstats CSVs, GPL-3.0), real pregame moneyline snapshots from The Odds API (h2h only), a deterministic pipeline (schedule → odds → features → projections → grade → backtest → readiness), six GitHub workflows, and ~78 tests. However: (1) there is **no genuine probability model** — the moneyline "model" is the de-vigged market line plus a hand-weighted adjustment hard-capped at ±4pp and shrunk 50% toward market (≈0 in every committed row), and the method/distance/round outputs are an unvalidated deterministic rule/score blend of career finish shares; the multi-sport adapter states in code that "UFC has NO independent fight model live." (2) The **backtest has 0 rows** and `modelValidated=false`; by design the harness only ever validates the *market baseline*, never the fighter-stat model. (3) The only rich "settlement" (`results-settled-latest.json`, one 2026-06-15 event) is **static, has no generator, is not reproducible, and is internally inconsistent** (a +320 underdog shown at 0.773 "model probability"). (4) There is **no current/upcoming event** (newest card is 2026-07-11, 12 days stale, never settled) and **no scheduled automation** (all workflows are `workflow_dispatch`). The public `/ufc` route exists but is fail-closed to a market-implied read only. Net: this is scaffolding + reference data, not a working engine.

## Component Matrix

| Component | Exists | Current | Automated | Tested | Leakage-safe | Evidence |
|---|---|---|---|---|---|---|
| Routes | ✓ | ✓ | n/a | ✓ | ✓ | `app/src/app/ufc/page.tsx:114` `modelGated = !v1Validated || !publicPicksVisible` (fail-closed → market-implied only); built at `app/out/ufc` |
| Schedule / cards | ✓ | ✗ | partial | ✓ | ✓ | `app/public/data/ufc/schedule-latest.json` newest `eventDate 2026-07-11T21:00Z`, `generatedAt 2026-07-10` (12 days stale); `pipeline/ufc/build_schedule.py` (ESPN MMA) |
| Fighter map | ✓ | partial | partial | ✓ | ✗ | `fighters-latest.json` `fighterCount 2695`, `latestFightDate 2026-05-16`; `build_fighter_stats.py` + `name_matching.py`. Career/aggregate stats = **leak point-in-time** |
| Bout ids | ✓ | partial | partial | ✓ | ✗ | boutId = `date:normA|normB`; `name_matching.py resolve()` (ambiguous→blocked). Date-agnostic key in `build_backtest_dataset.py:42` → rematch collision |
| Provider / odds ingestion | ✓ | partial | partial | partial | ✓ | `pipeline/ufc/providers/oddsapi.py` + `build_odds.py` (The Odds API MMA, **h2h only**); `odds-snapshots/odds-2026-07-10…json` 20 bouts `pregame:true`, `creditsRemaining 18449` |
| Feature gen | ✓ | partial | partial | partial | ✗ | `build_features.py` → `features-latest.json` (4 bouts, all `"likely futures/hypothetical"`); deltas from current stats → leak |
| Prediction gen | ✓ | partial | partial | ✓ | partial | `model_moneyline.py` (±4pp shrunk-to-market), `build_expanded_projections.py` (career-share blend), `ufc-prediction-engine.ts`; `multi-sport-report/ufc-adapter.ts:6` "**NO independent fight model live**" |
| Settlement | partial | ✗ | partial | ✓ | partial | `grade_moneylines.py` (automated, moneyline-only) → `graded-moneylines-latest.json` (only 2 decisive, same 2023 bout); `results-settled-latest.json` = static, **no generator found** |
| Backtest | ✓ | ✗ | partial | ✓ | ✓/✗ | `build_backtest_dataset.py` + `backtest_moneyline_model.py` (leakage-safe design, excludes post-commence) but `backtest-dataset-latest.json` `rowCount 0`; `backtest-summary` `modelValidated false` |
| Workflows | ✓ | partial | ✗ | n/a | ✓ | `.github/workflows/ufc-*.yml` (6) — **all `on: workflow_dispatch`, no `cron`**; odds guarded by `--dry-run` credit check |
| Tests | ✓ | ✓ | ✓ | ✓ | ✓ | 11 TS/mjs suites (~68 tests) + 10 Python `pipeline/ufc/*_test.py`; `ufc-model-gate.test.mjs` pins the gate wiring |
| Result artifacts | ✓ | ✗ | partial | ✓ | partial | `readiness-latest.json` `backtestReady false`, `publicLevel "grading-internal"`; `backtest-summary-latest.json` `rowCount 0`, `launchDecision "hold"` |
| Public copy | ✓ | ✓ | n/a | ✓ | ✓ | `page.tsx` metadata "Educational, paper-only"; `audit-ufc-readiness.mjs` bans "lock/guaranteed/best bet/…"; `docs/methodology/ufc-*` |

Legend: ✓ = yes · ✗ = no · partial = present but incomplete/degraded.

## The Ten Questions

**1. Is there a genuine PROBABILITY model?**
**No.** The moneyline "model" (`pipeline/ufc/model_moneyline.py`) starts from the market-implied probability and adds a nudge from a fixed weighted sum of normalized deltas, passed through a logistic hard-capped at ±0.04 (4pp) and shrunk 50% toward market (85% when data-quality is low). The weights `W` are hardcoded constants, never fit to outcomes. In every committed row the adjustment is ≈0: `projections-latest.json` shows `modelProbability` within ±0.0007 of `marketImpliedProbability` for all 9 bouts, every `label: "No clear edge"`. `multi-sport-report/ufc-adapter.ts:6,24` states in code: "sourceMode is ALWAYS `market_implied_simulation`. UFC has NO independent fight model live." So the moneyline output is a market passthrough, not a learned/validated probability model.

**2. Or merely a rule/score system?**
**Yes — for everything except the market passthrough.** Method/goes-distance/total-rounds (`build_expanded_projections.py`) are a deterministic blend of each fighter's *career* KO/sub/dec win shares weighted by the (market-derived) win prob, with fixed constants (`avg_finish_round = 1.8`, reference lines 2.5/4.5). `ufc-prediction-engine.ts styleScores()` computes hand-crafted `finishThreat/distance/striking/grappling` scores (e.g. `finishThreat = 0.55·finishRate + 0.30·(koShare+subShare) + 0.15·normSig`). All are labeled "experimental / model-only / not a verified edge / not parlay-eligible." This is a rule/score system, not a fitted model.

**3. Which market families are genuinely supported?**
**Only h2h moneyline** carries real sportsbook odds (The Odds API MMA = h2h only). Method-of-victory, goes-the-distance, and total-rounds are **model-only with no odds** and explicitly `parlayEligible: false`. Prop markets (method/distance/rounds) are `"unavailable"` — `prop-odds-latest.json` `providerConnected: false`, `reason: "The Odds API MMA exposes h2h only."` Suggested parlays stack moneyline favorites only.

**4. Does settlement work on HISTORICAL events?**
**Mechanically yes, substantively no.** `grade_moneylines.py` grades moneyline vs final results (draw→push, no-contest→void) and there is a real 1,519-bout historical corpus (`results-latest.json`, 2023-06-10…2026-05-16, all with winner/method/round/weightClass). But there are **no historical pregame odds** to grade against — `data/internal/ufc/backfill-status.json` `status "not-started"`, `oddsFetched 0`, "Historical pre-fight moneylines require founder-approved Odds API credits." The live `graded-moneylines-latest.json` has only 2 decisive grades, both the *same* 2023-11-11 bout surfaced from a futures line. The one rich settlement (`results-settled-latest.json`, UFC Freedom 250, 2026-06-15) has **no generator script anywhere in the repo** and is a static fixture.

**5. Are predictions timestamped BEFORE bout start?**
**Not provably.** The current card's `projections-latest.json` (`generatedAt 2026-07-10`) predates the 2026-07-11 card — but that card was never settled (no matching result). The one settled event's `expanded-projections-latest.json` is `generatedAt 2026-06-15T00:36:08Z` versus `eventDate 2026-06-15T00:00Z` — 36 minutes **after** the listed event start — and the recap that grades it is static. No pre-start-timestamped prediction is paired with an official result anywhere in the repo.

**6. Is opponent quality normalized?**
**No.** Features (`features-latest.json`, `build_features.py`) are raw per-fighter deltas (win rate, finish rate, sig strikes/round, takedowns/round, reach, age, experience) and career method shares. There is no strength-of-schedule or opponent-adjusted rating (no Elo/Glicko/SRS). Opponent *identity* is resolved (`name_matching.py`), but opponent *quality* is not normalized.

**7. Are canceled / rebooked bouts handled?**
**Partially / defensively, not structurally.** `grade_moneylines.py` maps no-contest→void, draw→push; `build_results.py` counts draw/no_contest/unknown; futures/hypothetical matchups are flagged and blocked from public (`isFutures`, `publicEligible=false`). But there is no cancellation/rebooking state machine, and a rebooked rematch actively *causes* the leakage collision (see below) because the bout key ignores date.

**8. Are short-notice replacements handled?**
**No.** No replacement / short-notice / weigh-in field exists in any artifact. An opponent swap silently re-keys the bout; nothing captures or models it.

**9. Is 5-round vs 3-round format represented?**
**Partially — as a positional heuristic only.** `build_expanded_projections.py:122` sets `scheduledRounds = 5` when the bout id equals the last fight in the ESPN array (headliner), else `3`. It is **not** sourced from official card data. The schedule carries `weightClass: null` for every bout and no scheduled-rounds field; the results corpus stores the *ending* round, not the scheduled count. So format is inferred by card position, not represented from data.

**10. Can the stack reproduce prior outputs deterministically?**
**Partially.** The Python builders are pure and now-injectable and are unit-tested, so projections/parlays/backtest can be regenerated from their inputs. But the flagship `results-settled-latest.json` has **no generator** → it cannot be reproduced; and re-running `build_backtest_dataset.py` today would newly emit the two rematch-collision rows, so it is not idempotent against the stale committed 0-row artifact. The reproducible parts are the least substantive; the settled "proof" is the non-reproducible part.

## Classification

### SCAFFOLD_ONLY

**Justification.** Every named component exists, is mostly tested, and is genuinely fail-closed — but the substance a working engine requires does not exist:

- **No genuine model.** Moneyline output is the de-vigged market line (adjustment ≈0 in every committed row); method/distance/round is an unvalidated deterministic rule blend; the code itself declares "NO independent fight model live" (`ufc-adapter.ts`).
- **Zero validated backtest.** `backtest-dataset-latest.json` `rowCount 0`; `backtest-summary` `modelValidated false`, `launchDecision "hold"`. By design the harness only ever validates the *market baseline*, never the fighter-stat model.
- **No reproducible end-to-end result.** The only rich settlement is a single static, generator-less, internally inconsistent recap (a +320 underdog shown at 0.773 "model probability").
- **No live surface.** Newest event is 12 days stale and was never settled; all six workflows are `workflow_dispatch` (no cron).

**Why not RESEARCH_ONLY:** there is no validated model and no usable research output — a backtest of 0 clean rows and a market-passthrough "model" produce nothing to analyze. The prior RESEARCH_ONLY label is not supported by the artifacts.

**Why not HISTORICAL_ONLY:** the stack *cannot* actually backtest or settle history. Historical grading needs pregame odds that do not exist (backfill not-started, paid-credit-gated), and the one date-agnostic join it can make is a leakage collision, not a valid settlement. A real 1,519-bout results corpus + a functioning grader raise it above a bare stub, but not to a working historical engine.

## Top Leakage Risks

1. **Date-agnostic bout-key join (backtest + grader).** `build_backtest_dataset.py` builds `by_key = {sorted(normA,normB): result}` with **no date check**, so a pregame odds snapshot for a *future rematch* joins a *past* fight's result between the same two fighters. Confirmed collisions: the 2026-06-14 Pereira/Prochazka futures line → 2023-11-11 result; the 2026-07-11 Dvalishvili/Cejudo pregame line → 2024-02-17 result. Re-running the backtest would emit these as "clean pregame" rows and grade the current line against a stale outcome.
2. **Feature leakage from current stats.** Features are derived from `fighters-latest.json` career/aggregate stats *as of the latest fight*, which **include the bout being predicted** — there are no point-in-time pre-fight snapshots. Documented in `backtest-summary-latest.json`: "current stats leak the predicted fight … Only the market-implied baseline is leakage-safe." Any fighter-stat model trained or evaluated on these is contaminated.

*Secondary:* `results-settled-latest.json` mis-aligns model probability to the fighter/odds side (Josh Hokit +320 carries `modelProbability 0.773` vs `marketProbability 0.229`) and is timestamped after the event start; name/side joins are fragile (e.g. schedule "Kai Kamaka III" vs odds "Kai Kamaka").
