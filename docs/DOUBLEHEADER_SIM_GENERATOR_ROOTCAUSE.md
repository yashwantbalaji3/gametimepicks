# Doubleheader Sim-Generator gamePk-Collapse — Root Cause & Fix

**Status:** FIXED in the generator (fixture-proven). CI must re-run the real generator to regenerate the
committed `public/data/mlb/game-simulations/<date>.json` artifacts (paid pipeline — not run here).
**Money:** untouched. `portfolio.json` md5 stays `affe6b21071f2b3be96bb2774eb347c3`.

---

## The defect (confirmed on the real 2026-07-22 slate)

The MLB game-simulation artifact labeled **both** games of a doubleheader with the **same** `gamePk`, so
the twin whose id was dropped resolved to **no** simulation downstream and honestly rendered
"not yet simulated", while its sibling rendered.

Evidence (`app/public/data/mlb/`):

| Team pair | `boards/2026-07-22.json` (schedule, correct) | Old `game-simulations/2026-07-22.json` |
|-----------|----------------------------------------------|----------------------------------------|
| PIT @ NYY | `823518` (17:05, Cole) **and** `823519` (23:05, Chandler) | **both** games → `823519` (`823518` absent) |
| BAL @ BOS | `824735` (17:35) **and** `824732` (23:10)   | **both** games → `824732` (`824735` absent) |

The two PIT@NYY sim games have **distinct** `gameId`s (`8291188e…` and `825819c6…`) — the identity fix from
a prior mission works — but both carried `gamePk 823519`.

---

## Root cause — trace from artifact back to source

### 1. Originating corruption (upstream board build — NOT changed here)
Every PIT@NYY **lean** in the board is stamped with `gamePk 823519` (`823518` appears on **no** lean);
every BAL@BOS lean with `824732` (`824735` dropped). The lean's own `commenceTime` still distinguishes the
games (`17:06` vs `23:05`), and `board.games[]` still carries the **correct distinct** `gamePk` + `gameDate`
per game — but the per-lean `gamePk` was collapsed by a **team/date-only (last-wins) join** in the paid
board build. That build is upstream, needs the paid pipeline, and is out of scope for this fix.

### 2. Where the collapse entered the sim artifact — **the generator (the fix site)**
`app/src/lib/game-simulations/mlb-generator.ts` → `generateMlbGameSimulations()`. The old code grouped
leans by `gameId` (correct — two distinct groups) and then took the **gamePk straight off the leans**:

```ts
// OLD (defect): trusts the collapsed per-lean gamePk; never consults board.games[]
const gamePk = gLeans[0].gamePk;   // both PIT groups → 823519
const built  = buildGame(board, date, gameId, gamePk, gLeans, sourceBoardHash, generatedAt);
```

The generator **had the authoritative schedule** in `board.games[]` (distinct `gamePk` + `gameDate`) but
never consulted it — it propagated the leans' collapsed id verbatim into `game.gamePk`. That is the exact
line where two doubleheader games collapse onto one gamePk in the artifact.

### 3. How the collapse becomes "not yet simulated" (downstream, self-heals once #2 is fixed)
`app/src/lib/game-detail.ts` → `mlbSimulationJoiner()` builds a **last-wins** map keyed by the artifact's
`gamePk` (line ~340: `gameIdByKey.set(String(g.gamePk), g.gameId)`). With both sim games sharing `823519`,
the key `"823518"` is **never set**, so the board fixture for `823518` (its `matchId` = its own, correct
schedule gamePk) finds no sim → honest `game_not_in_artifact` → "not yet simulated". Once the artifact
carries **distinct** gamePks (the fix), this map keys both `823518`→gameId and `823519`→gameId and the join
self-heals.
*(Separately, `mlbDetails()` line ~397 builds `idByPk` from the still-corrupted leans; it only affects the
per-game "build" deep-link, not the sim mislabel — an upstream-data concern, not fixed here.)*

---

## The fix (generator only — `app/src/lib/game-simulations/mlb-generator.ts`)

**Re-derive each game's `gamePk` from the authoritative schedule, doubleheader-safe, and fail closed.**

1. **New pure resolver `resolveGamePks(groups, scheduleGames)`** (exported, unit-tested). Buckets both the
   lean-groups and `board.games[]` by normalized team-pair, then per pair:
   - 1 group + 1 schedule row → `schedule-unique`;
   - **N groups + N schedule rows (a doubleheader)** → a **strict, tie-free commence-time↔gameDate
     bijection** (`schedule-time-order`): earliest-commence game → earliest scheduled `gamePk`, etc. This
     guarantees **distinct** gamePks and has **no first-match fallback**;
   - 1 group + many rows → `schedule-nearest-time`; no schedule + 1 group → trust the lean id (safe, no twin
     to collide with);
   - **anything underdetermined** — counts mismatch, missing times, or a time tie → `{ gamePk: null,
     resolved: false }` (**fail closed**).
2. **`generateMlbGameSimulations` calls the resolver** and passes the resolved gamePk + a `resolved` flag
   into `buildGame` (replacing `gLeans[0].gamePk`).
3. **`buildGame` fail-closed identity gate:** a game is `ready` with a `gamePk` **only** when identity is
   proven; otherwise `status:"unavailable"`, the `gamePk` is **omitted** (so nothing downstream can
   mis-join it to its twin), and an honest `game_identity` / `ambiguous_doubleheader` unavailable module is
   declared. The per-lean seed uses the resolved gamePk (falls back to the stable `gameId` when unresolved).

`makeSlug` is unchanged (kept equal to the downstream `baseSlug`; the `gamePk` is the identity anchor the
reconciliation gate checks, not the slug).

**Blast radius:** for non-doubleheader games `lean.gamePk == board.gamePk`, so their gamePk/seed/hash are
**unchanged**. Only the doubleheader game whose lean id was wrong flips (e.g. PIT game 1 `823519`→`823518`,
BAL game 1 `824732`→`824735`), changing its seed/distributions/per-game hash and thus the top-level
`artifactHash`. This is expected — **CI must re-run the real generator** to refresh the committed artifacts.

---

## Fixture proof (no paid pipeline, no money file)

Regression tests: `app/src/lib/game-simulations/mlb-generator-doubleheader.test.mjs` (13 tests, all pass).
They build a doubleheader board whose leans carry the **collapsed** id (reproducing the exact defect) and
assert end-to-end through the real `generateMlbGameSimulations`:

- **(a)** both twins get **distinct** gamePks matching the schedule (`823518` + `823519`, a bijection);
- **(b)** assignment is **time-keyed**, **overrides** the collapsed `leans[0].gamePk`, and is **stable under
  lean re-order** (a first-match fallback would flip the ids); resolver method is `schedule-time-order`;
- **(c)** each board `gamePk` joins (via the replicated production joiner) to a **distinct** sim game that
  **reconciles** (`sim.gamePk === anchor`, no `sim_gamepk_mismatch`);
- **(d)** an **unsplittable** doubleheader fails **closed** (both `unavailable`, no gamePk, `game_identity`
  module, neither board gamePk joins), and a game with **no leans** reads honestly `unavailable`
  (`game_not_in_artifact`) via the real reader.

Plus 8 pure-function tests over every `resolveGamePks` branch (unique / time-order / nearest-time /
lean-single-no-schedule / time-tie / missing-times / counts-mismatch / distinctness invariant).

**Real-slate dry-run confirmation** (`--dry-run`, writes nothing):

```
# 2026-07-22 (after fix)
PIT @ NYY  pk 823518  [ready]      BAL @ BOS  pk 824735  [ready]
PIT @ NYY  pk 823519  [ready]      BAL @ BOS  pk 824732  [ready]
# 17/17 games ready, gamePks distinct, matching boards/2026-07-22.json exactly
# 2026-07-07: MIL@STL (only one game had props) → resolves via schedule-nearest-time; propless twin honestly absent
```

Before the fix the same dry-run produced `823519` / `824732` twice and dropped `823518` / `824735`.

---

## Validation

- `cd app && npx tsc --noEmit` → **0 errors**.
- `npx tsx --test src/lib/game-simulations/mlb-generator-doubleheader.test.mjs` → **13/13 pass**.
- Existing adjacent suites unaffected: `mlb-generator.test.mjs` **16/16**, `game-simulations.test.mjs`
  **14/14**.
- Money untouched: `portfolio.json` md5 = `affe6b21071f2b3be96bb2774eb347c3`.
