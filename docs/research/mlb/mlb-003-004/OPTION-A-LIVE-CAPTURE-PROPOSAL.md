# MLB-003 / MLB-004 / MLB-005 · option A: live pregame capture of player forecasts (proposal, 2026-10-10; not implemented)

**Status:** a design for a founder decision. Nothing is wired. Forward tests B and B2 (frozen-code replays) already collect prospective evidence without any Production change. Option A would make the same rows exist **before** each first pitch, which is stronger evidence.

## Where it would run

`mlb-lineup-refresh.yml` already runs hourly from 15:30Z to 00:30Z:
- it captures the confirmed lineups (`capture-mlb-pregame-lineup.mjs`);
- it regenerates the full-game simulations (`generate-mlb-full-game-simulations.mjs`, which already writes the private P317 and matchup-v1 shadows);
- its single commit stages `data/internal/research/mlb/engine-level-shadow`.

A forward-capture step would run **after** the lineup capture and **before** that commit, writing:
- `data/internal/research/mlb/forward-player-live/<date>.json`;
- one row per pregame game whose lineups are both posted, written once per game, never after first pitch.

## Contract and safeguards (same as #1048's shadow)

| Concern | Rule |
|---|---|
| Public output | Unchanged and byte-identical; the step writes only under `data/internal/research/` |
| Failure isolation | Its own step with `continue-on-error`. A wall-clock budget and try/catch per game; a failure never blocks the forecast commit |
| Build cost | No new commit: it rides the existing commit. Not a Vercel build input (`data/internal/research` is outside BUILD_INPUTS) |
| Odds credits | None: the lines come later from the board, at grading |
| Code | The frozen models of forward test B or B2, at an exact commit, invoked by path. A model change is a new registration |
| State | Earlier box scores. This needs the box-score capture as a daily step (free StatsAPI, about 15 requests a day), today run by hand |

## Cost

- **Compute:** about 2,000 worlds per game (≈ 0.3–0.6 s each), on at most about 15 games per run.
- **Actions minutes:** about +10–20 s per run.
- **Repository growth:** about 1 MB per regular-season day, under `data/internal`.

## What it needs

1. **Founder approval** of a workflow change (Production-bound, its own PR and exact-head approval). It should follow #1048: the same file, a sequential integration.
2. A daily box-score capture step, likely in `nightly-settle.yml`.
3. Freezing a model set for the live capture: B/B2's versions, or newer ones registered before their window.
