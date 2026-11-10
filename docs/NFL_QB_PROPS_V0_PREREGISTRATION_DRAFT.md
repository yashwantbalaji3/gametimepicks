# NFL QB props v0: pre-registration (DRAFT, not approved)

**Status: DRAFT.** No grading runs against real outcomes until the founder approves this file in writing.

The approval is recorded as this file's sha256 in `APPROVED_PREREG_SHA256` (`app/src/lib/sports/nfl/qb-props-grade.mjs`). The grader refuses any other file.

Founder ruling 2026-11-10: thresholds are approved before anyone sees graded accuracy, and they do not come from anyone who has seen the numbers. The author of this draft has seen descriptive results for weeks 5–9 (§5). This draft therefore **sets no threshold of its own**: every bar below is copied verbatim from a document written before that look.

## 1. Source of the bars

- `~/gtp-evidence/market-review-other-sports-2026-11-09.md` §3, "Ranked list: missing/unvalidated markets", written 2026-11-09 (file time 2026-11-09T18:05Z), before any QB-prop outcome was graded.
- The interval rule is copied from `~/gtp-evidence/engine-parity-plan-2026-11-10.md` §4, "Accuracy (grader, forward only)", written by the Program Director.

## 2. Bars per family (verbatim; nothing added)

| Family | Bar, verbatim from the market review §3 |
|---|---|
| Passing yards | "forward test: pre-register 2026 wk 11+, n>=300 QB-games (~10 weeks, ~30/wk), ECE <=0.03, log loss vs positional baseline." |
| Passing TDs | "forward test on QB-games, n>=300 (~10 weeks), Poisson count log loss vs team-level baseline and team-passTd reconciliation" |
| Interceptions | NO BAR PROPOSED — founder to set |
| Completions | NO BAR PROPOSED — founder to set |
| Attempts | NO BAR PROPOSED — founder to set |

**Interval rule**, verbatim from the engine parity plan §4: "Game-clustered 95% interval. A direction is claimed only when the interval excludes 0."

**Open items for the founder to decide.** These are questions only; this draft fills in no values.

1. **Passing yards: ECE and log loss need a probability at a line.**
   - The receipt (`simulation-receipt@2.1`) stores pass-yards *quantiles*, not a distribution.
   - A line probability can't be read from quantiles without fitting one, and the requirement is "real PMFs straight from the simulated runs, no fitted distribution".
   - So either the receipt gains a pass-yards histogram from the runs (a schema change), or the founder restates this bar.
2. **The "positional baseline" and "team-level baseline" are named in §3 but not defined there.** The founder sets their definitions.
3. **The "team-passTd reconciliation" bar:** whether the simulated team pass TDs must reconcile with the per-QB PMFs (the conservation suite already enforces this inside every simulated game), or whether a forward comparison against actual team pass TDs is meant.

## 3. Evaluation window and exclusions

- **Confirmatory window:** only games whose kickoff is **after the founder's approval timestamp** (§6). Weeks 5–9 are permanently exploratory: excluded and labelled as seen (`SEEN_EXPLORATORY_WEEKS`).
- **Rows:** the receipt of record per game is the latest shadow receipt generated strictly before `eventStart`; receipts generated at or after kickoff are excluded and counted. From it, one row per team: the projected QB, i.e. the largest pass-attempt median.
- **Count props:** must come from the receipt's count PMF (`countPmf.passTd`, `countPmf.int`): real frequencies over the simulated runs, never fitted.
- **Excluded and counted, never dropped silently:**
  - a projected QB who did not play;
  - a game without a verified final (the settlement source FINAL, with each team's passing yards agreeing with the box score);
  - a game not yet final.
- **Strata, reported beside the primary result and never used to choose one:**
  - starter match (projected QB = the QB with the most attempts);
  - `eligibility@1` state at freeze, once the contract is on main;
  - R5 publishable (the game forecast is not QB-blind).
- **The look:** happens once, when the n bar is reached. A failed bar is not re-run with edited bars; a new model version is a new registration.

## 4. Fixed now

- Grader code: `app/src/lib/sports/nfl/qb-props-grade.mjs`, `app/scripts/nfl/grade-qb-props.mjs` (counts only until approved).
- Bootstrap seed `20261110` with 2,000 resamples.
- The rules in §3.

The open items in §2 are decided by the founder before signature. Any change after signature is a new registration.

## 5. Disclosure: what has already been seen

- **On 2026-11-10, before this ruling,** the grader was run once on weeks 5–9: 137 QB-games, all five families.
- **What was computed and seen:** descriptive metrics (MAE, bias, 80% coverage, and a trailing-mean comparison).
- **Where that record lives:** an unmodified audit copy is outside the repository, at `~/gtp-evidence/nfl-qbp-seen-2026-11-10/`, with a sha256 manifest. No graded value is in this repository or its history.
- **Consequence:** those weeks can never be confirmatory, and their author sets no threshold here.

## 6. Approval

| | |
|---|---|
| Founder approval (written) and timestamp | ________ |
| Confirmatory window opens | at the first kickoff after that timestamp |
| sha256 of this file as approved | ________ (also recorded in `APPROVED_PREREG_SHA256`) |
