# UFC Repo + Provider Audit (overnight, 2026-07-10)

**UFC is more built than a scaffold — it has a real, fail-closed, data-backed pipeline — but there is no
upcoming card in the schedule right now, so the public page correctly shows nothing.** No fake fights, no
fabricated odds. This audits the real state instead of building a redundant scaffold.

---

## What already exists (NOT a from-scratch build)

| layer | file / artifact | state |
|---|---|---|
| types + markets | `src/lib/ufc-types.ts` — `UfcFighter/Bout/Event/MarketOdds/Projection/GradedBout/LaunchGates`; `UFC_SUPPORTED_MARKETS = [winner, method, rounds_total, goes_distance]` | real |
| public page | `app/ufc/page.tsx` (352 lines) — **FAIL-CLOSED**: projections render only when `moneylineV1Ready` + real projections; expanded markets gated on availability flags | real |
| settlement | `ufc250-settlement.test.mjs` (a real graded card) + `methodology/ufc.ts` | real |
| readiness/ops | `public/data/ufc/ops-status-latest.json` — `currentStage`, `scheduleStatus`, `oddsStatus`, `fighterStatsStatus`, `gradingStatus`, `backtestStatus`, `parlaySimStatus`, `cleanGradedRows` | real |
| data artifacts | schedule / projections / results-settled / backtest-dataset / backtest-summary / features / expanded-projections | committed |
| tests | `ufc-types`, `ufc250-settlement`, `ufc-public-ready` | passing |

## Current status: `no upcoming card`

- **`schedule-latest.json` → 0 events.** Between cards / off-cycle. The page is fail-closed, so it shows
  no picks — which is correct, not a bug.
- Markets supported by the model: **winner, method, rounds_total, goes_distance** (moneyline + method +
  round totals + goes-distance). These are the right four for a fight product.
- Settlement exists (a UFC 250 card was graded in tests), so the grade path is proven.

## Provider gaps (what unlocks the next card)

| need | current | unlock |
|---|---|---|
| upcoming events + fight card | schedule empty | ingest the next event's card (provider/schedule feed) |
| moneyline odds | gated (`oddsStatus`) | odds provider for the next card |
| method / round / distance odds | expanded, gated | same provider's prop lines |
| fighter stats (tale-of-the-tape) | `fighterStatsStatus` | a fighter-stats source |

No paid scrape was run tonight (no guarded UFC refresh + no upcoming card to justify it).

## Verdict

**UFC readiness = data-backed pipeline, currently idle (no scheduled card).** It is NOT a fake scaffold
and NOT falsely "live" — the fail-closed page is the honest state. The `UfcFightSimulationArtifact` the
overnight prompt imagined is effectively already covered by `UfcProjection` + the gated page; building a
parallel schema would be redundant. **Do not add a public UFC experience until a real next card is
scheduled + odds ingested.**

## Recommended next (when a card is scheduled)

1. Ingest the next event's schedule + card (fighters, bouts).
2. Ingest moneyline + method + round-total + goes-distance odds (guarded).
3. Let the existing V1 gates flip `moneylineV1Ready` → the page lights up on its own.
4. THEN design the fight-simulator graphics (tale-of-the-tape, method probability, round distribution) as
   a gated internal preview first — market-implied, no fabricated finish probabilities.

The fight-simulator *graphics vision* (win prob, method, KO/sub/decision, round-by-round, upset path) is a
worthwhile design track — but it is a UI plan on top of this real data layer, not a new data model.
