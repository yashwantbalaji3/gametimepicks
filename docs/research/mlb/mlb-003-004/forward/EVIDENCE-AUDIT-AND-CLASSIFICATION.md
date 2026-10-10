# Forward tests B / B2 / B-GAMES · evidence audit and classification (founder decision 3, 2026-10-10 morning)

**Classification: `PREREGISTERED_REPLAY`.**
- These are preregistered research evaluations. They are **not** verified live forward forecasts.
- They do **not** count toward live qualification.
- No pregame receipt is, or will be, manufactured retroactively for them.
- Live evidence comes from option A (`../OPTION-A-LIVE-CAPTURE-PROPOSAL.md`, now in development), with its own receipts.

## Requirement by requirement

| Requirement | B / B2 / B-GAMES today | Met? |
|---|---|---|
| Immutable predicted probabilities **recorded before first pitch** | Computed **after** the games by `materialize*.sh`, from inputs timestamped before first pitch | **No** |
| Immutable full count distributions | Stored in full per row, write-once per date, but written after the game | Partly (immutable, not pregame) |
| Frozen model version and code fingerprint | Registration commit = code freeze (`e273bf4e2c`, `2d83693e14`, `b716996414`). The wrapper refuses any code drift. Rows record `codeCommit` | Yes |
| Immutable input hashes | Per-game `inputFingerprint` (FNV over inputs). Input files are named, but not hashed by content | Partly |
| Verified capture timestamps | Inputs carry `capturedAt` (self-reported). The bot commits that pushed them to GitHub give external times | Inputs only |
| Pregame player and team identities | From the pregame lineup and matchup captures and the day's board | Yes |
| Verified sportsbook lines and prices | Board leans with `bookmaker`, `capturedAt`, line and both prices, joined at grading | Yes (at grading) |
| Evidence the prediction existed **before the outcome was known** | None: the prediction is materialised after the game | **No** |
| Pregame capture separate from postgame grading | The grader is separate, but there is no pregame capture step | **No** |

## Why they are still useful

- The code was frozen before any included game, and every input is a pregame capture, so each row is a deterministic function of pregame information.
- They are honest **out-of-sample replays**: no tuning on their outcomes is possible.
- They are **not** a live record, because nothing proves a forecast existed before the game.

## Labelling

Any report of B / B2 / B-GAMES results must carry `PREREGISTERED_REPLAY` and this audit's reference. The frozen graders are not changed; this document is the label.
