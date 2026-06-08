# UFC Current Capability Audit (latest)

> Verified against code + the free ESPN MMA source. No paid calls. No fake data.

## Answers
1. **UFC schedule available?** YES — `event-schedules.ts` reads ESPN MMA
   scoreboard (free); UFC registered schedule-only in `sports-coverage.ts`.
2. **Saturday event visible?** Next card on ESPN: **UFC Freedom 250: Topuria vs.
   Gaethje, 2026-06-15, status pre, 7 bouts** (no card on 06-13). Visible/free.
3. **Fight matchups available?** YES — ESPN lists bout competitors (e.g., Steve
   Garcia vs Diego Lopes).
4. **Moneyline odds available?** NOT ingested — ESPN scoreboard has no odds; the
   Odds API provider is hardcoded `SPORT_KEY="basketball_nba"` (no MMA path).
5. **Method / round / total-rounds odds?** NO.
6. **Fighter stats?** NO provider.
7. **Historical results?** NO store.
8. **Grading implemented?** NO.
9. **Public UI?** Schedule-only via Events/coverage; no projections/parlays UI.
10. **Suggested-Parlay eligibility?** NO — `sport-capabilities` schedule-only →
    `hasProjections:false`; Build-a-Parlay + suggested filters block UFC.
11. **Exact current blocker:** no MMA odds ingestion + no fighter-stat provider +
    no results/grading + no backtest. Fail-closed by design.

## Infrastructure added this pass (no fake data)
`app/src/lib/ufc-types.ts` — typed schema (event/bout/fighter/odds/projection/
graded) + a FAIL-CLOSED launch-gate resolver (`ufcPublicLevel`) + current gate
state (`UFC_CURRENT_GATES` = schedule-only). Tests in `ufc-types.test.mjs`.
