# Simulation Theater V2: technical feasibility (NFL)

- **Date:** 2026-10-18 (UTC). **Type:** read-only research. No build, test, commit, push, PR, deploy or setting change was made.
- **Code base:** `origin/main` @ `6de21842dd` (2026-10-18 00:39Z), read with `git show` and `git grep`. Live Hub V2 was read from PR #1082 (OPEN).
- **Inputs:**
  - the competitive audit `~/Downloads/competitor-audit.md` (its screenshots were not available, so they are cited by description only);
  - `SIMULATION_THEATER_V0_SPEC_2026-10-17.md` and `COMP-001-PROPDEALER-COMPETITIVE-ANALYSIS.md` (#1116 branch, not on main);
  - the #1116 roadmap copy and `docs/cost/BUILD_INPUT_COVERAGE_AUDIT_2026-10-17.md` (#1116 branch).
- **Evidence labels:**
  - **[CODE]** read on `origin/main` at the cited `path:line`.
  - **[OBS]** an observation recorded by another document or a live page; not re-measured here.
  - **[INF]** inference or proposal. Every effort or size figure marked "est." is an estimate.
- **Wording rules:**
  - Nothing here claims GTP is more accurate than any competitor.
  - Nothing claims billed savings.
  - For log loss and Brier score, lower is better.

---

## 1. Executive summary

1. **GTP already has a drive engine that is public as a static table.** `nfl-drive-sim-v2` (`app/src/lib/sports/nfl/sim-v2/engine.mjs:2-13`) records one event per drive (`:416`). Each receipt keeps 5 representative runs with full drive logs (`receipt.mjs:218-237`). `/nfl/simulation/[eventId]/` already renders three of those logs as tables (`components/nfl/simulation-v2-report.tsx:238-257`). [CODE] Both the audit and COMP-001 missed this page. COMP-001 §6.2 says "no drive data or engine", which is now wrong.
2. **Every one of the 168 receipts on main has drive logs** (`schemaVersion simulation-receipt@2`, `nfl-drive-run@1`, 10,000 runs, 5 representatives, 16–27 drives each). None of them has per-run player lines. [CODE, counted with `jq` over `data/internal/research/nfl/sim-v2/shadow/**`]
3. **The same-world player box score is computed and then thrown away.** Each representative run is re-simulated with `players: prep` into `scratch.players` (`receipt.mjs:223,227`), but only `final`, `quarters` and `drives` are serialized (`:228-236`). Keeping it is a recording change, not new modelling. [CODE]
4. **The WM2 "five sample games" on `/nfl/game/<id>/` cannot be animated.**
   - WM2 draws the final score from a normal distribution first and decomposes it afterwards (`world-model-v2/engine.mjs:6-21`). It has no drives, clock or event order.
   - Its sampled worlds come from a different engine and different run indices than sim-v2. For SF–WSH 401873008: WM2 world #8 is 18–28; sim-v2 MEDIAN_LIKE run #428 is 21–29. [CODE]
   - Joining the two is forbidden: player IDs share the `nfl-athlete-<espnId>` format, but the worlds do not match.
5. **A drive-level MVP needs no new data.** A build-time adapter over the existing receipt of record (`public-receipt.mjs:44-60`) can feed a pure `stateAt(t)` SVG renderer. That means 0 new commits, 0 new files under `app/public/data`, and 0 new build triggers. [INF]
6. **Freshness gap today:** the shadow receipts sit outside `BUILD_INPUTS` (`app/scripts/vercel-ignore-build.sh:124-134`).
   - [OBS] #1116 measured 4 stale windows in 14 days (8–29 min) where Production served an older receipt of record.
   - Open PR #1124 ("DO NOT MERGE — founder approval") would add the path at about +0.29 builds/day.
7. **Model status must travel with every frame.** sim-v2 is `promotionState: "SHADOW"` (`receipt.mjs:249`) and is shown as experimental.
   - On held-out games its winner log loss was 0.6468 vs 0.6358 for V1 (A) and 0.6419 vs 0.6343 (B). Lower is better, so V2 was worse on both (`docs/SIMULATION_ENGINE_V2.md:97-100,128-131`).
   - These are point estimates; no interval is reported. Motion must never be presented as evidence of quality.
8. **No rendering library is needed for the MVP.** `app/package.json` has no d3, pixi, three, framer-motion or gsap [CODE, via subagent]. Hand-written SVG keeps the theater bundle around ≤30 KB gzip (est.).
   - pixi.js 8.6.6 is 214.9 KB gzip; three 0.170.0 is 171.2 KB gzip [OBS, bundlephobia, whole package]. Either alone would exceed the audit's 120 KB budget.
9. **The "five-chapter story" is aggregate narration, not playback.** Its chapters are event, outcome, distribution (conditional), limits and closing (`lib/simulate/presentation/nfl.ts:74-155`). It is mounted at `app/nfl/game/[eventId]/page.tsx:362`. Its pure player reducer (`player-machine.mjs:31-48`) and reduced-motion handling can be reused.
10. **Feasibility verdict:**
    - **Drive view:** feasible now, from existing receipts (MVP about 6–10 engineering days, est.).
    - **Same-world player panel:** feasible forward-only after a small producer change (about 5–8 days, est.). Backfilling past receipts only if reconstruction is proven byte-exact.
    - **Simulated plays:** not feasible without a new play/rules model (NFL-002 research; 4–8+ weeks, est., outcome uncertain).
    - **Cinematic:** not feasible honestly until play-level output exists. Building it over drives would be decoration.

## 2. Audit and companion docs vs. repo reconciliation

| # | Claim (source) | Verdict | Evidence |
|---|---|---|---|
| 1 | sim-v2 `engine.mjs` is drive-based (audit §7) | Confirmed | `engine.mjs:2-13`, `:30` `NFL_SIM_V2_ENGINE="nfl-drive-sim-v2"` |
| 2 | Saved drive fields: quarter, start clock, offense, start yards-to-goal, result, plays, net yards, seconds, score (§7) | Confirmed | `engine.mjs:416`. `score` is `[home, away]`; `offense` 0 = home, 1 = away (`simulation-v2-report.tsx:252`) |
| 3 | Excludes downs/distance, penalties, timeouts, play clock, kick returns, kicker, weather (§7) | Confirmed | `engine.mjs:19-22`. Unexplained yardage is noted at `:362-365` |
| 4 | Shadow/experimental, not a replacement (§7) | Confirmed | `receipt.mjs:249`; validator forbids self-claimed PUBLIC (`:298`); `docs/SIMULATION_ENGINE_V2.md:137-141` |
| 5 | `simulation-receipt@2`, `nfl-drive-run@1`, selected representatives (§7) | Confirmed | `receipt.mjs:14-16`; rule-based picks MEDIAN_LIKE / HIGH_SCORING / LOW_SCORING / UPSET / OVERTIME (`:133-161`) |
| 6 | Representatives have no per-sample player box score (§7) | Confirmed, with an addition | Not serialized (`receipt.mjs:228-236`), but computed during the re-simulation (`:223,227`) |
| 7 | Public selector needs pre-kickoff data and fails closed (§7) | Confirmed | `public-receipt.mjs:44-60`; `MIN_PUBLIC_RUNS=10000` (`:20`) |
| 8 | GTP has no field playback (§5) | Confirmed | No animation library; staged animations are DORMANT under P242 (`presentation-player.tsx:3-7`, `simulation-animation.tsx:6`) |
| 9 | NFL report: five-chapter story with Play/Pause (§5) | Confirmed, with a nuance | Chapters at `nfl.ts:74,87,114,146,155`; the distribution chapter only appears when the total median is finite. Controls at `simulation-story.tsx:171-177` |
| 10 | 10,000-run distributions, player ranges, five sample games (§5) | Confirmed | `build-nfl-world-model-v2.mjs:197-217`; explorer mounted at `page.tsx:553-557` |
| 11 | Do not splice WM2 box scores onto sim-v2 drives (§7) | Confirmed and required | Different engines (`world-model-v2/engine.mjs:6-14` vs `sim-v2/engine.mjs:4-12`), run indices and side order: WM2 index 1 is home (`build-nfl-world-model-v2.mjs:208`); sim-v2 side 0 is home |
| 12 | Static export, unoptimized images, trailing slash; Next 14.2.15 / React 18.3.1 (§8) | Confirmed | `next.config.mjs:35-39`; `package.json:50-52`; `experimental.cpus: 4` (`:52`) |
| 13 | "Theater v0 spec not located" (§1) | Stale | Exists on #1116: `docs/research/SIMULATION_THEATER_V0_SPEC_2026-10-17.md`; roadmap `SIM-THEATER-001` (#1116 copy, §2A) |
| 14 | GTP lacks a drive/possession view (§5 gap table) | Stale / incomplete | `/nfl/simulation/[eventId]/` is public (`app/nfl/simulation/[eventId]/page.tsx:1-12`) with drive tables, linked from the game page (`page.tsx:751`, `simulation-v2-link.tsx:11-13`) |
| 15 | Sample games described as a "real game" need clearer copy (§5) | Confirmed | `game-explorer.tsx:3`, `:74` "A real game from this run" |
| 16 | JAX 62.1% vs 57.5% forecast/world discrepancy shown (§5) | Mechanism confirmed; values not re-checked | `forecastOfRecord` and `game.disagreement` (`build-nfl-world-model-v2.mjs:229-242`) |
| 17 | Roadmap on main has 2,803 lines (§1) | Confirmed | `origin/main:GAMETIMEPICKS_MASTER_ROADMAP_V2.md` (2,803) |
| 18 | COMP-001 §6.2: NFL event traces "❌ (no drive data or engine)"; theater needs NFL-002 | Corrected | sim-v2 is NFL-002 rung 4 ("Possession/drive process", reviewed, not promoted; roadmap main §8 `NFL-002`). Drive data: `drives-v1.json.gz` from nflverse pbp (`scripts/research/nfl/extract_pbp_drives.py:3-13`) |
| 19 | v0 spec: NFL drives "only after a drive engine (NFL-002)"; NFL source = WM2 `sampledWorlds` | Corrected | The drive engine exists. WM2 worlds have no order, so drive playback must use sim-v2 receipts |
| 20 | v0 spec: WM2 published copy is already a build input | Confirmed | It sits under `:(top)app/` (`vercel-ignore-build.sh:125`) |
| 21 | Shadow workflow and builder: "never public" / "nothing public reads these receipts" | Stale comments | `.github/workflows/nfl-sim-v2-shadow.yml:7-11`; `build-nfl-sim-v2-shadow.mjs:18-19`. Contradicted by the founder's §7c decision of 2026-10-05 (`docs/SIMULATION_ENGINE_V2.md:176-185`) |
| 22 | MLB keeps no per-inning linescore or event log (COMP-001 §6.1) | Confirmed | `lib/mlb/full-game/engine.ts:99-108`; one RNG stream per game (`simulate.ts:152,182`) |
| 23 | Live Hub V2 is preview only | Confirmed | PR #1082 is OPEN and contains no field, possession or down-distance code [CODE, via subagent] |

## 3. Reusable inventory

| Asset | Path | What it gives | Gaps |
|---|---|---|---|
| Drive engine | `lib/sports/nfl/sim-v2/engine.mjs:176-453` | One coherent game per run; drive events through an optional `events` array (`:416`); per-run team (`:164`) and player (`:111`) buffers | No participants on drive events; no downs, penalties, returns or punt spot |
| Per-run RNG | `engine.mjs:47-54`; `simulate.mjs:34` | Run *i* is reproducible on its own (`runRng(baseSeed, i)`) | Receipt stores thetas rounded to 4 dp (`receipt.mjs:260`), so reconstruction must re-run `calibrate` |
| Coherence contract | `sim-v2/coherence.mjs:20-75` | Points = scoring events, quarters sum to the final, player sums = team sums, first-TD scorer | Per-run only; no drive-level checks (score deltas vs result) |
| Receipt and validator | `sim-v2/receipt.mjs:166-312` | Batch identity, `artifactHash` (`:284`), representatives, validator | No forecast hash, engine commit or selection distance |
| Receipt of record | `sim-v2/public-receipt.mjs:44-66` | Latest before kickoff, fail-closed, never an older substitute | Reads from the repo root at build, outside `BUILD_INPUTS` |
| Public sim page | `app/nfl/simulation/[eventId]/page.tsx:43-77`; `simulation-v2-report.tsx` | Experimental framing (`:94-106`), canonical card (`:108-116`), drive tables (`:238-257`), provenance (`:260-280`) | Shows 3 of 5 representatives (`:241`); static only |
| Internal preview | `app/preview/simulation-v2/page.tsx` (guard `:87`) | Pattern for a pruned internal route | Reads a legacy `<eventId>.json` path |
| Internal-route pruning | `scripts/prune-internal-routes.mjs:41` (`ops`, `preview`, `launch`); `lib/internal-route-guard.ts` | `/preview/**` is 404 in Production and deleted from `out/` | A data sweep refuses runtime-assembled `/data/` URLs (`:14-25`) |
| Player machine | `lib/simulate/presentation/player-machine.mjs:31-48` | Pure states (IDLE, PLAYING, PAUSED, COMPLETED, UNAVAILABLE, ERROR) and actions | Chapter-indexed; no time axis, speed or seek |
| Story controls | `simulation-story.tsx:130-136,171-177`; `story-controls.mjs:14-36` | Reduced-motion listener (no auto-advance), `describeBars` text equivalents, `aria-live` article | Chapters only |
| Field art | `components/simulate/scenes.tsx:29,66` (`Field`, viewBox 320×190); `components/game/sport-field-graphics.tsx:18-60` (`GridironGraphic`, reduced motion at `:34`) | Token-coloured yard lines and end zones; `aria-hidden` | Decorative: no ball-spot or possession props |
| Score strip | `components/live/live-primitives.tsx:78-127` | `LiveScoreStrip`, `periodParts`, `LivePeriodLine` | Typed to the live envelope. `LiveBadge`/`FreshnessLine` (`:31,:53`) must **not** appear in a sim |
| Live lifecycle (PR-only) | `lib/live/v2/event-view.mjs:22-42` (#1082) | Status-vocabulary pattern | Real-feed states; the theater needs its own READY / PLAYING / PAUSED / ENDED |
| ESPN NFL adapter | `lib/live/adapters/espn-nfl.mjs:86-94` | `downDistance`, `possessionTeamId`, `yardLine` text | Live truth only; a sim must not use the same namespace |
| Tokens and DS-001 | `app/globals.css:71,86,145,460` (`--vault-gold`, `--vault-text`, `--sport-nfl`, `--gtp-card`); `docs/UX_DESIGN_STANDARDS.md` | Colours, 44 px targets, breakpoints, probability wording | No "simulated, not a real game" banner rule yet (COMP-001 R1) |
| WM2 explorer | `components/nfl/forecast/game-explorer.tsx` | Roving-tab sample chooser, avatars, logos | Different engine; reuse the UI pattern, never the data |
| MLB | `lib/mlb/full-game/engine.ts:357-428`; `components/mlb/mlb-simulations-section.tsx:16-52` | Later reuse of shell and contract | No trace. The shared RNG stream needs replay or buffering; `rng.ts:16` imports `node:crypto`, so it is not client-safe |

## 4. Missing capabilities and dependencies

| Capability | What must exist | Kind |
|---|---|---|
| **Drive MVP** | (a) adapter `receipt → TheaterManifest/TheaterSample` (§5); (b) derived `clockEnd = clockStart − seconds` (regulation seconds remaining; OT uses its own 600 s clock, `engine.mjs:416`); (c) `fieldEnd = startYardsToGoal − netYards` (TD → 0; SAFETY → 100); (d) `scoreBefore` taken from the previous drive; (e) an explicit "transition not modelled" step between drives (punt landing, return and kickoff are not events: `engine.mjs:394-414`); (f) all five representatives exposed; (g) a DS-001 banner rule | UI + adapter (data). No model work |
| **Same-world player panel** | A receipt run-schema bump to `nfl-drive-run@2` that serializes per representative: `team` (25 `TEAM_FIELDS`, `engine.mjs:164`), sparse `players[{playerId, side, stats{12 PSTAT}}]` plus `OTHER`, and `firstTd`. Per-drive `scorer{playerId, type}` and `passer` recorded **without consuming RNG**. Validator checks: Σ players = team per `coherence.mjs` | Data (producer recording); no model change |
| Historical backfill (optional) | Re-run `calibrate` → `runBatch` from pinned inputs (forecast receipt, `role-shares-v1/current.json@<ts>` from git history, availability snapshot, params sha256), then require byte-equality of `final`, `quarters` and `drives` with the stored representative before attaching players. On mismatch: no player panel for that receipt | Data; verification-heavy |
| **Play-level engine** | Down, distance and field state; play type and participants; completion/sack/turnover/penalty rules; clock with timeouts and two-minute logic; kicks and returns; tries; OT rules; held-out evaluation. Source: nflverse pbp (already reduced at `extract_pbp_drives.py`, labelled CC BY 4.0 there; licence to be re-confirmed) | Model + data (NFL-002 research) |
| **Cinematic rendering** | Coordinate conventions, original assets, motion templates, quality tiers, a separate scene RNG, an opt-in loader | UI; blocked on play-level output |

## 5. Architecture proposal

### 5.1 Contract (adapter at the engine edge; field names map to the real receipt)

```text
TheaterManifest v1                               ← sim-v2 receipt of record (public-receipt.mjs)
  contract            "theater-manifest@1"
  sport               "NFL"
  gameId              receipt.eventId
  scheduledStart      receipt.eventStart
  generatedAt         receipt.generatedAt
  inputCutoff         receipt.availabilitySnapshotId          (string; no separate cutoff field exists)
  forecastRef         receipt.inputSnapshotIds.forecastReceipt  (path; forecastHash: null + reason until stored)
  receiptId           receipt.simulationReceiptId              receiptHash  receipt.artifactHash
  receiptFile         rec.file (data/internal/research/nfl/sim-v2/shadow/<date>/<id>-<hash>.json)
  engine              receipt.simulationEngine @ simulationEngineVersion; paramsSha256 receipt.params.sha256
  anchorModel         receipt.modelVersion.forecastModel; anchors receipt.calibration.anchors
  batchId             receipt.simulationReceiptId              runCount receipt.runCount
  status              "experimental" (promotionState SHADOW|EXPERIMENTAL; never "validated")
  fidelity            "drive"
  samples[]           runId = representativeRuns[k].runIndex; kind = .kind;
                      seed = {baseSeed: receipt.baseSeed, strategy: receipt.seedStrategy};
                      selectionRule = text of representativeIndices (receipt.mjs:151-159); selectionDistance: null (not stored)
  sources[]           {dataset:"nflverse pbp → drive-params", sha256: params.sha256, license:"CC BY 4.0 (per extract script)"}
  limitations[]       engine.mjs:19-22 + report :277-280 wording

TheaterSample v1 (drive)                         ← representativeRuns[k]
  batchId, runId, kind, label = representativeRuns[k].label ("REPRESENTATIVE SIMULATED GAME")
  finalScore          {home, away, overtime} = .final
  periodScores        {home[5], away[5]} = .quarters  (index 4 = OT)
  teamStats / playerStats   ABSENT, unavailableReason "not recorded in nfl-drive-run@1"
  events[i]           id "<runId>:<i>", sequence i, kind "DRIVE_SUMMARY",
                      period = drives[i].q (5 = OT), clockStart = .clockStart, clockEnd = derived,
                      offense = .offense (0 → home, 1 → away; normalised to abbr),
                      fieldStart = .startYardsToGoal, fieldEnd = derived, plays = .plays,
                      netYards = .netYards, outcome = .result (RESULTS, engine.mjs:32),
                      scoreBefore = drives[i-1].score | [0,0], scoreAfter = .score ([home, away]),
                      participants: ABSENT; provenance "engine"
  scene               {geometryClass:"illustrative", sceneVersion, sceneSeed: null (deterministic, no RNG)}
```

The adapter must also:
- normalise every side index to named `home`/`away`, because sim-v2 and WM2 order sides differently;
- reject a sample whose summed `scoreAfter` deltas or quarters do not reproduce `final`.

### 5.2 Data layout and loading

- **MVP and public drive view:** no files under `app/public/data`.
  - The page reads the receipt at build time (as `page.tsx:24-25` already does) and passes `TheaterSample[]` as props or inline JSON.
  - Measured size: a representative run is about 3.2 KB raw and 740 B gzip; five come to about 16 KB raw (SF–WSH receipt). So zero playback requests are needed.
- **If a fetched layout is ever needed** (more samples, or play-level data): use `app/public/data/nfl/theater/<eventId>/<receiptHash>/<runIndex>.json`, content-addressed and written only by the generation commit that writes the receipt.
  - The HTML must name each URL literally, because the prune data sweep refuses runtime-assembled `/data/` paths (`prune-internal-routes.mjs:14-25`).
- **Lazy loading:**
  - Server-render the summary, the final-state SVG and the full transcript.
  - Load the animated client component with `next/dynamic` on first Play.
  - Ship no renderer code on unrelated routes.

### 5.3 Renderer

- `stateAt(sample, t, sceneVersion) → {driveIdx, phase, ballYardsToGoal, possession, score, gameClock, period}` is a pure function.
  - The timeline is built from drives with a versioned duration policy (e.g. weight ∝ plays, clamped).
  - Seek, pause, 1×/2×/4× speed and reload all resolve through `stateAt`. With 16–27 drives, no checkpoints are needed.
  - Score changes only at drive end. The ball moves linearly from `fieldStart` to `fieldEnd` and is labelled "illustrative". No intermediate plays are drawn.
- **SVG** (hand-written, about 0 KB of library) plus a `requestAnimationFrame` loop that stops when paused, hidden or off-screen. Canvas 2D would only be considered for a later dense play scene.
  - pixi.js (214.9 KB gzip, MIT) and three (171.2 KB gzip) [OBS, bundlephobia, whole-package] are rejected for the MVP.
- **Reduced motion:** stepped drive-by-drive with no tweening (`matchMedia` pattern, `simulation-story.tsx:130-136`).
- **Transcript:** an HTML `<ol>` of drives using templated sentences from fields only, e.g. "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0". It is the accessible equivalent; the SVG is `aria-hidden`.
- **Transport:** reuse the `player-machine.mjs` state vocabulary, extended with a time cursor. Controls are 44 px (DS-001).

### 5.4 Six kinds of truth, mapped to GTP artifacts

| Truth | GTP source | Invariant in the theater |
|---|---|---|
| Frozen forecast | `data/internal/nfl/forecast-receipts/**` (receipt `inputSnapshotIds.forecastReceipt`); canonical card (`simulation-v2-report.tsx:108-116`) | Shown only in its own labelled card; never derived from a sample |
| Batch | sim-v2 receipt `aggregate`, `periodAggregates`, `playerStatDistributions` | Its distribution sits beside the sample at all times |
| Selected world | `representativeRuns[k]` (`runIndex`, `kind`) | Every number shown resolves to one `runIndex` of one `simulationReceiptId` |
| Scene | Theater `sceneVersion` | Cannot change outcomes; no RNG |
| Live feed | `lib/live/adapters/espn-nfl.mjs` | Never inside the theater; no `LiveBadge` or freshness text |
| Settlement | `data/internal/nfl/settlement/**`, Results ledger | Independent of which sample was watched; linked, not embedded |

## 6. Phased milestones (efforts are estimates for one experienced engineer)

**Phase 0: reconciliation and ADR (1–2 days).**
- Scope: an ADR choosing sim-v2 as the theater engine and `/nfl/simulation/[eventId]/` as its home; correct COMP-001 §6.2 and v0 spec §"Out of scope"; draft the DS-001 banner rule; founder decision on P242.
- Files: `docs/adr/…`, `docs/research/*` (docs only; 0 builds if merged with docs-only content).
- Exit: founder sign-off on the engine, the route and P242.
- Does NOT: touch `app/`.

**Phase 1 (MVP): drive theater on one NFL game, local preview only (6–10 days).**
- Scope: adapter and validator; `stateAt`; SVG field; transport; transcript; reduced motion; five-sample chooser; explicit absences.
- Files likely touched:
  - `app/src/lib/sports/nfl/sim-v2/theater-adapter.mjs` (+ `.test.mjs`)
  - `app/src/lib/theater/state-at.mjs` (+ test)
  - `app/src/components/theater/{drive-theater,field-svg,transport,transcript}.tsx`
  - `app/src/app/preview/simulation-theater/[eventId]/page.tsx` (`guardInternalRoute()`, noindex)
- Run with `NEXT_PUBLIC_INTERNAL_ROUTES=1 next dev` locally.
- Exit gate:
  - **Adapter invariants:** the adapter reproduces `final` and `quarters` from drives for all 840 representatives (168 receipts × 5).
  - **Determinism:** `stateAt` returns identical output across speed, seek and reload.
  - **Layout and accessibility:** 320/390/768/1440 with no overflow; keyboard-only operation.
  - **Budgets:** theater JS ≤ 30 KB gzip (est. budget); zero playback network requests.
- Does NOT: modify receipts, add public routes, touch `/nfl/game`, use WM2 data, or deploy (a `claude/*` branch never deploys: `vercel.json` `"**": false`).

**Phase 2: public drive theater on `/nfl/simulation/[eventId]/` (3–5 days, after founder approval).**
- Scope: lazy client island above the existing drive tables; all 5 representatives; the banner "Simulated · not a real game · run #N of 10,000 · experimental engine".
- Files: `simulation-v2-report.tsx`, `app/nfl/simulation/[eventId]/page.tsx`.
- Exit: the Phase 1 gates, plus Production verification. The release is one code-merge build.
- Does NOT: change the canonical game page, picks or eligibility, or promote sim-v2.

**Phase 3: same-world player panel, forward-only (5–8 days).**
- Scope: `nfl-drive-run@2` recording (§4), validator extension, a player panel with columns *batch range* (`playerStatDistributions`) | *this run*, and drive scorer highlights.
- Files: `sim-v2/engine.mjs` (record only), `receipt.mjs`, `coherence.mjs`, tests, adapter, panel.
- Exit gate:
  - For identical inputs, everything except `representativeRuns` is byte-identical with the recorder on and off.
  - Representative `final`, `quarters` and `drives` are unchanged.
  - Σ player = team in every serialized run.
- Does NOT: backfill old receipts (receipts without player lines show "player lines not recorded for this receipt"), or join to WM2.

**Phase 3b (optional): verified backfill (3–5 days).** Reconstruct per §4. A receipt is attached only on a byte-exact drive match, in a separate sidecar; the write-once receipt is never edited.

**Phase 4: play-level NFL model (research; 4–8+ weeks, uncertain).**
- Owned by `NFL-002` (rung 4 successor). Needs preregistered held-out evaluation.
- The theater gains `kind: "PLAY_SIMULATED"` only after the model gate passes.
- Does NOT: interpolate plays from drives.

**Phase 5: 2.5D or cinematic (3–6 weeks after Phase 4, est.).** Opt-in loader, original assets, quality tiers, explicit "movement is illustrative" labelling. Not committed scope.

## 7. Vercel cost controls

- **Today's cadence [CODE, `git log origin/main --since=2026-10-04`]:**

  | Item | Last 14 days |
  |---|---|
  | All commits on main | 1,688 |
  | Commits touching build inputs (per-commit, so it overstates per-push builds) | 1,237 |
  | `auto: nfl event window` commits | 110 |
  | sim-v2 shadow commits | 40 (168 receipts; one receipt ≈ 47–53 KB raw, ≈ 8.9 KB gzip) |

  - WM2 public files (30 files, 1.46 MB total, about 48–57 KB each) changed in 39 commits. All of them were event-window commits that already build.
  - [OBS] #1116 measured a baseline of about 78 Production builds/day.
- **Will theater data add builds?**
  - Phases 1–2 derive everything from receipts at build time: **0 new commits and 0 new triggers**. The only builds are the code merges themselves (1 per approved merge).
  - Phase 3 adds fields inside the same write-once receipt in the same shadow commit (`nfl-sim-v2-shadow.yml:51-60`): **0 new commits**. Size grows by about 10–15 KB raw per receipt (est.).
  - **Do not** write theater JSON to `app/public/data` from the shadow workflow. That would make every shadow commit (about 2.9/day) a build input in its own push, landing about 70–85 s after the event-window commit (observed from commit times).
- **Piggybacking:**
  - Keep the generation in `nfl-sim-v2-shadow.yml` (runs after `nfl-event-window` via `workflow_run`, `:16-20`).
  - If a public file is ever needed, emit it from `nfl-event-window.yml`'s existing commit (`:606-611`), next to the WM2 build at `:449`.
- **Freshness:** the receipt-of-record staleness (4 windows, ≤29 min, [OBS]) is a decision about #1124, not new theater cost. Without it, a receipt written just before kickoff can miss Production during a quiet period.
- **Payload budgets (targets):** 5 samples inline ≤ 20 KB raw HTML; theater JS ≤ 30 KB gzip; manifest fields ≤ 2 KB; 0 requests during playback; Phase 3 player lines ≤ 4 KB raw per run.
- **No request-time compute:** static export (`next.config.mjs:35`). No API route, simulation, LLM narration or polling in the browser.
- **Local preview, not preview deploys:**
  - Only `main` and `preview/**` deploy (`app/vercel.json` `git.deploymentEnabled`).
  - Work on `claude/*` branches, never push `preview/**`, and develop under `/preview/` (pruned from the export, `prune-internal-routes.mjs:41`).
  - The feature flag is the route location itself: moving from `/preview/` to `/nfl/simulation/` is the release.

## 8. Risks and honesty rules

1. **Illustrative vs tracked.**
   - Every scene says "Drive-level simulation · movement between drive start and end is illustrative · not tracking data".
   - Possession changes between drives say "kick/return not modelled".
2. **No invented plays.** `plays` is a count. The theater never draws individual snaps, downs, penalties or player credits from a drive record.
3. **No cross-engine splicing.**
   - The adapter accepts one `simulationReceiptId` per view.
   - A test must fail if a WM2 artifact (`nfl-world-model-v2-simulation`) ever reaches the theater.
   - Shared player-ID formats make this an easy mistake.
4. **Experimental status carried through.** `promotionState` and the existing caveat ("not shown to be more accurate", `simulation-v2-report.tsx:101-103`) appear on the scene, any share image and the transcript.
5. **Motion does not validate the model.**
   - No copy may tie playback to accuracy.
   - Held-out winner log loss for V2 was higher (worse) than V1 in both tests, as point estimates without intervals. Any comparative claim needs an interval excluding 0.
6. **Representative ≠ forecast.** Keep the receipt label "REPRESENTATIVE SIMULATED GAME … not the forecast" (`receipt.mjs:16,235`). Show the batch distribution beside the sample, and show the rule text for each `kind`.
7. **Write-once integrity.** Never rewrite receipts (`nfl-sim-v2-shadow.yml:56-59` already refuses). Backfill goes only into separate verified sidecars.
8. **The P242 precedent.** The founder retired staged animation as "ceremony". The defence is that every frame maps to a recorded engine event; Phase 0 must get that confirmed explicitly.
9. **Engine biases visible in playback.** The engine under-produces 3-point margins (8.0% vs 14.9%) and overtime (3.2% vs 5.4%) (`docs/SIMULATION_ENGINE_V2.md:134`). Watching many games could surface these; list them under limitations.

## 9. Roadmap placement (no edit made; draft text only)

- **Home:** `# 2A. Post-launch tracked items (competitive and simulation)` → `## SIM-THEATER-001 — Simulation Theater` (#1116 copy; not on main until #1116 merges).
- **Dependencies by exact heading on `origin/main`:**
  - `## NFL-002 — Benchmark ladder` (rung 4, possession/drive process = sim-v2; Phase 4 owner)
  - `## UX-001 — Shared Sport Hub` → `#### DS-001 — shared design standards` (banner rule, 44 px)
  - `## COST-001` and `## COST-002` under `# 3A`
  - `### WorldReceipt` under `# 3`, and `## CONTRACT-001` under `# 5` (manifest identity)
  - `## LIVE-002 — L2 visual Game Center` (shared field primitives later; never mixed with sim)
  - `## RESULTS-001` (settlement link)
  - `# 23. Founder decisions — locked direction` ("Localhost-first/Vercel release control")

Draft addition to `SIM-THEATER-001`:

> **v1 — Drive Theater (NFL, sim-v2).** Status: PROPOSED; not authorized. Evidence: `docs/research/SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md`. Corrects v0's "out of scope: playback": NFL drive playback is honest when every frame maps to a recorded `nfl-drive-sim-v2` drive event (receipt `representativeRuns[].drives`, 168/168 receipts). The WM2 `sampledWorlds` stay a static explorer (no event order). Phases: 0 ADR + P242 confirmation → 1 local `/preview/simulation-theater` MVP → 2 lazy island on `/nfl/simulation/[eventId]/` → 3 `nfl-drive-run@2` same-world player lines (forward-only, recorder-invariance test) → 4 play-level model under `NFL-002` → 5 optional 2.5D. Cost: 0 new data commits or build triggers through Phase 3; code merges only; no preview deploys. Gates: same-run identity, adapter reproduces finals/quarters, reduced-motion + transcript equivalence, ≤30 KB gzip JS, experimental label on every frame, no cross-engine data. Depends: `NFL-002`, DS-001, `COST-001`, `CONTRACT-001` WorldReceipt, decision on #1124.

## 10. Open questions for the founder

1. Does a replay in which every frame is a recorded sim-v2 drive event fall outside the 2026-09-07 P242 retirement of staged animation?
2. Should the theater live on `/nfl/simulation/[eventId]/` (the sim-v2 page; recommended) rather than `/nfl/game/[eventId]/`, given that the game page's five sample games come from a different engine (WM2)?
3. Approve `nfl-drive-run@2` (persist representative team and player lines and drive scorers) forward-only? Should the 168 historical receipts get player panels only through byte-exact verified reconstruction, or never?
4. Merge #1124, so receipts of record reach Production without the observed 8–29 min staleness, at a measured cost of about +0.29 builds/day?
5. Fund a play-level NFL model under `NFL-002`, knowing realistic plays need weeks of research and their own preregistered evaluation, and that a cinematic layer depends on it?
6. Show all five representatives (the page currently shows three, `simulation-v2-report.tsx:241`), each with its selection-rule text?
