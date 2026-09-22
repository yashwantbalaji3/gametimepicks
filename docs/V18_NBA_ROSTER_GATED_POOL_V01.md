# v1.8 — Track A1: NBA roster-gated player pool v0.1 (design + receipt)

**Date:** 2026-09-22 · **Branch:** `v18-nba-readiness` · **Registry:** `nba` = `HISTORICAL_ONLY`, `productEligible:false`
— **unchanged**. Everything here is `dataClass PRIVATE_RESEARCH` under `data/internal/research/nba/**` and
`app/src/lib/sports/nba/**`; no public route, `app/public/data`, or product reads it (`public-beta-safety` 6/6,
grep of `src/app` and `public` for the new paths → none).

## 1. What v0 did, measured (not trusted from the receipt)

`buildForecastArtifact` v0 simulates every player who appeared in a box score for the team — the
"appeared for this team" pool. Rebuilt for 2026-10-03 (MIA @ TOR, preseason) at one instant
(`--now 2026-09-22T14:30:00Z`, roster capture `asOf 2026-09-22T14:01:32Z`):

| Side | Roster | v0 simulated | of which no longer rostered | Rostered but invisible to v0 |
|---|---|---|---|---|
| TOR | 19 | 19 | **8** (Brandon Ingram 20.9 min, Mamukelashvili, Gradey Dick, Agbaji, Mogbo, Roddy, Sarr, Rhoden) | **8** (Kawhi Leonard, Kyle Anderson, Jackson-Davis, Jemison, A. Jackson Jr., Bittle, Bradley, Graves) |
| MIA | 20 | 21 | **9** (Kel'el Ware, Jaquez, Powell, Thompson, Madsen, Jakucionis, Achiuwa, Rozier, Dainja) | **8** (Giannis Antetokounmpo, Hardaway Jr., Klay Thompson, Portis, Richards, Hadley, Donaldson, Conwell) |

The v0 Oct 3 forecast is, measurably, for last year's teams. v0 stays exactly as preregistered
(`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §1): its rebuild at the committed `inputAsOf` is
**byte-identical in every `forecast` block and in `ratings`** (checked before this change landed; only the
roster-reconciliation stamp differs because the roster capture moved).

## 2. v0.1 — the rules (`app/src/lib/sports/nba/roster-gated-pool.mjs`, `POOL_VERSION = nba-roster-gated-pool-v0.1`)

| # | Rule | Where it bites | Test / mutation probe (`roster-gated-pool.test.mjs`) |
|---|---|---|---|
| 1 | A simulated player must be on the captured roster as of the forecast instant. Box-score membership is history, not authority. | departed players → `gate.excludedNotOnRoster` (with the minutes v0 would have simulated) | RULE 1: Giannis absent from MIL's pool; **positive control**: v0's `expectedMinutes` for MIL DOES contain him — deleting the gate flips the test |
| 2 | A rostered player with no usable history is present as `INSUFFICIENT_HISTORY`: `expectedMinutes: null`, `rates: null`, never 0, listed in `gate.insufficientHistory`. | rookies / camp invitees | RULE 2: rk1 present with null minutes; **positive control**: v0's pool never lists him — substituting box-score membership flips the test; the sim consumes the gated rows and names him in `excludedNoMinutes` |
| 3 | History is looked up by athlete: same team first, else the team of the last non-DNP appearance (rates travel with the player; minutes are a prior, not a role). `historyBasis` + `historyTeam` recorded; availability re-read under the NEW team. | trades / signings → `gate.otherTeamHistory` | RULE 3: Giannis on MIA with MIL history (34 min), Day-To-Day filed under MIA read; an `Out` under MIA excludes him — old-team history never re-admits |
| 4 | No roster capture → REFUSED. No fallback. A team MISSING or empty in the capture → that team refused (P247 absent-as-zero class). | `gatePool` → `{state:"REFUSED"}`; `buildForecastArtifact({family:"v0.1", rosters:null})` throws; the builder script exits 1 | RULE 4 (three refusals + the artifact-level throw); live: `mv rosters/latest.json` away → `REFUSED … never box-score membership`, exit 1 |
| 5 | Roster freshness: `asOf` after the forecast instant = leakage → `ROSTER_FROM_THE_FUTURE`; older than **48 h** → `ROSTER_STALE` (one missed daily capture tolerated, two not); unknown `asOf` → refused. | `checkRosterFreshness` | RULE 5 (edges: exactly 48 h is inside; 48 h + 1 s is stale) |
| 6 | Two-way status is not exposed by the free source and is never inferred. | no field exists | RULE 6/7 asserts no `twoWay`/`isTwoWay` key |
| 7 | Deterministic ordering (expected minutes desc, athlete id) so the seeded sim consumes uniforms identically. | `rows.sort` | RULE 6/7; live: two `--out` builds `cmp` identical |

A game whose either side refuses is **not simulated**: recorded in `manifest.refused` with `ROSTER_GATE: <reason>`
and `manifest.pool.gamesRefusedByRosterGate`; when every game on a date refuses, the builder exits 1 (the
workflow records the refusal and goes red). Nothing is partially forecast.

Unchanged by design: Elo (`team-rating.mjs`), the minutes model (`nba-minutes-model-v0`, per-player trailing-10
/ season / insufficient), the simulation engine (`nba-preseason-experimental-v0`, `simEngineVersion` in the
artifact), the 240-minute rescale with its 0.5–1.5 bounds. **Only the pool rule moved.** A2 (constrained
minutes / rotation) is where INSUFFICIENT_HISTORY players receive a documented prior; v0.1 does not invent one.

## 3. Artifact family (`experimental-forecast.mjs` `FAMILIES`)

| Family | Pool rule | `modelVersion` | Directory | Ledger |
|---|---|---|---|---|
| `v0` | box-score history (frozen, preregistered) | `nba-preseason-experimental-v0` | `data/internal/research/nba/experimental/` | `experimental/ledger.json` |
| `v0.1` | roster-gated | `nba-preseason-experimental-v0.1` (+ `family`, `poolRule`, `poolVersion`, `simEngineVersion`) | `data/internal/research/nba/experimental-v0.1/` | `experimental-v0.1/ledger.json` (`family` stamped; the grader refuses a ledger of another family) |

`build-nba-experimental-forecasts.mjs --family v0|v0.1 [--out <file>]` · `grade-nba-experimental-forecasts.mjs
--family v0|v0.1` (fetched box scores are looked up across both caches, written only to the grading family's own,
so a game is fetched once). The v0 artifact shape carries **no** new keys. `experimental-forecast.test.mjs` pins
that each family directory holds only its own model version, that every v0.1 side records the roster instant, and
that the two families forecast the same game differently (they are never merged).

## 4. First v0.1 artifact — 2026-10-03, MIA @ TOR (preseason), both families at `--now 2026-09-22T19:00:00Z`

Report: `data/internal/research/nba/reports/pool-v0-vs-v0.1-2026-10-03.json`
(`scripts/nba/compare-nba-pool-versions.mjs`, which refuses artifacts built at different instants).

**Both of the report's inputs are committed paths.** The first version of this comparison read a v0 rebuild from a
session scratchpad (`/private/tmp/.../cmp-v0-2026-10-03.json`) so that the two families shared one instant — the
numbers were right and `asOfMismatch` was correctly `false`, but the receipt cited a file that no longer exists and
nobody could reproduce it from the repository. Both families are now rebuilt at one pinned instant into their own
directories, so the report's `inputs` name two tracked files. The instant had to move to 19:00Z rather than the
committed v0's 12:00Z because the roster capture on disk is stamped 14:01:32Z: building v0.1 at 12:00Z is
`ROSTER_FROM_THE_FUTURE`, which is rule 5 doing its job.

| Quantity | v0 | v0.1 |
|---|---|---|
| Players simulated (both sides) | 40 | **33** |
| Retained across both | — | 23 |
| Departures excluded (were simulated at v0) | — | **17** (192.7 v0-minutes) |
| Arrivals modelled from other-team history | — | **10** (136.8 minutes): TOR Kawhi Leonard (LAC), Kyle Anderson (UTA), Jackson-Davis (GSW), Jemison (NYK), A. Jackson Jr. (MIL) · MIA Giannis (MIL), Hardaway Jr. (DEN), Klay Thompson (DAL), Portis (MIL), Richards (PHX) |
| `INSUFFICIENT_HISTORY` (rostered, no preseason history) | — | **6**: Bittle, Bradley, Graves (TOR) · Hadley, Donaldson, Conwell (MIA) — all rookies (experience 0) |
| Roster coverage (simulated + insufficient) / roster | — | 39 / 39 = **1.00** (every rostered player is accounted for by state) |
| Games refused by the gate · refusal rate | — | 0 · 0.00 |
| Raw pool minutes → rescale factor (TOR / MIA) | 318.0 → 0.755 / 354.8 → 0.677 | 267.8 → 0.896 / 295.0 → 0.814 (closer to 1: fewer phantom minutes to squeeze) |
| Pool-rate substitutions (players without own rates) | 8 | 4 |
| Sim pHome · margin mean ± sd · total mean | 0.589 · 5.2 ± 23.9 · 229.7 | 0.777 · 18.8 ± 24.6 · 227.0 |
| Elo pHome (identical by construction) | 0.6895 | 0.6895 |

Reading, not a judgement. v0.1's sim moves toward Elo on this one game because the two pools differ most on MIA:
v0's MIA pool carried nine departed players worth 99 minutes, which v0.1 replaces with five arrivals worth 71;
TOR loses 94 minutes of departures and gains 66. The margin SD is unchanged (≈24 in both), which is the useful
negative result: **the dispersion problem is not a pool problem** — it stays A3's to solve.

**This is not evidence that v0.1 is better.** It is one preseason game, forecast before it was played, with no
outcome attached. A 0.19 swing in win probability is a measure of how much the pool rule matters, not of which
rule is right. The two ledgers begin separating on Oct 3, and preseason grades are never regular-season evidence.

## 5. Automation (`.github/workflows/sport-schedules.yml`)

- **Order fixed:** the roster capture now runs **before** the experimental step (it ran after it — a v0.1 forecast
  would have read yesterday's roster). Step ids unchanged (`nbarosters`, `nbaexp`); guard tests
  `audits/capture-independence` (13), `launch/schedule-cadence`, `sports/nfl/injuries-reach-boards`,
  `ops/workflow-shell-syntax`, `ops/workflow-failure-visibility`, `soccer/capture-selection` all pass; YAML parses;
  `nbarosters` precedes `nbaexp` (asserted).
- **One step per family, and that matters.** The first version chained all four commands with `&&` —
  `grade v0 && grade v0.1 && build v0 && build v0.1` — and gated a single commit step on `state == 'BUILT'`.
  v0.1 refuses by design whenever the roster capture is missing, stale or newer than the forecast instant; in a
  chain that refusal set `state=FAILED`, and the commit step then **threw away v0's successful forecasts too**.
  v0 is the preregistered family whose forward record this program exists to protect, so a research variant's
  fail-closed must never cost it a day. Each family now grades and builds in its own step, records its own
  refusal string (`NBA experimental forecasts v0` / `… v0.1`), and commits its own directory. v0.1's step carries
  `if: !cancelled()` so it still gets its turn if v0's step ever fails outright, and it reads the instant v0
  published rather than taking a second `date` reading — two families compared at two instants is not a
  comparison. If that instant is missing it refuses rather than inventing one.

## 6. What this does NOT do

- Does not move the registry, touch a public route, or make any claim. Preseason is a separate population; nothing
  graded before Oct 20 is regular-season evidence.
- Does not give INSUFFICIENT_HISTORY players minutes (A2). Does not change dispersion (A3). Does not infer two-way.
- Does not change a single v0 forecast number. v0's 2026-10-03 artifact **is** rebuilt (at the shared 19:00Z
  instant, so the comparison reads two tracked files), and the rebuild was diffed key-by-key against the committed
  12:00Z one: **10 differences, none of them a forecast.** Five are input-provenance stamps that moved because the
  roster and injuries captures on disk were refreshed in the meantime (`roster.asOf`, `inputs.injuries.*`,
  `rosterReconciliation.asOf`); three are the additive manifest labels a family now stamps (`manifest.family`,
  `manifest.poolRule`, `manifest.pool`); two are the same roster stamp inside the manifest. Every probability,
  margin, total, player minute and RNG seed is identical, and the artifact's top level still carries no `family`
  key, which is what makes it adoptable as legacy v0. Its ledger entry is `graded: 0, pending: 1` — nothing
  graded was touched, because there is nothing graded until Oct 3.

## 7. Tests run

`roster-gated-pool` **13/13** · `experimental-forecast` 7/7 (its on-disk guard now covers both families and pins
that a family directory holds only its own model version) · `game-sim` 5/5 · `minutes-model` 5/5 · `roster-parse`
8/8 · `research/nba-research` 5/5 · `public-beta-safety` 6/6 · `ops/workflow-shell-syntax` 6/6 ·
`ops/workflow-script-cwd` 2/2 · `workflow-failure-visibility` 9/9 · `npm run -s lint:scripts` clean. Full
`run-suite.mjs --phase unit`: see §9.

Five of those 13 were added while finishing A1, because three required behaviours had no test and one existing
test was vacuous:

| Added | Pins |
|---|---|
| FAMILY ISOLATION — mismatch both ways | a v0.1 forecast or ledger is refused by the v0 grader and vice versa, by reading the DOCUMENT's `family` / `modelVersion` rather than trusting the directory it sits in |
| FAMILY ISOLATION — unstamped documents | an unstamped ledger is legacy v0 (the family key postdates v0) and is adopted by v0 **only**; v0.1 refuses it, because v0.1 has never existed without its stamps. An unknown family never silently becomes v0 |
| FAMILY ISOLATION — the two families are distinct | directories, model versions and pool rules are pairwise distinct, and v0 keeps the directory it was preregistered in |
| POPULATION LABELS — membership | preseason and regular season resolve to different membership and different appearance dates for a player present in both, **with a positive control that both populations are non-empty** |
| POPULATION LABELS — no borrowed minutes | a rostered player whose only history is preseason is `INSUFFICIENT_HISTORY` under the regular population — null, never 0, never his preseason number — and is listed; with a positive control that the preseason side really did model him |

### 7a. Mutation probes (each applied, run, reverted)

A guard that cannot fail is not a guard. Nine probes against the v0.1 rules, all caught:

| Probe | Result |
|---|---|
| `familyGuard` stops refusing a foreign `family` | caught (1 fail) |
| `familyGuard` stops refusing a foreign `modelVersion` | caught (1 fail) |
| v0.1 adopts an unstamped ledger | caught (1 fail) |
| `INSUFFICIENT_HISTORY` reports 0 minutes instead of null | caught (3 fail) |
| the pool ignores the population (preseason history leaks into regular) | caught (2 fail) |
| a missing / stale roster no longer refuses | caught (3 fail) |
| the 48 h staleness ceiling is dropped | caught (2 fail) |
| a roster captured AFTER the forecast instant is accepted (leakage) | caught (1 fail) |
| v0.1 no longer refuses at the artifact level when rosters are absent | caught (1 fail) |

Two of these were run against the real grader rather than the pure function, to prove the wiring is live and not
just the decision: planting the v0.1 artifact in `experimental/forecasts/` made
`grade-nba-experimental-forecasts.mjs --family v0` print
`REFUSED: … declares family "v0.1", not v0` and **exit 1 with no ledger written**; the reverse planting produced
the `modelVersion` refusal. (The exit code was read from the process, not from a pipeline's `$?`, which reports
`tail`'s status and would have shown 0.)

A first pass of this probe run reported all nine as "caught" while actually proving nothing: the harness passed
`$TESTS` holding two paths to `npx tsx --test`, and zsh does not word-split, so every run received one bogus path,
emitted no TAP output, and the absence of a `# fail` line was scored as success. The harness now refuses a run
that produced zero tests instead of counting it as a catch.

## 8. Gaps found while finishing A1, and what closed them

| Gap | Why it mattered | Closed by |
|---|---|---|
| The grader checked only the **ledger's** family, never the forecast artifact's | the sibling directories are the only thing that kept the families apart, and a path is not a proof. A forecast left in the wrong directory would have been graded into the wrong ledger, whose summary would then average two pool rules into one record — the two-populations-summed defect this project refuses everywhere else | `familyGuard()` in `experimental-forecast.mjs`, called for the ledger **and** for every forecast file; refusal exits 1 before anything is written |
| No test exercised either family-mixing refusal | the requirement existed only in prose | 3 family-isolation tests + 3 probes + 2 live end-to-end plantings |
| The population test was vacuous | the shared `BOX` fixture is regular-season only (`phase: 2`), so a preseason/regular comparison over it had an empty preseason side and asserted nothing | 2 population tests with their own two-phase fixtures and explicit non-emptiness positive controls |
| A v0.1 refusal discarded v0's forecasts | see §5 — the `&&` chain plus a single BUILT-gated commit | one grade+build step and one commit step per family |
| The comparison receipt cited a scratchpad file | see §4 — nobody could reproduce it from the repo | both families rebuilt at one pinned instant into tracked paths |

## 9. Status

Internal research only. NBA stays `HISTORICAL_ONLY`, `productEligible: false`, no public surface, no paid provider.
v0 is untouched as a forecast and keeps its own directory and ledger. v0.1 is **not** claimed to be better than v0
and cannot be until the two ledgers have graded games; the next gate is A2 (constrained minutes), which the
`INSUFFICIENT_HISTORY` rows are waiting for.
