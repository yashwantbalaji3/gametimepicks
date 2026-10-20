# NBA possession-level simulation prototype — `nba-possession-sim-v0` (research)

**Status:** PRIVATE RESEARCH PROTOTYPE · `dataClass: PRIVATE_RESEARCH` · `productEligible: false`.
It is not wired into any route, artifact producer, workflow, product, board, the Theater or the official snapshot.
A boundary test (`possession-sim.test.mjs` › BOUNDARY) fails if any file outside the research folders mentions it.
It promotes nothing. It does not change the preregistration. It does not replace `nba-sim-v1-coherent`.

**Short verdict (details in §5):** the engine works. Every draw passes eleven invariant families, and its box
score is exactly the fold of its play-by-play log. On a **partial** 2024-25 development sample (100 of 1,005
eligible games) it does **not** beat v1:

- **Winner:** no difference in log loss or Brier is established against v1 or Elo.
- **Margin and total MAE:** the same as v1's (the intervals include 0).
- **Margin and total intervals:** too wide (80 % bands cover 87 % of games).
- **Player MAE:** slightly worse than v1 for pts, reb, ast and 3PM, by 0.01–0.04 per row (established).
- **STL / BLK / TOV:** lower MAE than a naive last-10 average (established), with similar 80 % coverage.

The full dev-season run has not been done yet (§8).

## 1. Why a separate engine

The Theater wants to show a full game: clock, possession, play-by-play, team stats and overtime. v1 is
quarter-level only. Its log has no possessions, no shots as events and no STL / BLK / TOV. So the Theater may not
claim possession-level events from v1 (`NOT_MODELLED` in `app/src/lib/simulation-theater/nba/labels.mjs`).

This prototype asks one question: can a possession-level engine built on the **same as-of inputs** produce
coherent full-game logs? And how does it score next to v1?

## 2. Files

| File | Role |
|---|---|
| `app/src/lib/sports/nba/research/possession-sim/params.mjs` | Every constant with its source (FITTED / RULES / INHERITED / STRUCTURE) |
| `…/profile-ext.mjs` | As-of OREB / DREB / TOV / STL / BLK / PF per minute, plus team pace and defensive ratios. Uses exactly the v1 recency and shrinkage rules, reading `PROFILE_PARAMS`, so it adds no new profile constant |
| `…/engine.mjs` | One draw = one full game, possession by possession, seeded (`mulberry32(fnv1a32(seed:i))`) |
| `…/events.mjs` | Event vocabulary and `foldEvents` (log → box score + linescore) |
| `…/invariants.mjs` | `checkPossessionDraw`: P1–P11, run on every draw |
| `…/simulate.mjs` | N draws → game and player distributions. Throws on any violation |
| `…/paired-metrics.mjs` | Winner scores and the game-clustered paired bootstrap (approach copied from `claude/nba-winner-head-paired-eval`) |
| `app/scripts/nba/research/fit-possession-sim-v0.mjs` | Fit on 2023-24 → `data/internal/research/nba/reports/possession-sim-v0-fit-2024.json` |
| `app/scripts/nba/research/evaluate-possession-sim-v0.mjs` | 2024-25 dev evaluation → `…/reports/possession-sim-v0-dev-evaluation.json` |

The v1 files (`game-sim-v1.mjs`, `sim-v1-profile.mjs`) are imported read-only and are unchanged.

## 3. Structure of one draw

1. **Target minutes.** These use v1's rule exactly: Bernoulli(playRate) × N(mean, sd) clipped to [0, 48],
   raised to the power `MINUTES_POWER`, then water-filled to 240 minutes with a 48-minute cap.
2. **Clock.** The clock runs in deciseconds. Each period is a run of **timed segments**: a shot attempt, a
   turnover, a free-throw trip or a non-shooting foul.
   - Segment length is min(24 s shot clock, Gamma(k, scale)).
   - The scale is solved per game so that the mean segment equals 2880 s ÷ expected game segments per 48.
   - Expected game segments per 48 = `PACE_OFFSET + PACE_SLOPE · (pace_home + pace_away)/2`.
3. **Outcome.** The outcome is drawn from the **five players on court**, so it depends on the lineup.
   - The weights are Σ TOV rate × the defence's forced-TOV ratio × home, Σ two-shot-trip rate × the defence's
     trip ratio × home, Σ three-shot-trip rate, and Σ FGA rate.
   - The player who acts is drawn in proportion to his own rate for that outcome.
   - Shot type follows the shooter's 3PA share. Make probability = his shrunk 3P% / 2P% × the defence's FG%-allowed
     ratio × home.
   - Assist probability = min(1, Σ on-court AST ÷ Σ on-court FGM). The assister is one of the other four.
   - A made shot gets an and-one free throw with probability θ.
   - A turnover is a steal with probability `STEAL_SHARE` × the on-court defenders' STL relative to league.
   - A miss is blocked with probability β₂ or β₃ × the on-court defenders' BLK relative to league.
4. **Rebounds.** A rebound follows a missed shot or a missed last free throw.
   - It goes to a player with probability `PLAYER_REBOUND_SHARE`. Otherwise it is a team rebound.
   - It is offensive with probability Σ OREB(off) ÷ (Σ OREB(off) + Σ DREB(def)), using the players on court.
5. **Possession.** The ball changes hands after a made basket (after any and-one), a made last free throw, a
   defensive rebound or a turnover.
   - The jump ball is 0.5 each way.
   - The tip loser starts Q2 and Q3. The tip winner starts Q4. Each OT starts with a new jump ball.
6. **Rotation.** Substitutions happen at each period start and at the first dead ball after 7:00 and after 3:00
   (the mandatory-timeout points).
   - At each window, the five eligible players with the most target time left take the floor.
   - A 6th foul disqualifies the player and forces an immediate substitution. If no eligible substitute is left,
     the fouled-out player stays in (NBA rule); the engine logs this.
   - OT rescales the targets to 240 + 25·OT, with a cap of 48 + 5·OT.
   - **Minutes are seconds on court**, so each team has 240 + 25·OT minutes by construction.
7. **Late fouls (explicit).** In period ≥ 4, with ≤ `LATE_FOUL_WINDOW_DS` left, a defence trailing by 1 to
   `LATE_FOUL_MAX_DEFICIT` points fouls on purpose. The log records a `late_intentional` foul and two free throws.
8. **Overtime.** OT periods of 5:00 are played until the game is no longer tied.

**Event log.** Each event has the form `{i, q, c (deciseconds left), type, poss, team, player…, s:[home, away]}`.
The types are `period_start` (with both lineups), `jump_ball`, `sub`, `shot`, `free_throw`, `rebound`,
`turnover`, `foul`, `period_end` and `game_end`. Players are identified by `providerAthleteId` only.

**Box score.** The box score is defined as `foldEvents(log)`. It has MIN (exact deciseconds), PTS, FGM, FGA, 3PM,
3PA, FTM, FTA, OREB, DREB, REB, AST, STL, BLK, TOV and PF, plus team rebounds and the quarter linescore including
OT.

## 4. Parameters and their sources (for founder approval)

Every value below is in `params.mjs`. `possession-sim-params.test.mjs` checks that each FITTED value equals the
committed fit report. It also recomputes the Stage-A ratios from the committed 2023-24 box scores, and checks that
the (θ, τ) maximum-likelihood estimate (MLE) sits at a local optimum.

**Fit scope:** the 2023-24 regular season only (corpus season 2024; box scores of seasons ≤ 2024 loaded): 1,231
games, 26,309 player-games and 2,462 team-games. Stage B uses the 1,010 as-of games that are ≥ 30 days into the
season. Stage C uses 253 of those (every 4th) × 200 draws.

| Constant | Value | Derivation (2023-24) |
|---|---|---|
| `AND_ONE_PER_FGM` θ | 0.0608 | MLE of P(FTA odd) = (1 − (1−2θ)^FGM·e^(−2τ·MIN))/2 over player-games. Two-shot trips never change parity. Observed vs fitted odd-FTA rate: FGM 0: 0.0096 vs 0.0086; FGM 1: 0.069 vs 0.074; FGM ≥ 12: 0.441 vs 0.418 |
| `THREE_SHOT_TRIPS_PER_MIN` τ | 0.001083 | Same MLE: odd trips not tied to a make (three-shot fouls and technicals, which the corpus cannot separate). About 0.26 per team-game |
| `STEAL_SHARE_OF_TOV` | 0.5794 | Σ STL(def) ÷ Σ TOV(off) |
| `BLOCK_PER_MISS2` / `_3` | 0.2067 / 0.0055 | Non-negative least squares (NNLS) of team BLK on the opponent's missed 2PA and missed 3PA |
| `PLAYER_REBOUND_SHARE` | 0.8826 | Σ(OREB + opp DREB) ÷ (missed FGA + trips × (1 − FT%)) |
| `HOME_FG_RATIO` / `TOV` / `TRIP` | 1.0153 / 0.9989 / 1.0196 | League home ÷ away. The home side gets √ratio and the away side 1/√ratio |
| `PACE_OFFSET` / `PACE_SLOPE` | −186.625 / 1.7832 | OLS of game segments per 48 on the mean as-of team pace. The slope is above 1 because shrunk paces are compressed toward the league mean (the same effect as v1's `TOTAL_WEIGHT` 1.956) |
| `SEGMENT_DURATION_SHAPE` k | 1.274 | Renewal approximation Var(N) ≈ E[N]·CV²: residual SD 9.91 segments on a mean of 233.7 per 48 gives CV² 0.420, matched by a capped Gamma at k = 1.274. The residual includes as-of estimation error, so k is a **lower bound** (durations err toward too variable) |
| `LATE_FOUL_WINDOW_DS` / `MAX_DEFICIT` | 600 (1:00) / 6 | Grid W ∈ {0, 0:30, 1:00, 1:30, 2:00} × D ∈ {3, 6, 9}, minimising Σ((sim − real)/se)² of the mean (winner FTA − loser FTA) in final-margin buckets 1–3 / 4–6 / 7–10. Real: 2.06 ± 0.72 / 3.58 ± 0.73 / 2.44 ± 0.60. Chosen: 2.68 / 4.05 / 2.76 (objective 1.44; with no late fouls it is 26.6). W is an **effective** window, because an engine foul segment takes a normal segment's time |
| `MINUTES_POWER` (inherited) | v1 value 1.25 | `sim-v1-calibration-2024.json` |
| 24-s shot clock, 6-foul limit, 7:00 / 3:00 windows, tip rules | rules | NBA playing rules, not fitted |
| Jump ball 0.5; late-foul victim ∝ trip rate; substitution rule | structure | No data in the corpus; documented as structural choices with no numeric constant |

**Fit-season check** (Stage C at the chosen values, orientation only):

- Mean margin bias +0.40 and total bias −0.89 points.
- Per team-game, simulated vs real: FTA 22.45 vs 21.41, TOV 12.74 vs 13.01, OREB 10.31 vs 10.51, STL 7.45 vs 7.65,
  BLK 5.07 vs 5.18, PF 19.09 vs 18.34, 3PA 34.17 vs 35.15, FGA 87.18 vs 88.81.
- **OT rate 1.9 % simulated vs 4.35 % real.**

**Known data limits.** The corpus has player box lines only:

- Team-credited turnovers and rebounds are absent.
- Offensive fouls cannot be separated from turnovers, so v0 books every PF on the defence.
- The penalty/bonus is inside the fitted trip rate and is not modelled separately.

## 5. Development-season evaluation (2024-25) — PARTIAL SAMPLE

**Sample rule.** This is the same rule as `evaluate-sim-v1.mjs`: 2024-25 regular season, ≥ 30 days in, box score
present. There are 1,005 eligible games. This run took every 10th, so **n = 100 games** and 2,109 paired player
rows.

**Inputs.** All inputs are strictly as of tip, with the same historical roster proxy for both engines and no
injuries feed.

**Settings.** v1 used 4,000 draws with frozen `V1_PARAMS`. The possession engine used 1,000 draws, all of which
passed the invariant checker.

**Paired differences.** A − B, game-clustered percentile bootstrap, 2,000 resamples. **Lower is better** for log
loss, Brier and MAE. A difference counts as established only when the 95 % interval excludes 0.

**This sample is hard.** Elo's log loss here is 0.7234, which is **worse** than a coin flip (0.6931). Every
winner number below is noise-dominated.

| Winner (n = 100) | Brier | Log loss | ECE | Accuracy |
|---|---|---|---|---|
| Elo | 0.2586 | 0.7234 | 0.129 | 0.58 |
| v1 | 0.2589 | 0.7235 | 0.081 | 0.58 |
| possession v0 | 0.2506 | 0.6947 | 0.095 | 0.52 |

| Paired winner difference | Δ log loss [95 %] | Δ Brier [95 %] |
|---|---|---|
| possession − v1 | −0.029 [−0.077, +0.019] | −0.008 [−0.028, +0.010] |
| possession − Elo | −0.029 [−0.082, +0.021] | −0.008 [−0.027, +0.013] |

Neither difference is established. The lower point estimate mostly reflects less confident probabilities on a
sample where the favourites lost often. It is **not** a claim that v0 is better.

| Team (n = 100) | Margin MAE | Margin bias | Margin cov80 | Total MAE | Total bias | Total cov80 | Sim SD margin / total |
|---|---|---|---|---|---|---|---|
| v1 | 12.92 | −0.81 | 0.77 | 15.59 | −3.87 | 0.77 | 14.4 / 18.0 |
| possession v0 | 12.97 | −1.51 | **0.87** | 15.60 | −3.89 | **0.87** | 17.0 / 20.7 |

Paired possession − v1:

- |margin error|: +0.04 [−0.65, +0.74], not established.
- |total error|: +0.01 [−1.10, +1.12], not established.
- 80 % coverage: margin +0.10 [+0.05, +0.16] and total +0.10 [+0.03, +0.17]. These are **established**. The bands
  are wider than v1's and **over-cover** the 0.80 target.
- OT rate in the draws: 1.9 % (v1 2.5 %; 3.0 % realized in this sample).

| Player (2,109 rows) | v1 MAE / cov80 | possession MAE / cov80 | naive MAE / cov80 | possession − v1 Δ MAE [95 %] |
|---|---|---|---|---|
| PTS | 4.816 / 0.790 | 4.853 / 0.798 | 4.772 / 0.542 | +0.037 [+0.012, +0.062] |
| REB | 1.942 / 0.844 | 1.955 / 0.837 | 1.942 / 0.789 | +0.013 [+0.003, +0.023] |
| AST | 1.384 / 0.871 | 1.426 / 0.876 | 1.385 / 0.853 | +0.043 [+0.030, +0.056] |
| 3PM | 0.907 / 0.903 | 0.914 / 0.899 | 0.905 / 0.897 | +0.008 [+0.004, +0.011] |

v0 is slightly but measurably worse than v1 on all four families. Neither engine beats the naive last-10 mean on
MAE. (The naive mean's 80 % band for points covers only 54 % because a Poisson band is too narrow for points.)

| New family (2,109 rows) | possession MAE / cov80 / bias | naive MAE / cov80 | possession − naive Δ MAE [95 %] | Δ cov80 [95 %] |
|---|---|---|---|---|
| STL | 0.680 / 0.920 / −0.16 | 0.707 / 0.922 | −0.027 [−0.039, −0.015] | −0.002 [−0.011, +0.007] |
| BLK | 0.495 / 0.939 / −0.05 | 0.506 / 0.921 | −0.011 [−0.021, −0.0004] | +0.018 [+0.009, +0.027] |
| TOV | 0.871 / 0.908 / −0.19 | 0.901 / 0.905 | −0.030 [−0.046, −0.014] | +0.003 [−0.007, +0.013] |

On MAE, v0 beats the naive baseline for STL, BLK and TOV (established). Both have 80 % bands that over-cover:
these are low-count stats, so integer quantiles sit at 0. The model's mean is about 0.2 too low for STL and TOV.

**Team totals vs actual** (simulated − real, per team-game): FGA −1.9, 3PA −2.0, FTA +0.9, OREB −0.6, STL −0.6,
PF +0.9, TOV 0.0, AST −0.5. Both engines' total bias (about −3.9) is mostly a dev-season scoring rise that a
2023-24 fit cannot see.

### Verdict

As expected, v0 **does not beat v1 yet**:

- Winner, margin and total accuracy are statistically the same on this sample.
- Its intervals are too wide.
- Its player lines are slightly worse.
- It produces OT less than half as often as real games.

What it adds is structural. It produces a genuinely coherent play-by-play log with STL / BLK / TOV, OREB / DREB, PF,
FTA and minutes as seconds on court, all reconciled to the box score on every draw. The new families beat a naive
baseline on MAE. Nothing here moves v0 toward product use.

## 6. Invariants (every draw; `simulatePossessionGame` throws on any violation)

The checker re-derives everything from the log itself. It does not trust the reported box.

| | Invariant |
|---|---|
| P1 | 4 + OT periods per team; Σ periods = final = team PTS = Σ player PTS = the last running score |
| P2 | Σ player seconds = 5 × game length per team (240 + 25·OT minutes); each player within [0, game length] |
| P3 | Five distinct roster players per team at every `period_start`. Every sub takes a player off who is on court and puts on one who is not. Every actor (shooter, assister, FT shooter, rebounder, turnover, stealer, blocker, fouler, fouled player) is on court for the right team. No self-assist |
| P4 | Non-negative integers; 3PM ≤ 3PA ≤ FGA; 3PM ≤ FGM ≤ FGA; FTM ≤ FTA; PTS = 2·FGM + 3PM + FTM; REB = OREB + DREB. Checked on both the fold and the reported box |
| P5 | AST ≤ FGM; STL ≤ opponent TOV; BLK ≤ opponent missed FGA; no assist on a miss; no made blocked shot; 0 seconds ⇒ 0 stats |
| P6 | The final is untied; OT is played only after a tie |
| P7 | Event indices are contiguous; each period starts at 12:00 (OT 5:00); the clock never rises; each period ends at 0:00; the log ends with `game_end` |
| P8 | Every event's score = the running sum of made shots and made free throws |
| P9 | Shots, free throws and turnovers belong to the team in possession; fouls belong to the defence. Possession changes only after a made basket or made last FT, a defensive rebound, a turnover or a period start, and always changes after a defensive rebound or turnover |
| P10 | ≤ 6 PF per player; a disqualified player never re-enters (unless the logged no-substitute rule applies) |
| P11 | The reported box equals `fold(log)`, and the fold equals the engine's independently kept running ledger |

PRA, PA and PR are summed inside each draw. A test recomputes PRA quantiles from the draws themselves.

**Tests.** 17 tests in 2 files, all passing:

```
npx tsx --test src/lib/sports/nba/research/possession-sim/possession-sim.test.mjs \
                src/lib/sports/nba/research/possession-sim/possession-sim-params.test.mjs
```

- Every draw is checked, and the box is compared with the fold and the ledger.
- An OT draw is found and checked for 240 + 25·OT minutes, 5:00 periods and five on court at every event.
- Determinism and replay.
- The event vocabulary uses `providerAthleteId` only.
- **20 mutation probes**, covering every one of P1–P11.
- `simulatePossessionGame` throws on a violating draw.
- PRA comes from the same draw.
- Late fouls: off at W = 0, and correctly triggered when on.
- Foul-outs under inflated foul rates.
- No leakage.
- Helper maths.
- The research boundary.
- Params equal the fit report, with Stage A recomputed.

## 7. Proposed Theater event-stream contract (not implemented)

**Purpose.** This would let the NBA Theater timeline play a possession log in place of illustrative interpolation
between quarter checkpoints (`timeline.mjs`). It is a proposal only. Nothing in the Theater reads this engine.

**Payload.** A selected run would carry a `possessionStream` block next to the existing sample:

```
possessionStream: {
  schema: "nba-possession-stream-v0",
  modelVersion: "nba-possession-sim-v0", dataClass: "PRIVATE_RESEARCH", productEligible: false,
  providerEventId, inputAsOf, seed, seedPolicy, runIndex,
  rosters: { home: [providerAthleteId…], away: [...] },
  events: [ …exactly the engine's log (events.mjs vocabulary)… ],
  checker: { name: "checkPossessionDraw", version, families: ["P1"…"P11"], violations: 0 },
  boxDigest: sha256(canonical JSON of foldEvents(events))
}
```

**Loader rules.** The loader re-runs `checkPossessionDraw` on the stream. It refuses the stream on any violation
or on a `boxDigest` mismatch. It also refuses unless every `providerAthleteId` is in the manifest roster.

**Timeline mapping.**

- Each event maps to playback time t = periodStart(q) + (len(q) − c)/len(q) × `REG_MS` / `OT_MS`.
- Breaks and halftime holds stay as they are today.
- The frame at time t is the state after the last event with tₑ ≤ t:
  - **Score and clock** come from the event's `s` and `c`. They are exact, not illustrative, so
    `scoreIllustrative` / `clockIllustrative` = false whenever a validated stream is present.
  - **Possession arrow** comes from `poss`.
  - **On-court five** comes from the `period_start` lineups plus `sub` events.
  - **Play-by-play feed** is one line per event, from templates (e.g. "3PT miss · J. Doe; rebound · …").
  - **Live box score** = `foldEvents(events up to t)`, the same function as the final box. The running box can
    therefore never disagree with the final one.
- **Quarter checkpoints** become the `period_end` events. They must equal the linescore (P1).

**Labels while research-only.**

- **Route:** the dev route only (`/dev/simulation-theater/nba/[eventId]`, `GTP_DEV_ROUTES=1`).
- **Banner:** a persistent banner: "RESEARCH PROTOTYPE — POSSESSION-LEVEL SIMULATION (nba-possession-sim-v0) · NOT
  THE OFFICIAL FORECAST · NOT VALIDATED".
- **Feed rows:** every play-by-play row is tagged "simulated".
- **Evidence panel:** shows the checker result and the fit / evaluation report links.
- **Not-modelled list:** replaces `NOT_MODELLED` with:
  - shot locations and player movement
  - timeouts and challenges
  - offensive fouls (booked as turnovers, PF on the defence)
  - bonus or penalty logic (folded into the fitted trip rate)
  - late-game strategy beyond intentional fouls (the OT rate is too low)
  - technicals (folded into odd trips)
  - fatigue and blowout rest
- **Never the official sample.** Under the founder's cross-product consistency rule (one official forecast for
  every product), a v0 stream may **never** be shown as the "Official Representative Simulation". It is a
  different model from the official forecast, so its pHome, margin and box would disagree with the official
  numbers.
- **Promotion path.** It may become official only by the possession engine itself passing the preregistered bars
  and becoming (or being re-anchored to) the official forecast, after a recorded founder decision. Until then it
  is a labelled what-if research view and never feeds a product.

## 8. What remains

1. **Full dev-season run.** This is deliberately deferred: the opening-night protected window runs until
   05:00Z 2026-10-21. From `app/`, single process:
   ```
   nice -n 19 node scripts/nba/research/evaluate-possession-sim-v0.mjs --write
   ```
   It covers all 1,005 games, with 4,000 v1 draws and 1,000 possession draws per game, and takes about 16 minutes
   on the dev machine (100 games took 94 s). It overwrites the partial report. Its `status` field changes to
   `FULL_DEV_SEASON`. This doc's §5 should then be updated.
2. **Research next steps.** None of these is started, and the order is a suggestion:
   - Late-game strategy that creates ties (trailing three-point attempts, clock-milking). The OT rate is 1.9 %
     against 4.35 %.
   - Tighten game-level dispersion. Fit the duration shape on a deconvolved residual (k is a lower bound) and add
     game-level efficiency correlation.
   - Restore the 3PA / FGA shortfall (about −2 per team-game).
   - Decide whether team strength should also use Elo, as v1 does. This would be a cross-product consistency
     question for the founder.
