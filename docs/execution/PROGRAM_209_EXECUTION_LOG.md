# PROGRAM 209 — Execution Log & Final Report

**Verdict: PROGRAM_209_MATERIAL_PROGRESS** — the simulation journey (IA, state machine, sport
scenes), the optimizer-seeding closure and the F7 vocabulary closure are deployed with production
proof. The exact unmet engineering criterion is F8's component-family token migration (the ratchet
moved down twice on measured emissions — 1166→1159 this program — but the family-by-family
migration remains open, same named P2 as P208).

## Window & anchors
- Start: 2026-08-25 23:26 EDT / 2026-08-26 03:26 UTC. Close: 2026-08-26 ~01:15 EDT.
- Start tip: 9fe4bcf97 (= production b23cedb38 + one `[skip ci]` props refresh; ancestry proven).
- Releases:
  | Release | Commit | Rollback parent | Proof |
  |---|---|---|---|
  | Phase-0 | 809f30571 | 9fe4bcf97 | P208 log's in-flight row corrected; findings committed |
  | R-ABC (sim IA + machine + scenes) | a1c2388c0 | 809f30571 | browser-proven both terminal paths; e2e 425/0 |
  | R-F+G (optimizer seeding + F7) | 440f3793f | a1c2388c0 | CI 32930072708 success; 20 customizable cards live |
  | Final assurance | (in-flight — this commit) | 440f3793f | verified after push |

## Simulation experience (Releases A–C)
- `/simulate` is date-first and sport-first on ONE selector (`lib/simulate/day-view`): typed events
  on the charter's state matrix from each sport's own owner; counts reconcile by construction;
  22 static date routes (`/simulate/d/[date]`, window −14/+21; params can never be empty);
  `?sport=` filter with history entries; settled days offer results and **zero** generate actions.
- One state machine (`lib/simulate/state-machine`): CHECKING_EVENT → … → COMPLETE|REFUSED|FAILED;
  illegal jumps throw; COMPLETE requires an artifact identity; refusals require a stated reason;
  copy is precomputed-honest. The terminal derives from the event's own readiness — a
  schedule/baseline event cannot visually emerge SIMULATION_READY.
- Five code-native scenes (diamond/field/pitch/octagon/court) + arena fallback: aria-hidden
  decoration, token colours, motion on the motion-token system (global reduced-motion guard
  governs), hidden-tab pause, no history trap, real prefetch during LOADING_INPUTS.
- Browser proofs: ready path narrates six phases then lands on `/games/mlb/tb-vs-det-2026-08-25/`;
  refusal path (NFL Aug-27 SCHEDULE_ONLY) stops in place with the stated reason and two actions;
  settled day (Aug-24) = 10 View-result actions, 0 generate.
- MLB ready games route DIRECT to their report: the report owns the richer gated
  GameSimulationRunner — the stage yielding avoids stacking two generation ceremonies (the
  "empty MLB report" I chased was that gated idle state working as designed, verified on
  production bytes).

## Parlay closure (Release F)
The optimizer artifact always decomposed its legs; normalization flattened them. Identity now
rides through fail-closed → 20 customizable cards on today's slate (2 ladder + 18 optimizer),
each seeding the shared draft (`/build/custom?card=<id>`); ineligible families state their reason;
settled cards offer neither. Browser-proven: 5 canonical-keyed legs seeded from a Longshot card.
Found in passing at 23:54 ET: the whole builder unmounted when every game had started (pool=0) —
the draft view and seeding died with it. The builder now always mounts with an honest pool empty
state. A 1.51:1 decorative "|" divider (text) became a real non-text divider.

## F7 closure (Release G)
Retired names ("Picks Lab", "Parlay Lab", "Build-a-Pick") and pipeline vocabulary ("optimizer",
"settlement contract") left every primary public surface at their sources (trust center, results
copy, responsible-use, methodology cards, learning-signal strings, ladder copy, the record label →
"Suggested-Card Record", my own headers). NEW guard `public-vocabulary.test.mjs` scans the
RENDERED text of every built public page — retired names banned everywhere, pipeline vocabulary
banned outside the labelled technical pages. Green on the built export.

## Sport-by-sport chain (Release D, derived — never hand-counted)
From `activation-gap-v1` regenerated at the close stamp: MLB 12/12 LIVE · EPL 11/12 (exact gate:
calibration [REALITY] — 30 paired pre-kickoff forecast+price matches, now 4/30) · UFC 10/12 ·
NFL 9/12 (model+calibration [REALITY], products [FOUNDER]) · NBA schedule-only DORMANT_BY_DESIGN.
Unchanged by this program: the redesign altered no model/settlement/record owner. Journeys: MLB
full path proven; NFL honest refusal; UFC card SIMULATION_READY on its date page → /ufc; EPL
weekend fixtures listed with schedule states; NBA off-season typed empty state.

## Reports (Release E)
Structural comprehension over the built bytes: every sport report's first sections carry identity,
distribution/state, market comparison where sourced, freshness and a next action (two heuristic
misses were regex artifacts — "SEA @ TEN" and "Brentford v Tottenham" verified present). MLB's
report is the gated generate-then-reveal experience by design.

## Operator alignment (Release J)
/launch gains the Simulation Experience panel (anchor registered): day-selector window/dates/
totals/sections, theme coverage incl. the unknown-sport fallback, machine phase/terminal contract,
and the guard list discovered from disk. Product Experience panel (P208) unchanged beside it.

## Gates at close
Suite 5,151 / 5,147 / 0 fail / 4 named skips (+25 new guards this program) · e2e 425/0/6 (three
engines) · typecheck clean · builds clean · structural a11y 0 findings · vocabulary guard green ·
health gate HEALTHY · route inventory 62/0 at the close stamp · record 125 rows, PDF verified
(sha 4e5f7ba1bfb9fd8d…) · zero paid requests · money record untouched (19–14 · $19,065.40).

## Defects this program's own guards caught
1. My SETTLED script couldn't legally reach COMPLETE (machine's own transition table refused) —
   fixed to the five-step script before ship.
2. The parlay-center built-HTML guards' CI lesson from P208 was re-applied here (assert-when-built).
3. The contrast slice caught the decorative-text divider at 1.51:1.
4. The conservation guard demanded Phase-0's registration before R-F+G could land.

## Remaining, partitioned
- ENGINEERING (P2): F8 component-family token migration (ratchet-guarded, shrink-only);
  optimizer-card families beyond MLB/multi (UFC/WC/daily-mixed cards still label-only legs — their
  producers don't decompose; UI states the reason).
- REALITY: EPL calibration 4/30; NFL model+calibration; UFC bout-coverage growth.
- FOUNDER: NFL products gate; NBA expansion.
- INCIDENT: none open.

## Next five actions (dependency-ordered)
1. F8 family migration (owner: engineering; acceptance: measured ceiling drop per family, classes
   pinned separately).
2. Decompose UFC card-producer legs (owner: engineering; acceptance: UFC suggested cards seed the
   draft under the one identity rule).
3. EPL calibration watch to 30/30 (owner: reality; acceptance: the committed gate flips with its
   receipt — never hand-counted).
4. Sport-hub Simulate deep links pass the selected sport into `/simulate?sport=<s>` (owner:
   engineering; acceptance: hub → prefiltered day view in one action).
5. NBA season return: flip the schedule adapter's season context when captures resume (owner:
   reality; acceptance: day view lists NBA dates from real captures).
