# UFC 329 — Final Fight-Week Readiness (2026-07-10)

Tomorrow's card (2026-07-11). Covers the data-freshness check (`UFC329_FINAL_DATA_FRESHNESS_CHECK`) and the
launch-ready state. **Market-implied simulations are live; validated model picks remain gated.**

## Data freshness (no refresh needed)

| field | value |
|---|---|
| Event | **UFC 329: McGregor vs. Holloway 2** (`isRealCard: true`) |
| Date / venue | 2026-07-11T21:00Z · T-Mobile Arena |
| Fights | 14 (ESPN MMA) |
| Odds-backed fights | **9** (two-sided moneyline, The Odds API MMA) |
| Odds `generatedAt` | 2026-07-10T14:49:59Z — **today**, event tomorrow ⇒ **fresh** |
| Odds credits remaining | 18,449 (healthy) |

No paid refresh was run — the odds are same-day fresh. No stale timestamps, no faked freshness.

## Validation state (unchanged, honest)

```
moneylineValidated: false   publicPicksVisible: false   cleanGradedRows: 0 / 150
propMarketsAvailable: { h2h: true, method/distance/rounds: false }   (feed = h2h only)
```

## What shipped this pass (launch polish)

1. **Octagon fight-night hero** (`ufc-fight-night-hero.tsx`) — original inline SVG cage/octagon, headliner
   initials columns (parsed from the real event name), honest "Market-implied sims live" + status chips
   (`N fights · N odds-backed sims · Validation 0/150 · Props provider-needed`). No brand logos, no photos.
2. **De-vig probability bars** (`probability-bar.tsx`) — a neutral stacked win-probability bar now rendered
   in every FreeSim report's Simulation Output (UFC 2-way + soccer 3-way). Visual, never a guaranteed outcome.
3. **Provider-needed chips** — the report's roadmap markets render as disabled 🔒 chips.
4. **Phase-6 hardening** — while unvalidated, the Expanded tab's no-odds method/round/distance model
   projections are **hidden** and replaced with a provider-needed roadmap (they were the last model-only
   surface). Fighter stats (factual) remain; the moneyline shows the market-implied read only.
5. **CTA** — command-rail UFC entry → "Fight simulator · sims live".
6. **Backfill scaffold** — internal `data/internal/ufc/backfill-status.json` (0 progress, `paidOddsNeeded`,
   threshold 150, not unlocked) + schema test.

## Layout (Overview)
Octagon hero → status strip (Public now · market-implied / Gated · model-adjusted / 0/150) → Featured fight
(full `MultiSportReportShell` with probability bar) → fight-card simulations (collapsed) → Advanced odds
board → validation gate. The raw odds table is no longer the main event.

## Guardrails
No money/formula/settlement change (md5 `affe6b21…`, 19-14, $0). No fake fights/odds/props/stats/photos/
results. Model picks gated (0/150). UFC excluded from all products. Internal artifacts stay internal.
