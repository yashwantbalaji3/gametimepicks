# MLB-005 · `mlb-coherent-worlds-v1`: player read-outs from one simulated game (preregistration, 2026-10-10)

**Registered:** before any engine read-out is computed on any season. The commit of this file is the registration.

**Status:** research only, a **development** look. Nothing published, promoted or made eligible.

## Question

Can the published full-game engine supply the player props as **read-outs of the same simulated games** (MLB-005) without losing accuracy against the separate per-player model? Here the engine runs under the official rules (#1043, pa-v3), and two existing models are fed in as engine inputs:
- **MLB-003 v2** per-PA batter rates, against the opposing starter and against the bullpen;
- **MLB-004 v2** starter workload, a per-game batters-faced limit drawn from the residual distribution.

The comparison model is the analytic `mlb-batter-counts-v2` and `mlb-k-workload-v2` from the frozen replay (`docs/research/mlb/mlb-003-004/replay/`, `d170c425d1`). It is computed on the same rows by an exact copy of the frozen code.

## Data, exposure and window

- **Development season: 2024** (`data/internal/mlb/boxscore-outcomes-history/2024/`), chronological, scored from May 1, as in the replay.
- **2025 is NOT used.** Its single retrospective read is spent.
- **2026** was already examined and may be used for debugging only.
- **Exposure, declared:** the v2 designs were developed on 2024 and 2026. This experiment can produce `PROCEED_TO_FORWARD_SHADOW` or `DO_NOT_PROCEED`, nothing more. Qualification needs the forward test against posted lines.

## The engine read-out (fixed here)

For each game on date D, the inputs come only from the replay state, which holds games dated before D.
- **Lineups:** each team's nine starters in their batting-order slots.
  - This is the game's own lineup, which is equivalent to the confirmed pregame lineup. Late scratches are absent. This selection is disclosed, and is the same as the replay's.
  - The engine plays the nine starters for the whole game. **Substitutions are not simulated**, which is a known difference from reality.
- **Per batter:** explicit PA distributions **vs the opposing starter** and **vs the opposing bullpen**.
  - K, BB and HR are log5(batter, starter, league) and log5(batter, bullpen, league), with v2's priors.
  - Non-HR hits use the batter's own BABIP and 2B/3B shares (v2's `outcomeProbs`).
  - No reach-on-error.
  - Unlike v2's analytic mixture, the share of PA against the starter is **decided inside each simulated game**, by when the starter leaves.
- **Per starter:** `bfLimitPmf` is v2's residual batters-faced distribution, and one limit is drawn per game. The blow-up rule (7 runs) and every advancement parameter stay at the published engine's values.
- **Rules:** `OFFICIAL_RULES_2026`. The ruleset comes from the game's StatsAPI `gameType` (R → regular season, otherwise postseason).
- **Worlds:** 2,000 per game, seed `mlb005-coh|<gamePk>`.
- **Read-out:** each batter's and each starter's count histograms over the worlds (H, TB, HR, R, RBI, H+R+RBI; starter K), smoothed by +0.5/L per cell. The same worlds give P(home win) and the total-runs distribution.
- **Invariants:** `world-invariants.mjs` is checked on **every** world. Any violation is reported, and the market is then not scored.

## Metrics and decision (per market; development tier)

**Primary:** mean count log loss, engine read-out minus v2 analytic (v2's fitted κ). 95% interval from a paired bootstrap that resamples whole dates. The rows are those where the replay scores v2.

**Secondary:**
- engine minus v2 with κ = ∞ (the same inputs without over-dispersion);
- engine minus the current-model replica;
- calibration slope at the replay's main thresholds;
- mean PA per batter, simulated against actual.

**Game level** (descriptive; no market is available historically):
- winner log loss and the total-runs log score and CRPS from the same worlds;
- compared with the league's season-to-date home-win rate and its empirical total-runs distribution.

**Decision:**
- `PROCEED_TO_FORWARD_SHADOW` when the 95% interval's upper end is ≤ +0.005 (non-inferior) **and** there are 0 invariant violations.
- Otherwise `DO_NOT_PROCEED` for that market.
- HR, R and RBI are compared with v2 only, since there is no current-model counterpart.

**Fidelity check (must pass before any read-out is reported):** the copied replay code reproduces the frozen 2024 replay's current, v1 and v2 count log loss **exactly** (`replay-2024-dev.json`).
