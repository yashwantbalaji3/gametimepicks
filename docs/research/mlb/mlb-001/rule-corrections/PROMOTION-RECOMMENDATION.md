# pa-v3 (official MLB rules): promotion recommendation

**Status:** recommendation only. pa-v3 is **not active** in published forecasts. The generator's default is pa-v2. Activation needs explicit founder approval.

This recommendation rests on **correctness and operational safety**, not on accuracy. The historical replay shows the rules barely move the numbers. No accuracy improvement is claimed, and none should be.

## 1. Correctness: what is confirmed, and how

| Requirement | Evidence | Result |
|---|---|---|
| Regular-season extra innings: runner on 2nd every extra half-inning | `automaticRunnerApplies(OFFICIAL, "REGULAR_SEASON") === true` (rules.test 1). The legal-finals test plays 3,000 regular-season games | ✓ |
| Postseason extra innings: no automatic runner | Truth table (rules.test 1). Postseason extra-inning games run longer under the same seeds (rules.test 3). Zero-offense fixture: no runner is ever placed (rules.test 4) | ✓ |
| Walk-off: non-homer ends at the winning run; a home run counts all | 6,000 seeded games: every non-homer walk-off wins by exactly 1, home-run walk-offs by 1–4, and box-score runs equal team runs in every game (rules.test 5). Legacy premise confirmed: pa-v2 produced non-homer walk-offs by more than 1 | ✓ |
| No fabricated safety-cap runs | Zero-offense game reaches inning 30 at 0–0, flagged `incomplete`, no run added. Legacy gave 0–1 (rules.test 4) | ✓ |
| Bounded termination | The cap stays at 30 innings. More discards than requested runs means the game is refused. The hopeless fixture is refused after 26 discards for 25 runs, in milliseconds (rules.test 7). 4.06M historical replays: 0 discards | ✓ |
| Appropriate unavailable states | A cap-unresolved game and an unresolved season phase each give `status: unavailable`, `winProbability: null`, no histogram, and a story naming the reason (rules.test 7, 8) | ✓ |
| Explicit model-version handling | `--rules official-2026` gives `mlb-fullgame-2026.10-pa-v3` plus per-game `engineRules`; an unknown rule set exits 1. Carried pa-v2 forecasts keep `frozenPregame[pk].modelVersion` (frozen-carry test) | ✓ |
| Legacy pa-v2 reproducibility | Default generator output is **byte-identical** to main on 10-06/07/08, both before and after first pitch. The one intended difference is that carried entries gain `modelVersion`. The 406 historical forecasts reproduce on every simulated number | ✓ |
| Historical forecast immutability | No committed artifact, grade, ledger row or WorldReceipt is touched. pa-v3 seeds differ (the version is in the seed), so it never overwrites a v2 stream | ✓ |

## 2. The historical replay: what it is and is not

- **406 reproducible forecasts** (321 pa-v1, 85 pa-v2; 388 regular season, 18 postseason). The rebuilt inputs reproduce every simulated number of the published forecast under the legacy engine, so the old-vs-new comparison is rules-only.
- **404 excluded forecasts are not tests.** All are pa-v2. Their consumed confirmed lineups are not in the repository: the captures were never committed, or they predate the input snapshot of 2026-09-26. They are **not** counted as passes, and nothing was approximated. They are listed in `not-reproduced.jsonl`.
- **Effect on the 406:**
  - Regular season: P(home) is unchanged and the total moves −0.007 runs.
  - Postseason: the total moves −0.08 runs (max 0.14 in one game) and P(home) moves at most 0.013.
  - The cap was never hit.
- In-sample and descriptive. Not evidence of better accuracy.

## 3. Operational safety: risks before activation

| Risk | Status / mitigation |
|---|---|
| Boards do not carry `gameType` until the pipeline change (in #1043) is merged and a board is refreshed. Until then the phase comes from the season calendar | The calendar resolves every 2026 date from 03-25 to 10-31. A missing calendar **and** missing `gameType` would refuse every game, which is fail-closed but would blank the slate. Pre-activation check: the next board after merge carries `gameType` for every game |
| Spring training, exhibition and other game types resolve as UNRESOLVED and are refused | Correct (never guessed). The board carries only R and postseason games today |
| Transition day: one file mixes carried v2 games with fresh v3 games | Handled: carried entries name their own version, and the per-game `engineRules` field exists only on v3 games |
| Runtime | Unchanged in practice: 0 discards in 4.06M games, so the discard loop never runs |
| Rollback | One line: the generator default back to `legacy-v2` (or `MLB_FULLGAME_RULES=legacy-v2`). Published v3 artifacts stay as published, append-only |

## 4. Recommendation

**Activate pa-v3 for the postseason as a correctness fix, after three conditions are met:**

1. #1043 is merged (default still pa-v2) and the next board refresh carries `gameType` for every game.
2. A **shadow** run for 3 slates: v3 generated alongside v2 into an internal path, never published. It must show zero unexpected refusals, zero discards, `engineRules` on every game, and correct phase basis `GAME_TYPE`.
3. Explicit founder approval of a one-line PR that flips the default, with the rollback stated.

**Expected effect on users:** almost none. Postseason totals and run lines move by a few hundredths of a run. Winner probabilities move by at most about one point.

**What stays in place:**
- Model-health states.
- The paused totals and run line.
- Every eligibility hold.
- The baseline audit's finding: the winner model is worse than a coin flip on log loss and worse than the market.

pa-v3 does not change any of these.
