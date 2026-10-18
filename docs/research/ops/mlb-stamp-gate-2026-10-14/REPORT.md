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

## Founder checks (2026-10-14 evening)
| Check | Result |
|---|---|
| **Publication-SLO changes are never suppressed or left waiting** | Two layers. **(1)** `vercel-ignore-build.sh` now builds when the public fields of `ops/publication-slo.json` (date, state, platformState, publishDeadlineUtc, reason) move. This uses `scripts/ops/publication-slo-public-changed.mjs` and applies to every workflow; any error builds. **(2)** The gate also publishes the gated set in that case. History: over 10 days, 20 commits moved those fields; 8 of them previously waited for an unrelated deploy and now build on their own. The trigger is tested on a real git repo: a `checkedAt`-only change skips; a deadline, state or date change builds; unreadable JSON or a missing helper builds. A new guard proves `read-publication-slo.ts` is the only publicly reachable reader under `ops/` |
| **Three clocks kept apart** | Forecast `generatedAt` ("Simulated <time>") = when the simulation shown was produced. Under suppression it is the last run that changed it, which is true. `ops/heartbeat.json` (dead-man's switch) and input-snapshot capture times are free files and commit on every run, so a stalled pipeline is never hidden. Two public strings that implied the simulation moves hourly now read "batting order not posted yet · re-simulated when it posts" and "MLB forecasts: first run A → latest published B". No staleness verdict reads the gated stamps |
| **Pregame snapshot provenance** | `provenance.mjs`: the grader's rule (newest revision whose generatedAt pre-dates first pitch, over snapshots plus committed revisions) picks a **byte-identical prediction row for 21/21 games** (13 dates) with and without the gate's suppressions |
| **Legitimate lineup changes** | All 30 full-game content changes in the replay published, as did the 2 necessary builds in the 24h audit. Tests pin lineup, probability and status-flip publishes |
| **Official results and settlement** | No results, settlement, graded, ledger, board or linescore path matches a stamp rule. A test asserts this and that staging one publishes. Neither workflow writes those paths |

## Expected reductions and estimated savings
COST-001 §2.4: an ignored build is **not free**. A skip still provisions and clones, at about 16 CPU-minutes ($0.056). The gate still commits the run records, so each suppressed run costs one ignored build instead of one full build.

| Window | MLB builds avoided | Gross build CPU-min avoided | Net of ignored-build charge | Estimated net $ |
|---|---|---|---|---|
| 24h audit (actual build minutes) | 13 of 16 | 644.8 | 436.8 | **≈ $1.53/day** |
| 10-day replay (avg 6.11 build-min) | ≈ 9.5/day | ≈ 465 | ≈ 312 | **≈ $1.09/day** (≈ $33/30 days) |

**Without the heartbeat:** about 1 more build avoided per day (≈ +$0.12/day).

**Conservative estimate (the figure to plan on): ≈ $0.75/day (≈ $22/30 days).** It assumes:
- 9.55 avoided build-triggering commits a day;
- × 0.84 commit-to-build coalescing (19 MLB commits produced 16 builds in the audited 24h), giving 8.0 avoided builds a day;
- × (median MLB build 5.9 min × 8 vCPU − a 16 CPU-min skip charge on **every** suppressed run) × $0.0035;
- − 0.8 builds a day the SLO trigger adds back. Those are correct builds that previously waited.

All of these are estimates, not billed figures.

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

## Suppression-safety assessment (founder request, 2026-10-15)
The question: **can the gate ever suppress a meaningful forecast, settlement, grading, live-data, freshness or publication change?** Each class below names the mechanism that prevents it and the evidence for it.

| Class | Why it cannot be suppressed | Evidence |
|---|---|---|
| **Scope** | The gate can restore **only** files that match one of 7 exact MLB path patterns (full-game simulations, predictions, game simulations, homer-nukes, MLB tier grid, MLB schedule, prediction snapshots). Every other staged file is left alone. If an unruled build input is staged, the whole run publishes. The gate is called only from the two MLB workflows | `STAMP_RULES`; test "a new day's file, a deletion, or an unruled build input publishes" |
| **Forecasts** | Inside a gated file, only exact JSON paths are ignored: top-level `generatedAt`, `games.*.freshness.generatedAt`, `evidence.priceAgeDays`. Any other byte (a probability, lineup, status, artifact hash, note, count) publishes **every** gated file, never a subset | Tests for a moved probability, a new lineup, a status flip, and a stamp-named key outside the allowlist; real committed artifacts re-stamped (suppress) and with one moved number (publish); 9/9 mutations caught |
| **Pregame provenance** | A dropped snapshot is byte-identical (except `generatedAt`) to the newest snapshot already committed for its date. The first snapshot of a date, a differing one, and a rewritten one all publish | Grader rule replayed over 13 dates: forecast of record **byte-identical for 21/21 games** with and without suppression (`provenance.mjs`) |
| **Settlement, grading, results** | No results, settled, graded, ledger, board or linescore path matches a rule; the two workflows do not write them; staging one publishes | Test "official results, settlement and graded records never match a stamp rule" |
| **Live data** | Live scores come from the runtime gateway (`/api/live`), not from committed files, so the gate cannot touch them. NFL, NBA, UFC and soccer files are never gated | No rule outside `mlb/` and `parlays/tier-grid/mlb-*` |
| **Freshness claims** | No public staleness verdict reads a gated stamp. Every reader was traced:<br>• "Sportsbook snapshot captured …" reads **team-markets** (never gated);<br>• market capture times read `sourceCapturedAt` / `marketSnapshot.capturedAt` (not allowlisted, so a newer capture publishes);<br>• the MLB product-day freshness reads the **board** (never gated);<br>• the footer reads the build time.<br>Gated stamps feed only "Simulated / Simulation generated at <time>", which remains literally true (the content shown was produced then and has not changed). The copy that implied an hourly visible refresh was fixed | Reader trace (`game-intelligence.ts` → `getTeamMarketsForDate`; `public-provenance.ts`; `product-day.ts`) |
| **Publication (SLO) state** | The public fields of `ops/publication-slo.json` moving makes the gate publish. The deploy trigger also builds on such a move **for every workflow**, closing a pre-existing gap (8 commits in 10 days had waited for an unrelated deploy) | Trigger tests on a real git repo; reachability guard (`read-publication-slo.ts` is the only publicly reachable `ops/` reader) |
| **Dead-man's switch** | `ops/heartbeat.json` and the SLO files are free files and commit on every run, so a stalled pipeline stays visible | Test "run records kept"; CLI test leaves only the heartbeat staged |
| **Failure modes** | Unparseable JSON, a missing HEAD, no clock, a git error or an exception all publish. CLI exit 1/2 leave the index byte-identical | CLI tests (exit 1 untouched, exit 2 untouched, `--dry-run` touches nothing) |
| **Staleness bound** | Even when nothing changes, a run publishes once the oldest committed gated stamp is more than 6h old | Heartbeat tests |

**Residual risks, stated plainly:**
1. A future generator could give a stamp field real meaning, for example make `generatedAt` drive a public "updated N minutes ago". The allowlist would then hide changes to it. Mitigations:
   - the allowlist is 3 exact paths, written down;
   - any new public reader of these fields should be reviewed against this table;
   - the real-artifact test fails if the stamp paths disappear.
2. "Simulated <time>" can show a time up to 6h older than the latest confirming run. It is true, but a reader could take it for staleness. The heartbeat bounds this.
3. The added SLO trigger means about 0.8 extra (correct) builds a day.

**Verdict:** no meaningful forecast, settlement, grading, live-data, freshness or publication change can be suppressed by this design. Everything outside the 3 stamp paths in 7 MLB file patterns publishes as before, and every error path publishes.
