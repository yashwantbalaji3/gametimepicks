# Simulation Theater V2 — ST-01 Architecture and UX Specification

Date: 2026-10-18 (UTC). Status: specification only. No code, no data writes, no deploys.
Builds on: `SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md`, `SIMULATION_THEATER_V0_SPEC_2026-10-17.md`, roadmap `SIM-THEATER-001`.
Fact tags: **[CV]** code-verified on `origin/main` (path:line), **[INF]** inference, **[PROP]** proposal, **[EST]** estimate.

Code base: `origin/main` fetched 2026-10-18 03:34Z. Every `path:line` below was re-read there with `git show` / `git grep`. Paths are relative to `app/src/` unless they start with `app/`, `data/` or `docs/`. Wording rules: nothing here claims GTP is more accurate than any competitor; the drive engine is experimental (held-out winner log loss 0.6468 vs 0.6358 for V1 and 0.6419 vs 0.6343; lower is better, so V2 was worse on both point estimates; no intervals reported; `docs/SIMULATION_ENGINE_V2.md:97-100,128-131` as cited by the feasibility doc). Every effort, size and timing figure is an estimate unless tagged [CV].

### 0. Re-verified facts this spec depends on

| # | Fact | Evidence |
|---|---|---|
| F1 | Engine id `nfl-drive-sim-v2`, version `2.0.0-shadow` | [CV] `lib/sports/nfl/sim-v2/engine.mjs:30-31` |
| F2 | Drive results: `TD, FG, FG_MISS, PUNT, TURNOVER, DOWNS, END_HALF, OPP_TD, SAFETY` | [CV] `engine.mjs:32` |
| F3 | One event per drive: `{q, clockStart, offense, startYardsToGoal, result, plays, netYards, seconds, score:[home,away]}` | [CV] `engine.mjs:416` |
| F4 | `clockStart` is **regulation seconds remaining in the game** (3600 → 0), not the quarter clock; in OT it is the OT clock | [CV] `engine.mjs:202` (`let clock = 3600`), `:416` (`clockStart: inOT ? otClock : clock`) |
| F5 | `q = quarterOf(clockStart)` (thresholds 2700/1800/900), but points are credited to `quarterOf(clockEnd)`; OT points go to period index 4 | [CV] `engine.mjs:43`, `:379-380` |
| F6 | Regulation `clockEnd = clock − dur`; OT `otClock = max(0, otClock − dur)` | [CV] `engine.mjs:379`, `:420` |
| F7 | Possession: default `nextPos = def`; after `OPP_TD` the scoring defense kicks to the **same** offense (`nextPos = pos`); at halftime possession resets to `1 − firstReceiver` | [CV] `engine.mjs:381`, `:399-405`, `:433-440` |
| F8 | OT: sudden death once both teams have possessed or on a defensive score/safety; postseason ties restart a 900 s period | [CV] `engine.mjs:419-428` |
| F9 | A TD score delta includes the try (XP or two-point) | [CV] `engine.mjs:383-394` |
| F10 | `simulation-receipt@2`, `nfl-drive-run@1`, label `REPRESENTATIVE SIMULATED GAME` | [CV] `receipt.mjs:14-16` |
| F11 | `representativeIndices` picks MEDIAN_LIKE, HIGH_SCORING, LOW_SCORING, UPSET by nearest `|total−target|+|margin−target|`, and OVERTIME as the **first** OT run by index; kinds with no candidate are dropped, so **fewer than 5 is possible** | [CV] `receipt.mjs:134-161`, `:146`, `:157-160` |
| F12 | Representatives are re-simulated by index with `players: prep`, but only `final`, `quarters`, `drives` are serialized | [CV] `receipt.mjs:219-237` |
| F13 | `promotionState: "SHADOW"` | [CV] `receipt.mjs:249` |
| F14 | The public route reads receipts from the repo root at build time and is fully static | [CV] `app/nfl/simulation/[eventId]/page.tsx:20,24-25`, `dynamicParams = false` `:47`; `app/next.config.mjs:35-39,52` `output: "export"`, `trailingSlash: true`, `experimental: { cpus: 4 }` |
| F15 | The report shows only 3 of the representatives | [CV] `components/nfl/simulation-v2-report.tsx:241` (`.slice(0, 3)`) |
| F16 | Player-state vocabulary `IDLE, PLAYING, PAUSED, COMPLETED, UNAVAILABLE, ERROR` | [CV] `lib/simulate/presentation/player-machine.mjs:31`, `createPlayer` `:48` |
| F17 | **No NFL team-colour map exists.** `TEAM_COLORS` in `components/team-badge.tsx:40` is NBA/MLB only, keyed by bare abbreviation, and contains `DEN, MIN, MIA, DAL, PHI, IND` with NBA colours. Reusing it for NFL would paint the Broncos in Nuggets colours | [CV] `team-badge.tsx:35-59`, lookup `:115` |
| F18 | Tokens: `--font-display` Geist, `--font-headline` Space Grotesk, `--font-mono` JetBrains Mono, `--bg #0A0705`, `--surface*`, `--lava-text #F5F7F6`, `--lava-text-muted`, `--lava-glow`, `--lava-heat #34D399`, `--lava-danger #F87171`, `--vault-accent-deep #2EA066` ("simulation surfaces"), `--sport-nfl #A78BFA`, `--gtp-card #121A16`, `--gtp-card-shadow` | [CV] `app/globals.css:13,16,17,29-33,145,191,194-201,247-248,460-465` |
| F19 | Existing field art is decorative: `Field` (viewBox 320×190, `aria-hidden`), `GridironGraphic` (300×300, reduced-motion block) | [CV] `components/simulate/scenes.tsx:29`; `components/game/sport-field-graphics.tsx:18,34,40` |
| F20 | `LiveScoreStrip`/`LivePeriodLine` are typed to the live envelope (`envelope: any`); `LiveBadge`/`FreshnessLine` sit beside them | [CV] `components/live/live-primitives.tsx:31,53,78,108,117` |
| F21 | `app/scripts/serve-export.mjs` is the static server for the export (trailing-slash aware, serves the exported 404) | [CV] `app/scripts/serve-export.mjs:1-15` |

Real receipt used throughout (SF home vs WSH away, kickoff 2026-10-20 00:15Z): `data/internal/research/nfl/sim-v2/shadow/2026-10-17/401873008-6da012510c023181.json` [CV]: `simulationReceiptId "nfl-sim-v2:401873008:6da012510c023181"`, `artifactHash "84e555d1a14f0f9c"`, `runCount 10000`, `baseSeed "59520a64"`. Representatives: MEDIAN_LIKE #428 SF 29–21 (19 drives); HIGH_SCORING #35 37–29 (25); LOW_SCORING #195 20–13 (18); UPSET #1107 21–29 (25); OVERTIME #21 27–20 OT (27).

## 1. Scope and honesty contract

### 1.1 What the theater is
A **drive-level playback of one recorded run** of one `nfl-drive-sim-v2` receipt of record. Every frame is a pure function of one `representativeRuns[k]` plus a versioned scene policy. [PROP]

### 1.2 Animation classes

| Class | Elements | Source | Rule |
|---|---|---|---|
| **Recorded (may animate)** | possession side; ball spot at drive start (`startYardsToGoal`) and drive end (derived `fieldEnd`); the drive-progress ribbon; score change at drive end (`score`); game clock and quarter (`clockStart`, derived `clockEnd`, `q`); drive outcome chip (`result`); play count and duration as numbers (`plays`, `seconds`) | `engine.mjs:416` [CV] | Exact values; display formatting only |
| **Illustrative** | the ball's motion *between* start and end spot; camera pan/zoom; the possession-change card (kicks, returns and punt landings are not events, `engine.mjs:394-414` [CV]) | scene policy | Always captioned "movement illustrative"; the motion must not imply individual plays (no per-play pauses, no tick marks per play along the ribbon) |
| **Forbidden** | individual plays or snaps; down and distance (not modelled, `engine.mjs:19-22`); penalties; timeouts; player figures or motion; passer/rusher/scorer names on a drive (not recorded in `nfl-drive-run@1`); any world-model (`nfl-world-model-v2`) value spliced into the sample; live-feed primitives (`LiveBadge`, `FreshnessLine`, F20) | — | Tests fail if any appears (§5 ST2-01, ST2-03) |

`plays` appears only as a number in text ("11 plays"). It is never drawn as 11 hops.

### 1.3 Mandatory labels
- **Persistent scene badge** (top-left of the scene; never hidden, never animated): `SIMULATED · drive-level · movement illustrative · experimental model`.
- **Banner above the theater** (DS-001 rule draft): `Simulated · not a real game · run #428 of 10,000 · experimental engine` (`runIndex`, `runCount`).
- **Sample label:** `REPRESENTATIVE SIMULATED GAME — not the forecast` (`receipt.mjs:16`) plus its `kind` rule text (§2.1).
- **Clock labels:** the game clock reads `SIM CLOCK Q2 4:12`; transport time reads `Playback 1:48 / 4:30`. Never the same label or typographic style.
- **Transition card:** `Change of possession · kick/return not modelled`.
- Share images (if ever made) and the transcript carry the same badge text.

### 1.4 Six-truths separation (audit §7) in the theater

| Truth | Where it appears | Invariant |
|---|---|---|
| Frozen forecast | Its own card in the Evidence tab and the existing canonical card (`simulation-v2-report.tsx:108-116`, per feasibility) | Never computed from a sample; never animated |
| Simulation batch | Distribution tab (`aggregate`, `periodAggregates`, `teamStatDistributions`) | Labelled "10,000 runs · this receipt" |
| Selected world | Score bug, field, timeline, transcript, linescore | Every value resolves to one `runIndex` of one `simulationReceiptId` |
| Scene | Ball path, camera, transitions | `sceneVersion` + separate scene seed; cannot change any outcome |
| Live feed | Not in the theater | No live primitives, no ESPN data, no "LIVE" wording |
| Settlement | A link to the Results surface | Independent of which sample was watched |

Different-engine context (WM2) is excluded by default; if ever shown it follows decision D6 (§8).

## 2. Visual experience

Design intent [PROP]: a broadcast-grade 2D scene in GTP's own dark visual language (lava/vault tokens, F18), with analysis around it. Nothing is reproduced from PropDealer's branding, proportions, imagery, field artwork or layout (audit §6).

### 2.1 Desktop, 1440 px

Content width 1200 px (12 columns, 24 px gutters). Scene column 8 columns (≈784 px), side panel 4 columns (≈392 px).

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Simulated · not a real game · run #428 of 10,000 · experimental engine            [Evidence ↗]│ banner (role=note)
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ SAMPLES [● Median-like 29–21][High-scoring 37–29][Low-scoring 20–13][Upset 21–29][OT 27–20 OT]│ radiogroup, 44 px
│ "Run closest to the batch median total and median margin." · run #428 of 10,000              │
├───────────────────────────────────────────────────────────────┬──────────────────────────────┤
│ ┌──────────────────────── SCORE BUG ───────────────────────┐  │ [ Drive ][ Distribution ][ Evidence ]
│ │ ▌WSH  21        ▌SF  29 ●    │ Q4  SIM CLOCK 0:00 │ FINAL│  │ ── Drive 19 of 19 ─────────── │
│ └──────────────────────────────────────────────────────────┘  │ SF ball · own 12              │
│ ┌ SIMULATED · drive-level · movement illustrative · experimental model ┐ │ 1 play · 61 yds · 0:58│
│ │▓▓│10 │20 │30 │40 │50 │40 │30 │20 │10 │▓▓│                 │  │ Result: end of half           │
│ │▓S│   │   │   │   │   │   │   │   │   │W▓│ ← end zones     │  │ Score after: SF 29 – WSH 21   │
│ │▓F│   ○━━━━━━━━━━━━━━━▶◉       │   │   │S▓│   team colour   │  │                               │
│ │▓▓│   │   │   │   │   │   │   │   │   │H▓│                 │  │ This quarter: list of Q4      │
│ │▓▓│10 │20 │30 │40 │50 │40 │30 │20 │10 │▓▓│                 │  │ drives (buttons → seek)       │
│ └─ ○ start spot  ━ drive ribbon  ◉ ball  ▶ possession arrow ──┘  │                               │
│ DRIVE TIMELINE (one segment per drive, width ∝ playback time) │                               │
│ Q1 ▮▮▮▮▮ │ Q2 ▮▮▮▮▮ │ Q3 ▮▮▮▮ │ Q4 ▮▮▮▮▮   ▲ cursor              │                               │
│ (fill = offense colour; ★ score; ✕ turnover/downs; ⏸ end half)│                               │
│ [⏮][▶][⏭] [1×|2×|4×] ═══●══════════ seek   Playback 3:58 / 4:30   [Transcript]               │ transport 56 px
├───────────────────────────────────────────────────────────────┴──────────────────────────────┤
│ LINESCORE (this run)                     │ BATCH RANGES (10,000 runs, this receipt)          │
│ Team  Q1 Q2 Q3 Q4  F                     │ SF pts p10–p90 · WSH pts p10–p90 · total · margin │
│ WSH    0  7 14  0  21                    │ Team/player lines for this run: "not recorded in  │
│ SF    13  7  3  6  29                    │ nfl-drive-run@1" (no zeros)                       │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ Full drive transcript (HTML <ol>, 19 items)      ▸ Provenance (receipt, hash, seed, engine) │
│ Existing static drive tables and report sections continue below, unchanged                   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Score bug** [PROP]: 64 px pill, `--surface-elevated`, 1 px `--border-strong`, inset top highlight. Each team block has a 6 px leading bar in team primary (§2.5); abbreviation in `--font-headline` 20/24 semibold; score in `--font-mono` 32/36 tabular. Possession: a 10 px ball glyph beside the team with the ball (a shape, not colour alone). Right block: period and `SIM CLOCK` in `--font-mono` 16; state chip `END Q1` / `HALFTIME` / `OT` / `FINAL`. Order away–home, matching the report's `A … H` summary line (`simulation-v2-report.tsx`, after `:241`).
- **Field scene**: 120 × 53.3 yard geometry. End zones in team primary at 85% with the abbreviation set vertically in team ink. Yard lines every 5, numbers every 10 (`--lava-text` 70%), hash marks every yard at 30%. Possession arrow: chevron above the ball pointing at the offense's goal. Ball: 14 px ellipse, white lace stroke, soft drop shadow. Ribbon: a band from the start spot to the current ball spot in offense primary at 55% with a lighter top edge; start spot is a hollow ring.
- **Orientation** [PROP]: fixed for the whole game; home defends the left end zone, so home drives move left → right. Real teams change ends each quarter, but the engine has no field direction; a fixed orientation is the least misleading choice and is stated in the Evidence tab.
- **Drive timeline**: one button per drive, grouped by quarter with 2 px gaps, width ∝ compiled playback duration (§3.4). Fill = offense primary at 40%, current drive 100%. Icons: ★ score (TD/FG/OPP_TD/SAFETY), ✕ turnover/downs, ⏸ end of half. Each button seeks to its drive start; `aria-label` "Drive 7, second quarter, SF, touchdown, SF 14–7".
- **Side panel tabs** (`role=tablist`, roving tabindex):
  - *Drive*: current drive card (offense; start spot in field language, "own 30" / "WSH 42"; plays; net yards; duration; result; score after) and the drives of the current quarter.
  - *Distribution*: batch histograms of total and margin from `aggregate`, with a marker where this run sits; quarter means from `periodAggregates`. Caption "10,000 runs · experimental engine · not the forecast".
  - *Evidence*: receipt id, `artifactHash`, `runIndex`, `baseSeed` + `seedStrategy`, engine + version, `promotionState`, `params.sha256`, `availabilitySnapshotId`, `inputSnapshotIds.forecastReceipt`, selection-rule text, the fixed-orientation note, limitations (`engine.mjs:19-22`; the engine's under-production of 3-point margins and OT, `docs/SIMULATION_ENGINE_V2.md:134` as cited), and the frozen-forecast card.
- **Transport bar**: 56 px row, 44×44 controls. Prev drive, Play/Pause (`aria-pressed`), Next drive, speed segmented control 1×/2×/4× (`radiogroup`), seek `input[type=range]` with `aria-valuetext` "Q2 4:12, drive 9 of 19", playback time, Transcript toggle. Keyboard: Space/K play-pause; ←/→ previous/next drive; Shift+←/→ ±5 s playback; Home/End; 1/2/4 speed.
- **Sample selector**: up to five 44 px chips (`role=radiogroup`) with kind and final score; the rule sentence and run number sit under the strip. Rules, from `receipt.mjs:151-159` [CV]:

  | kind | Rule shown to users |
  |---|---|
  | MEDIAN_LIKE | The run closest to the batch's median total and median margin |
  | HIGH_SCORING | The run closest to the 90th-percentile total at the median margin |
  | LOW_SCORING | The run closest to the 10th-percentile total at the median margin |
  | UPSET | The underdog-wins run closest to the median total and the mirrored median margin |
  | OVERTIME | The first overtime run in the batch by run index (not "typical") |

  Closeness = |total − target| + |margin − target| (`receipt.mjs:146`). "Underdog" = the side not favoured by `hw >= aw` (`receipt.mjs:225`; ties count as home-favoured). If a kind is absent (F11) its chip is not rendered and the strip says "No overtime run in this batch".
- **Below the scene**: this run's linescore from `quarters` (OT column only if `final.overtime`), beside batch ranges. Team and player lines for the run are an explicit absence until ST-03. No zero-filled cells.

### 2.2 Mobile, 390 px (purpose-built portrait sequence)

```text
┌──────────────────────────────┐
│ Simulated · not a real game  │ banner, ≤2 lines
│ run #428 · experimental      │
├──────────────────────────────┤
│ WSH 21     SF 29    FINAL    │ score bug 56 px; sticky while the scene is in view
├──────────────────────────────┤
│ [Median-like 29–21 ▾] #428   │ opens the sample bottom sheet
├──────────────────────────────┤
│ SIMULATED · drive-level ·    │ badge (wraps)
│ movement illustrative · exp. │
│ ▓│  │  │  │  │  │  │  │  │▓ │ field 358 × ≥168 px
│ ▓│  ○━━━━━━━▶◉  │  │  │  │▓ │ numbers every 20 yd
│ ▓│  │  │  │  │  │  │  │  │▓ │
├──────────────────────────────┤
│ ▮▮▮▮│▮▮▮▮│▮▮▮│▮▮▮▮▮  timeline │ 24 px visual, 44 px hit row
├──────────────────────────────┤
│ [⏮]  [ ▶ ]  [⏭]  [1×]  [≡]  │ transport row, 44 px targets
│ ════●═══════════ 3:58 / 4:30 │ seek row, 44 px
├──────────────────────────────┤
│ Drive 19 · SF ball own 12    │ current-drive card
│ 1 play · 61 yds · end of half│
├──────────────────────────────┤
│ [Drive][Distribution][Evidence] → bottom sheets
│ Linescore (own scroll region)│
│ ▸ Full transcript            │
└──────────────────────────────┘
```

- Field minimum height 168 px at 390; numbers every 20 yards; hash marks dropped below 400 px width.
- Speed is one cycling button (1× → 2× → 4×) whose accessible name includes the value; seek has its own row.
- Bottom sheets (sample picker, Distribution, Evidence): `role=dialog`, `aria-modal=true`, focus contained and returned to the opener, drag handle plus a 44 px Close button, max 85 vh with internal scroll. Opening a sheet pauses playback; it resumes only on user action.
- Portrait is complete; landscape just widens the field (no forced rotation).

### 2.3 Mobile, 320 px
- Score bug 52 px: abbreviations and scores on line 1, period and clock on line 2.
- Field minimum height 150 px (≈300 × 150); end-zone abbreviations dropped (colour + score bug carry identity); numbers at 30/50/30 only.
- Transport row: Prev, Play, Next, Speed, Transcript at 44×44: 5 × 44 + 4 × 8 = 252 px ≤ 288 px usable (16 px gutters).
- Badge shortened to `SIMULATED · drive-level · illustrative · experimental` (all four facts kept).
- No horizontal page scroll; the linescore scrolls inside its own `overflow-x: auto` region.

### 2.4 Motion design [PROP; all timings are estimates to tune in ST-02]

Base at 1× (wall-clock ms; 2× and 4× divide all values):

| Event | Duration | Easing | Visual |
|---|---|---|---|
| Drive start | 500 ms | `cubic-bezier(.2,.7,.2,1)` | Ball fades in at the start spot; start ring scales 0.6 → 1; possession arrow flips (180 ms) |
| Drive progress | `clamp(900, 260 × plays, 3200)` ms | `cubic-bezier(.45,.05,.35,1)` | Ball moves along the field line, eased in time; ribbon grows behind it; clock counts down linearly from `clockStart` to `clockEnd` |
| Score (TD/FG/OPP_TD/SAFETY) | 900 ms hold | ease-out | Digit roll (240 ms); scoring team's end zone 85% → 100% for 600 ms; chip "TOUCHDOWN · SF +7" (delta from data, never assumed) |
| Turnover / downs / missed FG | 600 ms hold | ease-out | Chip; arrow flips with a ≤4 px, 120 ms nudge |
| Possession change (non-scoring) | 500 ms | linear | Card "Change of possession · kick/return not modelled"; ball fades out at the end spot and in at the next start spot (no flight arc) |
| End of quarter | 700 ms | — | Chip `END Q1`; timeline gap highlights once |
| Halftime | 1200 ms | — | Chip `HALFTIME`; field dims to 70% |
| OT start | 900 ms | — | Chip `OVERTIME`; OT column appears |
| End of game | 1500 ms, then stop | — | `FINAL`; winner's end zone holds at 100%; state COMPLETED |

- **Camera** (2D only): default is the whole field. During a drive the viewBox may zoom to ≤1.35× and pan to keep the start spot and ball in frame with a 25% margin. It never rotates or tilts, never moves during score holds, returns to full field at quarter breaks, interpolates over ≥400 ms and never moves faster than one field-width per second.
- **Reduced motion** (`prefers-reduced-motion: reduce`, reusing the `matchMedia` listener pattern at `simulation-story.tsx:130-136`, per feasibility): Play steps one drive per 1.5 s (or per Next) with no tweening; camera fixed at full field; no rolling digits, glows or nudges; score changes are instant with a static 2 px outline on the scoring team. No information is conveyed only by motion.
- **No autoplay** in any mode. Nothing flashes more than 3 times per second (WCAG 2.3.1).

### 2.5 Visual polish

- **Depth**: the scene card uses `--gtp-card` with `--gtp-card-shadow`; the field sits in an inset (`inset 0 2px 12px rgba(0,0,0,.45)`, 1 px `--border-strong` frame) under a top vignette in the `--lava-glow` style (F18).
- **Grass**: a procedural SVG `<pattern>` of alternating 5-yard stripes in two dark greens derived from `--vault-accent-deep`, added as a new token pair `--theater-turf-a` / `--theater-turf-b` [PROP], plus an `feTurbulence` grain at ≤3% opacity rendered **once** in the static layer (never per frame). No raster assets.
- **Typography**: `--font-headline` for team names and chips, `--font-label` for labels, `--font-mono` with `font-variant-numeric: tabular-nums` for every number so clock and scores never jitter.
- **Team colours**: none exist for NFL (F17). Proposal: a new sport-namespaced `lib/sports/nfl/team-colors.mjs` (32 × `{primary, secondary, ink}`) from public brand hex codes, the same sourcing statement as `team-badge.tsx:38`, reviewed by the founder (D3). `TEAM_COLORS` must not be reused for NFL because of the abbreviation collisions.
- **Contrast rules**: text on any team surface uses that entry's `ink` at ≥4.5:1 (a unit test over all 32 entries); ball and ribbon edge ≥3:1 against both turf stripes; if the two primaries are within ΔE 20 the away team uses its secondary; unknown teams fall back to `--sport-nfl` (home) and `--lava-text-muted` (away). Possession is never colour-only.
- **Originality**: all artwork is GTP's own geometry and tokens.

## 3. Rendering architecture

### 3.1 Options scored (1 = poor, 5 = best; scores are judgement [INF], sizes are estimates)

| Option | Animation quality | Maintainability | Accessibility | Performance (≤30 moving parts) | Bundle (gzip, est.) | Static-export fit | Total /30 |
|---|---|---|---|---|---|---|---|
| A. SVG only (scene + text in SVG) | 4 | 4 | 3 (text in SVG is awkward for AT; still needs an HTML transcript) | 4 | 5 (~0 KB lib, ~15–25 KB own code) | 5 | 25 |
| B. Canvas 2D only | 4 | 3 (manual hit-testing, DPR handling, text layout) | 2 (opaque bitmap; everything duplicated in HTML) | 5 | 5 (~0 KB lib) | 5 (but no SSR final frame) | 24 |
| **C. Hybrid: SVG scene layer + semantic HTML overlay/shell** | **4** | **5** | **5** (HTML carries all meaning; SVG `aria-hidden`) | **4** | **5** (~18–30 KB own code) | **5** (final frame SSR-able as SVG) | **28** |
| D. WebGL via PixiJS | 5 | 3 | 2 | 5 | 1 (pixi.js ≈ 215 KB, feasibility §1 [OBS]) | 3 (client-only, needs WebGL fallback) | 19 |
| E. CSS-only (DOM + transitions) | 3 | 3 (keyframes hard to seek deterministically) | 4 | 3 (layout thrash risk) | 5 | 5 | 23 |

### 3.2 Recommendation
**Option C: a hand-written SVG scene (static field layer + a small dynamic layer) inside a semantic HTML shell (score bug, labels, tabs, transport, transcript), driven by a pure `stateAt`.** [PROP]
- It is the only option where the server can render the exact final frame and full meaning without JavaScript, so the static fallback is the real scene, not a placeholder.
- The scene has fewer than 30 moving nodes (ball, ribbon, arrow, start ring, chip, camera viewBox), well within SVG's comfortable range; per-frame updates are direct attribute writes via refs, not React re-renders.
- Canvas 2D stays an option *behind the same `SceneState` interface* for ST-05 if a dense play scene ever exists; nothing upstream changes.
- No library: 0 KB of third-party renderer code.

### 3.3 Pure state function
```ts
// lib/simulation-theater/state-at.mjs   [PROP]
type SceneState = {
  sceneVersion: "drive-scene@1";
  receiptId: string; runIndex: number;            // identity echoed on every frame
  t: number; tEnd: number;                         // playback ms
  driveIdx: number; phase: "START" | "PROGRESS" | "RESULT" | "TRANSITION" | "BREAK" | "FINAL";
  phaseProgress: number;                           // 0..1, eased per phase policy
  offense: "home" | "away";
  ballYardsToGoal: number;                         // offense-relative, 0..100
  ballFieldX: number;                              // 0..120 absolute (fixed orientation, home end zone left)
  ribbon: { fromX: number; toX: number } | null;
  score: { home: number; away: number };           // changes only at RESULT of a scoring drive
  period: 1 | 2 | 3 | 4 | 5; periodClock: number;  // seconds on the quarter / OT clock
  chip: null | { kind: string; text: string };
  breakKind: null | "END_Q" | "HALFTIME" | "OT_START" | "FINAL";
  camera: { cx: number; zoom: number };            // zoom ∈ [1, 1.35]
  illustrative: true;
};
export function stateAt(receipt, runIndex, t, opts = { sceneVersion: "drive-scene@1", reducedMotion: false }): SceneState
// = stateAtCompiled(compileTimeline(adaptSample(receipt, runIndex), opts), t)  (both memoised by receiptId|runIndex|sceneVersion|reducedMotion)
```
- Deterministic: no `Date`, no `Math.random`, no DOM access. `t` is clamped to [0, tEnd]. Seek = one binary search over keyframe start times (≤ ~34 × 5 keyframes) + interpolation, so cost is O(log n).
- Quarter clock display: regulation `periodClock = clock − 900 × (4 − period)` with `clock` interpolated from `clockStart` to `clockEnd`; OT shows the OT clock directly (F4, F6). Example from the receipt: `clockStart 3600, q 1` → `Q1 15:00`; `clockStart 1862, q 2` → `Q2 1:02`.
- Reduced motion changes the *compiled* timeline (no PROGRESS tween; each drive is START → RESULT steps), never the outcomes.

### 3.4 Timeline compiler
`compileTimeline(sample, policy) → { keyframes[], tEnd }` [PROP]
- Per drive, emit `START` (500 ms), `PROGRESS` (`clamp(900, 260 × plays, 3200)` ms), `RESULT` (900 ms score / 600 ms stop / 0 ms otherwise), `TRANSITION` (500 ms when the next drive has a different offense or a kick follows), and `BREAK` keyframes when the quarter of `clockEnd` differs from the next drive's `q`, at halftime, at OT start and at the end.
- Policy is versioned (`drive-scene@1`); changing any duration bumps the version and the screenshot baselines.
- Estimated length (est.): 19 drives (MEDIAN_LIKE #428) ≈ 19 × (0.5 + ~1.9 + ~0.6 + 0.5) s + breaks ≈ 70–75 s at 1×; 27 drives ≈ 100 s; the observed extreme of 34 drives ≈ 125 s. A long-form option (D7) could stretch this toward 3–5 minutes.
- Output is plain data, unit-testable, and its hash is part of the determinism tests.

### 3.5 Frame loop and pausing
- One `requestAnimationFrame` loop exists only while state is PLAYING **and** the scene is ≥25% visible (`IntersectionObserver`) **and** `document.visibilityState === "visible"`. Otherwise the loop is cancelled (not throttled); resuming re-anchors the playback clock so no time jumps.
- Each frame: `t += dt × speed` (dt clamped to 100 ms), `s = stateAt(...)`, write attributes only for fields that changed (shallow compare). React state updates at most on drive changes (to update the HTML panel and `aria-live` text), never per frame.
- Speed changes and seeks only change `t`; outcomes come from `stateAt`, so 1×/2×/4× are identical at equal `t`.
- Leaving the page or switching samples cancels the loop and drops the old compiled timeline from the memo (bounded LRU of 5).

### 3.6 Scene RNG
- `sceneSeed = fnv1a32("drive-scene@1|" + simulationReceiptId + "|" + runIndex)` feeding a local mulberry32 in `lib/simulation-theater/scene-rng.mjs` [PROP].
- Used only for cosmetic choices: the ball's lateral lane (y within the middle 40% of the field) so consecutive ribbons do not overlap, and the turf grain offset.
- Never imports or calls the engine's `runRng` (`engine.mjs:47-54`); a test asserts `scene-rng` is the only RNG module the theater imports and that outcome fields are identical with two different scene seeds.

### 3.7 Component tree and file layout [PROP]
```text
app/src/lib/simulation-theater/
  adapter-nfl-sim-v2.mjs        receipt → TheaterManifest + TheaterSample[] (build time, node-free core)
  validate.mjs                  §4.3 rules; returns {ok, errors[]} per sample
  timeline.mjs                  compileTimeline
  state-at.mjs                  stateAt / stateAtCompiled
  scene-rng.mjs                 fnv1a32 + mulberry32 (cosmetic only)
  format.mjs                    clock, field-position language ("own 30"/"WSH 42"), transcript sentences
  transport-machine.mjs         player-machine.mjs vocabulary + time cursor, speed, seek
  *.test.mjs                    one per module
app/src/lib/sports/nfl/team-colors.mjs   (D3; separate PR)
app/src/components/simulation-theater/
  TheaterSection.tsx            server component: banner, sample strip (links), SSR final-frame SVG, transcript, noscript
  TheaterIsland.tsx             "use client"; loaded with next/dynamic(() => import(...), { ssr: false }) on first interaction
    ScoreBug.tsx  SampleSelector.tsx  FieldScene.tsx (StaticField + DynamicLayer)
    DriveTimeline.tsx  Transport.tsx  SidePanel.tsx (DriveTab, DistributionTab, EvidenceTab)
    BottomSheet.tsx  LiveAnnouncer.tsx
  Transcript.tsx                server-renderable <ol>, shared by SSR and island
  theater.module.css            tokens only (no new colours except the turf pair and team map)
```
- **Lazy island on the existing static route** (D2): `TheaterSection` renders inside `simulation-v2-report.tsx` above the existing drive tables. The island chunk is requested on the first Play/sample/seek interaction or when the section is within 1 viewport (IntersectionObserver prefetch), so other routes and the first paint of this route ship 0 theater JS.
- Data reaches the island as props from the server component (≈16 KB raw for five samples, feasibility §5.2), so playback makes 0 network requests.
- **Static fallback**: without JavaScript the page shows the banner, a server-rendered SVG of the **final** frame (final score, last drive ribbon), the linescore and the full transcript; `<noscript>` says "Playback needs JavaScript. Every drive is listed in the transcript below." The sample strip falls back to anchors to each sample's transcript.

### 3.8 Accessibility model
- Scene SVG `aria-hidden="true"`; all meaning lives in HTML.
- `LiveAnnouncer` (`aria-live="polite"`) announces once per drive result ("SF touchdown. SF 10, WSH 0. Q1 7:47") and at breaks; never per frame; silent while seeking until the seek settles (250 ms).
- The transcript is the equivalent of the scene: one item per drive, generated only from recorded fields, e.g. drive 1 of run #428: "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0".
- Focus order: banner → samples → score bug (static text) → transport → timeline → side panel → linescore → transcript. Visible focus ring ≥3:1. No keyboard traps except inside open sheets (Escape closes).

## 4. Data integration

### 4.1 Real receipt structure (code-verified)
- Top-level keys of the example receipt [CV]: `aggregate, artifactHash, availabilitySnapshotId, away, baseSeed, calibration, eventId, eventStart, generatedAt, home, inputSnapshotIds, marketReceiptId, marketUse, modelVersion, params, periodAggregates, playerStatDistributions, promotionState, representativeRuns, runCount, runSchemaVersion, schemaVersion, scoringEventDistributions, seedStrategy, simulationEngine, simulationEngineVersion, simulationReceiptId, sport, teamStatDistributions, validation`.
- `aggregate` keys [CV]: `margin, marginHistogram, overtimeProbability, score, total, totalHistogram, winProbability`; `periodAggregates` is an array; `params` = `{file, sha256, trainingWindow}`; `inputSnapshotIds` = `{forecastReceipt, roleShares, availability, params}`.
- `seedStrategy` [CV]: "per-run mulberry32 seeded by splitmix(baseSeed, runIndex); baseSeed = fnv1a64(engine|eventId|inputHash)".
- `representativeRuns[k]` = `{label, kind, runIndex, final:{home, away, overtime}, quarters:{home[5], away[5]}, drives[], note}` (`receipt.mjs:228-236`) [CV]. Index 4 of `quarters` is OT.
- Drive event (`engine.mjs:416`) [CV], first four drives of MEDIAN_LIKE #428 verbatim:
  ```json
  {"q":1,"clockStart":3600,"offense":0,"startYardsToGoal":70,"result":"FG","plays":11,"netYards":28,"seconds":165,"score":[3,0]}
  {"q":1,"clockStart":3435,"offense":1,"startYardsToGoal":68,"result":"PUNT","plays":4,"netYards":-1,"seconds":64,"score":[3,0]}
  {"q":1,"clockStart":3371,"offense":0,"startYardsToGoal":73,"result":"TD","plays":6,"netYards":73,"seconds":204,"score":[10,0]}
  {"q":1,"clockStart":3167,"offense":1,"startYardsToGoal":75,"result":"PUNT","plays":6,"netYards":21,"seconds":240,"score":[10,0]}
  ```
  `offense` 0 = home (SF), 1 = away; `score` = `[home, away]` after the drive, try included (F9). `3600 − 165 = 3435` shows `clockStart[i+1] = clockStart[i] − seconds[i]` within a half.
- Half and OT edges [CV, same receipt]: run #428 drive with `{"q":2,"clockStart":1862,...,"result":"END_HALF","seconds":62}` ends the half exactly at 1800 (`dur = halfSec`, `engine.mjs:230-232`); OVERTIME #21 ends `{"q":4,"clockStart":331,...,"result":"FG","seconds":331,"score":[20,20]}`, then `{"q":5,"clockStart":600,"offense":1,...,"result":"PUNT"}` and `{"q":5,"clockStart":495,"offense":0,...,"result":"TD","score":[27,20]}`.
- Scoring states: points only on `TD` (+6 and try +1/+2 to offense), `FG` (+3), `OPP_TD` (+6, XP +1, to defense), `SAFETY` (+2 to defense); `FG_MISS`, `PUNT`, `TURNOVER`, `DOWNS`, `END_HALF` score 0 (`engine.mjs:383-410`). A scoring drive keeps its result even when time expires (`engine.mjs:230-232`).

### 4.2 Adapter contract (`TheaterSample v1`) — every field mapped [PROP]

| Field | Source | Notes |
|---|---|---|
| `receiptId`, `receiptHash` | `simulationReceiptId`, `artifactHash` | identity on every frame |
| `engine` | `simulationEngine`@`simulationEngineVersion` | must equal `nfl-drive-sim-v2` |
| `status` | `promotionState` | `SHADOW` → "experimental" |
| `runId`, `kind`, `label` | `runIndex`, `kind`, `label` | |
| `selectionRule` | static text per `kind` (§2.1) | `selectionDistance: null` — reason "not stored in simulation-receipt@2" |
| `seed` | `{baseSeed, seedStrategy}` | display only |
| `teams` | `home{abbr,name}`, `away{abbr,name}` | sides normalised to `"home"`/`"away"` |
| `finalScore`, `periodScores` | `final`, `quarters` | |
| `events[i].kind` | constant `"DRIVE_SUMMARY"` | `PLAY_SIMULATED` reserved for ST-04 |
| `events[i].period` | `drives[i].q` | 5 = OT |
| `events[i].clockStart` | `drives[i].clockStart` | game-seconds remaining (regulation) or OT clock |
| `events[i].clockEnd` | derived: `max(0, clockStart − seconds)` | engine's own `clockEnd` is 0 for every OT drive (`:379`); the adapter uses the OT clock |
| `events[i].scorePeriod` | derived: OT → 5, else `quarterOf(clockEnd)` | matches the engine's point crediting (F5) |
| `events[i].offense` | `drives[i].offense` → `"home"`/`"away"` | |
| `events[i].fieldStart` | `startYardsToGoal` | offense-relative |
| `events[i].fieldEnd` | derived: `TD` → 0; `SAFETY` → 100; else `startYardsToGoal − netYards` | flag if outside [0,100] |
| `events[i].plays`, `netYards`, `seconds`, `outcome` | as recorded | |
| `events[i].scoreBefore` / `scoreAfter` | `drives[i−1].score` or `[0,0]` / `drives[i].score` | |
| `events[i].participants` | `null` — "not recorded in nfl-drive-run@1" | |
| `teamStats`, `playerStats` | `null` — same reason | ST-03 |
| `downDistance`, `penalties`, `kickReturn` | `null` — "not modelled by nfl-drive-sim-v2" (`engine.mjs:19-22`) | permanently null for this engine |
| `forecastRef` | `inputSnapshotIds.forecastReceipt` | `forecastHash: null` — "not stored" |
| `inputCutoff` | `availabilitySnapshotId` | string; no separate cutoff timestamp exists |
| `scene` | `{geometryClass: "illustrative", sceneVersion: "drive-scene@1", sceneSeed}` | |
| `unavailableFields[]` | list of every null above with its reason | rendered in the Evidence tab |

### 4.3 Validation (runs at build time in the adapter and in unit tests over every receipt on main) [PROP]
1. **Engine identity**: `simulationEngine === "nfl-drive-sim-v2"`, `schemaVersion === "simulation-receipt@2"`, `runSchemaVersion === "nfl-drive-run@1"` (or a later version the adapter explicitly supports). Reject any object carrying world-model markers (`nfl-world-model-v2-simulation` engine id, `sampledWorlds`, or a WM2 file path) — the test feeds a real WM2 artifact and expects `ENGINE_MISMATCH`.
2. **Score reconciliation**: `drives[last].score` = `final`; each delta is in the allowed set for its result (TD: offense +6/+7/+8, defense 0; FG: +3; OPP_TD: defense +6/+7; SAFETY: defense +2; else 0); Σ deltas grouped by `scorePeriod` = `quarters` for both sides; `final.overtime` ⇔ any `q === 5`.
3. **Clock monotonic**: within a half `clockStart[i+1] === clockStart[i] − seconds[i]`; the first drive of the second half starts at 1800; `clockStart` never increases within regulation; OT drives decrease from the OT start (600 regular season; 900 per restarted postseason period, F8); `seconds ≥ 5` except a drive cut by the clock.
4. **Possession**: `offense[i+1] = 1 − offense[i]` with documented exceptions: (a) after `OPP_TD` the same offense receives (F7); (b) the first drive of the second half is `1 − drives[0].offense` (F7); (c) the first OT drive may be either side, because OT possession is a coin flip (`pos = rng() < 0.5 ? 0 : 1`, `engine.mjs:441-447` [CV]); (d) after a postseason OT period ends tied, the engine restarts a 900 s period with `continue` and no change of `pos` (`engine.mjs:426` [CV]), so the same offense may drive again — accepted only when `q === 5` and the previous drive ended the OT clock. Any other repeat fails. Regular-season OT may end tied (`engine.mjs:427`, `tie` in the return at `:452`); a tied `final` is valid only when `final.overtime` is true.
5. **Field**: `1 ≤ startYardsToGoal ≤ 99`; derived `fieldEnd` within [0, 100]; `TD` requires `netYards === startYardsToGoal` (holds in the excerpt: 73/73).
6. **Count**: 1–5 representatives, unique `kind`s; zero is a fail.

**Dry run of rules 2–5 over main (read-only `jq`, 2026-10-18 03:44Z) [CV]:** 168 receipts × 5 = 840 representatives (each kind present 168 times); 0 with last-drive score ≠ `final`; 0 with per-quarter sums (credited by `quarterOf(clockEnd)`, OT → index 4) ≠ `quarters`; 0 regulation clock gaps (allowing the 1800 s second-half start); 0 same-offense repeats outside the OPP_TD / second-half / OT exceptions; 0 field violations (start outside 1–99, or TD with `netYards ≠ startYardsToGoal`). Drives per representative range **11–34** (the feasibility doc's 16–27 is narrower than what main now holds). This was a quick script check, not the ST2-01 test suite; it did not yet verify that the second-half receiver equals `1 − drives[0].offense`.
7. **Fail-closed UI states**: `ENGINE_MISMATCH` or `SCHEMA_UNSUPPORTED` → the whole theater is replaced by an absence card ("Playback unavailable for this receipt: <reason>"), the existing report stays; a single invalid sample → its chip is disabled with the reason, others play; never substitute another receipt or another run; no zero-filled numbers. The build never fails for one bad receipt; the unit test over all receipts does fail CI.

### 4.4 Future ST-03 player stats (recording change, forward-only) [PROP]
- **Change in `receipt.mjs`**: at the representative re-simulation (`:219-237`) serialize what is already computed in `scratch.team` and `scratch.players` as a new versioned field `boxScore` (`box-score@1`) and bump `runSchemaVersion` to `nfl-drive-run@2`: `{team:{home:{25 TEAM_FIELDS}, away:{…}}, players:[{playerId, side, stats:{12 PSTAT}}], other:{home, away}, firstTd}`. For time sync, add a parallel `driveStats[i]` array (sparse per-drive player deltas and `scorer{playerId,type}`), recorded by the engine **without consuming RNG**. `drives[]` stays byte-identical, so v1 consumers are unaffected.
- **Panel sync**: with `driveStats`, the Players tab shows cumulative lines through the current drive (Σ deltas ≤ `driveIdx`) and highlights the scorer of a scoring drive; without it, it shows the full-game line labelled "full-game line for this run (not synced to playback)".
- **Reconciliation**: Σ players + `other` = team per stat (`coherence.mjs:20-75` contract); Σ `driveStats` = `boxScore`; TD/FG counts in `boxScore.team` equal counts of drive results; first-TD scorer equals the first TD drive's scorer.
- **Invariance test**: for identical inputs, every receipt field other than the new ones is byte-identical with the recorder on and off.
- **Historical receipts stay unchanged** (write-once); they show "Player lines were not recorded for this receipt". Any backfill is a separate verified sidecar (feasibility §6 Phase 3b).

### 4.5 Missing data contracts
| Missing | Needed for | Status |
|---|---|---|
| NFL team-colour map | end zones, ribbon, score bug | none exists (F17); new file, D3 |
| `forecastHash`, `engineCommit`, `selectionDistance` in the receipt | provenance completeness | null with reason until stored (later receipt version) |
| An input-cutoff timestamp distinct from `availabilitySnapshotId` | Evidence tab | string only today |
| OT opening possession recorded on the event | validation rule 4c | coin flip in code (`engine.mjs:445`); not stored as a field, so the theater cannot say "won the toss" |
| Punt/kick landing and return spots | transition art | not modelled; transition stays a card |
| Per-drive participants / scorer | player highlights | ST-03 `driveStats` |
| `sceneVersion` registry and baseline policy | determinism tests | defined in ST2-03 |
| DS-001 "Simulated · not a real game" banner rule | banner | draft text §1.3; DS-001 owner |

## 5. Implementation plan

All efforts are **estimates** for one experienced engineer. Each row is one small PR, mergeable on its own, local-only until the release task. Order: adapter and validation → accessible shell and transcript → timeline engine → renderer → polish → mobile → verification → (separately approved) public island.

### 5.1 ST-01 remaining design deliverables (documentation only)

| ID | Deliverable | Files | Depends | Effort (est.) | Acceptance |
|---|---|---|---|---|---|
| ST1-01 | ADR: engine = `nfl-drive-sim-v2`; route (D2); P242 position (D1); fixed field orientation | `docs/adr/<n>-simulation-theater-drive-engine.md` | founder D1, D2 | 0.5–1 d | Founder sign-off recorded |
| ST1-02 | DS-001 label lexicon: banner, badge, sample label, clock labels, transition card, absence copy | `docs/UX_DESIGN_STANDARDS.md` (DS-001 section) | ST1-01 | 0.5 d | Every string in §1.3 and §4.3.7 has an approved final form |
| ST1-03 | NFL team-colour table proposal with computed contrast ratios and collision pairs | doc appendix | D3 | 0.5 d | All 32 teams ≥4.5:1 ink; collision list |
| ST1-04 | High-fidelity mockups at 1440/768/390/320 for 6 states (pre-play, drive in progress, score, possession change, halftime, final) and the 3 absence states | design files (original art) | ST1-02 | 1.5–2 d | Founder approves; no PropDealer-derived art |
| ST1-05 | Motion tuning sheet (§2.4 table) with reduced-motion variant | doc appendix | ST1-04 | 0.5 d | Founder approves timings |
| ST1-06 | Correct COMP-001 §6.2 and the v0 spec's "out of scope: playback" (feasibility §2 rows 18–19) | those docs | ST1-01 | 0.25 d | Wording reviewed |
| | **Total ST-01 remaining** | | | **3.75–4.75 d (est.)** | |

### 5.2 ST-02 tasks

| ID | Task | Files (under `app/src/`) | Depends | Effort (est.) | Acceptance tests |
|---|---|---|---|---|---|
| ST2-01 | **Adapter + validation.** `adaptSample`, `validate` per §4.2–4.3, including exceptions 4a–4d | `lib/simulation-theater/adapter-nfl-sim-v2.mjs`, `validate.mjs`, tests | ST-01 sign-off | 1.5–2 d | Over every receipt on main (168 at feasibility time × ≤5 reps): rules 1–6 pass; `final` and `quarters` reproduced from drives; a real WM2 artifact → `ENGINE_MISMATCH`; mutated fixtures (swapped score, clock gap, double possession, unknown result) each fail with the right code; nulls carry reasons |
| ST2-02 | **Accessible shell + transcript** (SSR, no client JS): banner, sample anchors, final-frame static SVG, linescore, transcript, noscript, absence card | `components/simulation-theater/TheaterSection.tsx`, `Transcript.tsx`, `lib/simulation-theater/format.mjs`; `app/preview/simulation-theater/[eventId]/page.tsx` (`guardInternalRoute()`, noindex) | ST2-01 | 1.5–2 d | Transcript sentence snapshot for run #428 drive 1 equals "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0"; route absent from the pruned export; axe 0 serious/critical; page works with JS disabled |
| ST2-03 | **Timeline engine**: `compileTimeline`, `stateAt`, `scene-rng`, transport machine (player-machine vocabulary + `t`, speed, seek) | `lib/simulation-theater/{timeline,state-at,scene-rng,transport-machine}.mjs`, tests | ST2-01 | 1.5–2 d | Determinism (§6.3); `stateAt(t=tEnd)` score = `final`; score changes only at RESULT keyframes; seek cost O(log n) (unit benchmark ≤1 ms per call in Node, est.); scene seed change leaves all outcome fields identical; no `Math.random`/`Date` in the module (lint test) |
| ST2-04 | **Renderer + island**: `FieldScene` (static + dynamic layers), `ScoreBug`, `DriveTimeline`, `Transport`, rAF loop, IntersectionObserver/visibility pause, `next/dynamic` island | `components/simulation-theater/*` | ST2-02, ST2-03 | 2–3 d | Loop not running when paused/hidden/off-screen (Performance panel: 0 rAF callbacks over 10 s); keyboard map §2.1 works; 0 theater JS on other routes (chunk diff); 0 playback requests |
| ST2-05 | **Side panel**: Drive / Distribution / Evidence tabs; `LiveAnnouncer` | `components/simulation-theater/SidePanel.tsx` etc. | ST2-04 | 1–1.5 d | Evidence lists every `unavailableFields` reason; announcer fires once per drive result and not during seek; tab pattern passes keyboard test |
| ST2-06 | **NFL team colours** + contrast unit test | `lib/sports/nfl/team-colors.mjs` + test | D3, ST1-03 | 0.5–1 d | 32 entries; ink ≥4.5:1; `team-badge.tsx` untouched; fallback path tested |
| ST2-07 | **Polish**: turf pattern, depth, motion table, score celebrations, reduced-motion variant | `FieldScene.tsx`, `theater.module.css`, `timeline.mjs` policy | ST2-04, ST2-06 | 1.5–2 d | Screenshot baselines for the 6 states at 1440; reduced-motion run has no tweened frames; no flashing >3/s |
| ST2-08 | **Mobile** 390/320: portrait sequence, sticky bug, bottom sheets, cycling speed | components above | ST2-07 | 1.5–2 d | No horizontal overflow at 320/390/768; all controls ≥44×44; sheets trap/return focus; baselines at 390 and 320 |
| ST2-09 | **Verification pass**: budgets and local plan §6 | `app/e2e/simulation-theater.spec.ts` (local), perf notes in PR | ST2-08 | 1–1.5 d | All §6.1 budgets met or the PR states the gap; 5 cold + 5 warm runs recorded |
| ST2-10 | **Public island** on `/nfl/simulation/[eventId]/` (separately approved; replaces `.slice(0, 3)` with all representatives) | `components/nfl/simulation-v2-report.tsx`, `app/nfl/simulation/[eventId]/page.tsx` | ST2-09, founder release approval | 2–3 d | Existing page sections unchanged except the added section; one code-merge build; Production check of 3 events |
| | **Total ST-02** | | | **14–20 d (est.)**; local MVP ST2-01…09 = 12–17 d | |

The ST-02 total is above the roadmap's 6–10 d local MVP estimate because it now includes the broadcast-polish (ST2-07), team colours (ST2-06) and mobile-specific (ST2-08) work the founder asked for; this is an estimate, not a measurement.

## 6. Visual-performance targets and local verification

### 6.1 Budgets (targets, not measurements)

| Item | Ceiling | Target |
|---|---|---|
| Theater JS on the route | ≤120 KB gzip (audit §8) | ≤30 KB gzip (feasibility §7); no third-party renderer |
| JS added to any other route | 0 bytes | 0 (chunk-manifest diff vs baseline) |
| Inline sample data | ≤20 KB raw HTML for 5 samples | ≈16 KB (feasibility §5.2 [OBS]) |
| Playback network requests | 0 | 0 |
| Seek to correct state | p95 ≤100 ms | p95 ≤16 ms desktop |
| Frame rate | 60 FPS desktop / 30 FPS mid-range phone | frame-time p95 ≤20 ms desktop, ≤40 ms phone (audit §8) |
| Work while paused or hidden | no rAF, no timers | 0 callbacks over a 10 s idle trace |
| Memory | no monotonic growth across 20 sample switches | JS heap after switch 20 within +5% of switch 1 (after GC) |
| CLS | ≤0.1 | ≤0.02 (island reserves its height; SSR final frame has the same box) |
| Build overhead | ≤5% wall time and peak memory vs identical baseline (audit §8) | ≤2%; adapter runs once per event page |

### 6.2 Local verification plan (localhost only)
1. `next build` (static export to `app/out`) with internal routes enabled for the preview route, then serve with `node app/scripts/serve-export.mjs` on localhost (F21). No Vercel preview.
2. Playwright (`app/playwright.config.ts`, `app/e2e/`) at 1440, 768, 390 and 320 px: no horizontal overflow (`scrollWidth ≤ clientWidth`); controls ≥44×44 (bounding boxes); screenshot baselines for the 6 states × 4 widths, rendered at fixed `t` via a test-only `?t=` seek hook on the preview route (never on the public route).
3. Keyboard: full tab order (§3.8), every shortcut, sheet focus trap/return, zero traps elsewhere. Screen reader: VoiceOver (Safari) manual pass reading banner → sample → score → controls → transcript; announcer cadence.
4. `prefers-reduced-motion: reduce` emulation (`page.emulateMedia({ reducedMotion: "reduce" })`): no tweened frames (sample `stateAt` phases), no autoplay, stepped Play.
5. Performance traces in Chrome DevTools: 60 s playback at 1× and 4×, idle 10 s paused, 10 s hidden tab, 20 sample switches; record frame-time p95, long tasks, heap snapshots. CPU throttle 4× and a fixed network profile as the "mid phone" proxy, plus one real mid-range phone if available.
6. 5 cold + 5 warm runs per measurement; report median and worst (with n = 5, "p95" is effectively the worst observation; say so).
7. Bundle: compare `.next` chunk sizes and the route's gzip JS against a `main` baseline build on the same machine.

### 6.3 Determinism tests
- For every representative on main: `stateAt(r, k, t)` at 200 fixed `t` values is identical (deep-equal, and a hash of the series) whether reached by (a) playing at 1×, (b) 2×, (c) 4×, (d) seeking forward, (e) seeking backward, (f) reload; tested in Node with a simulated clock (no browser needed).
- Reduced-motion timeline: the sequence of (driveIdx, score, period, clockEnd) at each RESULT equals the normal timeline's.
- Changing `sceneSeed` changes only cosmetic fields (lane, grain).
- `compileTimeline` output hash is pinned per `sceneVersion`; a policy change must bump the version.

## 7. Cost controls
- **Localhost-first**: all development and review on `claude/*` branches and localhost (`COST-001`); only `main` and `preview/**` deploy (`app/vercel.json:5-9` `git.deploymentEnabled`: `main` true, `preview/**` true, `**` false [CV]); never push `preview/**`; no Vercel preview deploys.
- **0 new data writes**: nothing under `app/public/data`; receipts stay in `data/internal/research/nfl/sim-v2/shadow/**`; the adapter runs at build time inside the existing page (F14).
- **0 new workflows**, no paid services, no new scheduled jobs, no request-time compute, no polling.
- **Feature flag = route**: build under `/preview/simulation-theater/[eventId]/` (pruned from the export, `app/scripts/prune-internal-routes.mjs:41` [CV]) and unlinked; the move to `/nfl/simulation/[eventId]/` is the release (ST2-10), needing founder approval and one code-merge build.
- **Build-time overhead**: ≤2% target / ≤5% ceiling on `next build` wall time and peak memory against the same baseline data (the build is already memory-sensitive: `experimental.cpus: 4`, F14). Validation is linear in drives (≈100–135 events per receipt).
- **Known freshness gap** stays a separate decision (#1124); the theater adds no trigger of its own.

## 8. Open design decisions for founder approval (8)
1. **D1 — P242.** Does a playback in which every frame maps to a recorded `nfl-drive-sim-v2` drive event (with illustrative motion labelled) fall outside the 2026-09-07 retirement of staged animation as "ceremony"? Recommended: yes, with the §1 contract.
2. **D2 — Route.** Lazy island on `/nfl/simulation/[eventId]/` (recommended: same engine, already experimental-framed) vs a new route vs `/nfl/game/[eventId]/` (rejected by this spec: that page's sample games come from WM2).
3. **D3 — Team colours.** Approve a new NFL-only colour map from public brand hex codes for end zones, ribbons and the score bug, or stay neutral (GTP tokens only, team identity by text). `team-badge.tsx` is not reused either way.
4. **D4 — All five representatives** with their rule text, including the OVERTIME pick described as "first OT run by index", replacing the current three (F15).
5. **D5 — Fixed field orientation** (home end zone left all game) vs swapping ends each quarter (realistic, but not something the engine models).
6. **D6 — World-model context.** Whether to show the WM2 distribution beside the drive-engine sample. Allowed only as a separately labelled, different-engine panel ("Different model: World Model V2 · not the engine of this replay"), never joined to the run, never sharing a scoreboard, chart axis or player row. Recommended: not in ST-02.
7. **D7 — Playback length.** ~45–125 s at 1× for 11–34 drives (drive-weighted, est.) vs a long-form 3–5 minute mode.
8. **D8 — ST-03 recording.** Approve `nfl-drive-run@2` (`boxScore` + `driveStats`, forward-only, recorder-invariance test) so a synced player panel can follow; historical receipts unchanged.
