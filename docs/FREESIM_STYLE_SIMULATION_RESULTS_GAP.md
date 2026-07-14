# FreeSim-Style Simulation Results — Gap (2026-07-14)

Blunt comparison against the product standard (not a FreeSim clone). Money untouched (md5 `affe6b21`).

## What the founder saw
1. `/simulate` featured the **stale July-11 MLB slate** on July 14. **← FIXED this pass.**
2. The France v Spain report reads like a **market dashboard** ("Generate Market Dashboard" → market snapshot,
   "No strong lean") rather than a rich pre-match **simulation result**; no bracket/props above the fold.

## Why the report feels thin (honest)
- World Cup is a **market-implied 90' read**, not an independent simulation — so there is no projected score
  distribution or run-by-run story to show. "No strong lean" is the *correct* disciplined output when the
  de-vigged market is efficient; it is not a broken page, but it currently *reads* like one.
- Player props exist (real Odds API: goalscorer / shots / SOT / assists) but are on `/world-cup`, **not on the
  game report**. Settlement is plan-blocked (free API-Football tier, no 2026 season) — so they stay
  provider-backed + settlement-pending, out of product cards.

## Fixed this pass
- **Featured freshness** — `/simulate` + home lead with the current WC semifinals (market-implied), stale MLB
  dropped. (`SIMULATE_HUB_FRESHNESS_FIX`.)
- Prior passes already added: `WcBracketContext` (path-to-final, TBD finalists) on `/world-cup`,
  `SportMethodologyPanel` + the coverage matrix on each center, and honest per-game markets in `WcGameCenter`
  (match result / DC / DNB / total / BTTS).

## What can be built honestly next (no new provider) — Phase 4/5, deferred
- Move the **bracket-impact card** + a **compact player-props preview** onto the *game report* (they exist on
  `/world-cup`; the report doesn't show them yet).
- Above-the-fold **simulation result summary** on the WC report: 3-way probability bar + "market-implied read"
  label + a "No strong lean = disciplined, not broken" explanation, so useful info isn't buried in the advanced
  table. Relabel the CTA "Generate Market Dashboard" → "Generate Simulation Report".
- These are UI-only, reusing real artifacts — no fake data.

## What needs a provider / data (cannot fake)
- A real independent soccer model (score distribution, xG) — a validated model, not market-implied.
- Player-prop **settlement** for 2026 — a **paid API-Football plan** (the grading is already built + validated on
  real 2022 data; see `WC_PLAYER_PROP_SETTLEMENT`).
- Corners / cards / correct-score markets — provider feeds.

## Verdict
The **stale-slate bug is fixed** (the loud one). The France v Spain report is **honestly market-implied** and
will not become a "real simulation" without either the Phase-4/5 UI polish (surfacing bracket/props/probability
above the fold — safe, next) or a paid soccer model + prop-settlement plan (the real depth — budget).
