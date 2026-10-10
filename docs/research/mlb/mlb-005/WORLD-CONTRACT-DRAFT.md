# MLB-005 · per-world event structure and contract boundary (draft, 2026-10-10)

**Research draft.**
- No shared contract is changed.
- No artifact field is added to any public file.
- Nothing is wired into a producer.

It records what the prototype on `claude/mlb-005-coherent-worlds` emits, and which pieces would need a CONTRACT-001 decision before any use.

## What one simulated world is (implemented, research only)

A world is one call of `simulateGame(game, rng, params, observer)` from the published full-game engine. The `observer` and `params.research` are opt-in; absent means the published engine byte for byte.

| Piece | Where | Content |
|---|---|---|
| Pregame participants | `GameInput` (existing) | Lineups by slot (`BatterInput`), starters (`PitcherInput`), `ruleset`, plus research-only `pa`, `bfLimitPmf`, `subHazard` and `subPa`. **Park is not yet an input** (park factors are captured pregame for 99% of games; see the availability matrix) |
| Event log | `WorldEvent` (engine.ts) | `HALF_START` (bases, so the automatic runner is explicit); `PA` (inning, half, outs before and after, bases before, batter slot, pitcher STARTER or BULLPEN, outcome, scorers, RBI, `sub`); `FREE_ADVANCE`; `STARTER_REMOVED` (BF, limit); `HALF_END` (runs, outs, walk-off kind) |
| Result | `GameResult` (existing + research) | Final score, innings, extra, walk-off, `incomplete`, slot batter lines, starter lines, research starter-only batter lines |
| Invariants | `world-invariants.mjs` | Score = Σ runs = Σ half-innings; RBI ≤ runs; scorers were on base; legal outs; lineup rotation; lines = events; K ≤ BF; legal ending; extras per rules; workload; substitution |
| Reproducibility | `worldFingerprint` + seeded RNG | Same seed and inputs give the same fingerprint |

**Not yet modelled** (each is a registered-version change, not a patch):
- named relievers (the bullpen is one aggregate);
- errors (0 in the published parameters);
- double plays and wild pitches (research switches exist, at 0 in the published parameters);
- pinch runners;
- the defensive alignment;
- pitch counts within a PA.

## From worlds to published numbers (the read-out rule)

Every number that claims the shared model must be a **count over the same worlds**:
- winner, final score, total, team totals, run line;
- every batter's H, TB, HR, R, RBI and H+R+RBI;
- the starters' K and outs.

Measured in `coherence-v1/RESULT.md`: on 2024 development data, such read-outs are non-inferior to the separate per-player model in 6 of 7 markets, and better for K.

## Contract boundary

| Need | Kind | Owner / approval |
|---|---|---|
| Per-player count distributions on the full-game artifact (for example `players.distributions`: hits 0–3+, TB 0–5+, K 0–12+), versioned with the model | **Additive artifact field**. The existing `players` means stay | CONTRACT-001 (Lane A lead) + founder; consumers unchanged until they opt in |
| A WorldReceipt for the shared population: engine, code and parameter hashes, seed scheme, input snapshot ids, counts, invariant result | Additive. The MLB `artifactHash` already covers the game; a receipt adds the world-level audit | CONTRACT-001 |
| Ledger rows for player families sourced from worlds | `forecast-ledger@1` rows already carry family and probability; the source model is a version string | LEDGER-001; **no identity change** (a new namespace if ever needed) |
| Product eligibility of any world-derived family | Eligibility, not schema | Founder, family by family, after forward qualification |
| Research inputs on `GameInput` (`pa`, `bfLimitPmf`, `subHazard`, `subPa`) | Internal engine types; never serialised publicly | MLB lane; already research-only |

**No change here touches the NFL owner's shared interfaces, the ledger identity, or the settlement writer.**
