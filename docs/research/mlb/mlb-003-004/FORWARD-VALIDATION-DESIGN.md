# MLB-003 / MLB-004 · forward validation design (2026-10-10; design only, nothing wired)

**Purpose:** the only evidence that can qualify a player-market model is **genuine prospective** forecasts graded against **posted lines and prices**. The 2024 development read and the single 2025 `RETROSPECTIVE_HOLDOUT` read cannot. This document specifies that capture and its gates. It changes no workflow, generator, artifact or product. Any wiring is a separate, founder-approved change, and it is **not** part of #1048.

## Point-in-time availability (measured: `availability/availability-matrix.json`, 2026-07-22 → 10-10, 901 completed games)

| Input | Coverage | When available | Usable pregame? |
|---|---|---|---|
| Earlier games' box scores (rates, workload, bullpen) | all | after each game | **Yes**, for later dates only (`POSTGAME_OUTCOMES`) |
| Confirmed lineups, both sides, before first pitch | **81% of games** | first posted a median of **115 min** before first pitch (p10 48, p90 175) | Yes, once posted. Earlier forecasts must refuse or say "lineup not confirmed" |
| Probable starters and their hands (`matchup`) | 99%; both hands in 98% of documents | about 85 min before the start | Yes |
| Bullpen usage over the last 1 and 3 days | 99% | about 85 min before | Yes (MLB-004 / MLB-005 bullpen availability) |
| Park factors (run and HR factor) | 99% | static | Yes |
| Per-batter splits, form, PA opportunity, batter-vs-pitcher | **47% of games, 41% of starting batters** | 95–315 min before; tied to the prop board, not to the lineup | Partial. These families follow the board, which is why batter-counts-v1's matchup inputs reached about 2% of rows under the capture-before-board rule |
| Batting-order slot (`pa-opportunity`) | 81% of those documents | about 60 min before | Partial |
| Posted lines and prices | as on the board (`app/public/data/mlb/boards/`, `leans` with `line`, `oddsOver` / `oddsUnder`, capture time) | board generation | Yes. Already captured. **No new odds credits** |
| Weather | separate pregame weather capture | — | Not used by v2 |

**Implications:**
- A forward capture should key batters to the **confirmed lineup**, not to the board.
- The per-batter splits families need lineup-driven capture to reach full coverage, which is a data-capture change.
- v2 itself needs only box-score state plus lineup, starters and hands, all of which are available.

## What is captured (per forecast row; write-once)

**Identity:**
- `gamePk`, `date`;
- `playerId` (MLB id), team, side, confirmed slot;
- family (`batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`, `batter_runs`, `batter_rbis`, `pitcher_strikeouts`; HR is excluded, below).

**Clock:**
- `forecastAt`: after both lineups are posted, before first pitch;
- `dataAsOf`: the box-score state through D−1, and the lineup, starter and hand captures with `capturedAt ≤ forecastAt`;
- the scheduled start, then the actual first pitch from the play-by-play, as in #1046.

**Models:**
- the frozen `v2` and `v1` count distributions (pmf);
- P(over) at every posted line;
- the published model's probability from the board lean, as champion;
- the de-vigged market from the same board row, with its capture time and book.

**Provenance:**
- model version and code commit (frozen);
- input fingerprint (hash of every input value);
- the capture ids and times used;
- the hash of the row itself.

**Grading:**
- from the official box score (`capture-mlb-boxscore-outcomes.mjs`);
- integer-line pushes are void;
- a batter with no PA is void, never a loss; a starter who does not start is void;
- missing stays missing.

## Two ways to run it

| | A · live capture in the MLB workflow | B · frozen-code forward replay |
|---|---|---|
| How | A step after the lineup refresh writes rows before first pitch (like #1048's shadow) | The model code is frozen and registered **before** the window. After each slate, rows are computed from captures timestamped before first pitch, with the same code |
| Prospective because | Each row exists before the game | The code and parameters existed before the games, and every input is a timestamped pregame capture |
| Weakness | Needs a workflow / generator change: Production-bound, founder approval, COST-001 review | Rows are materialised after the games, so it relies on the capture timestamps and the freeze commit |
| Cost | About ms per player in an existing run; no odds credits | Local only; no Production change |
| Recommendation | Propose after #1048 is decided, as its own PR | **Usable now** for the rest of the 2026 postseason and for 2027, until A is approved |

## Gates (to be preregistered per family, before the window opens)

- **Primary:** log loss of P(over the posted line), challenger minus the published model.
  - Paired, with a bootstrap that resamples **game dates**.
  - The 95% interval must be below 0.
- **Calibration:** slope at the posted line in [0.7, 1.3].
- **Market:** challenger minus the de-vigged market, always **reported**.
  - A claim of skill against the market needs its own interval below 0.
  - No betting-value claim follows from beating the published model.
- **Secondary:** count log loss, CRPS, AUC, interval coverage.
- **Sample, single look:**

  | Market | Minimum graded lines |
  |---|---|
  | Hits | 2,000 |
  | Total bases | 1,000 |
  | H+R+RBI | 1,000 |
  | Runs | 500 |
  | RBI | 500 |
  | Pitcher strikeouts | 300 starts |

  A market that does not reach its n is reported as "not enough data". It is never extrapolated.
- **Per family:** a pass in one family qualifies no other. HR is **withheld**: v2 failed its retrospective bar, and a new HR mechanism needs its own registration.
- **Refusals:** no confirmed lineup, no posted line, or a forecast after first pitch means no row, with the reason counted.

## Remaining acceptance requirements before any product use

1. Forward preregistration committed with the frozen code commit (B), or a founder-approved workflow step (A).
2. The window runs to its n; one read.
3. Founder decision on eligibility, family by family (MLB-003 / MLB-004 acceptance; CONTRACT-001 for the artifact field).
