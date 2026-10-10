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

**Equivalence:** on 2026-10-07 (three games), the live script's predictions equal the frozen B and B2 rows **192 / 192, exactly**.

## Validation on `claude/mlb-option-a-live-capture`

- **Tests:**
  - `forward-player-live.test.mjs` 4/4 on Node 20.4: before-start receipts and hashes, write-once (bytes unchanged on the second run), refusal at the start, a fixed clock cannot write. The mutation probe "remove the started check" is caught.
  - Full-game tests 139/139.
  - Workflow guard tests 578/579 (1 skip).
  - Unit phase and `tsc`: see the PR.
- **Today:** a dry run at 12:53Z gave 849831 → `NO_CONFIRMED_LINEUP` (correct: lineups post about 2 h before the start).

## Integration order and timing

The branch contains **#1048 + #1043** (the `engine.ts` conflict is resolved; both fields kept) plus Option A, because the models need pa-v3 and the hooks. The options:

| Option | Integrations | Notes |
|---|---|---|
| (a) | #1048 → #1043 (reconciled with this resolution) → Option A | Three approvals and three Production builds |
| (b) | #1048 → Option A **including** #1043 | Two approvals. #1043's scope rides inside, as #1047 rides inside #1048 |

**Tonight:**
- 849831 starts 00:00Z (8 PM ET). Lineups usually post about 2 h earlier, and the workflow runs at 22:30Z and 23:30Z.
- A capture tonight therefore needs Option A merged before about 23:15Z, which means every approval in the chosen chain today.
- If that does not happen, the first live receipts come from the next slate. **Nothing is backfilled.**
