# P209 — Findings & Target (Phase 0)

Baseline: 2026-08-25 23:26 EDT / 2026-08-26 03:26 UTC · local=origin 9fe4bcf97 (= production
b23cedb38 + one `[skip ci]` props refresh — deploy lag by design) · tree clean · P208 log's
in-flight row corrected with the deployed receipt.

## Current simulation journey (measured)

- `/simulate` is **today-pinned**: no date navigation of any kind (no previous/next, no picker,
  no historical view). MLB rows use `activeMlbDate()`; other sports pin their own "current".
- Sport selection is a **client-only tab filter** (SportSelector) — not URL-stable: refresh,
  share and back/forward all lose the selected sport. The tab list is hand-assembled in the
  lobby, includes the completed World Cup and a provider-less NHL stub, and does not derive from
  the sport registry (`SPORT_ASSESSMENTS`: mlb/nfl/nba/epl/ufc).
- Generation is **instant navigation** to a precomputed report — there is no state machine, no
  phase vocabulary, no sport-themed generation moment, and nothing distinguishes "precomputed
  artifact opened" from "simulation run".
- Event cards mix vocabularies ("Generate Simulation →" for precomputed artifacts — a truth
  problem the charter names) and per-sport card layouts drift.

## P0/P1 findings

| id | sev | finding | acceptance |
|---|---|---|---|
| S1 | P0 | No date navigation: a reader cannot see yesterday's settled slate or tomorrow's events from /simulate; "today" is unshareable and back-unsafe | date is a route segment (`/simulate/d/<date>`), prev/today/next + picker, product-day-owner labels, settled dates route to reports/results |
| S2 | P0 | Sport selection is hydration-only state from a hand-kept list | chips derive from the registry with typed states; `?sport=` survives refresh/share/back; counts reconcile from one selector |
| S3 | P1 | "Generate Simulation" on precomputed artifacts overstates what happens | action vocabulary from the state matrix (View Simulation / View Report / Explain availability); generation moment = honest phase machine ("Preparing the verified simulation") |
| S4 | P1 | No sport-themed generation experience; the transition to a report is a bare navigation | SportSimulationTheme registry + SimulationStage with 5 code-native scenes, reduced-motion posters, budgets |
| S5 | P1 | Optimizer cards cannot seed the shared draft (P208 carry-over) | daily-cards producer emits decomposed leg identity; Customize seeds /build/custom with provenance; ineligible families show a reasoned disabled state |
| S6 | P2 | F7 copy sweep + F8 token migration (P208 backlog) | vocabulary map + guard; component families on tokens; ratchets shrink-only |

## Target architecture

- `lib/simulate/day-view.ts`: one server selector — per-sport adapters return typed events
  (identity, participants, startUtc, state ∈ charter matrix, action) for a date; `availableDates()`
  = union of real per-sport event dates (bounded window). Counts = derived sums, never length-of.
- Routes: `/simulate` (today) + `/simulate/d/[date]` (generateStaticParams over availableDates) —
  the P208 pattern: real routes as state. `?sport=` filter client-applied at hydration (the
  /build/custom?sport pattern), chips as links.
- `lib/simulate/state-machine.mjs`: typed phases CHECKING_EVENT → LOADING_INPUTS → VALIDATING →
  PREPARING → SUMMARIZING → COMPLETE | REFUSED | FAILED; presentation-honest (precomputed ⇒
  "Preparing your report"); synthetic transition tests; readiness read from the availability owner.
- `lib/simulate/themes.ts` + `components/simulate/simulation-stage.tsx` + five scenes (diamond /
  field / pitch / octagon / court), aria-hidden decorative SVG, reduced-motion posters, hidden-tab
  pause, payload budgets.
- Release order per charter: A IA → B machine → C scenes → D 12-stage audit (reuse the existing
  gate/closure system; no hand percentages) → E report shell → F optimizer identity → G copy →
  H tokens → I assurance → J /launch panel.
