# UFC FreeSim Report — Implementation (2026-07-10)

Wires UFC 329 into the shared multi-sport report shell so `/ufc` reads as a **fight simulator** — a
FreeSim-style report per fight — while staying honest that the read is **market-implied** (de-vigged
sportsbook moneyline), not an independent model, and while keeping model-adjusted picks gated.

## What shipped

### 1. UFC adapter — `app/src/lib/multi-sport-report/ufc-adapter.ts`
Pure. `ufcFightToReport(proj, oddsBout, opts)` and `ufcEventToReports(v1Proj, odds, opts)`.

- Joins each public projection (`projections-latest.json`) to its **two-sided** odds bout
  (`odds-latest.json`) by normalized fighter-name key, then **de-vigs** (`pA/(pA+pB)`) for a proper
  win/win read that sums to ≈ 1. Falls back to the single implied probability if a bout isn't matched.
- `sourceMode: "market_implied_simulation"`, `sourceLabel: "Market-implied simulation"`, `publicClaims`
  all false. **Does not read the model's probability / edge** — public report is market-implied only.
- Market Snapshot: `moneyline` available; `method` / `rounds` / `distance` = `provider_needed` (roadmap).
- Top Leans: at most ONE — the market-implied moneyline favorite, and only when it clears 58% de-vigged;
  a near-pick'em (< 6% off a coin-flip) yields no forced lean. Never a model pick, never method/round.
- Key Takeaways state the model-pick **gating** while `moneylineValidated=false`.

### 2. `/ufc` wiring — `app/src/app/ufc/page.tsx`
The Overview now **leads** with a "Fight simulations" section: the featured fight as a full
`MultiSportReportShell`, the remaining fights as collapsed `<details>` each expanding to their own shell.
The raw two-sided odds board is demoted to "Advanced odds board" beneath it. Hero relabeled to
"UFC · fight simulator", status "Market-implied sims live", framing rewritten to the FreeSim + gating story.
The stale-card gate is respected — when the event is settled, fight sims are skipped and the page points
to Results.

## Honesty / guardrails
- The strongest public claim is **"Market-implied UFC predictions are live."** Not "validated model picks".
- No fabricated fights / odds / props / fighter stats / method-round-distance markets / model edge / EV.
- Method/round/distance stay `provider_needed` (feed is h2h only). Nothing enters Bank Builder / Moonshot /
  Picks Lab as a model pick, and no UFC card creates real-money or official exposure.
- Money untouched — no formula/settlement/card change; portfolio md5 `affe6b21…`; 19-14; exposure $0.
- `/ufc` is a public fight-week board (no Generate gate) — it shows only public-safe market-implied info.

## Tests
`app/src/lib/multi-sport-report/ufc-adapter.test.mjs` (8), run against the **real** UFC 329 artifacts:
valid market-implied reports; no independent/10k/EV/edge claim + no run count; two-sided de-vigged win probs
sum ≈ 1; the only lean is a market-implied moneyline favorite; method/round/distance provider-needed and
never leans; gating copy present; synthetic favorite ⇒ lean, pick'em ⇒ none; page wired to the shell.

## Deferred (honest)
- Model-adjusted picks stay gated (0/150 clean graded fights — see
  `docs/UFC329_PUBLIC_PREDICTION_READINESS.md`). No validation was forced.
- MLB is unchanged; it already renders its own spine with an artifact-backed 10k-run claim.
- Homepage/nav CTA to `/ufc` and a Picks-Lab UFC-safety test were not added this pass (nav already lists UFC;
  `/ufc` shows only market-implied info, so no unvalidated model pick can leak from it).
