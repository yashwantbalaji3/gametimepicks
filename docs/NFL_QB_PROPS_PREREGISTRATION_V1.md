# NFL QB props v0: pre-registration v1 (awaiting founder approval)

**Status: NOT APPROVED.** No grading runs against real outcomes until the founder approves this exact file in writing.

The approval is recorded as this file's sha256 in `APPROVED_PREREG_SHA256` (`app/src/lib/sports/nfl/qb-props-grade.mjs`). The grader refuses any other file. Any edit after approval changes the sha256 and makes a new registration.

## 1. The founder's decisions (2026-11-10), verbatim

Source: `~/gtp-evidence/nov10-founder-qbp-four-decisions.md`, the Program Director's record of the text the founder typed in the PD session (full text in PD transcript 78e9aef1). The text is quoted below without edits.

> 1. Passing yards: ADD YARDS HISTOGRAM from the simulated games (5-yard bins or finer). Exact line probabilities (e.g. 199.5/224.5/249.5) without material approximation; supports ECE, log loss, error, coverage, with provenance.
> 2. Baseline: OWN + TEAM TRAILING. QB's own previous 8 games for yds/cmp/att. Pre-kickoff Poisson from the team's previous 8 games for TD/INT. Walk-forward, frozen before confirmatory testing. Secondary where practical: league-average and sportsbook-implied. Primary: paired 95% CI of the difference excludes 0 in the favourable direction.
> 3. Reconciliation: INSIDE EACH SIMULATION. QB/receiving/team pass TDs agree (multiple QBs, non-QB passers, exceptional events). Team score = scoring events incl. DEF/ST. First TD = the actual first TD event incl. DEF/ST. Consistency + deterministic replay tests. Historical outcome bias measured separately in validation.
> 4. INT/CMP/ATT: SAME STRUCTURE. n >= 300 eligible QB-games per market; beat the primary baseline (paired 95% CI excludes 0, favourable); count log loss for INT, distributional/interval scores for att/cmp; cov80 in 0.76-0.84, plus width, bias, calibration; sparse-event adequacy check for INT (too few events => INCONCLUSIVE); prospective eligible observations only.
>
> Safeguards: weeks 5-9 exploratory forever. Freeze the full spec + checksum before any confirmatory look; no threshold changes after. Failed/inconclusive => experimental research only, never official. Keep building other markets meanwhile. Public flag OFF until separately approved. Canonical + eligibility safeguards preserved. #1295 not disturbed; two-session policy.

Relayed by the Program Director with the same decisions (2026-11-10), verbatim:

> Primary: paired 95% game-clustered CI of (model − baseline) excludes 0 in the favourable direction. Scores: count log loss for TD/INT; log loss + ECE at lines for yds; CRPS/interval score for att/cmp. All five families: n ≥ 300 eligible QB-games; cov80 in 0.76–0.84; also report width, bias, calibration. Failed or inconclusive ⇒ research only.
>
> INT ADEQUACY MINIMUM: founder to set.
>
> Eligibility = eligibility@1 ELIGIBLE at freeze plus R5. Window: kickoffs after the frozen file's approval timestamp. Weeks 5–9 exploratory forever.

**INT ADEQUACY MINIMUM: founder to set.** In code: `INT_ADEQUACY_MINIMUM = null` (`app/src/lib/sports/nfl/qb-props-scores.mjs`). While it is unset, the interceptions family is always INCONCLUSIVE.

## 2. The bars, per family

The same bars apply to all five families: passing yards, completions, attempts, passing TDs and interceptions.

| Bar | Rule |
|---|---|
| n | ≥ 300 eligible QB-games in the confirmatory window, each with a model score and a primary-baseline score (the paired n) |
| Primary | paired 95% game-clustered bootstrap CI of mean(model − baseline) on the family's primary score excludes 0 favourably (upper bound < 0; lower scores are better) |
| Coverage | the model's 80% interval coverage (cov80) lies in 0.76–0.84 |
| INT only | the sparse-event adequacy minimum is reached (founder to set; until then INCONCLUSIVE) |
| Reported, no bar | interval width, bias of the median, calibration (ECE at the yards lines), the interval score, the league-average secondary |

**Decision** (`familyOutcome`, `app/src/lib/sports/nfl/qb-props-grade.mjs`):

- **INCONCLUSIVE:** paired n < 300; the INT minimum is unset or not reached; no interval; or the interval contains 0.
- **FAILED:** the interval excludes 0 unfavourably, or cov80 lies outside 0.76–0.84.
- **MET:** the interval excludes 0 favourably and cov80 lies in 0.76–0.84.

Failed or inconclusive ⇒ experimental research only, never official. MET is necessary for release but not sufficient: the public flag stays OFF until it is separately approved.

## 3. Scores and baselines (frozen in code)

Code: `app/src/lib/sports/nfl/qb-props-scores.mjs` (`qb-props-scores@1`), tested in `qb-props-scores.test.mjs` on synthetic inputs only.

| Family | Primary score (lower is better) | Primary baseline | Secondary |
|---|---|---|---|
| Passing yards | mean binary log loss of P(over) at 199.5 / 224.5 / 249.5; ECE at each line reported | the QB's own previous 8 games played | league average |
| Completions | CRPS on the integer grid; 80% interval score reported | the QB's own previous 8 games played | league average |
| Attempts | CRPS on the integer grid; 80% interval score reported | the QB's own previous 8 games played | league average |
| Passing TDs | count log loss −log P(y), with 6+ pooled | Poisson, λ = the team's mean over its previous 8 games | league average |
| Interceptions | count log loss −log P(y), with 6+ pooled | Poisson, λ = the team's mean over its previous 8 games | league average |

- **Model distribution:** the receipt's exact run counts (`simulation-receipt@2.2`, `exactCounts`, 1-yard / 1-count resolution) give exact line probabilities as a ratio of run counts. For TD/INT, the count PMF in @2.1 receipts is also accepted. A row with neither has no model score: it is counted and never approximated from quantiles.
- **Walk-forward:** every baseline input has a kickoff strictly before the graded game's kickoff. Prior games may come from earlier seasons (player-events-v1, 2023 on).
- **Sportsbook-implied:** used only where an authorized private capture exists. None is wired, and nothing public is used.
- **Bootstrap:** 2,000 resamples, seed 20261110, with the game as the cluster.

## 4. Eligible observations and window

- **Confirmatory row:** must meet all four of:
  - kickoff after the founder's approval timestamp (§7);
  - not in 2026 weeks 5–9;
  - eligibility@1 ELIGIBLE at freeze;
  - R5 allows the QB line (the game forecast is not QB-blind).

  A row with unknown eligibility is never confirmatory.
- **Weeks 5–9 of 2026** are exploratory forever (`SEEN_EXPLORATORY_WEEKS`).
- **Receipt of record:** the latest shadow receipt generated strictly before `eventStart`. From it, one row per team: the projected QB, who has the largest pass-attempt median.
- **Excluded and counted, never dropped silently:**
  - receipts at or after kickoff;
  - the projected QB did not play;
  - no verified final (settlement source FINAL, with team passing yards agreeing with the box score);
  - no model distribution;
  - no baseline.
- **Strata:** starter match and eligibility state. They are reported beside the result and never used to choose one.
- **The look:** happens once per family, when its paired n reaches 300. A failed or inconclusive family is not re-run with edited bars; a new model version is a new registration.

## 5. Implementation choices made under this registration (founder to confirm or replace before approval)

The author of this file has seen descriptive weeks 5–9 results (§6). The founder's rules do not fix the choices below, so they are listed for the founder to confirm or replace. None of them is a threshold.

1. **Distribution form of the own-8 baseline:** a normal with the sample mean and sample SD (n − 1) of those 8 games, read on the integer grid. A zero SD means no baseline (counted).
2. **Exactly 8 prior games played:** a game counts as played when passAtt ≥ 1. Prior games may cross seasons. A QB with fewer than 8 has no baseline, and the row leaves the paired n (counted).
3. **Yards lines:** 199.5 / 224.5 / 249.5, the founder's example taken verbatim. ECE uses 10 equal-width bins.
4. **Primary score for cmp/att:** CRPS (the interval score is reported).
5. **Probability floor:** 1e-6, applied before a log.
6. **Paired n:** "n ≥ 300 eligible QB-games" is read as the paired n, meaning rows with both a model and a primary-baseline score.
7. **INT adequacy:** the unit of the minimum is the founder's choice. The ledger reports both total interceptions and QB-games with ≥ 1 INT.
8. **League average:** uses the same season's earlier team-games. For yds/cmp/att it takes the starting QB (most attempts), as a normal; for TD/INT, a Poisson of the team totals.

## 6. Disclosure: what has already been seen

- **When:** on 2026-11-10, before the founder's ruling, the grader was run once on weeks 5–9: 137 QB-games, all five families.
- **What was seen:** descriptive metrics only (MAE, bias, 80% coverage, and a trailing-mean comparison).
- **Where the record is:** an unmodified audit copy sits outside the repository at `~/gtp-evidence/nfl-qbp-seen-2026-11-10/`, with a sha256 manifest. No graded value is in this repository or its history.
- **Consequence:** those weeks can never be confirmatory, and their author sets no threshold here.

## 7. Approval

| | |
|---|---|
| Founder approval (written) and timestamp | ________ |
| Confirmatory window opens | at the first kickoff after that timestamp |
| sha256 of this file as approved | ________ (also recorded in `APPROVED_PREREG_SHA256`) |
| Grader commit frozen with it | ________ |
