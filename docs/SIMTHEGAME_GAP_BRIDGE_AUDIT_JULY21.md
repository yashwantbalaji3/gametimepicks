# SimTheGame Gap-Bridge Audit — MLB Report (July 21)

Audit of the current MLB game report (`/games/mlb/<game>`) against the founder's SimTheGame screenshots, to
drive the presentation revamp. Money untouched (`affe6b21…`, 19-14, $0). Public-safe language only.

## Current render flow (the problem)

`game-detail-page.tsx` (isMlbSim branch) → clean hero → `<GameSimulationRunner … postReveal={V2.5}>`.

Inside the runner's **done phase** (`game-simulation-runner.tsx:1012`), the reading order is:

1. Header ("Simulation complete", matchup, model/runs/freshness, model-projection).
2. Market snapshot (`MlbGameCenter`).
3. `PricedPropSnapshot`.
4. `CentralRead` (single strongest lean).
5. `MainTakeaways`.
6. "Biggest leans" grid (top-6).
7. "Deeper analysis" accordions: Full pick table · Outcome distributions · Model-vs-market agreement · Unavailable modules · Copy recap.
8. **THEN** `postReveal` → the 12-section **V2.5 report** (`mlb-simulation-report-v2.tsx`) — the market snapshot, watchlist, model-vs-market, settlement, etc.
9. Post-reveal nav.

**→ The V2.5 report is the *second* report on the page.** The runner's own dashboard (steps 2–7) renders the
same ideas (leans, market snapshot, model-vs-market, distributions) *above* V2.5, then V2.5 repeats them lower
down. That is the "legacy → accordions → V2.5 lower" stack the founder flagged: repetitive, deep-scroll, two
"simulation result" reads, two "market snapshot" reads.

## Scorecard vs SimTheGame

| SimTheGame strength | GameTime today | Gap |
|---|---|---|
| One primary simulation report | **Two** stacked (runner dashboard + V2.5) | **Fix: unify** |
| Player average box-score grid | none (only a prop list) | **Build** |
| Clean market-agreement score card | exists but buried in a collapsed accordion | **Surface** |
| Distribution charts | exist but buried in a collapsed accordion, generic label | **Surface + label player-prop** |
| Biggest model leans cards | yes (runner) + yes (V2.5 watchlist) — duplicated | **De-dup** |
| Simple supported/neutral signal read | reason bullets only | acceptable |
| Product-card integration | V2.5 has an eligibility count, but no per-player product tag | **Add tags** |
| Clean nav / IA | heavy sidebar, no in-report index, V2.5 far down | **Add mini-nav, hoist V2.5** |
| No unsupported full-game claims | ✅ already guarded (validating / market-anchored) | keep |

## GameTime issues → planned fixes

1. Duplicate reports (runner dashboard + V2.5) → **V2.5 becomes the single primary report; runner dashboard demoted into ONE collapsed "Advanced simulation detail" block.**
2. V2.5 starts too far down → **V2.5 renders immediately after the "Simulation complete" header.**
3. Repeated market-snapshot / result blocks → **market snapshot renders once, inside V2.5 §10; result once, in V2.5 §3.**
4. "edge" visible in legacy copy → **already banned in V2.5 body; legacy runner cards move into the collapsed block; a public text scan guards user-visible routes.**
5. No player box score → **new Player simulation board (V2.5 §4).**
6. Market agreement buried → **clean market-agreement card in V2.5 §6 (sanity check, not calibration).**
7. Distributions buried / generic → **player-prop outcome distributions in V2.5 §7, clearly labelled player-prop, empty state when no bins.**
8. Product eligibility too low / no tags → **per-prop product tags (Bank Builder Lane A/B, Moonshot Step 1, paper · $0) on the board + watchlist; eligibility summary stays in V2.5 §9.**

## Constraints preserved

`GameSimulationRunner` is MLB-only (WC uses `WcSimulationRunner`) — safe to restructure. Pure derivations
(`marketAgreement`, `deriveTakeaways`, `buildRecap`, `humanizeMarket`) are reused, not rewritten. No public
projected score / win probability / full-game distribution; the internal full-game model stays "validating".
