# MLB-001 — full-game simulation audit: coherence, provenance and rules (research only)

**Date:** 2026-10-14.
**Data:** `origin/main` at `c776f45bdaa060523c6399c58665340b686af4a3`.
**Repo impact:** read-only; nothing in the repository was changed by the analysis.
**Status:** research completed (evidence stage: *research*). Not an engine change, not a model promotion, and not a change to any published or frozen forecast.
**Scoring rule:** lower log loss (LL) is better. Every Δ is model − benchmark, with a 10,000-resample bootstrap 95% interval clustered by game.

## Why this task
Of the roadmap tasks that are ready now, MLB-001 is P1, NOT_STARTED, unblocked and data-rich.

**Data used:**
- 79 slate files and 704 committed file revisions;
- 779 graded finals in 2026;
- 7,289 regular-season finals from 2023–25 as a historical baseline.

**Alternatives considered:**
- *NFL-003 conservation:* WM2 conserves team totals by construction, the public player lists are truncated, and only about 30 team-games are graded.
- *NFL forward readiness:* the private `v2-candidates-forward` captures are not on main.

## Method
1. **`extract.py`** reads every first-parent revision of `app/public/data/mlb/full-game-simulations/*.json` (704 revisions, 866 game keys). Each game's forecast is the **last revision committed before first pitch that is a real simulation** (LCP).
2. **`audit.py`** does four things:
   - classifies where each record on main came from;
   - runs 28 coherence invariants on all 839 distinct simulated records;
   - joins LCP records to `results/game-projected-scores-graded.jsonl` on (gamePk, date);
   - scores the joined games against the market and against a coin.
3. **`crosscheck.py`** compares the grader's forecast identity with LCP.
4. **`player_check.py`** compares simulated batter means with `settledStat` in `results/model-rows/*.json`.

Reproduce with `sh run_all.sh /path/to/gametimepicks`. The scripts and the outputs used here (`out/`) are committed alongside this report.

## Findings

### 1. Internal coherence is clean
- All 839 records pass every invariant except I26: 9 records whose market was captured after first pitch, all of them post-pitch records on main.
- Win share, run line and final-score distributions reconcile exactly with the run-differential distribution. There are no tied worlds.
- Team means reconcile with the total and margin means (|gap| ≤ 0.010).
- Each team's run mean minus the sum of its batters' runs is ≤ 0.007.
- Plate appearances fall by batting-order slot as expected (slot 1: 4.70, slot 9: 3.82).

### 2. Provenance anomalies (866 game keys)
| Class | n |
|---|---|
| Main record = LCP | 535 |
| Pregame simulation erased on main (now `unavailable` / `startedBeforeGeneration`) | **203** (mostly Sep 8 – Oct 3) |
| Main serves a revision generated after first pitch | **17** (Jul 31 – Sep 6) |
| Main reverted to earlier pregame bytes after first pitch | 23 |
| Generated before first pitch but first committed after it | 7 |
| Simulation on main with no pre-pitch commit | 7 |
| Never simulated before first pitch | 74 |

- **`2026-09-19.json` gamePks 823249 and 823899** are full simulations (`startedBeforeGeneration: false`). They were generated at 01:30:32Z, after first pitch (00:40Z and 01:10Z), so the started-game guard did not fire.
- **The grader's forecast differs from LCP on 9 games.** In 6 it graded a revision first committed after first pitch; in 3 the medians differ. This is consistent with the known "unserved revision" class; overlap with the 29 known discrepancies was not checked.
- No `frozenPregame` ledger violations were found.

### 3. Engine rules exposure (`full-game/engine.ts`)
- **Postseason extras.** The automatic runner on second is applied in every extra inning, regardless of game type. That affects 30 postseason pregame simulations (≈3.1 expected extra-inning games).
- **Starter removal is not pitcher-specific.** Batters faced fall within 24.32–24.96 for every starter (cap 25). Strikeout level is still right: actual − simulated −0.01 [−0.14, +0.12].
- **Plate-appearance outcome conversion over-produces hits:**

  | Batter stat | n | Actual ÷ simulated | Actual − simulated (95% interval) |
  |---|---|---|---|
  | Hits | 10,949 | 0.903 | −0.094 [−0.115, −0.073] |
  | Total bases | 4,511 | 0.879 | −0.228 [−0.289, −0.169] |
  | H+R+RBI | 10,727 | 0.948 | −0.098 [−0.150, −0.044] |
- **Every run is credited as an RBI** (ΣRBI/Σruns = 1.000). Scoring rules give no RBI on errors or ground-into-double-plays.
- **No home-field term.** Simulated mean P(home) is 0.501, against 0.528 historically. The 2026 gap is +0.033 [−0.003, +0.068], so it is **not established** on 2026 alone.

### 4. Pregame forecasts vs results (779 games)
| Target | Simulation | Benchmark | Δ (95% interval) | Reading |
|---|---|---|---|---|
| Winner LL | 0.7021 | Coin 0.6931 | +0.0090 [−0.0041, +0.0222] | Not established |
| Winner LL | 0.7022 | Market 0.6712 | +0.0310 [+0.0156, +0.0459] | Market better |
| Over/under LL at the market line | 0.7471 | Market 0.6936 | +0.0536 [+0.0313, +0.0754] | Market better |
| Run line LL | 0.6928 | Market 0.6644 | +0.0284 [+0.0122, +0.0450] | Market better |

**Totals:**
- Actual minus simulated mean total is **+0.89 [+0.57, +1.20] runs**.
- In the postseason the sign flips: −1.35 [−2.54, −0.11] (n = 29).
- The spread is too narrow: residual SD is 4.51 against a simulated SD of 3.93.
- The high tail is too thin: P(total ≥ 21) is 0.0068 simulated vs 0.0141 actual.

## Limitations
- "Pregame" is judged by GitHub commit time, not by proof of the served READY deployment (Option B).
- There is no committed innings or starter-workload data, so the extras rate and starter workload can't be checked against reality.
- The player comparison covers only batters with a posted prop line.
- The 2026 record has been examined before (P317, P331, MLB-002), so this is a **descriptive audit, not a test**.

## Next steps (founder decisions marked)
1. **Founder:** decide whether to restore the 203 erased pregame simulations from git history as an additive ledger (never a rewrite), and how to treat the 17 post-pitch revisions on main.
2. Root-cause the 2026-09-19 started-game guard miss. Add an invariant that `generatedAt ≤ firstPitch` for every game that is not `unavailable`.
3. A new engine version, preregistered and forward-only:
   - no automatic runner in the postseason;
   - RBI exceptions;
   - pitcher-specific workload;
   - a home-field term;
   - PA-to-run conversion (bundle with P317).

   The public model stays unchanged until it passes.
4. Capture innings per game and starter batters faced/outs (StatsAPI, free) so these rules can be measured.
