# Multi-Sport FreeSim Report Audit (2026-07-10)

Yash: *"the World Cup game only has a market dashboard — every sport needs a FreeSim-style report."* This
audits what each sport has today and ships the **shared honest report contract** that the soccer + UFC
report UIs will conform to. Official money md5 `affe6b21…` unchanged, 19-14, $0. Suite green.

---

## What each sport has today

| sport | report components | data / source mode | FreeSim spine? |
|---|---|---|---|
| **MLB** | `game-detail-page` + `game-simulation-runner` + `mlb-game-center` + `game-lab/mlb-report.ts` | **market-anchored simulation** (10k-run distributions, artifact-backed) | **yes** — Market Snapshot → Sim Output → Main Read → Leans → Takeaways → Details |
| **Soccer / WC** | `wc-simulation-runner` + `wc-game-center` + `game-lab/wc-report.ts` | **market-implied** (de-vigged odds; NOT an independent 10k-run sim) | partial — reads as a market dashboard; the explicit FreeSim section headers + source-mode badge are missing |
| **UFC** | `/ufc` page + `ufc-types` + V1 moneyline model | **market-implied** moneyline (model gated until validated) | partial — event/odds board, no unified report spine |

So the WC + UFC "reports" exist as data + components, but they don't present the **uniform FreeSim spine**
with an honest **source-mode badge** — which is exactly why soccer "feels like only a market dashboard."

## What shipped this pass — the shared honest contract

`app/src/lib/multi-sport-report/schema.ts` (pure, tested):

- **`SimulationSourceMode`** = `independent_simulation | market_anchored_simulation |
  market_implied_simulation | projection_only | unavailable` — so every report says *what kind* of read it
  is, out loud.
- **`MultiSportGameReport`** — the six-section spine (Market Snapshot / Simulation Output / Main Read /
  Top Leans / Key Takeaways / Details) + a `publicClaims` block.
- **`validateMultiSportGameReport`** enforces the honesty rules a builder can't violate:
  - a **market-implied** report (soccer, UFC ML) **cannot** claim an independent sim, a 10,000-run count,
    positive EV, or a model edge;
  - a **10k-run** claim requires a *sampled* mode **and** a real `runCount ≥ 1000` (only MLB qualifies
    today);
  - a **lean must reference an available market** — unavailable markets can never become a lean;
  - an `unavailable` report carries no leans; `mainRead.paperOnly` must be true.
- `defaultClaimsFor(mode)` gives the honest, never-over-claiming defaults; `SOURCE_MODE_LABEL` gives the
  user-facing label ("Market-implied read", etc.).

## What can be implemented next (UI, on this contract)

1. **Shared components** — `MultiSportReportShell` + `MarketSnapshotPanel` / `SimulationOutputPanel` /
   `MainReadPanel` / `TopLeansPanel` / `KeyTakeawaysPanel` / `ReportDetailsDisclosure` / `SourceModeBadge`,
   driven by a `MultiSportGameReport`.
2. **Soccer builder** — `wc-report.ts` → a `MultiSportGameReport` with `sourceMode:
   market_implied_simulation`, `sourceLabel: "Market-implied read"`, the de-vigged 3-way/DC/DNB/total/BTTS
   markets, leans only from available+settlement-supported markets, and the explicit note *"not an
   independent 10,000-run soccer simulation."*
3. **UFC builder** — `MultiSportGameReport` with `sourceMode: market_implied_simulation`, moneyline board,
   model picks **omitted** while `moneylineValidated=false`.
4. **MLB** — wrap the existing report in the same shell (`market_anchored_simulation`, `runCount` attached)
   — no behavior change, just the uniform spine + badge.

## Deferred (honest — real component work, budget-bounded)

The UI rollout (shared components + per-sport builders + wiring the WC/UFC/MLB pages) is the next pass. The
July-10 WC game (repo data — verify Spain vs Belgium vs whatever the committed slate says) will render the
FreeSim spine once the soccer builder + shell land. No fake xG / player props / scoreline distribution is
introduced anywhere; soccer stays honestly **market-implied**.

## Guardrails

No formula/pick/model change. No fake sim. Official money untouched (md5 `affe6b21…`). The contract is a
pure lib (not web-served); Generate gate unaffected.
