# NFL QB props v0: pre-registration v1.1 (FROZEN, awaiting founder approval of this hash)

**Status: FROZEN, NOT APPROVED.** No grading runs against real outcomes until the founder approves this exact file in writing.

The approval is recorded as this file's sha256 in `APPROVED_PREREG_SHA256` and its timestamp in `PREREG_APPROVED_AT` (`app/src/lib/sports/nfl/qb-props-grade.mjs`). The grader refuses any other file, and refuses an approved file that has no timestamp. Any edit after approval changes the sha256 and makes a new registration.

v1.1 differs from v1 (sha256 `693919cf…77e9`) only by the grade-mode wiring (§4a), the R5 source (§4), the approval timestamp constant (§7) and this note. The bars, scores, baselines and §5 are unchanged.

## 1. The founder's decisions (2026-11-10), verbatim

### 1a. The four validation decisions

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
> Eligibility = eligibility@1 ELIGIBLE at freeze plus R5. Window: kickoffs after the frozen file's approval timestamp. Weeks 5–9 exploratory forever.

### 1b. Decision 2: no fixed interception-count gate (replaces any fixed INT minimum; decision 4's "too few events => INCONCLUSIVE" now acts through the interval)

Source: `~/gtp-evidence/nov10-founder-qbp-int-decision.md` (the PD's record of the founder's text; full text in PD transcript 78e9aef1), quoted without edits:

> - Neither 100 nor 150. No fixed observed-INT minimum gates implementation, generation, display or evaluation.
> - Build all five QB markets now (pass TD, yds, cmp, att, INT): distributions, line probabilities, relevant historical stats, sim-derived outcomes.
> - Three distinct statuses, never confused: Implemented/Experimental, Forward Evaluation, Validated/Official.
> - Report eligible QB-games, observed INT events, event/non-event frequencies, uncertainty intervals, calibration, baseline comparisons. Insufficient evidence => INCONCLUSIVE, which does not block implementation or experimental availability. The prespecified forward protocol and the defensible-evidence requirement for superiority claims are kept.
> - After every slate: grade frozen forecasts vs official finals; per-market dashboard; systematic errors/calibration; versioned challenger pipeline; retrain/recalibrate when justified; promote only through gates; no silent production change.
> - Experimental markets may appear in a clearly separated research section once simulation, data-integrity, eligibility and functional tests pass. Never labelled as proven edges, high-confidence or official; no manufactured odds/lines/records/probabilities.
> - #1302 isolated; #1295 not interrupted; two-session policy; no extra audits or approval loops.
> PD reading: the other decision-4 bars (n >= 300, CI excludes 0, cov80 0.76-0.84) still define Validated/Official. Point 5 allows the research section through the normal release gate once those tests pass.

Relayed by the Program Director (2026-11-10), verbatim with one omission marked "…":

> There is NO fixed INT-count minimum. … the grader always reports, per market: eligible QB-games, observed INT events, event and non-event frequencies, intervals, calibration and baseline comparisons. If the interval doesn't settle it, the result is INCONCLUSIVE. The other bars stay as the Validated/Official criteria (n ≥ 300, paired CI excludes 0 in the favourable direction, cov80 0.76–0.84).
>
> Three statuses, each a field in code and in the prereg: IMPLEMENTED_EXPERIMENTAL / FORWARD_EVALUATION / VALIDATED_OFFICIAL. They are never merged, and only the last one may feed official picks.

## 2. The bars, per family

The same bars apply to all five families: passing yards, completions, attempts, passing TDs and interceptions.

| Bar | Rule |
|---|---|
| n | ≥ 300 eligible QB-games in the confirmatory window, each with a model score and a primary-baseline score (the paired n) |
| Primary | paired 95% game-clustered bootstrap CI of mean(model − baseline) on the family's primary score excludes 0 favourably (upper bound < 0; lower scores are better) |
| Coverage | the model's 80% interval coverage (cov80) lies in 0.76–0.84 |
| Reported, no bar | interval width, bias of the median, calibration (ECE at the yards lines and at the count lines), the interval score, the league-average secondary; for passing TDs and interceptions always: eligible QB-games, total events, events / non-events and their frequencies at each line (TD 0.5 / 1.5 / 2.5, INT 0.5 / 1.5) with the model's mean chance |

There is no fixed event-count minimum for any family, interceptions included. Too few events shows as an interval that does not settle, which is INCONCLUSIVE.

**Decision** (`familyOutcome`, `app/src/lib/sports/nfl/qb-props-grade.mjs`):

- **INCONCLUSIVE:** paired n < 300; no interval; or the interval contains 0.
- **FAILED:** the interval excludes 0 unfavourably, or cov80 lies outside 0.76–0.84.
- **MET:** the interval excludes 0 favourably and cov80 lies in 0.76–0.84.

Failed or inconclusive ⇒ experimental research only, never official. MET is necessary for VALIDATED_OFFICIAL but not sufficient (§2a). INCONCLUSIVE does not block implementation or experimental availability.

## 2a. Market status (three states, never merged)

In code: `MARKET_STATUS` and `QB_MARKET_STATUS` (`app/src/lib/sports/nfl/qb-props-markets.mjs`), a frozen constant changed only by a reviewed commit.

| Status | Meaning | How a market gets there | May feed official picks |
|---|---|---|---|
| `IMPLEMENTED_EXPERIMENTAL` | built from the simulation; research section only (flag OFF until the release gate) | now: all five markets | no |
| `FORWARD_EVALUATION` | frozen forecasts graded after every slate under this registration | the founder approves this file's hash | no |
| `VALIDATED_OFFICIAL` | may feed official picks | the family's decision is MET on confirmatory rows, AND the founder approves the promotion | yes (`mayFeedOfficialPicks`) |

All five markets are `IMPLEMENTED_EXPERIMENTAL` today. No data file or job can change a status, so there is no silent production change.

## 2b. The five markets, the per-slate loop and the challenger

- **Markets:** passing TDs, passing yards, completions, attempts and interceptions, all from the same simulation (the receipt of record). Each shows:
  - the run distribution (median and 80% range);
  - exact chances from the run counts: TDs 1+ / 2+ / 3+, yards 200+ / 225+ / 250+, INT 1+ / 2+. Completions and attempts show the range only, with no manufactured line;
  - the QB's actual previous games, labelled **History**, never a forecast and never an input to the chances.
- **Research section:** `/nfl/simulation/[eventId]`, behind `GTP_NFL_QB_PROPS_PUBLIC` (default OFF). It is labelled EXPERIMENTAL · MODEL PROJECTION, with no prices, edges or confidence words. It is turned on only through the normal release gate, once the simulation, data-integrity, eligibility and functional tests pass.
- **Per-slate loop:** the `nfl-sim-v2-shadow` workflow runs `app/scripts/nfl/grade-qb-props.mjs --write` after each receipt run. It writes `forward-counts.json`, `dashboard.json` and `r5-at-freeze.json` (`data/internal/research/nfl/qb-props/`): market status, forward rows per slate, the challenger slot and R5 at freeze. While grading is LOCKED, none of them holds an outcome or a metric.
- **Challenger:** `QB_CHALLENGERS` (empty) holds versioned challengers. A challenger is graded beside the incumbent on the same rows and reported on the dashboard, and never changes a market's status by itself. Retraining or recalibration is a new model version, so a new registration, promoted only through these gates.

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
  - R5 allows the QB line (the game forecast is not QB-blind). R5 is read from `data/internal/research/nfl/qb-props/r5-at-freeze.json`. The per-slate job records each game's official-forecast `teamInputs.state` from the latest official forecast generated before kickoff; a later or post-kickoff forecast never replaces it. A game with no entry is not allowed. This is interim until CANON-01's `nflOfficialOfRecord` is on main.

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

## 4a. Grade mode (wired, refusing)

- **Command:** `node app/scripts/nfl/grade-qb-props.mjs --grade --prereg <this file> --write`.
- **Gate first:** `runGrade` (`app/src/lib/sports/nfl/qb-props-inputs.mjs`) checks the sha256 against `APPROVED_PREREG_SHA256` and `PREREG_APPROVED_AT` before reading anything. Refused means exit 2, and nothing is read or written.
- **After the gate, it reads:**
  - the shadow receipts;
  - every season of player-events-v1;
  - the FINAL official stats (`data/internal/nfl/official-stats/`);
  - the R5 log.
- **It writes:** `data/internal/research/nfl/qb-props/ledger.json`, with the decision per family from confirmatory rows only and the inputs digest, sha256 and approval timestamp.
- **Eligibility:** eligibility@1 at freeze is wired once the contract is on main. Until then every row is PENDING, and none is confirmatory.
- **Tests:** synthetic only (`qb-props-inputs.test.mjs`): nothing is read before the gate, exit 2 under the frozen constants, a ledger on a synthetic root, and the R5 log rules.

## 5. Implementation choices made under this registration (founder to confirm or replace before approval)

The author of this file has seen descriptive weeks 5–9 results (§6). The founder's rules do not fix the choices below, so they are listed for the founder to confirm or replace. None of them is a threshold.

1. **Distribution form of the own-8 baseline:** a normal with the sample mean and sample SD (n − 1) of those 8 games, read on the integer grid. A zero SD means no baseline (counted).
2. **Exactly 8 prior games played:** a game counts as played when passAtt ≥ 1. Prior games may cross seasons. A QB with fewer than 8 has no baseline, and the row leaves the paired n (counted).
3. **Yards lines:** 199.5 / 224.5 / 249.5, the founder's example taken verbatim. ECE uses 10 equal-width bins.
4. **Primary score for cmp/att:** CRPS (the interval score is reported).
5. **Probability floor:** 1e-6, applied before a log.
6. **Paired n:** "n ≥ 300 eligible QB-games" is read as the paired n, meaning rows with both a model and a primary-baseline score.
7. **Count calibration lines:** TD 0.5 / 1.5 / 2.5 and INT 0.5 / 1.5. These are reported only, never a bar.
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
| sha256 of this file as approved | ________ (also recorded in `APPROVED_PREREG_SHA256`, with the timestamp in `PREREG_APPROVED_AT`) |
| Grader commit frozen with it | ________ |
