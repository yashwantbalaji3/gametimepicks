# Simulation Theater V2 — ST-01 Architecture and UX Specification

**Version: v1.1 (2026-10-18).** v1.0 was commit `ae8ee0aa7b`; v1.1 applies the independent review's corrections S1–S18.

> **This is still a specification. Implementation is NOT approved.** The founder's 2026-10-18 approval covers Theater V2 as a **P1 planning** objective only (direction and planning). No ST-02 code may start until ST-01 sign-off (decision D1, §8). Nothing in this document authorizes a build, a data write or a deploy.

Date: 2026-10-18 (UTC). Status: specification only. No code, no data writes, no deploys.
Builds on: `SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md`, `SIMULATION_THEATER_V0_SPEC_2026-10-17.md`, roadmap `SIM-THEATER-001`.
Reviewed by: `SIMULATION_THEATER_V2_ST01_REVIEW_AND_DECISIONS_2026-10-18.md` (cited as **REVIEW §n**).
Fact tags: **[CV]** code-verified on `origin/main` (path:line), **[DATA]** a read-only reconciliation over all receipts on `origin/main`, **[INF]** inference, **[PROP]** proposal, **[EST]** estimate.

Code base: `origin/main` fetched 2026-10-18 03:34Z for v1.0. **v1.1 re-verification:** every technical rule changed by S1–S18 was re-read on `origin/main` @ `05c9deea4f` (fetched 2026-10-18) with `git show`; the engine, receipt and shadow-builder files are unchanged since v1.0 (their last commits predate it), so their line numbers stand. Two cited UI files shifted and are updated in place (F15, F17). Paths are relative to `app/src/` unless they start with `app/`, `data/` or `docs/`. Wording rules: nothing here claims GTP is more accurate than any competitor; the drive engine is experimental (held-out winner log loss 0.6468 vs 0.6358 for V1 and 0.6419 vs 0.6343; lower is better, so V2 was worse on both point estimates; no intervals reported; `docs/SIMULATION_ENGINE_V2.md:97-100,128-131` as cited by the feasibility doc). Every effort, size and timing figure is an estimate unless tagged [CV] or [DATA].

### v1.1 changelog (2026-10-18)

Source of every item: REVIEW §3 (defects table), with detail in REVIEW §2. "Re-verified" means the rule was re-read on `origin/main` @ `05c9deea4f` for v1.1.

| # | Applied in | How it was applied |
|---|---|---|
| S1 | F22, §1.2, §2.1, §3.3, §4.2, §5.2 | Displayed quarter now derives from the clock (`displayPeriodAtStart`, `periodAtEnd`), never raw `q`; the Q3 kickoff reads "Q3 15:00". Re-verified: `quarterOf` uses `>=` (`engine.mjs:43`), events record `q: quarterOf(clock)` (`:416`) |
| S2 | §2.4, §3.3, §3.4, §6.3 | v1.0 BREAK rule superseded; a non-blocking `QUARTER_ROLLOVER` marker sits at the instant the clock crosses 2700 or 900 (interpolated mid-drive, or at a drive boundary when exact). Re-verified with a [DATA] re-count: quarter ends mid-drive in 834/840 (Q1) and 829/840 (Q3) runs |
| S3 | §1.3, §2.1 mock, §4.1, §4.2 | END_HALF is labelled by the drive's **end instant**: "end of half", "end of regulation" or "end of overtime". Run #428 drive 19 now reads "end of regulation" |
| S4 | §2.4, §4.3 rule 8, §1.3, Evidence tab | `ENGINE_CLOCK_RUNOFF` validation note (not a failure), inline caption and Evidence limitation; the 10 long run-off drives (933–1,674 s, 1–5 plays) are named. Re-verified: `engine.mjs:230-232`. v1.1 re-count: the rule as worded flags 18 drives (388–1,674 s), a superset of the 10 |
| S5 | §2.1 selector, §4.2, §4.3 rule 6 | Runs shared across kinds render as one merged chip with both rule texts; validation reports shared indices (4 receipts listed) |
| S6 | §2.1 ribbon, §2.5, Appendix A | Per-team `accent` (≥3:1 on the page and both turf stripes) for ribbon and end-zone edge; fills may use primary |
| S7 | F17, §2.5, Appendix A | Collision count corrected to **10** abbreviations (adds CLE, SEA, HOU, ATL). Re-verified on `team-badge.tsx:41-72`. ΔE formula named (CIE76, <20 → 48 of 496 pairs; 3 identical); hatched end zone when primaries and away secondary all collide |
| S8 | §2.4 camera, §2.5 grain, §3.2, §3.3 | No viewBox camera animation. MVP keeps the full field; any later camera is a CSS `transform` on a cached wrapper group (or a rasterized turf layer); grain stays outside any animated subtree |
| S9 | §2.1 keyboard, §2.1 timeline, §2.2, §3.8 | Shortcuts scoped to the theater region and never on the range input; single-key shortcuts focus-scoped (WCAG 2.1.4); announcements throttled above 1× (≤1 per 3 s); timeline is one tab stop (roving tabindex); `scroll-padding-top` for the sticky bug (WCAG 2.4.11); Play/Pause swaps its name |
| S10 | §2.2, §2.3 | 320 px: the field fits the 288 px usable width (288 × ≥128 px) by default, full-bleed 320 as a design option; y-axis declared data-free with a stated vertical-stretch policy; range thumb ≥24 px |
| S11 | §3.7, §6.1 | `TheaterLoader.tsx` client shim (≤2 KB est.); "0 theater JS on first paint" restated as "≤2 KB loader". Re-verified: Next `14.2.15` (`app/package.json:50`) |
| S12 | §5.2 (ST2-02), §6.2, §7 | Preview route returns a fixed list of ≤3 fixture event ids from `generateStaticParams`; build-time delta budget <0.5% (est.) |
| S13 | §1.2, §1.3, §3.3 | The game clock *between* recorded endpoints is classed illustrative ("illustrative between recorded endpoints") |
| S14 | §4.3 rule 1 | WM2 marker corrected: it is the **`artifact` field** `"nfl-world-model-v2-simulation"` with numeric `schemaVersion: 2`, not an engine id. Re-verified: `app/scripts/nfl/build-nfl-world-model-v2.mjs:221` |
| S15 | §4.3 rule 4 | Precedence stated: halftime and end-of-regulation resets first, then the after-OPP_TD rule, then alternation. Re-verified: `engine.mjs:434-445` run after `nextPos = pos` (`:404`) |
| S16 | §4.4, §8 D8 | ST-03 must also change the input hash (bump `NFL_SIM_V2_VERSION` or hash `runSchemaVersion`); consequences stated, including the `baseSeed` change. Re-verified: `build-nfl-sim-v2-shadow.mjs:129-134` |
| S17 | §3.4, §8 D7 | Length estimate corrected to ≈40–103 s at 1× (35.1–97.2 s without breaks, median 66.6 s [DATA, REVIEW §2.10] + ≈5 s breaks [EST]) |
| S18 | §2.4, §3.8 | CSS transitions in the HTML shell use the existing `--motion-*` tokens and the global reduced-motion block (`app/globals.css:339-358`, `:376-390`); rAF timings stay in the versioned scene policy |

Also from the review (not numbered S-items): the quality bar is restated as "broadcast graphics package, 2D" (§2); OPP_TD chip wording (§1.3); §5.2 replaced by the review's 11-task / 6-PR sequence; §8 rewritten as a decision package; the 32-team colour table is Appendix A.

### 0. Re-verified facts this spec depends on

| # | Fact | Evidence |
|---|---|---|
| F1 | Engine id `nfl-drive-sim-v2`, version `2.0.0-shadow` | [CV] `lib/sports/nfl/sim-v2/engine.mjs:30-31` |
| F2 | Drive results: `TD, FG, FG_MISS, PUNT, TURNOVER, DOWNS, END_HALF, OPP_TD, SAFETY` | [CV] `engine.mjs:32` |
| F3 | One event per drive: `{q, clockStart, offense, startYardsToGoal, result, plays, netYards, seconds, score:[home,away]}` | [CV] `engine.mjs:416` |
| F4 | `clockStart` is **regulation seconds remaining in the game** (3600 → 0), not the quarter clock; in OT it is the OT clock | [CV] `engine.mjs:202` (`let clock = 3600`), `:416` (`clockStart: inOT ? otClock : clock`) |
| F5 | `q = quarterOf(clockStart)` (thresholds 2700/1800/900), but points are credited to `quarterOf(clockEnd)`; OT points go to period index 4 | [CV] `engine.mjs:43`, `:379-380` |
| F6 | Regulation `clockEnd = clock − dur`; OT `otClock = max(0, otClock − dur)` | [CV] `engine.mjs:379`, `:420` |
| F7 | Possession: default `nextPos = def`; after `OPP_TD` the scoring defense kicks to the **same** offense (`nextPos = pos`); at halftime possession resets to `1 − firstReceiver`; at a tied end of regulation OT possession is a fresh coin flip. Both resets run after, and override, `nextPos` (v1.1, S15) | [CV] `engine.mjs:381`, `:399-405`, `:433-440`, `:441-447` |
| F8 | OT: sudden death once both teams have possessed or on a defensive score/safety; postseason ties restart a 900 s period. The **first** OT period is 600 s even in the postseason (v1.1 note) | [CV] `engine.mjs:419-428`, `:444` |
| F9 | A TD score delta includes the try (XP or two-point) | [CV] `engine.mjs:383-394` |
| F10 | `simulation-receipt@2`, `nfl-drive-run@1`, label `REPRESENTATIVE SIMULATED GAME` | [CV] `receipt.mjs:14-16` |
| F11 | `representativeIndices` picks MEDIAN_LIKE, HIGH_SCORING, LOW_SCORING, UPSET by nearest `|total−target|+|margin−target|`, and OVERTIME as the **first** OT run by index; kinds with no candidate are dropped, so **fewer than 5 is possible**. Two kinds can share one `runIndex` (4 receipts on main, v1.1, S5) | [CV] `receipt.mjs:134-161`, `:146`, `:157-160`; [DATA] REVIEW §2.2 |
| F12 | Representatives are re-simulated by index with `players: prep`, but only `final`, `quarters`, `drives` are serialized | [CV] `receipt.mjs:219-237` |
| F13 | `promotionState: "SHADOW"` | [CV] `receipt.mjs:249` |
| F14 | The public route reads receipts from the repo root at build time and is fully static | [CV] `app/nfl/simulation/[eventId]/page.tsx:20,24-25`, `dynamicParams = false` `:47`; `app/next.config.mjs:35-39,52` `output: "export"`, `trailingSlash: true`, `experimental: { cpus: 4 }` |
| F15 | The report shows only 3 of the representatives, and its drive table prints raw `d.q` (so the Q3 kickoff drive reads "2" there today; out of scope here) | [CV] `components/nfl/simulation-v2-report.tsx:242` (`.slice(0, 3)`; `:241` in v1.0, shifted by one line on `05c9deea4f`), `:253` |
| F16 | Player-state vocabulary `IDLE, PLAYING, PAUSED, COMPLETED, UNAVAILABLE, ERROR` | [CV] `lib/simulate/presentation/player-machine.mjs:31`, `createPlayer` `:48` |
| F17 | **No NFL team-colour map exists.** `TEAM_COLORS` in `components/team-badge.tsx` is NBA/MLB only, keyed by bare abbreviation. **10** of its keys are NFL abbreviations: `DEN, MIN, MIA, DAL, PHI, IND, CLE` (NBA) and `SEA, HOU, ATL` (MLB) (v1.1, S7; v1.0 listed 6). Reusing it for NFL would paint the Broncos in Nuggets colours and the Seahawks in Mariners colours | [CV] `team-badge.tsx:40-72` (sourcing comment `:40`, map `:41-72`), lookup `:118` (v1.0 cited `:35-59`/`:115`; shifted on `05c9deea4f`) |
| F18 | Tokens: `--font-display` Geist, `--font-headline` Space Grotesk, `--font-mono` JetBrains Mono, `--bg #0A0705`, `--surface*`, `--lava-text #F5F7F6`, `--lava-text-muted`, `--lava-glow`, `--lava-heat #34D399`, `--lava-danger #F87171`, `--vault-accent-deep #2EA066` ("simulation surfaces"), `--sport-nfl #A78BFA`, `--gtp-card #121A16`, `--gtp-card-shadow`; motion tokens `--motion-*` with a global reduced-motion override (v1.1, S18) | [CV] `app/globals.css:13,16,17,29-33,145,191,194-201,247-248,460-465`; `:339-358`, `:376-390` |
| F19 | Existing field art is decorative: `Field` (viewBox 320×190, `aria-hidden`), `GridironGraphic` (300×300, reduced-motion block) | [CV] `components/simulate/scenes.tsx:29`; `components/game/sport-field-graphics.tsx:18,34,40` |
| F20 | `LiveScoreStrip`/`LivePeriodLine` are typed to the live envelope (`envelope: any`); `LiveBadge`/`FreshnessLine` sit beside them | [CV] `components/live/live-primitives.tsx:31,53,78,108,117` |
| F21 | `app/scripts/serve-export.mjs` is the static server for the export (trailing-slash aware, serves the exported 404) | [CV] `app/scripts/serve-export.mjs:1-15` |
| F22 | *(v1.1, S1)* `quarterOf` uses `>=` thresholds, so an instant exactly on a boundary belongs to the **earlier** quarter. Every second-half opener carries `q: 2, clockStart: 1800` (840/840 runs); 6 drives start at 2700 with `q: 1` and 11 at 900 with `q: 3` | [CV] `engine.mjs:42-43`, `:416`; [DATA] REVIEW §2.3, re-counted for v1.1 |
| F23 | *(v1.1, S14)* WM2 artifacts carry `artifact: "nfl-world-model-v2-simulation"` with numeric `schemaVersion: 2` | [CV] `app/scripts/nfl/build-nfl-world-model-v2.mjs:221` |
| F24 | *(v1.1, S16)* The shadow builder's `inputHash` covers `{engine: NFL_SIM_V2_VERSION, params, anchors, runs, players}` but not `runSchemaVersion`; an existing id is skipped; `baseSeed` derives from `inputHash`; writes are `flag: "wx"` | [CV] `app/scripts/nfl/build-nfl-sim-v2-shadow.mjs:129-132`, `:133`, `:134`, `:150` |

Real receipt used throughout (SF home vs WSH away, kickoff 2026-10-20 00:15Z): `data/internal/research/nfl/sim-v2/shadow/2026-10-17/401873008-6da012510c023181.json` [CV]: `simulationReceiptId "nfl-sim-v2:401873008:6da012510c023181"`, `artifactHash "84e555d1a14f0f9c"`, `runCount 10000`, `baseSeed "59520a64"`. Representatives: MEDIAN_LIKE #428 SF 29–21 (19 drives); HIGH_SCORING #35 37–29 (25); LOW_SCORING #195 20–13 (18); UPSET #1107 21–29 (25); OVERTIME #21 27–20 OT (27). Run #428 hits the boundary case twice: drive 10 `{q:2, clockStart:1800}` (the Q3 kickoff) and drive 15 `{q:3, clockStart:900}` (the Q4 opener) [CV, re-read for v1.1].

## 1. Scope and honesty contract

### 1.1 What the theater is
A **drive-level playback of one recorded run** of one `nfl-drive-sim-v2` receipt of record. Every frame is a pure function of one `representativeRuns[k]` plus a versioned scene policy. [PROP]

### 1.2 Animation classes

| Class | Elements | Source | Rule |
|---|---|---|---|
| **Recorded (may animate)** | possession side; ball spot at drive start (`startYardsToGoal`) and drive end (derived `fieldEnd`); the drive-progress ribbon; score change at drive end (`score`); the game clock **at drive start and drive end** (`clockStart`, derived `clockEnd`) and the quarter **derived from those instants** (v1.1, S1: never raw `q`); drive outcome chip (`result`, with the period-aware END_HALF label, S3); play count and duration as numbers (`plays`, `seconds`) | `engine.mjs:416` [CV] | Exact values; display formatting only |
| **Illustrative** | the ball's motion *between* start and end spot; **the game clock between the recorded endpoints** (a linear interpolation, v1.1, S13) and the in-drive position of a `QUARTER_ROLLOVER` marker (S2); camera pan/zoom (none in the MVP, S8); the possession-change card (kicks, returns and punt landings are not events, `engine.mjs:394-414` [CV]) | scene policy | Always captioned "movement illustrative"; the in-drive clock is labelled "clock illustrative between recorded drive start and end"; the motion must not imply individual plays (no per-play pauses, no tick marks per play along the ribbon) |
| **Forbidden** | individual plays or snaps; down and distance (not modelled, `engine.mjs:19-22`); penalties; timeouts; player figures or motion; passer/rusher/scorer names on a drive (not recorded in `nfl-drive-run@1`); "interception" or "fumble" on an OPP_TD or TURNOVER (drawn at `engine.mjs:254` but not recorded, v1.1); any world-model (`nfl-world-model-v2`) value spliced into the sample; live-feed primitives (`LiveBadge`, `FreshnessLine`, F20) | — | Tests fail if any appears (§5.2 ST2-01, ST2-03) |

`plays` appears only as a number in text ("11 plays"). It is never drawn as 11 hops.

### 1.3 Mandatory labels
- **Persistent scene badge** (top-left of the scene; never hidden, never animated): `SIMULATED · drive-level · movement illustrative · experimental model`.
- **Banner above the theater** (DS-001 rule draft): `Simulated · not a real game · run #428 of 10,000 · experimental engine` (`runIndex`, `runCount`).
- **Sample label:** `REPRESENTATIVE SIMULATED GAME — not the forecast` (`receipt.mjs:16`) plus its `kind` rule text (§2.1). A merged chip (S5) carries both rule texts.
- **Clock labels:** the game clock reads `SIM CLOCK Q2 4:12`; transport time reads `Playback 1:48 / 4:30`. Never the same label or typographic style. While a drive is in progress the clock carries a small "illustrative" marker (tooltip and `aria-describedby`: "Clock illustrative between recorded drive start and end"; v1.1, S13). The quarter shown is derived from the clock (S1).
- **Transition card:** `Change of possession · kick/return not modelled`.
- **END_HALF result label** (v1.1, S3), chosen by the drive's end instant, not by `q`: `end of half` (ends at 1800), `end of regulation` (ends at 0 in regulation), `end of overtime` (OT clock reaches 0).
- **Run-off note** (v1.1, S4), inline on any drive carrying `ENGINE_CLOCK_RUNOFF`: `Engine ran out the half on this drive (clock use not modelled play-by-play)`.
- **Defensive score chip** (v1.1): `Defensive touchdown · SF`; never "interception" or "fumble".
- **Quarter rollover chip** (v1.1, S2): `End of Q1` / `End of Q3`, non-blocking.
- Share images (if ever made) and the transcript carry the same badge text.
- Final wording of every string is ST1-02 (DS-001 lexicon), which now also covers the run-off and merged-chip copy.

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

**Quality bar (v1.1, REVIEW §2.5).** The target is a **broadcast graphics package, 2D** (the tier of a network's 2D drive tracker or a Gamecast-style package). It is *not* "watching a football broadcast": `nfl-drive-run@1` has no players, formations, snaps or play events, so no renderer (SVG, Canvas or WebGL) can show more than a ball moving along a line per drive. Broadcast-like footage would need ST-04 play-level output and then ST-05 2.5D. [INF]

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
│ │▓▓│10 │20 │30 │40 │50 │40 │30 │20 │10 │▓▓│                 │  │ Result: end of regulation     │
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

Mock note (v1.1, S3): drive 19 of run #428 is `{q:4, clockStart:58, result:"END_HALF", seconds:58}` [CV], so the drive card reads "Result: end of regulation" (superseded in v1.1: "Result: end of half"). The timeline's quarter groups use the derived display period (S1), so drive 10 (`q:2, clockStart:1800`) sits in Q3 and drive 15 (`q:3, clockStart:900`) in Q4. The "⏸" icon marks any END_HALF drive (half, regulation or OT).

- **Score bug** [PROP]: 64 px pill, `--surface-elevated`, 1 px `--border-strong`, inset top highlight. Each team block has a 6 px leading bar in team primary (§2.5); abbreviation in `--font-headline` 20/24 semibold; score in `--font-mono` 32/36 tabular. Possession: a 10 px ball glyph beside the team with the ball (a shape, not colour alone). Right block: period and `SIM CLOCK` in `--font-mono` 16 (period derived from the clock, S1); state chip `END Q1` / `HALFTIME` / `OT` / `FINAL` (`END Q1`/`END Q3` appear briefly as the non-blocking rollover chip, S2). Order away–home, matching the report's `A … H` summary line (`simulation-v2-report.tsx`, after `:242`).
- **Field scene**: 120 × 53.3 yard geometry. End zones in team primary at 85% with the abbreviation set vertically in team ink, and a 2 px end-zone edge in team `accent` (v1.1, S6). Yard lines every 5, numbers every 10 (`--lava-text` 70%), hash marks every yard at 30%. Possession arrow: chevron above the ball pointing at the offense's goal. Ball: 14 px ellipse, white lace stroke, soft drop shadow. Ribbon: a band from the start spot to the current ball spot in **offense `accent`** at 55% with a lighter top edge (v1.1, S6; superseded in v1.1: "offense primary at 55%", which cannot reach 3:1 for 20 of 32 primaries); start spot is a hollow ring. The y-axis carries no data (§2.2).
- **Orientation** [PROP]: fixed for the whole game; home defends the left end zone, so home drives move left → right. Real teams change ends each quarter, but the engine has no field direction, and the Q1/Q3 breaks fall mid-drive in 99% of runs [DATA], so swapping would flip the field mid-drive with no recorded basis. A fixed orientation is the least misleading choice and is stated in the Evidence tab (D5, engineering default).
- **Drive timeline**: one segment per drive, grouped by **derived display period** (S1) with 2 px gaps, width ∝ compiled playback duration (§3.4). Fill = offense primary at 40%, current drive 100%; a thin tick marks each `QUARTER_ROLLOVER` instant inside the drive that contains it (S2; one tick per rollover, never per play). Icons: ★ score (TD/FG/OPP_TD/SAFETY), ✕ turnover/downs, ⏸ END_HALF. **One composite widget, one tab stop** (v1.1, S9): roving tabindex; ←/→ move between drives, Home/End to first/last, Enter or Space seeks to the focused drive's start (superseded in v1.1: "one button per drive", which made up to 34 tab stops). Each segment's accessible name: "Drive 7, second quarter, SF, touchdown, SF 14–7".
- **Side panel tabs** (`role=tablist`, roving tabindex):
  - *Drive*: current drive card (offense; start spot in field language, "own 30" / "WSH 42"; plays; net yards; duration; result with the period-aware END_HALF label; score after; any run-off note) and the drives of the current quarter.
  - *Distribution*: batch histograms of total and margin from `aggregate`, with a marker where this run sits; quarter means from `periodAggregates`. Caption "10,000 runs · experimental engine · not the forecast".
  - *Evidence*: receipt id, `artifactHash`, `runIndex`, `baseSeed` + `seedStrategy`, engine + version, `promotionState`, `params.sha256`, `availabilitySnapshotId`, `inputSnapshotIds.forecastReceipt`, selection-rule text, the fixed-orientation note, limitations (`engine.mjs:19-22`; the engine's under-production of 3-point margins and OT, `docs/SIMULATION_ENGINE_V2.md:134` as cited; the clock is interpolated within a drive; **every `ENGINE_CLOCK_RUNOFF` note in this run**, S4; OPP_TD/TURNOVER type not recorded), and the frozen-forecast card.
- **Transport bar**: 56 px row, 44×44 controls. Prev drive, Play/Pause (a single button whose accessible name swaps between "Play" and "Pause"; v1.1, superseded: `aria-pressed`), Next drive, speed segmented control 1×/2×/4× (`radiogroup`), seek `input[type=range]` with `aria-valuetext` "Q2 4:12, drive 9 of 19", playback time, Transcript toggle.
- **Keyboard (v1.1, S9; supersedes the v1.0 global map).** Shortcuts are handled only while focus is inside the theater region (`role=region`, labelled "Simulation theater"); nothing is bound at document level.
  - K: play/pause. Space: play/pause **only** when focus is on a non-button, non-input element of the region; on a button Space keeps its native activation.
  - ←/→: previous/next drive, **except** when focus is on the seek range (native ±step) or inside the timeline widget (its own roving focus). Shift+←/→: ±5 s playback, same exclusions.
  - Home/End: start/end of playback, same exclusions.
  - 1/2/4: speed.
  - WCAG 2.1.4: K and 1/2/4 are single-character shortcuts, made compliant by being **active only while the region has focus**; a "Keyboard shortcuts" disclosure in the transport lists them. [PROP]
- **Sample selector**: up to five 44 px chips (`role=radiogroup`) with kind and final score; the rule sentence and run number sit under the strip. Rules, from `receipt.mjs:151-159` [CV]:

  | kind | Rule shown to users |
  |---|---|
  | MEDIAN_LIKE | The run closest to the batch's median total and median margin |
  | HIGH_SCORING | The run closest to the 90th-percentile total at the median margin |
  | LOW_SCORING | The run closest to the 10th-percentile total at the median margin |
  | UPSET | The underdog-wins run closest to the median total and the mirrored median margin |
  | OVERTIME | The first overtime run in the batch by run index (not "typical") |

  Closeness = |total − target| + |margin − target| (`receipt.mjs:146`). "Underdog" = the side not favoured by `hw >= aw` (`receipt.mjs:225`; ties count as home-favoured). If a kind is absent (F11) its chip is not rendered and the strip says "No overtime run in this batch".
  **Shared runs (v1.1, S5).** When two kinds point at the same `runIndex`, render **one** chip with both kinds and both rule texts (e.g. "Median-like · also the first overtime run"), so the selector never offers two chips that play the identical game. On main this affects 4 of 168 receipts [DATA]: `401872999-48b22f9741b14789` (MEDIAN_LIKE = UPSET = #134), `401873005-dc8c9c8b13bf359d` (HIGH_SCORING = OVERTIME = #42), `401872997-bc61837dc9430351` (MEDIAN_LIKE = OVERTIME = #73), `401873006-00021db64663c940` (MEDIAN_LIKE = OVERTIME = #25).
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
│ 1 play · 61 yds · end of reg.│
├──────────────────────────────┤
│ [Drive][Distribution][Evidence] → bottom sheets
│ Linescore (own scroll region)│
│ ▸ Full transcript            │
└──────────────────────────────┘
```

- Field minimum height 168 px at 390; numbers every 20 yards; hash marks dropped below 400 px width.
- **Vertical-stretch policy (v1.1, S10).** The field's y-axis is declared **data-free**: no recorded value maps to lateral position (the ball's lane is cosmetic, §3.6). The field may therefore stretch vertically beyond the true 120 × 53.3 (2.25:1) aspect, up to 1.25× (est.; set in ST1-04), to meet the minimum heights. At 390 px the true-aspect field is 358 × 159 px, so 168 px is a 1.06× stretch. The ball, start ring, arrow and chips are drawn in **unscaled screen units** (outside the stretched transform) so the ball never becomes an oval and text never distorts. Yard lines and numbers stay on the x-axis, which is never stretched.
- Speed is one cycling button (1× → 2× → 4×) whose accessible name includes the value; seek has its own row.
- **Seek thumb (v1.1, S10).** The native range thumb (≈16–20 px) is restyled to **≥24 × 24 px** (WCAG 2.5.8) inside the 44 px row, on desktop and mobile.
- **Sticky score bug vs focus (v1.1, S9, WCAG 2.4.11).** While the bug is sticky, the scroll container sets `scroll-padding-top` to the bug's height (56 px at 390, 52 px at 320) so a focused element is never hidden beneath it.
- Bottom sheets (sample picker, Distribution, Evidence): `role=dialog`, `aria-modal=true`, focus contained and returned to the opener, drag handle plus a 44 px Close button, max 85 vh with internal scroll. Opening a sheet pauses playback; it resumes only on user action.
- Portrait is complete; landscape just widens the field (no forced rotation).
- Vertical budget at 390 × 844 [EST, REVIEW §2.7]: banner 40, score bug 56, sample row 44, badge 32, field 168, timeline 44, transport 44 + 44 ≈ 470 px, so the transport is above the fold. At 320 × 568 the transport scrolls below the field, which is why the sticky bug and 2.4.11 rule matter.

### 2.3 Mobile, 320 px
- Score bug 52 px: abbreviations and scores on line 1, period and clock on line 2.
- **Field (v1.1, S10).** The field fits the **288 px usable width** (320 − 2 × 16 px gutters): **288 × ≥128 px** at true aspect, stretched per §2.2 up to the ST1-04 cap (≈150 px at the 1.17× this implies, est.). Design option for ST1-04 to choose: a **full-bleed** scene at 320 (gutters removed for the scene only, 320 × ≥142 px); text and controls keep their 16 px gutters either way. (Superseded in v1.1: "≈300 × 150", which exceeded the 288 px usable width.) End-zone abbreviations dropped (colour + score bug carry identity); numbers at 30/50/30 only.
- Transport row: Prev, Play, Next, Speed, Transcript at 44×44: 5 × 44 + 4 × 8 = 252 px ≤ 288 px usable (16 px gutters).
- Badge shortened to `SIMULATED · drive-level · illustrative · experimental` (all four facts kept).
- No horizontal page scroll; the linescore scrolls inside its own `overflow-x: auto` region.

### 2.4 Motion design [PROP; all timings are estimates to tune in ST-02]

Base at 1× (wall-clock ms; 2× and 4× divide all values). These rAF-driven scene timings live in the versioned scene policy (`drive-scene@1`). **CSS transitions in the HTML shell** (chips, tabs, sheets, score-bug digits) use the existing `--motion-*` tokens (`app/globals.css:339-358`), so the global reduced-motion block (`:376-390`) shortens or removes them with no theater-specific CSS (v1.1, S18). The final values are the **ST1-05 motion tuning sheet**, which is also the D7 timing sheet (§8).

| Event | Duration | Easing | Visual |
|---|---|---|---|
| Drive start | 500 ms | `cubic-bezier(.2,.7,.2,1)` | Ball fades in at the start spot; start ring scales 0.6 → 1; possession arrow flips (180 ms) |
| Drive progress | `clamp(900, 260 × plays, 3200)` ms | `cubic-bezier(.45,.05,.35,1)` | Ball moves along the field line, eased in time; ribbon grows behind it; clock counts down linearly from `clockStart` to `clockEnd` (illustrative between endpoints, S13) |
| Score (TD/FG/OPP_TD/SAFETY) | 900 ms hold | ease-out | Digit roll (240 ms); scoring team's end zone 85% → 100% for 600 ms; chip "TOUCHDOWN · SF +7" (delta from data, never assumed); OPP_TD chip "Defensive touchdown · SF" |
| Turnover / downs / missed FG | 600 ms hold | ease-out | Chip; arrow flips with a ≤4 px, 120 ms nudge |
| Possession change (non-scoring) | 500 ms | linear | Card "Change of possession · kick/return not modelled"; ball fades out at the end spot and in at the next start spot (no flight arc) |
| **Quarter rollover (Q1→Q2, Q3→Q4)** (v1.1, S2) | 0 ms added; chip visible 700 ms | `--motion-state-change-*` | **Non-blocking** chip `End of Q1` / `End of Q3` at the instant the clock crosses 2700 or 900; the ball and clock **do not stop** (a pause could read as a play stoppage); timeline tick highlights once. (Superseded in v1.1: a 700 ms blocking "End of quarter" break between drives, which the data almost never produces) |
| Halftime | 1200 ms | — | Chip `HALFTIME`; field dims to 70% |
| OT start | 900 ms | — | Chip `OVERTIME`; OT column appears |
| End of game | 1500 ms, then stop | — | `FINAL`; winner's end zone holds at 100%; state COMPLETED |

- **Run-off drives (v1.1, S4).** An END_HALF drive flagged `ENGINE_CLOCK_RUNOFF` (§4.3 rule 8) is played **exactly as recorded**: never edited, skipped or slowed into fake plays. Its PROGRESS keyframe keeps the normal `plays`-based duration, so the clock runs the recorded 15–28 minutes in about 0.9 s; the run-off note (§1.3) is shown inline for the drive's whole duration and in the Drive tab. Example: `401872996-dec4680410c2d908` LOW_SCORING, `{q:1, clockStart:3474, plays:1, seconds:1674}` [DATA]. The cause is `engine.mjs:230-232`: an END_HALF draw takes the whole remaining half.
- **Camera (v1.1, S8; supersedes the v1.0 viewBox camera).** The ST-02 MVP **keeps the full field; no camera motion**. Animating the SVG `viewBox` is not allowed: it re-renders the whole SVG every frame, including the filtered turf and grain layer, which breaks the "grain rendered once" rule (§2.5). If a camera is added later behind the ST1-05 sheet, it is a CSS `transform` (`translate`/`scale` ≤1.35×, `will-change: transform`) on a wrapper **group whose turf is cached**, or the turf is pre-rasterized once to a bitmap layer and transformed; it never rotates or tilts, never moves during score holds, returns to full field at halftime and OT start, interpolates over ≥400 ms and never moves faster than one field-width per second. (v1.0's "returns to full field at quarter breaks" is superseded: Q1/Q3 breaks are mid-drive.)
- **Reduced motion** (`prefers-reduced-motion: reduce`, reusing the `matchMedia` listener pattern at `simulation-story.tsx:130-136`, per feasibility; the rAF loop checks `matchMedia` itself, while shell CSS follows the `--motion-*` tokens): Play steps one drive per 1.5 s (or per Next) with no tweening; camera fixed at full field; no rolling digits, glows or nudges; score changes are instant with a static 2 px outline on the scoring team; the rollover chip appears without transition. No information is conveyed only by motion.
- **No autoplay** in any mode. Nothing flashes more than 3 times per second (WCAG 2.3.1).

### 2.5 Visual polish

- **Depth**: the scene card uses `--gtp-card` with `--gtp-card-shadow`; the field sits in an inset (`inset 0 2px 12px rgba(0,0,0,.45)`, 1 px `--border-strong` frame) under a top vignette in the `--lava-glow` style (F18).
- **Grass**: a procedural SVG `<pattern>` of alternating 5-yard stripes in two dark greens derived from `--vault-accent-deep`, added as a new token pair `--theater-turf-a` / `--theater-turf-b` [PROP], plus an `feTurbulence` grain at ≤3% opacity rendered **once** in the static layer (never per frame). **The grain and any SVG filter sit outside every animated subtree** (v1.1, S8): nothing that moves is a descendant of a filtered element, and no ancestor of the filtered layer is animated. No raster assets in the MVP (procedural stripes plus static grain look clean, not photoreal; photoreal turf would be a deliberate ST-05 raster/Canvas question).
- **Typography**: `--font-headline` for team names and chips, `--font-label` for labels, `--font-mono` with `font-variant-numeric: tabular-nums` for every number so clock and scores never jitter.
- **Team colours (v1.1, S6/S7; supersedes the v1.0 proposal).** None exist for NFL (F17). The proposal is now the **32-team table in Appendix A** (copied from REVIEW §4: primary, secondary, ink with contrast ratio, accent with ratio, primary vs page background; sources and access dates kept), to live in a new sport-namespaced `lib/sports/nfl/team-colors.mjs` with lookups keyed `nfl:<ABBR>` so no NBA or MLB key can ever match. `TEAM_COLORS` must not be reused for NFL: **10** abbreviations collide (F17). **No logos or wordmarks: abbreviations plus colours only** (team names, abbreviations and colours identify a team factually; logos, wordmarks, helmet and uniform designs and the NFL shield are trademarks, and simulated games shown with real logos could read as endorsed [INF; not legal advice]). Founder decision D3; until approved, the engineering default is **neutral GTP tokens** (`--sport-nfl` home, `--lava-text-muted` away, identity by text), so the renderer is not blocked.
- **Contrast rules** (v1.1 additions marked):
  - text on any team surface uses that entry's `ink` at ≥4.5:1 (a unit test over all 32 entries; minimum in Appendix A is 4.69, LAC);
  - *(v1.1, S6)* ribbon and end-zone edge use the team's `accent`, ≥3:1 against the page (`#0A0705`) **and both turf stripes**; fills may use primary. 20 of 32 primaries are below 2:1 on the page, which is why `accent` exists;
  - ball and ribbon edge ≥3:1 against both turf stripes;
  - *(v1.1, S7)* colour collision uses **CIE76 ΔE < 20** between the two primaries (48 of 496 team pairs collide; 3 are identical: CIN = DEN, DAL = LAR, NE = SEA [REVIEW §3]); on a collision the away team uses its secondary; if the away secondary also collides with the home primary, the away end zone gets a **hatched pattern** instead;
  - unknown teams fall back to `--sport-nfl` (home) and `--lava-text-muted` (away);
  - possession is never colour-only (ball glyph and arrow are shape-coded).
- **Token ratchet [CV, REVIEW §2.8].** The ratchet scans `.tsx` only (`lib/uiux/token-ratchet.test.mjs`) and treats team colours as `identityData` (`token-exception-registry.mjs:30-32`), so a `.mjs` colour map does not move it; theater `.tsx` files still use only `var(--…)`.
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
**Option C: a hand-written SVG scene (static field layer + a small dynamic layer) inside a semantic HTML shell (score bug, labels, tabs, transport, transcript), driven by a pure `stateAt`.** [PROP] The review confirmed this choice (REVIEW §2.5).
- It is the only option where the server can render the exact final frame and full meaning without JavaScript, so the static fallback is the real scene, not a placeholder.
- The scene has about 6 moving nodes (ball, ribbon, arrow, start ring, chip, rollover tick), well within SVG's comfortable range; per-frame updates are direct attribute writes via refs, not React re-renders. (Superseded in v1.1: "camera viewBox" as a moving part; see §2.4 camera, S8.)
- **Performance risk is paint, not script [INF, REVIEW §2.5/§2.10].** SVG filters (`feTurbulence`, blur, drop shadow) are expensive and largely CPU-rasterized, and animating anything inside a filtered subtree re-rasterizes it every frame. Hence: static filtered layer, no viewBox animation, any future camera as a transform on a cached group or a pre-rasterized turf layer.
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
  period: 1 | 2 | 3 | 4 | 5; periodClock: number;  // derived from the (interpolated) clock, never raw q (v1.1, S1)
  clockIllustrative: boolean;                      // true strictly between a drive's recorded start and end (v1.1, S13)
  chip: null | { kind: string; text: string };
  breakKind: null | "HALFTIME" | "OT_START" | "FINAL";      // blocking breaks only (v1.1, S2; "END_Q" superseded)
  rollover: null | { quarter: 1 | 3; atT: number };        // non-blocking QUARTER_ROLLOVER chip while visible (v1.1, S2)
  camera: null;                                    // MVP: full field, no camera (v1.1, S8; v1.0: { cx, zoom ∈ [1, 1.35] })
  illustrative: true;
};
export function stateAt(receipt, runIndex, t, opts = { sceneVersion: "drive-scene@1", reducedMotion: false }): SceneState
// = stateAtCompiled(compileTimeline(adaptSample(receipt, runIndex), opts), t)  (both memoised by receiptId|runIndex|sceneVersion|reducedMotion)
```
- Deterministic: no `Date`, no `Math.random`, no DOM access. `t` is clamped to [0, tEnd]. Seek = one binary search over keyframe start times (≤ ~200 keyframes: 34 drives × 5 phases plus breaks and rollovers) + interpolation, so cost is O(log n).
- **Displayed quarter (v1.1, S1; supersedes the v1.0 rule that used `period = q`).** The engine's `q` is `quarterOf(clockStart)` with `>=` thresholds (F22), so a drive that *starts* on a boundary is labelled the earlier quarter: with v1.0's formula the Q3 kickoff (`q:2, clockStart:1800`) would show "Q2 0:00". The adapter therefore derives, for regulation clock values `c` (seconds remaining in the game):
  - `displayPeriodAtStart(c) = c > 2700 ? 1 : c > 1800 ? 2 : c > 900 ? 3 : 4` — used for a drive's **start instant** (an instant on a boundary opens the later quarter; 3600 → Q1);
  - `periodAtEnd(c) = quarterOf(c)` (`>=`, `engine.mjs:43`) — used for a drive's **end instant** and for the running clock up to and including a boundary (an instant on a boundary closes the earlier quarter: 1800 at the end of drive 9 reads "Q2 0:00");
  - `periodClock = c − 900 × (4 − period)`, with the period chosen as above; the running clock switches to the later quarter immediately after it crosses the boundary, where the `QUARTER_ROLLOVER` marker sits (§3.4);
  - OT: `period = 5`, `periodClock` = the OT clock directly (F4, F6).
  Score bug, timeline groups, transcript and seek `aria-valuetext` all use these helpers, never raw `q`. Examples from the receipt: `clockStart 3600` → `Q1 15:00`; `clockStart 1862` → `Q2 1:02`; drive 10 `clockStart 1800` → **`Q3 15:00`**; drive 15 `clockStart 900` → **`Q4 15:00`**. Raw `q` is kept on the event as `engineQ` for audit only.
- Reduced motion changes the *compiled* timeline (no PROGRESS tween; each drive is START → RESULT steps), never the outcomes.

### 3.4 Timeline compiler
`compileTimeline(sample, policy) → { keyframes[], markers[], tEnd }` [PROP]
- Per drive, emit `START` (500 ms), `PROGRESS` (`clamp(900, 260 × plays, 3200)` ms), `RESULT` (900 ms score / 600 ms stop / 0 ms otherwise), `TRANSITION` (500 ms when the next drive has a different offense or a kick follows).
- **Blocking `BREAK` keyframes** only at halftime, OT start and the end of the game.
- **Non-blocking `QUARTER_ROLLOVER` markers (v1.1, S2)** in `markers[]`, one at Q1→Q2 and one at Q3→Q4 per run. If a drive's interval strictly contains the boundary (`clockStart > b > clockEnd`, b ∈ {2700, 900}), the marker sits inside that drive's PROGRESS phase at the playback instant where the interpolated clock equals `b` (`phaseProgress` of the clock, not of the eased ball); if a drive ends exactly on `b`, the marker sits at that drive boundary. The marker adds no playback time. [DATA, re-counted for v1.1]: the Q1 boundary is crossed mid-drive in 834/840 runs and exactly at a drive boundary in 6; the Q3 boundary mid-drive in 829/840 and exactly in 11.
- (Superseded in v1.1: "`BREAK` keyframes when the quarter of `clockEnd` differs from the next drive's `q`". Within a half `next.clockStart === prev.clockEnd` [DATA], so `next.q === quarterOf(prev.clockEnd)` always holds and END Q1 / END Q3 could never fire.)
- Policy is versioned (`drive-scene@1`); changing any duration bumps the version and the screenshot baselines. Field orientation (D5) and the length policy (D7) are explicit policy parameters.
- **Estimated length (v1.1, S17; supersedes v1.0's "19 drives ≈ 70–75 s; 27 drives ≈ 100 s; 34 drives ≈ 125 s").** Recomputed with this policy over all 840 representatives on main, excluding break keyframes: **35.1–97.2 s, median 66.6 s** at 1× [DATA, REVIEW §2.10; a v1.1 spot re-count agreed within ~2 s]. Breaks add about 5 s [EST]. So 1× playback is **≈40–103 s** [DATA + EST]; 2× and 4× halve and quarter it. A long-form option (D7) could stretch this toward 3–5 minutes, adding only illustrative motion.
- Output is plain data, unit-testable, and its hash is part of the determinism tests.

### 3.5 Frame loop and pausing
- One `requestAnimationFrame` loop exists only while state is PLAYING **and** the scene is ≥25% visible (`IntersectionObserver`) **and** `document.visibilityState === "visible"`. Otherwise the loop is cancelled (not throttled); resuming re-anchors the playback clock so no time jumps.
- Each frame: `t += dt × speed` (dt clamped to 100 ms), `s = stateAt(...)`, write attributes only for fields that changed (shallow compare). React state updates at most on drive changes (to update the HTML panel and `aria-live` text), never per frame.
- Speed changes and seeks only change `t`; outcomes come from `stateAt`, so 1×/2×/4× are identical at equal `t`.
- Leaving the page or switching samples cancels the loop and drops the old compiled timeline from the memo (bounded LRU of 5).

### 3.6 Scene RNG
- `sceneSeed = fnv1a32("drive-scene@1|" + simulationReceiptId + "|" + runIndex)` feeding a local mulberry32 in `lib/simulation-theater/scene-rng.mjs` [PROP].
- Used only for cosmetic choices: the ball's lateral lane (y within the middle 40% of the field) so consecutive ribbons do not overlap, and the turf grain offset. The lane is the reason the y-axis is data-free (§2.2).
- Never imports or calls the engine's `runRng` (`engine.mjs:47-54`); a test asserts `scene-rng` is the only RNG module the theater imports and that outcome fields are identical with two different scene seeds.

### 3.7 Component tree and file layout [PROP]
```text
app/src/lib/simulation-theater/
  adapter-nfl-sim-v2.mjs        receipt → TheaterManifest + TheaterSample[] (build time, node-free core)
  validate.mjs                  §4.3 rules; returns {ok, errors[], notes[]} per sample
  timeline.mjs                  compileTimeline (keyframes + QUARTER_ROLLOVER markers)
  state-at.mjs                  stateAt / stateAtCompiled
  scene-rng.mjs                 fnv1a32 + mulberry32 (cosmetic only)
  format.mjs                    clock + displayPeriodAtStart / periodAtEnd, END_HALF labels, field-position language ("own 30"/"WSH 42"), transcript sentences
  transport-machine.mjs         player-machine.mjs vocabulary + time cursor, speed, seek
  *.test.mjs                    one per module
app/src/lib/sports/nfl/team-colors.mjs   (D3; separate PR)
app/src/components/simulation-theater/
  TheaterSection.tsx            server component: banner, sample strip (links), SSR final-frame SVG, transcript, noscript
  TheaterLoader.tsx             "use client" shim (≤2 KB est.): holds the "activated" state, renders the island after activation (v1.1, S11)
  TheaterIsland.tsx             "use client"; imported dynamically by TheaterLoader
    ScoreBug.tsx  SampleSelector.tsx  FieldScene.tsx (StaticField + DynamicLayer)
    DriveTimeline.tsx (composite widget)  Transport.tsx  SidePanel.tsx (DriveTab, DistributionTab, EvidenceTab)
    BottomSheet.tsx  LiveAnnouncer.tsx
  Transcript.tsx                server-renderable <ol>, shared by SSR and island
  theater.module.css            tokens only (no new colours except the turf pair and team map)
```
- **Lazy island on the existing static route** (D2): `TheaterSection` renders inside `simulation-v2-report.tsx` above the existing drive tables. **(v1.1, S11)** In Next `14.2.15` (`app/package.json:50` [CV]) `next/dynamic(..., { ssr: false })` cannot be called from a server component, and a dynamic import fires on render, not on interaction [INF]. So `TheaterSection` renders a small `"use client"` `TheaterLoader`, which holds the "activated" state and renders `TheaterIsland` (via `next/dynamic`) only after the first Play/sample/seek interaction or when the section comes within 1 viewport (IntersectionObserver prefetch). Other routes ship 0 theater JS; the first paint of this route ships **≤2 KB (est.) of loader** and no island code. (Superseded in v1.1: "`next/dynamic(() => import(...), { ssr: false })` on first interaction" from the server component, and "0 theater JS on first paint".)
- Data reaches the island as props from the server component (≈16 KB raw for five samples, feasibility §5.2), so playback makes 0 network requests. Those props are serialized into the page's RSC payload as well as the SSR transcript, so the data appears roughly twice [INF]; still small after gzip.
- **Static fallback**: without JavaScript the page shows the banner, a server-rendered SVG of the **final** frame (final score, last drive ribbon), the linescore and the full transcript; `<noscript>` says "Playback needs JavaScript. Every drive is listed in the transcript below." The sample strip falls back to anchors to each sample's transcript.

### 3.8 Accessibility model
- Scene SVG `aria-hidden="true"`; all meaning lives in HTML.
- **`LiveAnnouncer` (`aria-live="polite"`; v1.1, S9; supersedes "once per drive result" at every speed):**
  - at 1×: once per drive result ("SF touchdown. SF 10, WSH 0. Q1 7:47") and at breaks;
  - above 1× (2×, 4×, where per-drive announcements would arrive 1–2 a second): announce only scores, possession-ending turnovers/downs and breaks, **at most one announcement per 3 s**; a newer one replaces a queued older one;
  - on pause and when a seek settles (250 ms): announce the current drive in full;
  - never per frame; silent while seeking until the seek settles; quarter rollovers are announced only at 1× and only if no other announcement is pending.
- The transcript is the equivalent of the scene: one item per drive, generated only from recorded fields, with the derived display period (S1), the period-aware END_HALF label (S3) and any run-off note (S4), e.g. drive 1 of run #428: "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0"; drive 10: "Q3 15:00 · WSH ball …".
- Focus order: banner → samples (one radiogroup stop) → score bug (static text) → transport → timeline (**one tab stop**, roving tabindex, S9) → side panel → linescore → transcript. Visible focus ring ≥3:1. No keyboard traps except inside open sheets (Escape closes).
- Keyboard scoping, the range-input exclusion and WCAG 2.1.4 compliance are specified in §2.1 Keyboard; WCAG 2.4.11 (sticky bug) in §2.2.
- Shell CSS transitions use `--motion-*` tokens (S18), so the global reduced-motion block applies to them automatically.

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
- Half and OT edges [CV, same receipt]: run #428 drive with `{"q":2,"clockStart":1862,...,"result":"END_HALF","seconds":62}` ends the half exactly at 1800 (`dur = halfSec`, `engine.mjs:230-232`); the next drive is `{"q":2,"clockStart":1800,...}`, the Q3 kickoff, still labelled `q:2` by the engine (F22). OVERTIME #21 ends `{"q":4,"clockStart":331,...,"result":"FG","seconds":331,"score":[20,20]}`, then `{"q":5,"clockStart":600,"offense":1,...,"result":"PUNT"}` and `{"q":5,"clockStart":495,"offense":0,...,"result":"TD","score":[27,20]}`.
- **END_HALF ends three different things (v1.1, S3)** [DATA, re-counted for v1.1 over 840 runs]: the first half (444 drives ending at 1800), regulation (634 drives ending at 0; 630 carry `q:4`, and 4 start in Q3 and run out regulation, so the label must use the end instant, not `q`), and overtime (17). REVIEW §1 cites "630" for regulation, which is the `q:4` subset.
- Scoring states: points only on `TD` (+6 and try +1/+2 to offense), `FG` (+3), `OPP_TD` (+6, XP +1, to defense), `SAFETY` (+2 to defense); `FG_MISS`, `PUNT`, `TURNOVER`, `DOWNS`, `END_HALF` score 0 (`engine.mjs:383-410`). A scoring drive keeps its result even when time expires (`engine.mjs:230-232`).

### 4.2 Adapter contract (`TheaterSample v1`) — every field mapped [PROP]

| Field | Source | Notes |
|---|---|---|
| `receiptId`, `receiptHash` | `simulationReceiptId`, `artifactHash` | identity on every frame |
| `engine` | `simulationEngine`@`simulationEngineVersion` | must equal `nfl-drive-sim-v2` |
| `status` | `promotionState` | `SHADOW` → "experimental" |
| `runId`, `kind`, `label` | `runIndex`, `kind`, `label` | |
| `sharedKinds` (v1.1, S5) | other `kind`s with the same `runIndex` | non-empty → one merged chip with all rule texts |
| `selectionRule` | static text per `kind` (§2.1) | `selectionDistance: null` — reason "not stored in simulation-receipt@2" |
| `seed` | `{baseSeed, seedStrategy}` | display only |
| `teams` | `home{abbr,name}`, `away{abbr,name}` | sides normalised to `"home"`/`"away"` |
| `finalScore`, `periodScores` | `final`, `quarters` | |
| `events[i].kind` | constant `"DRIVE_SUMMARY"` | `PLAY_SIMULATED` reserved for ST-04 |
| `events[i].period` | derived (v1.1, S1): OT → 5, else `displayPeriodAtStart(clockStart)` (§3.3) | (superseded in v1.1: `drives[i].q`) |
| `events[i].engineQ` (v1.1) | `drives[i].q` | audit only; never displayed |
| `events[i].clockStart` | `drives[i].clockStart` | game-seconds remaining (regulation) or OT clock |
| `events[i].clockEnd` | derived: `max(0, clockStart − seconds)` | engine's own `clockEnd` is 0 for every OT drive (`:379`); the adapter uses the OT clock |
| `events[i].scorePeriod` | derived: OT → 5, else `quarterOf(clockEnd)` | matches the engine's point crediting (F5); crediting by `q` instead fails in 733/840 runs [DATA] |
| `events[i].offense` | `drives[i].offense` → `"home"`/`"away"` | |
| `events[i].fieldStart` | `startYardsToGoal` | offense-relative |
| `events[i].fieldEnd` | derived: `TD` → 0; `SAFETY` → 100; else `startYardsToGoal − netYards` | flag if outside [0,100] |
| `events[i].plays`, `netYards`, `seconds`, `outcome` | as recorded | |
| `events[i].outcomeLabel` (v1.1, S3) | derived | END_HALF: `clockEnd` 1800 → "end of half"; regulation 0 → "end of regulation"; OT → "end of overtime"; OPP_TD → "defensive touchdown" |
| `events[i].notes[]` (v1.1, S4) | from validation | e.g. `ENGINE_CLOCK_RUNOFF` with the §1.3 copy |
| `events[i].scoreBefore` / `scoreAfter` | `drives[i−1].score` or `[0,0]` / `drives[i].score` | |
| `events[i].participants` | `null` — "not recorded in nfl-drive-run@1" | |
| `teamStats`, `playerStats` | `null` — same reason | ST-03 |
| `downDistance`, `penalties`, `kickReturn` | `null` — "not modelled by nfl-drive-sim-v2" (`engine.mjs:19-22`) | permanently null for this engine |
| `forecastRef` | `inputSnapshotIds.forecastReceipt` | `forecastHash: null` — "not stored" |
| `inputCutoff` | `availabilitySnapshotId` | string; no separate cutoff timestamp exists |
| `scene` | `{geometryClass: "illustrative", sceneVersion: "drive-scene@1", sceneSeed}` | |
| `unavailableFields[]` | list of every null above with its reason | rendered in the Evidence tab |

### 4.3 Validation (runs at build time in the adapter and in unit tests over every receipt on main) [PROP]
1. **Engine identity**: `simulationEngine === "nfl-drive-sim-v2"`, `schemaVersion === "simulation-receipt@2"`, `runSchemaVersion === "nfl-drive-run@1"` (or a later version the adapter explicitly supports). This positive check already rejects any WM2 file. **(v1.1, S14)** The WM2 marker is the **`artifact` field** `"nfl-world-model-v2-simulation"` with numeric `schemaVersion: 2` (`app/scripts/nfl/build-nfl-world-model-v2.mjs:221` [CV]), not an engine id (superseded in v1.1: "`nfl-world-model-v2-simulation` engine id"); also reject `sampledWorlds` or a WM2 file path. The negative test feeds a real `app/public/data/nfl/world-model-v2/<id>.json` and expects `ENGINE_MISMATCH`.
2. **Score reconciliation**: `drives[last].score` = `final`; each delta is in the allowed set for its result (TD: offense +6/+7/+8, defense 0; FG: +3; OPP_TD: defense +6/+7; SAFETY: defense +2; else 0); Σ deltas grouped by `scorePeriod` = `quarters` for both sides; `final.overtime` ⇔ any `q === 5`.
3. **Clock monotonic**: within a half `clockStart[i+1] === clockStart[i] − seconds[i]`; the first drive of the second half starts at 1800; `clockStart` never increases within regulation; OT drives decrease from the OT start (the **first** OT period is 600 s in both regular season and postseason, `engine.mjs:444`; only a tied postseason OT restarts at 900, `:426`, F8); `seconds ≥ 5` except a drive cut by the clock.
4. **Possession**, applied in this order of precedence (v1.1, S15; v1.0 left precedence unstated):
   1. **Resets first.** (b) The first drive of the second half is `1 − drives[0].offense` (`engine.mjs:437` [CV]; 840/840 [DATA]); (c) the first OT drive may be either side, because OT possession is a coin flip (`pos = rng() < 0.5 ? 0 : 1`, `engine.mjs:441-447` [CV]; 98 same / 101 different [DATA]). These override everything below, including OPP_TD: the engine sets `nextPos = pos` (`:404`) before the half/regulation checks (`:434-445`) overwrite `pos`. Twice on main an OPP_TD was the half-ending drive and the reset applied [DATA, REVIEW §2.3].
   2. **Then OPP_TD.** (a) After `OPP_TD` the same offense receives (F7; 216/216 [DATA]).
   3. **Then the postseason restart.** (d) After a postseason OT period ends tied, the engine restarts a 900 s period with `continue` and no change of `pos` or `y0` (`engine.mjs:426` [CV]), so the same offense may drive again — accepted only when `q === 5` and the previous drive ended the OT clock (0 cases on main; code only).
   4. **Otherwise alternation**: `offense[i+1] = 1 − offense[i]`. Any other repeat fails.
   Regular-season OT may end tied (`engine.mjs:427`, `tie` in the return at `:452`); a tied `final` is valid only when `final.overtime` is true (23 tied finals on main, all with `overtime: true` [DATA]).
5. **Field**: `1 ≤ startYardsToGoal ≤ 99`; derived `fieldEnd` within [0, 100]; `TD` requires `netYards === startYardsToGoal` (holds in the excerpt: 73/73); `SAFETY` has `netYards === startYardsToGoal − 100` [DATA].
6. **Count**: 1–5 representatives, unique `kind`s; zero is a fail. **(v1.1, S5)** Shared `runIndex` values across kinds are valid and **reported** (`SHARED_RUN` note), and drive the merged chip; the test covers the 4 receipts listed in §2.1.

**Dry run of rules 2–5 over main (read-only `jq`, 2026-10-18 03:44Z) [CV]:** 168 receipts × 5 = 840 representatives (each kind present 168 times); 0 with last-drive score ≠ `final`; 0 with per-quarter sums (credited by `quarterOf(clockEnd)`, OT → index 4) ≠ `quarters`; 0 regulation clock gaps (allowing the 1800 s second-half start); 0 same-offense repeats outside the OPP_TD / second-half / OT exceptions; 0 field violations (start outside 1–99, or TD with `netYards ≠ startYardsToGoal`). Drives per representative range **11–34** (the feasibility doc's 16–27 is narrower than what main now holds). This was a quick script check, not the ST2-01 test suite; it did not yet verify that the second-half receiver equals `1 − drives[0].offense`. **(v1.1)** The independent review's script confirmed every one of these over 840/840 runs, including the second-half receiver (840/840), mean 22.4 drives per run (REVIEW §2.3 [DATA]).

7. **Fail-closed UI states**: `ENGINE_MISMATCH` or `SCHEMA_UNSUPPORTED` → the whole theater is replaced by an absence card ("Playback unavailable for this receipt: <reason>"), the existing report stays; a single invalid sample → its chip is disabled with the reason, others play; never substitute another receipt or another run; no zero-filled numbers. The build never fails for one bad receipt; the unit test over all receipts does fail CI.
8. **Engine clock run-off note (v1.1, S4).** An `END_HALF` drive with `seconds > 300` **and** `seconds > 60 × plays` gets an `ENGINE_CLOCK_RUNOFF` **note** (never a failure; the drive is never edited or skipped). It is shown inline (§1.3, §2.4) and listed under Evidence → limitations; the pattern is reported to the `NFL-002` owner. On main [DATA]:
   - the review's headline set is **10 drives of 1–5 plays consuming 933–1,674 s** (15.5–27.9 minutes), 7 of them LOW_SCORING picks; e.g. `401872996-dec4680410c2d908` LOW_SCORING `{q:1, clockStart:3474, plays:1, seconds:1674}`;
   - the rule as worded flags **18** drives in v1.1's re-count (388–1,674 s, 1–6 plays), a superset of the 10. ST2-01b's acceptance test asserts the exact set the final threshold produces; if the founder or designer wants only the extreme cases flagged, the threshold becomes `seconds ≥ 900`, which yields exactly the 10.

### 4.4 Future ST-03 player stats (recording change, forward-only) [PROP]
- **Change in `receipt.mjs`**: at the representative re-simulation (`:219-237`) serialize what is already computed in `scratch.team` and `scratch.players` as a new versioned field `boxScore` (`box-score@1`) and bump `runSchemaVersion` to `nfl-drive-run@2`: `{team:{home:{25 TEAM_FIELDS}, away:{…}}, players:[{playerId, side, stats:{12 PSTAT}}], other:{home, away}, firstTd}`. For time sync, add a parallel `driveStats[i]` array (sparse per-drive player deltas and `scorer{playerId,type}`), recorded by the engine **without consuming RNG**. `drives[]` stays byte-identical, so v1 consumers are unaffected. Cap: ≤4 KB per run (v1.1, D8).
- **Input hash and run-schema version (v1.1, S16).** The shadow builder's `inputHash` covers `{engine: NFL_SIM_V2_VERSION, params, anchors, runs, players}` but **not** `runSchemaVersion`, and the builder skips any event whose `nfl-sim-v2:<eventId>:<inputHash>` id already exists (`app/scripts/nfl/build-nfl-sim-v2-shadow.mjs:129-133` [CV]). Bumping only `runSchemaVersion` would therefore never write an `@2` receipt for events whose inputs have not changed. ST-03 must **either bump `NFL_SIM_V2_VERSION` or add `runSchemaVersion` to the hashed object**. Consequences, to be stated in the ST-03 PR:
  - **Seed consequence:** `baseSeed = fnv1a64(engine|eventId|inputHash)` (`:134`), so a new `inputHash` gives a new `baseSeed`, and the next receipt of record for an upcoming game shows **different representative runs** (and a re-drawn 10,000-run batch) than the previous receipt, even with unchanged inputs. Historical receipts are untouched (write-once, `flag: "wx"`, `:150`).
  - a one-off burst of new receipts for all upcoming events, riding the existing shadow commit (0 new commits [INF]);
  - the "byte-identical with recorder on/off" invariance test runs in a **fixed-seed harness** (same `baseSeed` supplied directly) and excludes `artifactHash`, `runSchemaVersion` and the hash-derived ids, which must differ.
- **Panel sync**: with `driveStats`, the Players tab shows cumulative lines through the current drive (Σ deltas ≤ `driveIdx`) and highlights the scorer of a scoring drive; without it, it shows the full-game line labelled "full-game line for this run (not synced to playback)".
- **Reconciliation**: Σ players + `other` = team per stat (`coherence.mjs:20-75` contract); Σ `driveStats` = `boxScore`; TD/FG counts in `boxScore.team` equal counts of drive results; first-TD scorer equals the first TD drive's scorer.
- **Invariance test**: for identical inputs and a fixed seed, every receipt field other than the new ones (and the exclusions above) is byte-identical with the recorder on and off.
- **Historical receipts stay unchanged** (write-once); they show "Player lines were not recorded for this receipt". Any backfill is a separate verified sidecar (feasibility §6 Phase 3b).

### 4.5 Missing data contracts
| Missing | Needed for | Status |
|---|---|---|
| NFL team-colour map | end zones, ribbon, score bug | none exists (F17); new file, D3; proposal in Appendix A |
| `forecastHash`, `engineCommit`, `selectionDistance` in the receipt | provenance completeness | null with reason until stored (later receipt version) |
| An input-cutoff timestamp distinct from `availabilitySnapshotId` | Evidence tab | string only today |
| OT opening possession recorded on the event | validation rule 4 (reset c) | coin flip in code (`engine.mjs:445`); not stored as a field, so the theater cannot say "won the toss" |
| Interception vs fumble on TURNOVER / OPP_TD (v1.1) | outcome wording | drawn (`engine.mjs:254`) but not recorded; chip says "Defensive touchdown" / "turnover" only |
| Punt/kick landing and return spots | transition art | not modelled; transition stays a card |
| Per-drive participants / scorer | player highlights | ST-03 `driveStats` |
| `sceneVersion` registry and baseline policy | determinism tests | defined in ST2-03 |
| DS-001 "Simulated · not a real game" banner rule | banner | draft text §1.3; DS-001 owner |

## 5. Implementation plan

> **Implementation is NOT approved.** Everything in this section is a plan for after ST-01 sign-off (D1). All efforts are **estimates** for one experienced engineer.

### 5.1 ST-01 remaining design deliverables (documentation only)

| ID | Deliverable | Files | Depends | Effort (est.) | Acceptance |
|---|---|---|---|---|---|
| ST1-01 | ADR: engine = `nfl-drive-sim-v2`; route (D2); P242 position (D1); fixed field orientation (D5 default) | `docs/adr/<n>-simulation-theater-drive-engine.md` | founder D1, D2 | 0.5–1 d | Founder sign-off recorded |
| ST1-02 | DS-001 label lexicon: banner, badge, sample label, clock labels (incl. "illustrative" marker), transition card, absence copy; **v1.1:** END_HALF labels, run-off note, merged-chip copy, rollover chip, defensive-touchdown chip | `docs/UX_DESIGN_STANDARDS.md` (DS-001 section) | ST1-01 | 0.5 d | Every string in §1.3 and §4.3 rules 7–8 has an approved final form |
| ST1-03 | NFL team-colour table with computed contrast ratios and collision pairs; **v1.1:** start from Appendix A (accent column, 10-collision list, source deviations, CIE76 pairs), plus brand-guide spot checks | doc appendix | D3 | 0.5 d | All 32 teams ≥4.5:1 ink; accent ≥3:1 on page and final turf tokens; collision list |
| ST1-04 | High-fidelity mockups at 1440/768/390/320 for 6 states (pre-play, drive in progress, score, possession change, halftime, final) and the 3 absence states; **v1.1:** includes the 320 field choice (288 px vs full-bleed) and the vertical-stretch cap | design files (original art) | ST1-02 | 1.5–2 d | Founder approves; no PropDealer-derived art |
| ST1-05 | **Motion tuning sheet = D7 timing sheet** (§2.4 table) with reduced-motion variant, `--motion-*` mapping, rollover chip, and the length table (≈40–103 s at 1×) | doc appendix | ST1-04 | 0.5 d | Founder approves timings |
| ST1-06 | Correct COMP-001 §6.2 and the v0 spec's "out of scope: playback" (feasibility §2 rows 18–19) | those docs | ST1-01 | 0.25 d | Wording reviewed |
| | **Total ST-01 remaining** | | | **3.75–4.75 d (est.)** | |

### 5.2 ST-02 execution sequence (v1.1; supersedes the v1.0 ST2-01…ST2-10 table)

Replaced in v1.1 by REVIEW §6 (superseded in v1.1: the v1.0 10-task table, each task its own PR, total 14–20 d est.; local MVP 12–17 d). Changes: ST2-01b added (S1, S3, S4, S5); tasks grouped into **6 PRs**; ST2-03 gains `QUARTER_ROLLOVER`; ST2-04 drops the viewBox camera and adds `TheaterLoader` and focus-scoped keyboard; ST2-05 gains the throttled announcer and composite timeline; ST2-08 gains the 320 field, y-stretch policy, 24 px thumb and `scroll-padding-top`.

**Ground rules** (§7, roadmap `COST-001`):
- Work on `claude/*` branches only and verify on localhost (`node app/scripts/serve-export.mjs`).
- **PR-1 through PR-5 are unreachable in Production**: `lib/` only, or `/preview/**`, which is 404 via `guardInternalRoute()` and pruned from the export by `app/scripts/prune-internal-routes.mjs:41` [CV]. Only PR-6 touches a public page, and only after release approval.
- 0 data writes. Tests iterate *all* receipts on main and never hard-code 168.
- Heavy local builds (ST2-09) are scheduled outside protected release or capture windows.

| Seq | ID | Task | Files (under `app/src/` unless noted) | Depends | Acceptance test | Effort (est.) | PR |
|---|---|---|---|---|---|---|---|
| 1 | ST2-01 | Adapter + validation (§4.2–4.3 rules 1–8), with S14 (WM2 `artifact` marker) and S15 precedence | `lib/simulation-theater/adapter-nfl-sim-v2.mjs`, `validate.mjs` + tests | ST-01 sign-off (D1) | All runs on main pass. Second-half receiver 840/840. A real WM2 file → `ENGINE_MISMATCH`. Mutated fixtures (swapped score, clock gap, double possession, unknown result) fail with the right code; nulls carry reasons | 1.5–2 d | PR-1 |
| 2 | ST2-01b | Clock and label helpers: `displayPeriodAtStart`, `periodAtEnd`, period-aware END_HALF label, `ENGINE_CLOCK_RUNOFF` note, shared-run detection (S1, S3, S4, S5) | `lib/simulation-theater/format.mjs`, `validate.mjs` + tests | ST2-01 | Every second-half opener renders "Q3 15:00"; the 2700 and 900 starts render Q2/Q4 15:00. Run-off notes match the final threshold (10 at ≥900 s; 18 under the §4.3 rule 8 wording). 4 shared-run receipts detected. Run #428 drive 19 labelled "end of regulation" | 0.5 d | PR-1 |
| 3 | ST2-03 | `compileTimeline`, `stateAt`, `scene-rng`, transport machine, plus `QUARTER_ROLLOVER` markers (S2); orientation and length as policy params (D5, D7) | `lib/simulation-theater/{timeline,state-at,scene-rng,transport-machine}.mjs` + tests | ST2-01b | Determinism (§6.3). Exactly one Q1→Q2 and one Q3→Q4 rollover per run. Score changes only at RESULT. Scene seed leaves outcomes identical. No `Math.random`/`Date`. Seek ≤1 ms in Node (est.) | 1.5–2 d | PR-1 |
| 4 | ST2-02 | Accessible SSR shell: banner, sample anchors (merged chips), final-frame SVG, linescore, transcript, noscript, absence card; preview route `generateStaticParams` returns a **fixed list of ≤3 fixture event ids** (e.g. 401873008) (S12) | `components/simulation-theater/{TheaterSection,Transcript}.tsx`, `app/preview/simulation-theater/[eventId]/page.tsx` (`guardInternalRoute()`, noindex) | PR-1 | Transcript snapshot for #428 drive 1 equals "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0". Route absent from the pruned export. axe 0 serious/critical. Works with JS off. Build-time delta under 0.5% (est.) | 1.5–2 d | PR-2 |
| 5 | ST2-06 | NFL colour map + contrast test (Appendix A) | `lib/sports/nfl/team-colors.mjs` + test | **D3** | 32 keys matching the receipts, looked up as `nfl:<ABBR>`. Ink ≥4.5:1; accent ≥3:1 on both turf stripes. `team-badge.tsx` untouched; fallback path tested | 0.5–1 d | PR-3 |
| 6 | ST2-04 | Renderer + island: static and dynamic SVG layers, **no viewBox camera** (S8), `TheaterLoader` shim (S11), rAF / IntersectionObserver / visibility pause, focus-scoped keyboard (S9) | `components/simulation-theater/*` | PR-1, PR-2 (PR-3 optional: neutral fallback) | 0 rAF callbacks over 10 s paused, hidden or off-screen. Arrow keys on the range input do not switch drives. Loader ≤2 KB; island ≤30 KB gzip (est. targets). 0 playback requests | 2–3 d | PR-4 |
| 7 | ST2-05 | Side panel tabs + throttled `LiveAnnouncer` + composite timeline widget (S9) | `SidePanel.tsx`, `LiveAnnouncer.tsx`, `DriveTimeline.tsx` | ST2-04 | ≤1 announcement per 3 s above 1×. The timeline is one tab stop. Evidence lists every unavailable-field reason and every run-off note | 1–1.5 d | PR-4 |
| 8 | ST2-07 | Polish: turf tokens, depth, celebrations, reduced-motion variant, `--motion-*` mapping (S18) | `FieldScene.tsx`, `app/globals.css` (turf pair only), timeline policy | PR-4; ST1-05 motion sheet | Screenshot baselines (6 states, 1440). Reduced-motion run has no tweened frames. Grain outside any animated subtree. No flashing >3/s | 1.5–2 d | PR-5 |
| 9 | ST2-08 | Mobile 390/320: 320 field per §2.3 (288 px usable by default, full-bleed option) (S10), declared y-stretch policy, sheets, ≥24 px range thumb, `scroll-padding-top` | components above | ST2-07 | No overflow at 320/390/768. Targets ≥44 px; thumb ≥24 px. Focus never under the sticky score bug. Ball stays circular under y-stretch | 1.5–2 d | PR-5 |
| 10 | ST2-09 | Verification pass: §6 budgets, 5 cold + 5 warm runs, real mid-range phone if available | `app/e2e/simulation-theater.spec.ts` (local), PR notes | ST2-08 | Every budget met, or the gap stated. Write "worst of 5", not "p95" | 1–1.5 d | PR-5 |
| 11 | ST2-10 | Public island on `/nfl/simulation/[eventId]/`; all representatives (D4), replacing `.slice(0, 3)` | `components/nfl/simulation-v2-report.tsx`, `app/nfl/simulation/[eventId]/page.tsx` | PR-5; **D1, D2, D4**; release approval; #1124 decision (roadmap T4) | Existing sections unchanged except the added section. One code-merge build. Production check of 3 events | 2–3 d | PR-6 |

**Totals [EST].** About **12.5–18 d** for PR-1…PR-5 (local MVP) and about **15–21 d** including PR-6. That is above the roadmap's 6–10 d local MVP estimate because it includes the broadcast-polish (ST2-07), team colours (ST2-06) and mobile-specific (ST2-08) work the founder asked for, plus about 0.5 d for ST2-01b. These are estimates, not measurements.

**Starts on design approval (ST-01 sign-off, D1):** PR-1 (pure `lib`, no UI) and PR-2 (preview only). PR-4 follows them with the neutral palette, so it does not wait on D3.

**Waits on decisions:**
- PR-3 (ST2-06) waits on **D3**.
- PR-5's motion polish (ST2-07) waits on **ST1-05** (the timing sheet) and **D7**.
- PR-6 (ST2-10) waits on **D1, D2, D4**, release approval and T4 (#1124).
- **D8** gates only ST-03, not any PR here.
- **D5** and **D6** have engineering defaults and block nothing.

## 6. Visual-performance targets and local verification

### 6.1 Budgets (targets, not measurements)

| Item | Ceiling | Target |
|---|---|---|
| Theater JS on the route | ≤120 KB gzip (audit §8) | ≤30 KB gzip island (feasibility §7; pure modules ≈8–12 KB + components ≈10–18 KB, REVIEW §2.10 [EST]); no third-party renderer |
| Theater JS on this route's first paint (v1.1, S11) | ≤2 KB gzip | `TheaterLoader` only (est.); island loads after activation |
| JS added to any other route | 0 bytes | 0 (chunk-manifest diff vs baseline) |
| Inline sample data | ≤20 KB raw HTML for 5 samples | ≈16 KB (feasibility §5.2 [OBS]); also present in the RSC payload (≈2×, still small after gzip [INF]) |
| Playback network requests | 0 | 0 |
| Seek to correct state | p95 ≤100 ms | p95 ≤16 ms desktop |
| Frame rate | 60 FPS desktop / 30 FPS mid-range phone | frame-time p95 ≤20 ms desktop, ≤40 ms phone (audit §8); plausible only with static filters and no viewBox camera (S8) |
| Work while paused or hidden | no rAF, no timers | 0 callbacks over a 10 s idle trace |
| Memory | no monotonic growth across 20 sample switches | JS heap after switch 20 within +5% of switch 1 (after GC) |
| CLS | ≤0.1 | ≤0.02 (island reserves its height; SSR final frame has the same box) |
| Build overhead | ≤5% wall time and peak memory vs identical baseline (audit §8) | ≤2%; adapter runs once per event page; preview route with ≤3 fixtures <0.5% (est., S12) |

### 6.2 Local verification plan (localhost only)
1. `next build` (static export to `app/out`) with internal routes enabled for the preview route (≤3 fixture event ids, S12), then serve with `node app/scripts/serve-export.mjs` on localhost (F21). No Vercel preview.
2. Playwright (`app/playwright.config.ts`, `app/e2e/`) at 1440, 768, 390 and 320 px: no horizontal overflow (`scrollWidth ≤ clientWidth`); controls ≥44×44 and range thumb ≥24×24 (bounding boxes); screenshot baselines for the 6 states × 4 widths, rendered at fixed `t` via a test-only `?t=` seek hook on the preview route (never on the public route).
3. Keyboard: full tab order (§3.8; timeline is one stop), every shortcut, shortcuts inert outside the theater region, ←/→ on the seek range moves the range only, sheet focus trap/return, zero traps elsewhere, no focused element obscured by the sticky bug at 390/320. Screen reader: VoiceOver (Safari) manual pass reading banner → sample → score → controls → transcript; announcer cadence at 1× and 4×.
4. `prefers-reduced-motion: reduce` emulation (`page.emulateMedia({ reducedMotion: "reduce" })`): no tweened frames (sample `stateAt` phases), no autoplay, stepped Play, shell transitions at their reduced `--motion-*` values.
5. Performance traces in Chrome DevTools: 60 s playback at 1× and 4×, idle 10 s paused, 10 s hidden tab, 20 sample switches; record frame-time p95, long tasks, paint time, heap snapshots. CPU throttle 4× and a fixed network profile as the "mid phone" proxy, plus one real mid-range phone if available.
6. 5 cold + 5 warm runs per measurement; report median and worst (with n = 5, "p95" is effectively the worst observation; write "worst of 5").
7. Bundle: compare `.next` chunk sizes and the route's gzip JS against a `main` baseline build on the same machine.

### 6.3 Determinism tests
- For every representative on main: `stateAt(r, k, t)` at 200 fixed `t` values is identical (deep-equal, and a hash of the series) whether reached by (a) playing at 1×, (b) 2×, (c) 4×, (d) seeking forward, (e) seeking backward, (f) reload; tested in Node with a simulated clock (no browser needed).
- Reduced-motion timeline: the sequence of (driveIdx, score, period, clockEnd) at each RESULT equals the normal timeline's.
- *(v1.1, S1/S2)* Every second-half opener's `stateAt` at its START reads period 3, `periodClock` 900; exactly one `QUARTER_ROLLOVER` for each of Q1→Q2 and Q3→Q4 per run, at the instant the interpolated clock equals 2700 / 900.
- Changing `sceneSeed` changes only cosmetic fields (lane, grain).
- `compileTimeline` output hash is pinned per `sceneVersion`; a policy change must bump the version.

## 7. Cost controls
- **Localhost-first**: all development and review on `claude/*` branches and localhost (`COST-001`); only `main` and `preview/**` deploy (`app/vercel.json:5-9` `git.deploymentEnabled`: `main` true, `preview/**` true, `**` false [CV]); never push `preview/**`; no Vercel preview deploys.
- **0 new data writes**: nothing under `app/public/data`; receipts stay in `data/internal/research/nfl/sim-v2/shadow/**`; the adapter runs at build time inside the existing page (F14).
- **0 new workflows**, no paid services, no new scheduled jobs, no request-time compute, no polling.
- **Feature flag = route**: build under `/preview/simulation-theater/[eventId]/` (pruned from the export, `app/scripts/prune-internal-routes.mjs:41` [CV]) and unlinked; **(v1.1, S12)** its `generateStaticParams` returns a fixed list of ≤3 fixture event ids, because under `output: "export"` a dynamic route needs it, rendering every showable event would add pruned pages to every Production build [INF], and whether Next 14.2.15 accepts an empty array is unverified. The move to `/nfl/simulation/[eventId]/` is the release (ST2-10), needing founder approval and one code-merge build.
- **Build-time overhead**: ≤2% target / ≤5% ceiling on `next build` wall time and peak memory against the same baseline data (the build is already memory-sensitive: `experimental.cpus: 4`, F14); the preview route's share <0.5% (est.). Validation is linear in drives (≈100–135 events per receipt).
- **Known freshness gap** stays a separate decision (#1124); the theater adds no trigger of its own.

## 8. Design decisions: recommendation, authority and dependencies (8)

v1.1 restates each decision with the review's recommendation (REVIEW §5), whether it **genuinely needs founder authorization** or is an **engineering default** the coordinator can record, and its dependencies. Policy context: on 2026-09-07 the founder retired the staged reveal and recording/presentation experience as "ceremony" (P242; `components/simulate/presentation-player.tsx:3-7`, `components/game/simulation-animation.tsx:6` [CV, REVIEW §5]); on 2026-10-18 the founder approved Theater V2 as a **P1 planning** objective only. **Implementation is not authorized** by either.

| # | Decision | Recommendation | Founder authorization? | Depends on / gates | Alternatives (brief) |
|---|---|---|---|---|---|
| D1 | **P242 scope**: is playback in which every frame maps to a recorded `nfl-drive-sim-v2` drive outside the P242 retirement? | **Yes (a), under the §1 contract, with no autoplay and an explicit Play.** P242 removed waits imposed *before* the report; the theater is an optional view that delays nothing. Trade-off: it reopens animation, so the honesty labels carry the weight | **YES** — it limits a founder decision | P242; the 10-18 P1 planning approval. **Gates ST-01 sign-off, so every ST-02 PR** | (b) No: static tables only. (c) Yes, but stepped mode default and tweened motion opt-in |
| D2 | **Route** | Build on `/preview/simulation-theater/[eventId]/` (pruned, ≤3 fixtures, S12); release as a lazy island on `/nfl/simulation/[eventId]/` (same engine, already experimental-framed). Trade-off: one public page gains weight; no new route to index | **YES for the public route (the release); the preview location is an engineering default** | Gates PR-6 only | A new public route; `/nfl/game/[eventId]/` (ruled out: its sample games come from WM2, with no drive order) |
| D3 | **Team colours** | **Approve Appendix A** after brand-guide spot checks; **no logos or wordmarks: abbreviations plus colours**. Trade-off: real identity and polish vs trademark adjacency and upkeep after rebrands | **YES** (real organizations' identity). Until then the engineering default is neutral GTP tokens, so ST2-04 is not blocked | Counsel scope under `BETSLIP-001` B1 if logos are ever wanted. Gates PR-3 only | Neutral GTP tokens only (identity by text) |
| D4 | **All five representatives** with rule text, replacing the public `.slice(0, 3)` (`simulation-v2-report.tsx:242` [CV]) | **Yes.** Merge chips that share a run (S5); describe OVERTIME as "first overtime run by run index". Trade-off: more choice; the OVERTIME pick is not "typical" and says so | **Engineering default in preview; founder at release**, because it changes a public page | Gates PR-6 only | Keep three |
| D5 | **Field orientation** | **Fixed** (home end zone left all game), disclosed in Evidence. Q1/Q3 breaks fall mid-drive in 99% of runs [DATA], so swapping would flip the field mid-drive with no recorded basis. Trade-off: less realism, no invented geometry | **NO** — engineering/design default | Policy param in ST2-03; blocks nothing | Swap ends each quarter |
| D6 | **World-model context**: show the WM2 distribution beside the sample? | **Not in ST-02.** Exclusion is already the rule ("one `simulationReceiptId` per view", roadmap). If ever shown: a separately labelled, different-engine panel ("Different model: World Model V2 · not the engine of this replay"), never joined to the run, never sharing a scoreboard, chart axis or player row. Trade-off: less context, no cross-engine confusion; the shared `nfl-athlete-<espnId>` ids make splicing an easy mistake | **NO to exclude (the default); YES** only if it is ever wanted | Blocks nothing | A separate different-engine panel |
| D7 | **Playback length** | **Drive-weighted, ≈40–103 s at 1× (S17) with 1×/2×/4×; no long-form in ST-02.** Stretching the same recorded endpoints over 3–5 minutes adds only illustrative motion. Trade-off: a shorter watch; long-form would read more like a broadcast without adding information | **NO** for the default. The founder approves the timings via the **ST1-05 motion / D7 timing sheet** | ST1-05; gates PR-5's motion polish (ST2-07) | Long-form 3–5 minute mode |
| D8 | **ST-03 recording**: approve `nfl-drive-run@2` (`boxScore` + `driveStats`, forward-only)? | **Approve, with the S16 correction**: change the input hash (bump `NFL_SIM_V2_VERSION` or hash `runSchemaVersion`); this changes `baseSeed`, so upcoming games' representatives change once. Add the fixed-seed invariance harness and a ≤4 KB per-run cap. Trade-off: a synced player panel vs ≈10–15 KB per receipt (TV2 §7 [EST]) and a one-time representative change | **YES** — a producer change to a shadow artifact. **Not needed before ST-02** | Roadmap T3; ST-02 first. Gates ST-03 only, no PR in §5.2 | Do not record; full-game lines stay absent |

**Summary.** Founder authorization is genuinely needed for **D1** (before any ST-02 work), **D3** (before PR-3; neutral default meanwhile), **D2 and D4 at release** (PR-6), **D8** (ST-03 only) and **D6** only if WM2 context is ever wanted. **D5**, **D7** (default; timings via ST1-05), the preview location (D2) and D4-in-preview are engineering defaults.

## Appendix A. Proposed NFL colour map (32 teams) [PROP + WEB] (v1.1, S6/S7)

Copied from REVIEW §4; supersedes the v1.0 one-line proposal in §2.5. Values are a proposal for founder decision D3, not approved.

**Sources, accessed 2026-10-18.**
- Primary and secondary hex: [teamcolorcodes.com NFL page](https://teamcolorcodes.com/nfl-team-color-codes/).
- Cross-check: [Wikipedia `Module:Gridiron color/data`](https://en.wikipedia.org/wiki/Module:Gridiron_color/data).
  - Wikipedia agrees on most primaries but picks darker *background* shades for teams whose primary is light: PIT, NO and CIN black; DEN navy; JAX teal.
  - It also shows small hex differences: BAL `#24135F`, NYJ `#115740`, IND `#013369`, PHI `#004851`, TB `#A71930`.
- Individual team brand pages were not fetched. Before ST2-06 merges, the founder or designer should confirm each value against the team's own brand guide where one is public (ST1-03).

**Deviations from teamcolorcodes (REVIEW §4).**
- DAL secondary: silver `#869397` instead of the listed navy `#041E42`. Two navies do not separate on a dark field.
- TB secondary: pewter `#34302B`. The page's own "black" hex duplicates its orange, an apparent error.

**Columns.**
- *Ink*: the text colour on the primary (white `#FFFFFF` or the page ink `#0A0705`), with its WCAG contrast ratio. Every team reaches ≥4.5:1; the minimum is 4.69 (LAC).
- *Accent*: for ribbons and edges on the dark page, ≥3:1 vs `#0A0705`. Needs re-checking against the final turf tokens.
- *P vs bg*: the primary's contrast with `#0A0705`.

| Team | Primary | Secondary | Ink on primary | Accent (ratio) | P vs bg |
|---|---|---|---|---|---|
| ARI | #97233F | #000000 | white 7.99 | #FFB612 11.43 | 2.51 |
| ATL | #A71930 | #000000 | white 7.43 | #A5ACAF 8.72 | 2.70 |
| BAL | #241773 | #000000 | white 14.53 | #9E7C0C 5.11 | 1.38 |
| BUF | #00338D | #C60C30 | white 11.30 | #C60C30 3.34 | 1.78 |
| CAR | #0085CA | #101820 | dark 4.98 | #0085CA 4.98 | 4.98 |
| CHI | #0B162A | #C83803 | white 18.07 | #C83803 3.85 | 1.11 |
| CIN | #FB4F14 | #000000 | dark 5.96 | #FB4F14 5.96 | 5.96 |
| CLE | #311D00 | #FF3C00 | white 16.08 | #FF3C00 5.64 | 1.25 |
| DAL | #003594 | #869397 | white 10.84 | #869397 6.35 | 1.85 |
| DEN | #FB4F14 | #002244 | dark 5.96 | #FB4F14 5.96 | 5.96 |
| DET | #0076B6 | #B0B7BC | white 4.92 | #0076B6 4.08 | 4.08 |
| GB | #203731 | #FFB612 | white 12.71 | #FFB612 11.43 | 1.58 |
| HOU | #03202F | #A71930 | white 16.78 | #FFFFFF 20.09 | 1.20 |
| IND | #002C5F | #A2AAAD | white 13.77 | #A2AAAD 8.50 | 1.46 |
| JAX | #101820 | #D7A22A | white 17.89 | #D7A22A 8.70 | 1.12 |
| KC | #E31837 | #FFB81C | white 4.72 | #E31837 4.26 | 4.26 |
| LAC | #0080C6 | #FFC20E | dark 4.69 | #0080C6 4.69 | 4.69 |
| LAR | #003594 | #FFA300 | white 10.84 | #FFA300 10.03 | 1.85 |
| LV | #000000 | #A5ACAF | white 21.00 | #A5ACAF 8.72 | 1.05 |
| MIA | #008E97 | #FC4C02 | dark 5.08 | #008E97 5.08 | 5.08 |
| MIN | #4F2683 | #FFC62F | white 10.84 | #FFC62F 12.79 | 1.85 |
| NE | #002244 | #C60C30 | white 16.00 | #C60C30 3.34 | 1.26 |
| NO | #D3BC8D | #101820 | dark 10.85 | #D3BC8D 10.85 | 10.85 |
| NYG | #0B2265 | #A71930 | white 14.68 | #A5ACAF 8.72 | 1.37 |
| NYJ | #125740 | #000000 | white 8.53 | #FFFFFF 20.09 | 2.36 |
| PHI | #004C54 | #A5ACAF | white 9.71 | #A5ACAF 8.72 | 2.07 |
| PIT | #FFB612 | #101820 | dark 11.43 | #FFB612 11.43 | 11.43 |
| SEA | #002244 | #69BE28 | white 16.00 | #69BE28 8.61 | 1.26 |
| SF | #AA0000 | #B3995D | white 7.75 | #B3995D 7.30 | 2.59 |
| TB | #D50A0A | #34302B | white 5.42 | #D50A0A 3.71 | 3.71 |
| TEN | #0C2340 | #4B92DB | white 15.79 | #4B92DB 6.15 | 1.27 |
| WSH | #5A1414 | #FFB612 | white 13.59 | #FFB612 11.43 | 1.48 |

**Notes.**
- **Keys.** The 32 abbreviations the receipts actually use, including `WSH` (not WAS), `LAR`, `LV` and `JAX` [DATA]. Lookups are keyed `nfl:<ABBR>`.
- **Ink choice.** "dark" means `#0A0705` (`--bg`). Seven teams need dark ink (CAR, CIN, DEN, LAC, MIA, NO, PIT): white on them would be 4.03, 3.37, 3.37, 4.28, 3.95, 1.85 and 1.76 respectively.
- **Accent.** 22 of 32 accents are not the primary. 20 of 32 primaries are below 2:1 on the page.
- **Collisions with `TEAM_COLORS` (F17): 10** — DEN, MIN, MIA, DAL, PHI, IND, CLE (NBA) and SEA, HOU, ATL (MLB).
- **Primary-vs-primary collisions:** CIE76 ΔE < 20 in 48 of 496 pairs; 3 identical (CIN = DEN, DAL = LAR, NE = SEA). Handling in §2.5.
- **Contrast unit test** asserts: ink ≥4.5:1 on the primary; accent ≥3:1 on *both* turf stripes; lookups keyed `nfl:<ABBR>`, so no NBA or MLB key can ever match.
- **Out of scope but noted (REVIEW §2.8).** Today's NFL pages use `TeamLogo` with `sport: "nfl"`, which hotlinks ESPN logos and falls back to `TeamBadge`; in that fallback the Broncos get Nuggets colours and the Seahawks Mariners colours (`components/team-logo.tsx:1-20`). Worth its own ticket; counsel should review the logo hotlinking separately, together with `BETSLIP-001`'s legal review.
