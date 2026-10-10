# MLB-005 · `mlb-coherent-worlds-v2` (in-game substitution): preregistration, 2026-10-10

**Registered:** before v2 is computed on any season. The commit of this file is the registration.

**Exposure, disclosed:**
- v2 was designed **after** reading v1's 2024 development result (`RESULT.md`). v1's simulated starters took 4.33 PA against 4.01 actual, and total bases failed the margin.
- This is therefore a **second look at 2024**, development only. It can earn `PROCEED_TO_FORWARD_SHADOW` and nothing more.
- 2025 is not used. Qualification is forward only.

## The only change from v1: starters can be replaced

Everything in `PREREGISTRATION.md` stays as registered: inputs, workload, rules, 2,000 worlds per game, seeds, metrics, margin and fidelity check.

The addition is the engine's research substitution (`EngineParams.research.substitution`):

1. **League hazard by trip, from earlier games of the season only.**
   - For each starting batter in an earlier game, n_start is his PA. n_slot is all PA taken in his batting slot by him and every later batter in that slot (box-score `battingOrder` X00, X01, …).
   - `h_j` = #(n_start = j and n_slot > j) / #(n_start ≥ j and n_slot > j), for j ≥ 1 trips, with h_0 = 0.
2. **Batter multiplier:** the batter's own observed replacements over his earlier starts, against the number expected under the current league hazards. `mult = (observed + 5) / (expected + 5)` and `h_ij = min(0.95, h_j × mult)`.
3. **The replacement:** the league's season-to-date **non-starter** batting rates (rows whose `battingOrder` does not end in `00`).
   - K, BB+HBP and HR use log5 against the same starter and bullpen contexts.
   - Hits on balls in play, 2B and 3B use the non-starters' own rates.
4. **In the engine:** before each of a starter's later trips, he is replaced with probability `h_ij`, for the rest of the game.
   - The replacement takes the slot's remaining PA, so team totals include them.
   - The **starter-only** line stops at his removal, and the player read-outs are taken from it.
   - The world invariants check the starter-only line against the event log.

## Decision

- **Per market:** engine-v2 minus v2 analytic, with the same margin (95% upper end ≤ +0.005) and 0 invariant violations, gives `PROCEED_TO_FORWARD_SHADOW`.
- **Also reported:** engine-v2 minus engine-v1 on the same rows; simulated against actual mean PA; the game-level scores.
- **Pitcher strikeouts:** expected to be unaffected, since the starting pitcher's batters still bat. Reported regardless.
