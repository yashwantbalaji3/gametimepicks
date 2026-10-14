# COST-001 Stage B — MLB stamp-only build gate (proposal, 2026-10-14)

**Status:** engineered and validated locally. The workflow edits are **proposed for founder review**. They are not merged, and nothing has run in Production.

**Pattern:** the NBA results gate (`lib/sports/nba/results-publishable.mjs`, Stage A, 2026-10-09).

**All costs below are estimates** at the COST-001 rate assumption: $0.0035 per CPU-minute on the Enhanced 8-vCPU machine. None of them is a billed figure.

## The problem
`mlb-lineup-refresh` (hourly 15:30–00:30Z) and `mlb-daily-production` (the morning slate plus its recovery re-runs) regenerate deterministically from committed inputs. A run whose inputs did not move reproduces the simulation and predictions byte for byte, except for its own clock stamps (`generatedAt` and similar).

Those stamps sit in Vercel build inputs, so each such run was a full Production build:
- In the 24h to 2026-10-14 16:00Z, **14 of the 16 builds** these two workflows caused changed nothing a reader can see (the build-necessity audit reported to the founder on 2026-10-14).
- That is 7/9 lineup builds and 7/7 daily builds.

## The rule (`app/src/lib/ops/stamp-only-gate.mjs`)
The gate runs after `git add` and before `git commit`, and judges the staged set against HEAD.

| Staged file | Treatment |
|---|---|
| **Gated** — a build input with a declared stamp allowlist: full-game simulations, predictions, game simulations, homer-nukes, the MLB tier grid, the MLB schedule, prediction snapshots | **Stamp-only** when the new file equals HEAD after deleting exactly the allowlisted paths. A new prediction snapshot is stamp-only when it equals the newest snapshot already committed for that date |
| **Free** — not a build input, per the ignore step's own lists, parsed live: `ops/`, `admin/status.json`, input-snapshots, the engine shadow, production history and health | Always committed, as today. A commit of only these costs no build |
| **Unknown** — a build input with no stamp rule (paid market captures, team markets, props, a new day's file) | Never judged: its presence **publishes** |

**All or nothing.** The gated set is suppressed only when every one of these holds:
- every gated file is stamp-only;
- no unknown build input is staged;
- the public fields of `ops/publication-slo.json` are unchanged (see the finding below);
- the oldest committed gated stamp is under the **6h heartbeat**.

In every other case — one moved probability, a new lineup, a status flip, a deletion, an unreadable file, an exception — the gate publishes everything exactly as the workflow did before.

**Fail-safe CLI exit codes:**
- 0 = suppressed;
- 1 = publish, with the index untouched;
- 2 = could not judge, with the index untouched.

**The allowlist is exact JSON paths, not key names.**
- A `generatedAt` anywhere else, for example per prediction, publishes.
- `evidence.priceAgeDays` is allowlisted, but `evidence.pricesCapturedAt` is not, so new prices always publish.

The allowlist was mined from 157 commits (`mine.py` → `paths.txt`).

## Evidence
**Sequential replay** (`replay.mjs`, read-only, run from the repo root). Every MLB lineup/daily commit on `main` over 10 days (2026-10-04 → 10-14), through the gate, against the virtual `main` the gate itself would have produced:

| | Build-triggering commits before | After (6h heartbeat) | After (no heartbeat) |
|---|---|---|---|
| lineup-refresh (90 commits) | 90 | 30 | 29 |
| daily-production (67 commits) | 67 | 22 | 12 |
| **Total, 11 calendar days** | **157 (14.3/day)** | **52 (4.7/day)** | **41 (3.7/day)** |

**Why the 52 published (6h heartbeat):**
- 30 full-game content changes (confirmed lineups);
- 10 first files of a new day;
- 1 predictions-only change;
- 11 heartbeats.

**Cross-check against the independent 24h build audit:** 16/16 agree.
- All 14 stamp-only builds are suppressed. The one exception is `eef3aed738`, which publishes on the 6h heartbeat (6.1h).
- Both necessary builds (`6f6cd83041`, `236a4f24af`, confirmed lineups) publish.

These are commit counts. Vercel coalesces pushes that land close together, so "before" over-counts real builds slightly.

## Expected reductions and estimated savings
COST-001 §2.4: an ignored build is **not free**. A skip still provisions and clones, at about 16 CPU-minutes ($0.056). The gate still commits the run records, so each suppressed run costs one ignored build instead of one full build.

| Window | MLB builds avoided | Gross build CPU-min avoided | Net of ignored-build charge | Estimated net $ |
|---|---|---|---|---|
| 24h audit (actual build minutes) | 13 of 16 | 644.8 | 436.8 | **≈ $1.53/day** |
| 10-day replay (avg 6.11 build-min) | ≈ 9.5/day | ≈ 465 | ≈ 312 | **≈ $1.09/day** (≈ $33/30 days) |

**Without the heartbeat:** about 1 more build avoided per day (≈ +$0.12/day).

**Larger saving (not proposed):** skip the run-records commit too when nothing else changed. That would reach 100% of the build cost, but it stops the dead-man's-switch heartbeat (`ops/heartbeat.json`) and SLO verdicts from reaching `main`. Out of scope.

## Findings made while building this
1. **`ops/publication-slo.json` is read by public pages at build time, but `ops/` is excluded from the build trigger.**
   - The reader is `lib/ops/read-publication-slo.ts`, which supplies the Home/MLB deadline.
   - Until now its changes reached the site only by riding these stamp commits.
   - The gate publishes whenever its public fields (date, state, platformState, publishDeadlineUtc, reason) move, so the gate never makes this worse.
   - The pre-existing gap stays for other workflows that commit `ops/` alone. That is a separate, small fix to propose.
2. **`app/public/data/admin/status.json` changes on every daily run** (run stamps, workflow health). It is read only by the pruned `/ops` and `/launch` routes, so it is added to `NON_BUILD_INPUTS`.
   - It is guarded by a new post-build test: "NON_BUILD_INPUT files are read only by internal routes". The test was mutation-checked: a public read turns it red.
   - Without this entry, every daily re-run would still build.

## Tests
`app/src/lib/ops/stamp-only-gate.test.mjs`, 20 tests:

- **Suppress:** the real 7b2312f7a7 shape; every allowlisted stamp path; key order.
- **Publish:**
  - one moved probability, a new lineup, a started game;
  - a stamp-named key outside the allowlist, new prices;
  - a changed, first or rewritten snapshot;
  - a new day, a deletion, an unruled paid capture;
  - a moved, new-day or unreadable SLO verdict;
  - heartbeat, unreadable files, no clock.
- **Re-stamping the newest committed real artifacts:** suppresses. One moved number: publishes.
- **CLI tests on a scratch git index:** restores and drops; publish leaves the index byte-identical; `--dry-run` touches nothing; an unruled build input publishes; failure exits 2 untouched.

**Mutation checks:** all 9 caught.
- key-name stripping;
- no SLO clause;
- no heartbeat;
- unknown inputs ignored;
- first snapshot suppressed;
- partial suppression;
- CLI fails open;
- CLI ignores the ignore-step lists;
- a public reader of `admin/status.json`.

## Rollback
Any one of these:
- delete the two `if node app/scripts/ops/stamp-only-gate.mjs; then … fi` blocks from the workflows, which restores the previous behaviour exactly;
- run with `--heartbeat-hours 0`, so every run publishes;
- revert the PR.

No data is rewritten by any of these. Suppressed runs never committed stamp churn, so there is nothing to restore.

The `admin/status.json` `NON_BUILD_INPUTS` entry reverts independently. Without it, daily-production simply builds as before.
