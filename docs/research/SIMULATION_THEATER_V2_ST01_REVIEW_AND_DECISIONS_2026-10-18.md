# Simulation Theater V2 — ST-01 independent review and decision package

Date: 2026-10-18 (UTC). Type: read-only review plus this one document. No code, data, build, test, commit or deploy.
Spec under review: `docs/research/SIMULATION_THEATER_V2_ST01_SPEC_2026-10-18.md` (462 lines, commit `ae8ee0aa7b`), cited as **SPEC §n**.
Context read: `SIMULATION_THEATER_V2_FEASIBILITY_2026-10-18.md` (**TV2**), roadmap `SIM-THEATER-001` (on branch `claude/launch-readiness-oct20`; the section is **not on `origin/main`** yet, 0 matches there), `~/Downloads/competitor-audit.md` (**audit**).
Code base: `origin/main` @ `5fbf5889ec`, read with `git show` / `git grep`. Paths are relative to `app/src/` unless they start with `app/`, `data/`, `docs/` or `.github/`.

Evidence tags:
- **[CV]** code-verified on `origin/main` (path:line).
- **[DATA]** my own reconciliation script over **all 168 receipts × 5 representatives = 840 runs** under `data/internal/research/nfl/sim-v2/shadow/**` on `origin/main` (read-only `git show` → `python3 -I`, scratch files deleted afterwards).
- **[WEB]** public web page, accessed 2026-10-18 (sources listed where used).
- **[INF]** inference. **[PROP]** proposal. **[EST]** estimate (every effort, size and timing figure here is one unless tagged [CV]/[DATA]).

Wording rules kept: nothing here claims GTP is more accurate than any competitor. `nfl-drive-sim-v2` is experimental (`promotionState: "SHADOW"`, `sim-v2/receipt.mjs:249` [CV]). On held-out games its winner log loss was 0.6468 vs 0.6358 for V1 and 0.6419 vs 0.6343 (lower is better). So V2 was worse on both point estimates, and no intervals were reported (as cited by TV2 §1 item 7).

---

## 1. Verdict summary

| # | Item | Verdict | One-line reason |
|---|---|---|---|
| 1 | Recorded drives only | **PASS** | Every scene field maps to `engine.mjs:416` events; 840/840 runs carry `nfl-drive-sim-v2` / `nfl-drive-run@1` |
| 2 | One receipt and one run per event; engine-identity check | **PASS** (+ GAP) | Identity fields are present on every receipt. GAP: in 4 of 168 receipts two `kind`s share one `runIndex`, which the spec does not handle |
| 3 | Clock, points crediting, possession exceptions | **PASS** on the claims · **ISSUE** in the display rules | 0 violations over 840 runs. But the `q` label is wrong at quarter boundaries, and the spec's BREAK rule can never emit END Q1 or END Q3 |
| 4 | No invented plays | **PASS** (minor ISSUE) | No plays, downs or players are drawn. The clock between a drive's endpoints is interpolated and should be classed illustrative. 10 runs contain 15–28-minute "1–5 play" END_HALF drives that need a visible note |
| 5 | Rendering quality vs "broadcast" target | **ISSUE** (expectation) | SVG + HTML reaches a broadcast *graphics package* (Gamecast-tier 2D), not "watching a broadcast". The ceiling is the drive-level data, not the renderer. Animating the viewBox over filtered layers is a performance risk |
| 6 | Accessibility and reduced motion | **ISSUE** | Strong base: transcript, `aria-hidden` scene, no autoplay. Gaps: ←/→ conflicts with the range input, WCAG 2.1.4 single-key shortcuts, announcer cadence at 4×, 34 tab stops on the timeline, sticky score bug vs 2.4.11 |
| 7 | Mobile at 390 and 320 px | **ISSUE** (minor) | The 320 px field "≈300 px" exceeds the 288 px usable width. The aspect-ratio and y-scaling policy is unstated. The native range thumb is under 24 px |
| 8 | NFL team colours and branding | **GAP** → proposal in §4 | No map exists [CV]. 10 NFL abbreviations collide with `TEAM_COLORS`, not the 6 the spec lists. 20 of 32 primaries fall below 2:1 on the dark page |
| 9 | Historical evidence unchanged; ST-03 forward-only | **PASS** (+ GAP) | ST-01/02 write nothing. GAP: the builder's `inputHash` omits `runSchemaVersion`, so `nfl-drive-run@2` would never be written for events whose inputs have not changed |
| 10 | Performance targets | **PASS** (plausible) | About 6 moving nodes and an O(log n) seek. The ≤120 KB ceiling has large headroom. Risk is paint cost, not JS: viewBox animation and SVG filters |

**Top 3 spec defects** (detail in §3):
1. **Quarter labels at boundaries.** The engine labels a drive by `quarterOf(clockStart)`, and an instant exactly on a boundary belongs to the earlier quarter (`engine.mjs:42-43`). All 840/840 second-half opening drives therefore carry `q: 2` with `clockStart: 1800`. The spec's `periodClock = clock − 900 × (4 − period)` would show the Q3 kickoff as **"Q2 0:00"**. The spec's own reference run #428 hits this twice: drive 10 (`q:2, clockStart:1800`) and drive 15 (`q:3, clockStart:900`).
2. **END Q1 / END Q3 can never fire.** The spec emits a BREAK when "the quarter of `clockEnd` differs from the next drive's `q`". Within a half, `next.clockStart === prev.clockEnd` (0 gaps [DATA]), so `next.q === quarterOf(prev.clockEnd)` always holds. In 834/840 runs (Q1) and 829/840 (Q3), the quarter ends *inside* a drive [DATA].
3. **END_HALF is mislabelled, and long clock run-offs are unflagged.** END_HALF also ends regulation (630 drives) and overtime (17) [DATA]. The spec's own mock shows drive 19 at Q4 0:00 as "Result: end of half". Separately, 10 runs contain END_HALF drives of 1–5 plays that consume 933–1,674 s; 7 of those 10 are LOW_SCORING picks [DATA]. The spec neither labels nor discloses them.

---

## 2. Item-by-item verification

### 2.1 Recorded drives only — PASS
- The only per-drive record is `events.push({q, clockStart, offense, startYardsToGoal, result, plays, netYards, seconds, score})` (`engine.mjs:416` [CV]). Representatives serialize `final`, `quarters` and `drives` only (`receipt.mjs:228-236` [CV]).
- The batch and the representative re-simulation both run with `players: prep`: `app/scripts/nfl/build-nfl-sim-v2-shadow.mjs:137` and `receipt.mjs:227` [CV]. They use the same `runRng(baseSeed, idx)` and the same calibrated `thetas`, so a representative is the batch's run *idx*. Pushing `events` consumes no RNG.
- Identity on all 168 receipts [DATA]: `simulationEngine nfl-drive-sim-v2`, `2.0.0-shadow`, `simulation-receipt@2`, `nfl-drive-run@1`, `SHADOW`, `runCount 10000` (one combination, 168/168).
- SPEC §1.2's recorded/illustrative/forbidden split matches this field set. The adapter table (SPEC §4.2) adds only derived fields (`clockEnd`, `fieldEnd`, `scorePeriod`, `scoreBefore`).

### 2.2 One receipt, one run per animated event — PASS, with one GAP
- The route resolves one receipt of record per event: the latest generated before kickoff, fail-closed, never an older substitute (`sim-v2/public-receipt.mjs:44-60` [CV]). The theater consumes `rec.receipt` and echoes `receiptId` + `runIndex` on every `SceneState` (SPEC §3.3). That is sufficient [INF].
- **Engine-identity check.** A positive check (`simulationEngine === "nfl-drive-sim-v2"` and `schemaVersion === "simulation-receipt@2"`) already rejects any WM2 file. Correction to SPEC §4.3 rule 1: `nfl-world-model-v2-simulation` is WM2's **`artifact` field** with numeric `schemaVersion: 2` (`app/scripts/nfl/build-nfl-world-model-v2.mjs:221` [CV]), not an engine id. The negative test should feed a real `app/public/data/nfl/world-model-v2/<id>.json` and expect `ENGINE_MISMATCH`.
- **GAP: duplicate runs.** 4/168 receipts have two kinds on the same `runIndex` [DATA]:

  | Receipt | Shared run |
  |---|---|
  | `401872999-48b22f9741b14789` | MEDIAN_LIKE = UPSET = #134 |
  | `401873005-dc8c9c8b13bf359d` | HIGH_SCORING = OVERTIME = #42 |
  | `401872997-bc61837dc9430351` | MEDIAN_LIKE = OVERTIME = #73 |
  | `401873006-00021db64663c940` | MEDIAN_LIKE = OVERTIME = #25 |

  The selector would show two chips that play the identical game. [PROP] Render one chip with both rule texts ("Median-like · also the first overtime run"); validation rule 6 asserts unique `kind`s and *reports* shared indices.

### 2.3 Clock, points and possession — claims PASS; display rules ISSUE
My script checked the spec's rules 2–5 independently over **840/840 runs** [DATA]. Results:

| Check | Result |
|---|---|
| `drives[last].score` = `final` | 0 failures |
| Score delta allowed for each result | 0 failures. TD offense +6 / +7 / +8 seen 459 / 3,378 / 230 times; OPP_TD +6/+7 to the defense; SAFETY +2 |
| **Points credited to `quarterOf(clockStart − seconds)`, OT → index 4, reproduce `quarters`** | **840/840** |
| Same check crediting the drive's start quarter `q` instead | **fails in 733/840**. The distinction is real |
| `clockStart` counts down 3600 → 0 across the game | 0 increases and 0 gaps in regulation: `clockStart[i+1] = clockStart[i] − seconds[i]`, except the second-half start, which is always 1800 |
| OT clock | Every OT starts at 600 (199 runs); within OT `next = max(0, prev − seconds)`; 0 postseason 900 s restarts exist on main |
| `seconds < 5` | 42 drives, all cut by the clock |
| Field | `startYardsToGoal` 1–99; TD `netYards = start`; SAFETY `netYards = start − 100`; derived non-TD/SAFETY end spot 1–99. 0 failures |
| Tied finals | 23, all with `overtime: true` |
| Drives per run | 11–34 (mean 22.4). Confirms SPEC's 11–34; TV2's 16–27 is stale |

Possession exceptions [DATA]:

| Case | Observed | Code |
|---|---|---|
| (a) after OPP_TD the same offense receives | 216/216 | `engine.mjs:404` [CV] |
| (b) second-half receiver = `1 − drives[0].offense` | **840/840** (the spec left this unverified) | `:437` |
| (c) first OT drive is a coin flip | 98 same / 101 different from the last regulation offense | `:445` |
| (d) postseason restart, same `pos`, **same `y0`** | 0 on main (no postseason yet); code only | `:426` |
| Any other repeat | 0 | — |

- **Precedence the spec omits.** Halftime and end-of-regulation resets override (a). Twice, an OPP_TD was the half-ending drive and the reset applied [DATA, CV `:433-440`]. Rule 4 must apply the resets first.
- **Engine deviation to list as a limitation.** The first OT period is 600 s even in the postseason (`:444`); only a tied postseason OT restarts at 900 (`:426`). SPEC rule 3's "600 regular season; 900 per restarted postseason period" is correct but easy to misread.
- **ISSUE: display period.** `q` uses `quarterOf(clockStart)` with `>=` thresholds, so a drive starting on a boundary is labelled the *earlier* quarter. Seen in 840 drives at 1800 (`q 2`), 6 at 2700 (`q 1`) and 11 at 900 (`q 3`) [DATA]. The public table at `components/nfl/simulation-v2-report.tsx:252` prints `d.q` today, so the Q3 kickoff drive already reads "2" there [CV; out of scope].
- **ISSUE: quarter breaks.** These are mid-drive in 99% of runs (§1, defect 2). Corrections in §3.

### 2.4 No invented plays — PASS (minor ISSUE)
- No snaps, downs or distance, penalties, players or per-play hops. `plays` is text only (SPEC §1.2). Kicks and returns are a card, which matches `engine.mjs:19-22` and `:394-414` [CV].
- **ISSUE: the clock between endpoints.** SPEC §1.2 lists "game clock" as recorded. Only `clockStart` and the derived end are recorded; the countdown between them is a linear interpolation. [PROP] Class it as illustrative, like the ball path.
- **ISSUE: run-off drives.** 10 END_HALF drives of 1–5 plays consume 933–1,674 s. Example: `401872996-dec4680410c2d908` LOW_SCORING, `{q:1, clockStart:3474, plays:1, seconds:1674}` [DATA]. The cause is `engine.mjs:230-232`: an END_HALF draw takes the whole remaining half. Rendered faithfully, the clock spins 28 minutes in 0.9 s on a "1 play" drive. [PROP] Show it as recorded, with an inline note: "Engine ran out the half on this drive (clock use not modelled play-by-play)". Add it to Evidence → limitations, and report it to the `NFL-002` owner. Never edit or skip the drive.
- **OPP_TD wording.** The engine draws interception vs fumble (`:254`) but does not record it. The chip must read "Defensive touchdown · SF", never "interception" or "fumble".

### 2.5 Rendering quality — ISSUE (expectation, not architecture)
- **Achievable with hand-written SVG in an HTML shell [INF]:**
  - crisp vector art at any device pixel ratio;
  - linear and radial gradients, `<pattern>` turf stripes, masks and clip paths;
  - drop shadows and grain baked into a static layer;
  - an HTML/CSS score bug with gradients, inset highlights and `backdrop-filter`;
  - eased ball and ribbon motion, digit rolls and chip transitions.

  That is the quality tier of a network's 2D drive tracker or Gamecast-style graphics package. It is enough for "premium, broadcast-styled".
- **Not achievable from this data, with any renderer:** "closer to watching a football broadcast". No players, formations, snaps or camera-worthy play events exist in `nfl-drive-run@1`. Canvas or WebGL would draw the *same* ball moving along a line. Broadcast-like footage needs ST-04 play-level output, then ST-05 2.5D. The founder should hear this before approving ST-01 [INF].
- **Honest SVG vs Canvas limits [INF; WEB benchmarks are dated]:**
  - **Many objects.** SVG is DOM-per-shape. One dated benchmark measured about 10 ms for 1,000 SVG objects vs about 1 ms on canvas (LogRocket, 2019, Chrome 73). Developer forums put smooth SVG animation at "hundreds" of elements (GSAP forum). A 10,000-segment path ran about 20× slower in SVG in 2012, with the gap narrowed since (codedread). With about 6 moving nodes, this limit does not bind.
  - **Filters.** `feTurbulence`, `feGaussianBlur` and drop-shadow filters are expensive and largely CPU-rasterized; animating anything inside a filtered subtree re-rasterizes it every frame. Canvas would let a noise texture be blitted cheaply.
  - **Camera.** SPEC §2.4 pans and zooms via the **viewBox**. Changing the viewBox re-renders the *whole* SVG every frame, including the static turf pattern and grain filter. That breaks the "grain rendered once" rule (SPEC §2.5). [PROP] Either (a) drop the camera from the ST-02 MVP and keep the full field, or (b) move the camera to a CSS `transform` on a wrapper with `will-change: transform`. Option (b) composites cheaply but softens slightly during zoom at ≤1.35×. Recommend (a) first and (b) behind the motion sheet.
  - **Textures.** No raster assets means no photographic turf. Procedural stripes plus static grain look clean and premium, not photoreal. Photoreal would need raster or Canvas assets, a deliberate ST-05 question.
- **Verdict.** Option C is the right choice (SPEC §3.2); its SSR final frame and accessibility advantages are real. The spec should set the quality bar as "broadcast graphics package, 2D". Sources: [LogRocket](https://blog.logrocket.com/when-to-use-html5s-canvas-ce992b100ee8), [codedread path benchmark](https://www.codedread.com/blog/?p=757), [GSAP forum](https://gsap.com/community/forums/topic/17587-over-400-svg-elements-performance/) [WEB].

### 2.6 Accessibility and reduced motion — ISSUE
- **Solid** [PROP review]:
  - The scene is `aria-hidden` and the HTML transcript is its equivalent, generated from recorded fields.
  - `<noscript>` text and an SSR final frame.
  - No autoplay; nothing flashes more than 3 times a second.
  - Reduced motion changes only the compiled timeline. The site already has a global reduced-motion block (`app/globals.css:376-390` [CV]) that zeroes the `--motion-*` duration tokens. The HTML shell's CSS transitions should use those tokens; the rAF loop must still check `matchMedia` itself (SPEC §2.4 does).
- **Gaps:**
  1. ←/→ for previous/next drive conflicts with the native `input[type=range]` arrow keys when the seek bar has focus. Scope shortcuts to the theater region, exclude the range input, and do not bind Space when focus is on a button (Space activates it natively).
  2. K and 1/2/4 are single-character shortcuts: WCAG 2.1.4 requires a way to turn them off or remap them, or that they work only while the region has focus. Recommend focus-scoped.
  3. One `aria-live` announcement per drive becomes 1–2 a second at 4× (§2.10 timings). Announce scores, possession-ending turnovers and breaks only while playing above 1×, at most one per 3 s. Announce the current drive in full on pause or seek-settle.
  4. A timeline of up to 34 drive buttons is 34 tab stops. Make it one composite widget: roving tabindex, arrow keys move, Enter seeks.
  5. The sticky mobile score bug must not hide focused elements (WCAG 2.4.11): set `scroll-padding-top` to the bug's height.
  6. Play/Pause should swap its accessible name ("Play" / "Pause") rather than use `aria-pressed` with a changing label (ARIA APG toggle-button guidance) [INF].

### 2.7 Mobile practicality — ISSUE (minor)
- **390 px.** 390 − 2×16 = 358 px usable. A true 120 × 53.3 field (2.25:1) at 358 px is 159 px tall; the spec asks for ≥168 px. That is fine only if the **y-axis is declared data-free**, so the field may stretch vertically, with the ball drawn in unscaled screen units so it does not become an oval. [PROP] Say so in SPEC §2.2.
- **320 px.** The "≈300 × 150" field exceeds the 288 px usable width. Either go full-bleed at 320 (0 gutters on the scene only) or accept 288 × ≥128 px. The transport arithmetic, 5 × 44 + 4 × 8 = 252 ≤ 288, is correct.
- **Vertical budget at 390 × 844** [EST]: banner 40, score bug 56, sample row 44, badge 32, field 168, timeline 44, transport 44 + 44 ≈ 470 px. That fits above the fold. At 320 × 568, the transport scrolls below the field, so the sticky score bug matters.
- **Touch.** The native range thumb is about 16–20 px. Style a ≥24 px thumb (WCAG 2.5.8) inside the 44 px row.

### 2.8 NFL team colours and branding — GAP (proposal in §4)
- **Confirmed: no NFL map [CV].** `TEAM_COLORS` (`components/team-badge.tsx:40-71`) holds NBA/MLB entries looked up by bare abbreviation (`:115`).
- **Collisions are 10, not the spec's 6:** DEN, MIN, MIA, DAL, PHI, IND, **CLE** (NBA) and **SEA, HOU, ATL** (MLB).
- **Today's NFL pages already hit this [CV].** They use `TeamLogo` with `sport: "nfl"`, which hotlinks ESPN logos and falls back to `TeamBadge`. In the fallback path, the Broncos would get Nuggets colours and the Seahawks Mariners colours (`components/team-logo.tsx:1-20`, consumers `app/nfl/game/[eventId]/page.tsx`, `components/nfl/forecast/*`). This is outside the theater's scope but worth its own ticket.
- **Token ratchet [CV].** It scans `.tsx` only (`lib/uiux/token-ratchet.test.mjs`) and treats team colours as `identityData` (`token-exception-registry.mjs:30-32`). A `lib/sports/nfl/team-colors.mjs` therefore does not move the ratchet. Theater `.tsx` files must still use only `var(--…)`.
- **Trademark [INF; not legal advice].** Team names, abbreviations and colours used to identify a team are factual references. Logos, wordmarks, helmet and uniform designs, and the NFL shield are trademarks. [PROP] Use no logos or wordmarks in the theater, only abbreviations plus colours. Simulated games shown with real logos could read as endorsed. GTP already hotlinks ESPN team logos elsewhere; counsel should look at that separately, together with `BETSLIP-001`'s legal review.

### 2.9 Historical evidence unchanged — PASS (+ GAP for ST-03)
- **ST-01 and ST-02 write no data.** The adapter runs at build time over receipts the page already parses (`app/nfl/simulation/[eventId]/page.tsx:24-25,60` [CV]). Nothing is written to `app/public/data` (SPEC §7).
- **Write-once is enforced** by the shadow workflow, which refuses any non-`A` status (`.github/workflows/nfl-sim-v2-shadow.yml` "Commit new shadow receipts (add-only)" step [CV]), and by `writeFileSync(..., { flag: "wx" })` (`build-nfl-sim-v2-shadow.mjs:150`).
- **ST-03 is forward-only** in SPEC §4.4, and historical receipts show an explicit absence. PASS.
- **GAP.** `inputHash` hashes `{engine: NFL_SIM_V2_VERSION, params, anchors, runs, players}` but **not** `runSchemaVersion` (`build-nfl-sim-v2-shadow.mjs:129-132` [CV]). The builder skips any event whose id already exists (`:133`). If ST-03 bumps only `runSchemaVersion`, unchanged-input games never get an `@2` receipt. [PROP] Bump `NFL_SIM_V2_VERSION`, or add `runSchemaVersion` to the hash, and state the consequences:
  - `baseSeed` changes (`:134`), so the next receipt of record for an upcoming game shows *different* representatives;
  - there is a one-off burst of new receipts that rides the existing shadow commit (0 new commits [INF]);
  - the "byte-identical with recorder on/off" test (SPEC §4.4) runs in a fixed-seed harness and excludes `artifactHash` and `runSchemaVersion`, which must differ.

### 2.10 Performance targets — PASS (plausible)
- **JS.** The pure modules (adapter, validate, timeline, state-at, format, transport) come to roughly 8–12 KB gzip [EST]. Components add 10–18 KB. React is already on the route. The ≤30 KB target is plausible and the ≤120 KB ceiling has wide headroom.
  - Correction: in Next 14.2.15 (`app/package.json:50` [CV]), `next/dynamic(..., { ssr: false })` cannot be called from a server component, and dynamic import fires on render, not on interaction. A small `"use client"` loader (about 1–2 KB [EST]) must hold the "activated" state and render the island. So "0 theater JS on first paint" becomes "≤2 KB loader".
- **Data.** Props from the server component are serialized into the page's RSC payload as well as the SSR transcript. About 16 KB raw for 5 samples (TV2 §5.2) appears roughly twice [INF]; that is still small after gzip.
- **Seek.** `stateAt` is a binary search over ≤ ~200 keyframes (34 drives × 5 phases plus breaks) plus interpolation: microseconds in JS [INF]. The cost is the DOM update and one React panel render, a few ms. **p95 ≤100 ms is very plausible**, and the ≤16 ms desktop target is plausible.
- **FPS.** About 6 moving nodes with direct attribute writes. 60 FPS on desktop is plausible without viewBox animation. 30 FPS on a mid-range phone is plausible if filters stay static and the camera is off or CSS-transform based (§2.5). The binding risk is paint, not script [INF].
- **Timeline length.** Recomputed with the spec's own policy (SPEC §2.4/§3.4) over 840 runs, excluding break keyframes: **35.1–97.2 s, median 66.6 s** at 1× [DATA]. Breaks add about 5 s [EST]. So 1× is about 40–103 s, not "45–125 s" (SPEC §8 D7) or "34 drives ≈ 125 s" (§3.4).

---

## 3. Spec defects and proposed corrections

| # | Where | Defect | Correction [PROP] |
|---|---|---|---|
| S1 | §3.3, §2.1 timeline, transcript | `q` is the earlier quarter on boundaries, so the Q3 kickoff shows "Q2 0:00" (840/840 runs) | Adapter derives `displayPeriodAtStart(c)` = `c > 2700 ? 1 : c > 1800 ? 2 : c > 900 ? 3 : 4` (Q1 at 3600), and `periodAt(c)` for running and end instants. Timeline groups, transcript and score bug use these, never raw `q`. Test: every second-half opener renders "Q3 15:00" |
| S2 | §3.4 BREAK rule, §2.4 "End of quarter", camera "returns at quarter breaks" | END Q1 and END Q3 never emitted; quarter ends are mid-drive in 834 and 829 of 840 runs | Emit a `QUARTER_ROLLOVER` marker at the interpolated instant the clock crosses 2700 or 900, or at a drive boundary when the crossing is exact (6 and 11 cases). Use a non-blocking chip; the ball does not stop, because a pause could read as a play stoppage. Keep blocking BREAKs for halftime, OT start and final |
| S3 | §1.2/§4.1 result labels; §2.1 mock "Result: end of half" at Q4 0:00 | END_HALF also ends regulation (630) and OT (17) | Label by period: Q2 "end of half", Q4 "end of regulation", OT "end of overtime" |
| S4 | §4.3 (absent) | 10 run-off END_HALF drives (933–1,674 s, 1–5 plays) unflagged | Validation emits `ENGINE_CLOCK_RUNOFF` (END_HALF with `seconds > 300` and `seconds > 60 × plays`) as a *note*, not a failure. Inline caption plus Evidence limitation; report to `NFL-002` |
| S5 | §2.1 selector, §4.3 rule 6 | Duplicate `runIndex` across kinds (4 receipts) | Merge chips and show both rules; test over the 4 receipts |
| S6 | §2.5 contrast rules, §2.1 ribbon | Ribbon "offense primary at 55%" cannot reach the spec's own 3:1 rule for most teams: 20 of 32 primaries are below 2:1 on `#0A0705` (§4) | Add `accent` per team (first of primary, secondary, listed tertiary or white with ≥3:1 on turf). Ribbon and end-zone edge use `accent`; fills may use primary |
| S7 | §2.5 / F17 | Collision list says 6; it is 10. ΔE rule formula unspecified; under CIE76 ΔE<20, 48 of 496 pairs collide, 3 are identical (CIN=DEN, DAL=LAR, NE=SEA) | Name the formula. If both primaries *and* the away secondary collide, the away team gets a hatched end-zone pattern. Possession stays shape-coded |
| S8 | §2.4 camera, §2.5 grain | viewBox animation re-rasterizes the filtered static layer every frame | Camera off in the MVP, or a CSS-transform camera; grain kept outside any animated subtree |
| S9 | §2.1 keyboard, §3.8 | Arrow-key conflict with the range input; WCAG 2.1.4; announcer at 4×; 34 tab stops; 2.4.11 | As in §2.6 items 1–5 |
| S10 | §2.3, §2.2 | 320 field wider than usable width; y-scaling unstated | As in §2.7 |
| S11 | §3.7 island loading | `ssr:false` from a server component; load-on-interaction needs a client loader | Add a `TheaterLoader.tsx` client shim (≤2 KB); restate the budget |
| S12 | §5.2 ST2-02 preview route `[eventId]` | Under `output: "export"` a dynamic route needs `generateStaticParams`. Rendering every showable event adds pruned pages to *every* Production build [INF]. Whether Next 14.2.15 accepts an empty array is unverified | Return a fixed list of ≤3 fixture event ids (for example 401873008). Budget: under 0.5% build time [EST] |
| S13 | §1.2 "game clock recorded" | Intermediate clock values are interpolated | Class them "illustrative between recorded endpoints" |
| S14 | §4.3 rule 1 | WM2 marker named as an engine id | It is `artifact: "nfl-world-model-v2-simulation"` (`build-nfl-world-model-v2.mjs:221`) |
| S15 | §4.3 rule 4 | Exception precedence unstated | Halftime and end-of-regulation resets first, then OPP_TD, then alternation |
| S16 | §4.4 ST-03 | `inputHash` omits `runSchemaVersion` | As in §2.9 |
| S17 | §8 D7, §3.4 | Length estimates high | 40–103 s at 1× [DATA + EST] |
| S18 | §2.4 | Motion table ignores the existing `--motion-*` tokens and the global reduced-motion block | Map CSS transitions in the shell to `--motion-*` tokens; rAF timings stay in the versioned scene policy |

---

## 4. Proposed NFL colour map (32 teams) [PROP + WEB]

**Sources, accessed 2026-10-18.**
- Primary and secondary hex: [teamcolorcodes.com NFL page](https://teamcolorcodes.com/nfl-team-color-codes/).
- Cross-check: [Wikipedia `Module:Gridiron color/data`](https://en.wikipedia.org/wiki/Module:Gridiron_color/data).
  - Wikipedia agrees on most primaries but picks darker *background* shades for teams whose primary is light: PIT, NO and CIN black; DEN navy; JAX teal.
  - It also shows small hex differences: BAL `#24135F`, NYJ `#115740`, IND `#013369`, PHI `#004851`, TB `#A71930`.
- Individual team brand pages were not fetched. Before ST2-06 merges, the founder or designer should confirm each value against the team's own brand guide where one is public.

**My deviations from teamcolorcodes.**
- DAL secondary: silver `#869397` instead of the listed navy `#041E42`. Two navies do not separate on a dark field.
- TB secondary: pewter `#34302B`. The page's own "black" hex duplicates its orange, an apparent error.

**Columns.**
- *Ink*: the text colour on the primary (white `#FFFFFF` or the page ink `#0A0705`), with its WCAG contrast ratio. Every team reaches ≥4.5:1; the minimum is 4.69 (LAC).
- *Accent*: for ribbons and edges on the dark page, ≥3:1 vs `#0A0705`. This needs re-checking against the final turf tokens.
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
- **Keys.** These are the 32 abbreviations the receipts actually use, including `WSH` (not WAS), `LAR`, `LV` and `JAX` [DATA].
- **Ink choice.** "dark" means `#0A0705` (`--bg`). Seven teams need dark ink (CAR, CIN, DEN, LAC, MIA, NO, PIT): white on them would be 4.03, 3.37, 3.37, 4.28, 3.95, 1.85 and 1.76 respectively.
- **Accent.** 22 of 32 accents are not the primary.
- **Contrast unit test.** It should assert three things: ink ≥4.5:1 on the primary; accent ≥3:1 on *both* turf stripes; and lookups keyed `nfl:<ABBR>`, so no NBA or MLB key can ever match.

---

## 5. Founder decision package (SPEC §8)

Policy context.
- **P242.** On 2026-09-07 the founder retired the staged reveal and the recording/presentation experience as "ceremony" (`components/simulate/presentation-player.tsx:3-7`, `components/game/simulation-animation.tsx:6` [CV]). The roadmap keeps it open as T1.
- **2026-10-18 approval.** The founder approved Theater V2 as a **P1 planning** objective. That covers direction and planning only; implementation is not authorized (roadmap §2A).

**D1 — P242 scope.**
- **Question.** Is playback in which every frame maps to a recorded `nfl-drive-sim-v2` drive outside the P242 retirement?
- **Options.** (a) Yes, under the §1 contract. (b) No: static tables only. (c) Yes, but stepped mode is the default and tweened motion is opt-in.
- **Recommendation: (a), with no autoplay and an explicit Play.** P242 removed waits imposed *before* the report. The theater adds an optional view and delays nothing.
- **Trade-off.** It reopens animation, so the honesty labels carry the weight.
- **Dependency.** P242; the 10-18 P1 planning approval.
- **Founder authorization: YES.** It reverses or limits a founder decision.

**D2 — Route.**
- **Question.** Where does the theater live?
- **Options.** A lazy island on `/nfl/simulation/[eventId]/`; a new route; `/nfl/game/[eventId]/`. The game page is ruled out because its samples are WM2, with no drive order [CV TV2].
- **Recommendation.** Build on `/preview/simulation-theater/[eventId]/` (pruned, ≤3 fixtures, S12); release as an island on `/nfl/simulation/[eventId]/`.
- **Trade-off.** One public page gains weight; no new route to index.
- **Founder authorization: YES for the public route (the release); the preview location is an engineering default.**

**D3 — Team colours.**
- **Question.** Approve an NFL-only colour map?
- **Options.** The map in §4 (abbreviations plus colours, no logos); neutral GTP tokens only.
- **Recommendation.** Approve §4 after brand-guide spot checks, with no logos or wordmarks.
- **Trade-off.** Real identity and polish, against trademark adjacency and upkeep after rebrands.
- **Dependency.** Counsel scope under `BETSLIP-001` B1 if logos are ever wanted.
- **Founder authorization: YES** (real organizations' identity). Until then the engineering default is neutral tokens, so ST2-04 is not blocked.

**D4 — All five representatives.**
- **Question.** Show all five, with rule text, replacing the public `.slice(0, 3)` (`simulation-v2-report.tsx:241` [CV])?
- **Recommendation.** Yes. Merge chips that share a run (S5), and describe OVERTIME as "first overtime run by run index".
- **Trade-off.** More choice; the OVERTIME pick is not "typical" and must say so.
- **Founder authorization.** Engineering default in preview; **founder at release**, because it changes a public page.

**D5 — Field orientation.**
- **Options.** Fixed, home end zone left, disclosed; or swap ends at each quarter.
- **Recommendation: fixed.** Real teams change ends at Q1/Q3, but those breaks fall mid-drive in 99% of runs [DATA]. Swapping would flip the field mid-drive with no recorded basis.
- **Trade-off.** Less realism, but no invented geometry.
- **Founder authorization: NO.** An engineering and design call; disclose it in the Evidence tab.

**D6 — World-model context.**
- **Question.** Show the WM2 distribution beside the sample?
- **Options.** Never; or a separate different-engine panel.
- **Recommendation.** Not in ST-02. Exclusion is already the rule ("one `simulationReceiptId` per view", roadmap).
- **Trade-off.** Less context, but no cross-engine confusion. The shared `nfl-athlete-<espnId>` ids make splicing an easy mistake.
- **Founder authorization: NO to exclude (default); YES** only if it is ever wanted.

**D7 — Playback length.**
- **Options.** Drive-weighted, about 40–103 s at 1× (S17); or a long-form 3–5 minute mode.
- **Recommendation.** Drive-weighted, with 1×/2×/4×; no long-form in ST-02. Stretching the same recorded endpoints over 3–5 minutes adds only illustrative motion.
- **Trade-off.** A shorter watch; long-form would read more like a broadcast without adding any information.
- **Founder authorization: NO** for the default. The founder approves timings via the ST1-05 motion sheet.

**D8 — ST-03 recording.**
- **Question.** Approve `nfl-drive-run@2` (`boxScore` + `driveStats`, forward-only)?
- **Recommendation.** Approve, with the S16 correction: a version bump changes `baseSeed`, so upcoming games' representatives change. Add the fixed-seed invariance harness and a ≤4 KB per-run cap.
- **Trade-off.** A synced player panel, against about 10–15 KB per receipt (TV2 §7 [EST]) and a one-time representative change.
- **Dependency.** Roadmap T3; ST-02 first.
- **Founder authorization: YES.** It is a producer change to a shadow artifact. **Not needed before ST-02.**

---

## 6. ST-02 execution-ready sequence [PROP; efforts EST for one engineer]

Ground rules (from SPEC §7, roadmap `COST-001`):
- Work on `claude/*` branches only and verify on localhost (`node app/scripts/serve-export.mjs`).
- Every PR before PR-6 is unreachable in Production: `lib/` only, or `/preview/**`, which is 404 via `guardInternalRoute()` and pruned by `app/scripts/prune-internal-routes.mjs:41`.
- 0 data writes. Tests iterate *all* receipts on main and never hard-code 168.
- Heavy local builds (ST2-09) are scheduled outside protected release or capture windows.

| Seq | ID | Task | Files | Depends | Acceptance test | Effort (est.) | PR |
|---|---|---|---|---|---|---|---|
| 1 | ST2-01 | Adapter + validation (rules 1–6), with S14 and S15 precedence | `lib/simulation-theater/adapter-nfl-sim-v2.mjs`, `validate.mjs` + tests | ST-01 sign-off (D1) | All runs on main pass. Second-half receiver 840/840. A real WM2 file → `ENGINE_MISMATCH`. Mutated fixtures fail with the right code | 1.5–2 d | PR-1 |
| 2 | ST2-01b | Clock and label helpers: `displayPeriodAtStart`, `periodAt`, period-aware END_HALF label, `ENGINE_CLOCK_RUNOFF` note, shared-run detection (S1, S3, S4, S5) | `lib/simulation-theater/format.mjs`, `validate.mjs` + tests | ST2-01 | Every second-half opener renders "Q3 15:00"; the 2700 and 900 starts render Q2/Q4 15:00. 10 run-off notes found. 4 shared-run receipts detected. Run #428 drive 19 labelled "end of regulation" | 0.5 d | PR-1 |
| 3 | ST2-03 | `compileTimeline`, `stateAt`, `scene-rng`, transport machine, plus `QUARTER_ROLLOVER` markers (S2); orientation and length as policy params (D5, D7) | `lib/simulation-theater/{timeline,state-at,scene-rng,transport-machine}.mjs` + tests | ST2-01b | Determinism (SPEC §6.3). Exactly one Q1→Q2 and one Q3→Q4 rollover per run. Score changes only at RESULT. Scene seed leaves outcomes identical. No `Math.random`/`Date`. Seek ≤1 ms in Node | 1.5–2 d | PR-1 |
| 4 | ST2-02 | Accessible SSR shell: banner, sample anchors, final-frame SVG, linescore, transcript, noscript, absence card; preview route with ≤3 fixture params (S12) | `components/simulation-theater/{TheaterSection,Transcript}.tsx`, `app/preview/simulation-theater/[eventId]/page.tsx` | PR-1 | Transcript snapshot for #428 drive 1. Route absent from the pruned export. axe 0 serious/critical. Works with JS off. Build-time delta under 0.5% | 1.5–2 d | PR-2 |
| 5 | ST2-06 | NFL colour map + contrast test (§4) | `lib/sports/nfl/team-colors.mjs` + test | **D3** | 32 keys matching the receipts. Ink ≥4.5:1, accent ≥3:1 on both turf stripes. `team-badge.tsx` untouched | 0.5–1 d | PR-3 |
| 6 | ST2-04 | Renderer + island: static and dynamic SVG layers, no viewBox camera (S8), `TheaterLoader` shim (S11), rAF / IntersectionObserver / visibility pause, focus-scoped keyboard (S9) | `components/simulation-theater/*` | PR-1, PR-2 (PR-3 optional: neutral fallback) | 0 rAF callbacks over 10 s paused, hidden or off-screen. Arrow keys on the range input do not switch drives. Loader ≤2 KB; island ≤30 KB gzip. 0 playback requests | 2–3 d | PR-4 |
| 7 | ST2-05 | Side panel tabs + throttled `LiveAnnouncer` + composite timeline widget | `SidePanel.tsx`, `LiveAnnouncer.tsx`, `DriveTimeline.tsx` | ST2-04 | ≤1 announcement per 3 s above 1×. The timeline is one tab stop. Evidence lists every unavailable-field reason and every run-off note | 1–1.5 d | PR-4 |
| 8 | ST2-07 | Polish: turf tokens, depth, celebrations, reduced-motion variant, `--motion-*` mapping (S18) | `FieldScene.tsx`, `app/globals.css` (turf pair only), timeline policy | PR-4; ST1-05 motion sheet | Screenshot baselines (6 states, 1440). Reduced-motion run has no tweened frames. Grain outside any animated subtree | 1.5–2 d | PR-5 |
| 9 | ST2-08 | Mobile 390/320: full-bleed 320 field (S10), declared y-scaling, sheets, ≥24 px range thumb, `scroll-padding-top` | components above | ST2-07 | No overflow at 320/390/768. Targets ≥44 px; thumb ≥24 px. Focus never under the sticky score bug | 1.5–2 d | PR-5 |
| 10 | ST2-09 | Verification pass: SPEC §6 budgets, 5 cold + 5 warm runs, real mid-range phone if available | `app/e2e/simulation-theater.spec.ts`, PR notes | ST2-08 | Every budget met, or the gap stated. Write "worst of 5", not "p95" | 1–1.5 d | PR-5 |
| 11 | ST2-10 | Public island on `/nfl/simulation/[eventId]/`; all representatives (D4) | `components/nfl/simulation-v2-report.tsx`, the route page | PR-5; **D1, D2, D4**; release approval; #1124 decision (roadmap T4) | Existing sections unchanged. One code-merge build. Production check of 3 events | 2–3 d | PR-6 |

**Totals [EST].** About 12.5–18 d for PR-1…PR-5 (local MVP) and about 15–21 d including PR-6. That is above the roadmap's 6–10 d, for the reasons SPEC §5.2 gives, plus about 0.5 d for ST2-01b.

**Start immediately on design approval:** PR-1 (pure `lib`, no UI) and PR-2 (preview only). PR-4 follows them with a neutral palette.

**Waits on decisions:**
- PR-3 on D3.
- PR-5's motion polish on ST1-05 (timings) and D7.
- PR-6 on D1, D2 and D4, release approval, and T4.
- D8 gates only ST-03, not any PR here.
- D5 and D6 have defaults and block nothing.

**ST-01 documents to update before sign-off [PROP].** Fold S1–S18 into the spec. Add to ST1-03 the 10-collision list, the accent column and the source deviations. Add the run-off and duplicate-run copy to the DS-001 label lexicon (ST1-02).
