# Option A · live pregame capture of MLB-003/004/005 research forecasts (design and implementation status, 2026-10-10)

**Founder decision 4 (2026-10-10 morning):** develop and locally validate. **Not merged; not activated.** Merge needs exact-head approval. Research only (`PRIVATE_RESEARCH`): no public page, product, eligibility or published model changes.

## What it is

Inside the existing `mlb-lineup-refresh` workflow, which runs hourly from 15:30Z to 00:30Z and already captures the confirmed lineups and refreshes the forecasts, two isolated steps are added:

1. **Research state:** yesterday's official box scores (`capture-mlb-boxscore-outcomes.mjs`, free StatsAPI, about 15 requests a day, append-only by date) under `data/internal/mlb/boxscore-outcomes/`. Postgame outcomes are used only as inputs for **later** games.
2. **Live capture** (`capture-mlb-forward-player-live.mjs`): for each game **not yet started**, whose confirmed lineups (9 and 9) and probable starters were captured before now, it writes **one immutable receipt** to `data/internal/research/mlb/forward-player-live/<date>/<gamePk>.json`.

The step that already commits writes the receipt, so its **git commit, pushed before first pitch**, is the external timestamp. A separate postgame verifier classifies each receipt.

## Requirements → implementation

| Founder requirement | Implementation |
|---|---|
| Forecasts before actual first pitch | A game is eligible only if `now < scheduledStart`; at or after the start it is refused (`STARTED_OR_AT_START`). The verifier also requires the receipt's adding commit to be **before the actual first pitch** (#1046's play-by-play capture) for `VERIFIED_PREGAME` |
| Freeze predictions and input provenance | Each receipt carries: the code commit (`GITHUB_SHA`); a code fingerprint (sha256 over the capture script, engine, plate-appearance, invariants, board adapter, RNG); the models' walk-forward parameters; the lineup and matchup capture files with **sha256 and capturedAt**; the board file sha256 and generatedAt; the box-score state (through date, file count, set hash); the embedded identities (teams, starters, lineups by slot); and `receiptSha256` over the whole receipt |
| Immutable, versioned research receipts | Schema `gtp.mlb.forward-player-live@1`. Written once (`wx`: fails rather than overwrite); a later run skips a captured game. The verifier flags `TAMPERED` if the hash fails or more than one commit touches the file |
| Posted lines and prices | Every board lean for the game's listed players (hits, TB, H+R+RBI, K): line, both prices, bookmaker, capturedAt, the published model's P(over) and projection. Plus the published game forecast at capture time (`champion`: model version, `artifactHash`, P(home)) |
| Never overwrite prior research predictions | Write-once per game. The preregistered replays B / B2 / B-GAMES are separate and unchanged |
| Settlement in a separate postgame step | `verify-forward-player-live.mjs` (evidence classes, counts only) and, later, a grader that reads only `VERIFIED_PREGAME` receipts |
| Fail closed | No receipt when any of these hold: no confirmed lineup, no starters, no team codes, unresolved ruleset, stale state (> 4 days), state not ready, any invariant violation in any of the 4,000 worlds, a cap failure, or over the time budget (240 s). Both workflow steps are `continue-on-error` with timeouts; the forecasts never depend on them |
| No backfill after the game | A game is eligible only before its scheduled start. A fixed clock (`--now`) can never write a real receipt; it may write only into a test directory |
| No unnecessary Vercel deployments | The receipts and box scores live in `data/internal` (not build inputs) and ride the lineup-refresh commit. Only a **new receipt** can make a commit on its own (needed for its timestamp): at most one ignored build (≈ $0.05) when a lineup posts without changing the simulation. Box scores never commit alone |
| No sportsbook credits | Lines and prices come from the board already captured. 0 odds API calls |
| Public behaviour unchanged | The engine research hooks are opt-in (`EngineParams.research`; absent = published engine). The forecast generator is byte-identical (below). Nothing public reads the receipts |

## Models (exactly the preregistered replays' code; proven)

| Name | What | Seed |
|---|---|---|
| `v2` | MLB-003/004 v2 analytic | — |
| `engineSub` | Coherent worlds, official rules, substitution, v2 workload; 2,000 worlds | `mlb005-fwd|<gamePk>` |
| `v3k` | `mlb-k-workload-v3` analytic | — |
| `engineB2` | Coherent worlds with substitution + v3 workload; 2,000 worlds | `mlb005-fwd-b2|<gamePk>` |

**Equivalence:** see Validation.

## Validation (Option A minimal, branch `claude/mlb-option-a-live-capture`)

- **Equivalence:** 192 / 192 predictions identical to the frozen B and B2 rows (2026-10-07, three games).
- **Tests:**
  - `forward-player-live.test.mjs` 4/4 on Node 20.4: before-start receipts and hashes, write-once (bytes unchanged on the second run), refusal at the start, a fixed clock cannot write. The mutation probe "remove the started check" is caught.
  - `rules-engine.test.mjs` 8/8: the engine-level subset of #1043's rules tests, including "legacy rules ARE the published engine". The mutation probe "official walk-off under legacy" is caught.
  - All full-game and research tests 145/145.
  - `tsc` clean. Unit phase: see the PR.
- **Byte identity of the published generator vs main:** identical on 2026-09-15, on 2026-10-07 before and after first pitch, and on today's slate. The only additions are #1048's private matchup-v1 shadow files.
- **Today:** a dry run at 12:53Z gave 849831 → `NO_CONFIRMED_LINEUP` (correct: lineups post about 2 h before the start).

## Dependency on #1043 (founder decision 2, 2026-10-10)

Option A does **not** need #1043 as a whole. It needs only the **engine-level** rules, because the preregistered models (B / B2) were frozen under the official rules. This branch carries that subset **explicitly, opt-in and disclosed**:

| From #1043 | In Option A minimal? |
|---|---|
| `EngineParams.rules`, `LEGACY_RULES` / `OFFICIAL_RULES_2026`, `automaticRunnerApplies`; walk-off winning-run-only; discard flag at the cap | **Yes**, in `engine.ts`. Absent `rules` = the published engine, byte for byte |
| Rule 9.06(f) walk-off hit bases | **Yes**, in `engine.ts`, under the official rules only |
| `GameInput.ruleset` / `rulesetBasis`; `board-adapter` `gameType` + `resolveRuleset` | **Yes** (type fields; one additive pure function) |
| Generator `--rules` flag; `simulate.ts` discard / refusal and the `engineRules` output; frozen-carry `modelVersion`; `pipeline/mlb/mlb_stats.py` gameType; MLB-001 docs and comparison receipts | **No.** These stay in #1043 for its own approval |

**Nothing public changes:** the published generator never passes `rules`, so pa-v3 stays opt-in. The full #1043 merge into the earlier draft is preserved at `claude/mlb-option-a-live-capture-with-1043` (`a0cb366a74`).

## Integration order and timing

The order is #1051 → #1048 → this branch (Option A minimal) → #1043, each with its own exact-head approval. #1043 then rebases onto this branch: its engine-level part becomes a no-op, and its remaining scope is the generator, simulate, frozen-carry and pipeline changes.

**Tonight:**
- 849831 starts 00:00Z (8 PM ET). Lineups usually post about 2 h earlier, and the workflow runs at 22:30Z and 23:30Z.
- A capture tonight therefore needs #1048 and then this branch merged before about 23:15Z.
- If that does not happen, the first live receipts come from the next slate. **Nothing is backfilled.**
