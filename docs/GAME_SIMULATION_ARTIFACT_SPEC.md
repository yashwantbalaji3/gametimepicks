# Game Simulation Artifact — Contract Spec (Phase 3)

**Status:** contract only. Types + reader + validator + tests shipped this phase. **No generator**
(Phase 4) and **no UI wiring** (Phase 5) yet.

## What this is

A **FreeSim-style** feature. A user clicks **"Generate Simulation"** on a game and the site reveals a
**precomputed, deterministic, per-game simulation artifact** — the *same output for every user* for
the same `game + modelVersion + simulationVersion`. Nothing is simulated live in the browser; the UI
reads a persisted JSON artifact and renders it honestly.

This document defines that persisted artifact, the reader that consumes it, and the honesty rules the
validator enforces. Everything the feature shows is **paper-only / educational** — never wagering
advice.

## Where the files live

| Concern | Path |
| --- | --- |
| Types (framework-free) | `app/src/lib/game-simulations/types.ts` |
| Reader utilities | `app/src/lib/game-simulations/read.ts` |
| Validator | `app/src/lib/game-simulations/validate.ts` |
| Contract tests | `app/src/lib/game-simulations/game-simulations.test.mjs` |
| Persisted artifact | `public/data/{sport}/game-simulations/YYYY-MM-DD.json` |

Examples: `public/data/mlb/game-simulations/2026-07-08.json`,
`public/data/world-cup/game-simulations/2026-07-08.json`.

> The Phase-4 generator will write these files. This phase writes **none** — the reader/validator/tests
> operate on temp fixtures only, and the canonical money artifact
> (`app/public/data/mr-dub/portfolio.json`) is never touched.

## Artifact shape

### Top level (`GameSimulationArtifact`)

| Field | Type | Notes |
| --- | --- | --- |
| `date` | `string` | Slate date `YYYY-MM-DD`. |
| `sport` | `"mlb" \| "world_cup" \| "nba" \| "ufc"` | Owning sport. |
| `generatedAt` | `string` | ISO timestamp the artifact was generated. |
| `modelVersion` | `string` | e.g. `"mlb-2026.07"`. Drives staleness with `simulationVersion`. |
| `simulationVersion` | `integer` | Engine/format version. Bump on breaking sampling/shape changes. |
| `runCount` | `number \| null` | Monte-Carlo runs, or **`null` when no sampling ran**. Gates the "N runs" claim. |
| `sourceBoardHash` | `string` | Hash of the whole source board. |
| `artifactHash` | `string` | Hash of the whole serialized artifact. |
| `games` | `GameSimulationGame[]` | One entry per game. |

### Per game (`GameSimulationGame`)

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | `string` | Stable id. |
| `gamePk?` | `number` | MLB primary key. |
| `matchId?` | `string` | Soccer provider match id. |
| `slug` | `string` | Deterministic `home-vs-away-date`. |
| `teams` | `{ home, away }` | Team tokens. |
| `status` | `"ready" \| "unavailable" \| "stale" \| "error"` | Per-game readiness (honesty flag). |
| `freshness` | `SimFreshness` | Slate date + source/generated timestamps (no clock baked in). |
| `marketSnapshot` | `SimMarketSnapshot` | The **real board lines** used, with implied probabilities. |
| `simulationSummary` | `SimSummary` | Model point estimates / probabilities. |
| `distributions?` | `Record<string, SimDistribution> \| null` | Histograms. **`null`/absent = honest "not computed"** (must be declared as an unavailable module). |
| `generatedPicks` | `SimGeneratedPick[]` | Paper picks, each with provenance. |
| `unavailableModules` | `SimUnavailableModule[]` | Honest "not available" declarations. |
| `integrity` | `{ sourceBoardHash, artifactHash }` | Per-game hashes; required non-empty when `status: "ready"`. |

### Generated pick (`SimGeneratedPick`)

`id`, `sport`, `gameId`, `market`, `player?`, `team?`, `line` (`number | null`), `side`, `projection`,
`modelProbability` (0..1), `marketProbability` (0..1), `edgePct` (= `(modelProbability −
marketProbability) * 100`), `confidence` (0..1), `riskTier` (`anchor | core | value | longshot`),
`reasonBullets[]`, **`sourceFields[]` (non-empty — the real board/artifact field paths the pick was
derived from)**, `paperOnly: true`.

### Unavailable module (`SimUnavailableModule`)

`module` (e.g. `"distributions" | "xg" | "corners" | "cards" | "first_scorer"`), `reason` (machine
string), `requiredArtifactField` (the field that would carry it), `displayCopy` (ready-to-render).

## Reader (`read.ts`)

- `readGameSimulation(root, sport, date, gameId, opts?)` → `GameSimulationReadResult`
- `readGameSimulations(root, sport, date, opts?)` → `GameSimulationReadResult[]`
- `isSimulationStale(artifactDate, artifactSimVersion, currentDate, currentSimVersion)` → `boolean`
- `gameSimulationPath(root, sport, date)` → the deterministic on-disk path

**Status semantics the reader RETURNS** (this is the honesty core):

| Returned status | When |
| --- | --- |
| `ready` | Artifact exists, parses, validates, and the game's own status is `ready`. |
| `unavailable` | **No artifact file, or the game isn't in it.** A well-formed result — *not* an error. |
| `stale` | Artifact `date`/`simulationVersion` older than the injected current values (`opts.currentDate` + `opts.currentSimulationVersion`). |
| `error` | **Only** for a malformed / unparseable / structurally-invalid artifact. |

- Staleness is **deterministic** and driven by **injected** current values. The reader **never calls
  `Date.now()`**. Omit the `opts` to skip staleness entirely.
- **Missing `distributions` always surfaces as an `unavailable` module** in the result's
  `unavailableModules` — the reader synthesizes a `distributions` module when the game lacks real
  histograms, so the UI never has to inspect (or fake) empty bins.

## Validator (`validate.ts`)

`validateGameSimulation(obj)` → `{ ok: boolean, errors: string[] }`. Pure + deterministic (no clock,
no randomness). It **structurally enforces** the honesty rules:

1. A game with `status: "ready"` **must** carry non-empty `integrity.sourceBoardHash` and
   `integrity.artifactHash`.
2. A `runCount` "N-run" claim is valid **only** if it is a **positive integer**; `null`/absent means
   "no N-run claim" (allowed); `0`, negative, or non-integer values are **invalid** and fail.
   `allowsRunCountClaim(sim)` is the single source of truth for whether the UI may say "N runs".
3. Every `generatedPick` **must** carry a non-empty `sourceFields` array (**no pick without
   provenance**).
4. `distributions` present ⇒ must be a real object of named distributions with **non-empty described
   bins** (and integer per-bin `count`s when a `sampleCount` is claimed). `distributions` absent/null
   ⇒ fine, **but** the game **must** declare a `distributions` entry in `unavailableModules`.
5. **No fabricated** `xG` / `corners` / `cards` / `first-scorer`: those keys are rejected when placed
   bare on a game or its `simulationSummary`. They may exist only as an explicitly sourced module.

## Honesty rules (what the UI may claim)

- The UI may say **"simulated"** only when a game's `status === "ready"`.
- The UI may say **"N runs"** only when `allowsRunCountClaim(artifact)` is true (positive-integer
  `runCount`).
- The UI may render **histograms** only when real `distributions` exist for that game.
- The UI may show **xG / corners / cards / first-scorer** only when those sourced fields exist.
- Otherwise the UI shows **"Simulation not yet available"** (or the module's `displayCopy`).
- All output is **paper-only / educational**; every pick is `paperOnly: true`.

## Test coverage (`game-simulations.test.mjs`)

Valid artifact validates + reads ready · malformed → reader `error` · missing file / missing game →
`unavailable` (not error) · missing `distributions` → unavailable module (never faked) · `runCount`
gates the N-run claim · deterministic (deep-equal) reads · pick without `sourceFields` fails · no
fabricated xG/corners/cards/first-scorer · ready game carries both integrity hashes · deterministic
staleness · **canonical `portfolio.json` md5 unchanged**. Fixtures are written to `os.tmpdir()` and
cleaned up in `finally` — **never** into the repo.

## Guardrails

- **No real artifact is written into `public/data/` in this phase.**
- **Canonical money is never touched:** `app/public/data/mr-dub/portfolio.json` md5 stays
  `affe6b21071f2b3be96bb2774eb347c3`.
- Library code that must be deterministic takes time/versions as arguments — **no `Date.now()` /
  `Math.random()`** on those paths.
- Types are framework-free and tsx-runnable so the generator (Phase 4) and UI (Phase 5) share them.
