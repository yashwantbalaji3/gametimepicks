# World Cup FreeSim Report — Implementation (2026-07-10)

Wires the shared multi-sport report **contract** (shipped last pass) into an actual **UI**, World Cup first,
so a soccer game reads as a FreeSim-style simulation report instead of a market dashboard — while staying
fully honest that soccer is **market-implied**, not an independent 10,000-run model.

## What shipped

### 1. Shared FreeSim report UI — `app/src/components/game/multi-sport-report-shell.tsx`
Presentational only (no fetch/state/hooks) — a server-renderable element driven purely by a
`MultiSportGameReport`. Renders the six-section spine, always in order:

1. **Market Snapshot** — live markets (label · de-vig prob · odds); roadmap markets listed as disabled.
2. **Simulation Output** — headline + source-mode badge + win/draw/loss pills + honest notes. Shows a run
   count ONLY when the report carries one (soccer never does).
3. **Main Read** — one central read + confidence + explanation + paper-only note.
4. **Top Leans** — settlement-supported leans only; empty ⇒ "No qualified top leans… passing rather than
   forcing a weak play."
5. **Key Takeaways** — 3–5 plain bullets.
6. **Expandable Details** (`<details>`, collapsed) — methodology, source/data gaps, unavailable markets
   (roadmap), settlement notes, and the advanced market dashboard.

Plus `SourceModeBadge` — prefers the report's own `sourceLabel` ("Market-implied simulation" for soccer).

### 2. WC adapter — `app/src/lib/multi-sport-report/wc-adapter.ts`
Pure `WcGameLabView` → `MultiSportGameReport`. `sourceMode: "market_implied_simulation"`,
`sourceLabel: "Market-implied simulation"`, `publicClaims` all false (via `defaultClaimsFor`). Markets and
win/draw/loss come from real projection rows; supported rows become settlement-supported leans; unavailable
markets travel to `details.unavailableMarkets`, never to leans. Every output is checked by
`validateMultiSportGameReport` in tests.

### 3. Page wiring — `app/src/components/game/game-detail-page.tsx`
The World Cup Generate flow's post-reveal now leads with
`<MultiSportReportShell report={freeSimReport} advanced={<WcGameCenter …/>} />`. The market dashboard is the
`advanced` node inside the shell's Details. Falls back to the old dashboard-first layout only when there is no
`gameLabWc` to build from. Pre-Generate badge relabeled "Market-Implied Report Ready".

## Honesty / guardrails

- **Source mode** `market_implied_simulation`; the report can never claim an independent sim, a 10,000-run
  count, positive EV, or a model edge (validator-enforced). The Simulation Output note reads: *"a de-vigged
  read of the sportsbook price, not an independent 10,000-run soccer model."*
- **No fabrication** — no xG / scorers / corners / cards / scoreline distribution; those are roadmap only.
- **Settlement** — 90-minute regulation only (ET/PENs don't count), carried in `settlementNotes`.
- **Generate gate intact** — the report lives in the runner's `postReveal`, rendered only in the `done`
  phase. Verified against the built `out/`: report sections are `PAINTED=0` (present only in the RSC
  `<script>` payload for client reveal); the pre-click painted DOM shows only the matchup, CTA, locked labels,
  and the honest "de-vigged prices" description. No probabilities leak.
- **Money untouched** — no formula/settlement/card change; portfolio md5 `affe6b21…`; 19-14; exposure $0.

## Coverage of the requested docs
This file covers `MULTISPORT_REPORT_UI_IMPLEMENTATION` (the shared shell) and the WC implementation.
`docs/JULY10_WORLD_CUP_REPORT_STATE.md` holds the state snapshot.

## Deferred (next pass — honest)
- **UFC**: reuse the shell via a `ufc → MultiSportGameReport` adapter (moneyline only, model picks omitted
  while unvalidated). `docs/UFC_FREESIM_REPORT_IMPLEMENTATION.md` not yet written — no UFC UI change this pass.
- **MLB**: unchanged — it already has the strongest report (market-anchored, artifact-backed 10k-run). Not yet
  wrapped in the shared shell (its bespoke `MlbGameCenter` runner already renders the spine); regression only.
- **Picks Lab custom builder**: not started this pass.

## Tests
`app/src/lib/multi-sport-report/wc-adapter.test.mjs` (8) — valid market-implied report; no
independent/10k/EV/edge claim; win probs in [0,1]; leans reference available markets; honest "no strong lean"
pass; roadmap markets never leans; page wired to the shell; shell surfaces all six sections + honest badge.
Coupled WC render tests (`unified-report.test`, `wc-game-center.test`) updated to the shell-leads structure.
