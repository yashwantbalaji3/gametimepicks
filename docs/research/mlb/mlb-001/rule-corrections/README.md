# MLB-001 · Engine rule corrections (pa-v3) — validation record

**Founder decision 6 (2026-10-09):** approval to *implement and validate locally* three rule corrections. It is **not** approval to promote. Production adoption needs a separate founder decision on the PR.

## What changed

| Rule | pa-v2 (published) | pa-v3 (`OFFICIAL_RULES_2026`) | Official basis |
|---|---|---|---|
| Extra-inning automatic runner | A runner on 2nd in every extra half-inning, postseason included | Regular season only. **No automatic runner in the postseason** | MLB regulation since 2023: the runner applies to regular-season games only |
| Walk-off scoring | Every runner who crossed on the ending play counted | On anything but a home run, the game ends when the winning run scores, and only the runs needed to win count. A walk-off home run counts every runner | Official Baseball Rules 5.08(b) and 9.06(f) |
| Tied at the inning cap (30) | The home team was given a run | The game is **not a legal result**: it is discarded and re-drawn from the same deterministic stream, and the discards are counted. If discards exceed the requested run count, the game is **refused** (`unavailable`, with the reason). The cap still bounds every game | No fabricated runs, and no unbounded simulation |

Season phase comes from StatsAPI `gameType`, now captured by `pipeline/mlb/mlb_stats.py` (R = regular season; F, D, L, W = postseason). For boards written before that field existed, it comes from StatsAPI's season calendar (`mlb/season-state.json`) using the game's own date. An **unresolved** phase is refused under rules that depend on it, never assumed (`rulesetBasis: UNRESOLVED`).

## Versioning and preservation

- **Opt-in, not promoted.** By default the generator still runs the published engine as `mlb-fullgame-2026.08-pa-v2`. `--rules official-2026` (or `MLB_FULLGAME_RULES=official-2026`) produces **`mlb-fullgame-2026.10-pa-v3`**; an unknown value exits 1. Adopting pa-v3 for published forecasts means changing that default, which is a separate founder decision. Because the seed includes the version, pa-v3 draws its own stream.
- **Default output unchanged:** this branch's generator and main's were run on the same dates and clocks (2026-10-06, 10-07 and 10-08 at 18:00Z; 10-07 and 10-08 at 23:59Z, after first pitch). The full-game file, input snapshot and engine-level shadow are byte-identical, with one intended exception: carried entries in `frozenPregame` gain `modelVersion`.
- `LEGACY_RULES` (equivalent to no `rules` field) is the published engine **byte for byte**. Every committed pa-v1 and pa-v2 artifact keeps its hash. Legacy artifacts carry no new field (`rules.test.mjs`, `simulate.test.mjs`).
- pa-v3 artifacts carry `engineRules: { id, ruleset, rulesetBasis, discardedIncomplete }` on every game.
- **Transition day:** a pa-v2 pregame forecast carried past first pitch into the first pa-v3 file keeps its version in `frozenPregame[gamePk].modelVersion`. The carried bytes are untouched, and the label is copied forward, never restamped (`frozen-carry.test.mjs`).
- No published forecast, grade, ledger row or WorldReceipt is rewritten.

## Deterministic edge-case fixtures (`app/src/lib/mlb/full-game/rules.test.mjs`)

1. The rule sets are frozen and say what they claim. `automaticRunnerApplies` has the right truth table.
2. Legacy equals published: 400 seeded games are identical with and without explicit legacy rules, with any ruleset. Artifact hashes are equal and carry no `engineRules`.
3. Postseason extra-inning games run longer than regular-season ones under the same seeds (no runner).
4. Zero-offense fixture: no runner is ever placed or advanced, the cap is reached tied, the game is `incomplete` with 0–0 and no fabricated run. Under legacy, the same fixture gave the home team 0–1.
5. Walk-offs: every non-homer walk-off wins by exactly 1. Walk-off home runs win by 1 to 4, with some above 1. The box-score runs equal the team runs in every game. Premise check: legacy produced non-homer walk-offs by more than 1.
6. Legal finals, regular season and postseason: 9 to 30 innings, never tied, no away-win walk-offs, never incomplete for a real lineup.
7. `simulateFullGame` on a hopeless game: refused after 26 discards for 25 requested runs, finishes in milliseconds, `winProbability: null`, no score histogram.
8. Unresolved ruleset: refused under official rules. Legacy is unchanged.
9. `resolveRuleset`: `gameType` first, then the calendar, else UNRESOLVED. Spring and exhibition games are never guessed.

## Old vs corrected on the historical forecasts of record

`compare-engine-rules.mjs` takes every graded MLB game's forecast of record (the `artifactHash` that its graded prediction row carried). It rebuilds that forecast's inputs from the commit that **first** published the hash: board (whose `stableHash` must equal the artifact's `sourceBoardHash`), team markets, and confirmed lineups. The clock is set to the artifact's own `generatedAt`. The rebuild is **accepted only if the legacy engine reproduces the published forecast**: byte for byte, or on every simulated number. That second test exists because #1037 later added a per-batter `rateSource` label and reworded completeness notes; those changes alter the hash but no simulated value. The same inputs are then replayed under `OFFICIAL_RULES_2026` with the same seed, so every difference is the rules alone.

Confirmed lineups come from the immutable capture archive, restricted to captures at or before the run. Some captures a run consumed were never committed. For those games, from 2026-09-26 on, the input snapshot's record of the consumed order (player ids in slot order, keyed by artifactHash) is used, with names from the same published box score. That reconstruction is accepted only under the same reproduction test. Games that cannot be reproduced from committed evidence are **excluded and listed** (`not-reproduced.jsonl`), never approximated.

### Results (run 2026-10-09; 10,000 games per forecast per rule set)

**Reproduction:** 406 of 810 graded forecasts reproduced on every simulated number: 321 pa-v1 and 85 pa-v2. Of those, 395 used lineups from the archive and 11 used lineups from the input snapshot. None reproduced byte for byte, because all predate #1037's `rateSource` label. **404 are excluded**, all pa-v2: 398 regular-season games from August and September, and 6 postseason games. In every excluded game the published forecast used confirmed batting orders the repository no longer holds, either because the captures were never committed or because they predate the input snapshot (2026-09-26). This matches the boundary `input-snapshot.test.mjs` already states: forecasts published before the first snapshot are not reconstructible. Every reproduced game resolved its season phase from the calendar, because no historical board carried `gameType`.

| Same inputs, same seed | Regular season (388) | Postseason (18) |
|---|---|---|
| Mean P(home) shift (max abs) | 0.0000 (0.000) | −0.0004 (0.013) |
| Mean simulated total, pa-v2 rules → official | 7.956 → 7.949 (max abs shift 0.01) | 8.338 → 8.256 (max abs shift 0.14) |
| Extra-innings probability | 0.1078 → 0.1078 | 0.1049 → 0.1066 |
| Home −1.5 cover | 0.3253 → 0.3185 (max abs 0.010) | 0.3375 → 0.3305 (max abs 0.016) |
| Games discarded at the inning cap | 0 | 0 |
| Winner log loss (coin 0.6931) | 0.7015 → 0.7015 | 0.6885 → 0.6873 |
| Winner Brier (coin 0.25) | 0.2539 → 0.2539 | 0.2478 → 0.2472 |
| Total mean absolute error (runs) | 3.485 → 3.485 | 2.773 → 2.744 |

What the numbers show, mechanically:
- **Regular season:** only the walk-off rule applies there, and it never changes who wins. So P(home) and the winner scores are identical to every digit. Capping non-homer walk-offs at one run lowers the mean total by 0.007 runs and home −1.5 cover by 0.007.
- **Postseason:** removing the automatic runner makes extra innings longer and lower-scoring per inning. The mean total falls by 0.08 runs (at most 0.14 for one game), and P(home) moves by at most 1.3 points.
- **Inning cap:** no game was discarded in the 4.06 million games replayed under the official rules. The correction matters for correctness, not for the numbers.
- 18 postseason games cannot say anything about accuracy. The log-loss and Brier moves above are noise-sized and are not a claim.

**Reading this correctly.** This is an in-sample, descriptive comparison on already-graded games. It is not out-of-sample evidence, not a significance test, and not a basis for promotion. The corrections are made because the official rules say so, not because they score better. The winner model is still worse than a coin flip on log loss (see the baseline audit), and the market benchmark is better than the model. These rule corrections do not change that.

## Files

- `compare-engine-rules.mjs`: the comparison (read-only; writes only into this directory).
- `comparison-summary.json`, `comparison-rows.jsonl` (one row per reproduced game), `not-reproduced.jsonl` (each exclusion and which fields differed).
