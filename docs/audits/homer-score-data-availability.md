# Homer Score — Data Availability Audit (Phase 3)

_Date: 2026-06-23. Per-input source traceability for the Homer Score model._

## Principle
Every value the Homer Score displays must trace to a real source. No input is fabricated, approximated
from memory, or simulated. Where a real source is not wired, the input is reported **unavailable** and the
board shows **"Partial Model"** with the pending list — it never invents a number to fill the gap.

The engine (`lib/mlb/homer-score.ts`) already implements the full weighted model (batter 0.45 · pitcher
0.35 · environment 0.20) and `homerModelInputStatus()` reports how many advanced inputs are live. Today
that count is **0/7**, so `loadHomerNukes()` ranks the parlay by **de-vigged market probability** (honest,
no model edge claimed) and the UI labels it "Partial Model · pending Statcast".

## The 7 inputs — source, availability, what's needed

| # | Input | Real source | Free? | Available now? | Blocker / requirement |
|---|---|---|---|:--:|---|
| 1 | Barrel % | Statcast (Baseball Savant) | no stable free JSON API | **No** | Savant has no stable public JSON endpoint; CSV scraping is fragile/ToS-risky. Needs a Statcast data feed. |
| 2 | xSLG | Statcast | — | **No** | Same Statcast dependency as barrel %. |
| 3 | Hard-hit % | Statcast | — | **No** | Same Statcast dependency. |
| 4 | Pitcher HR/9 | MLB Stats API (free) | yes | **No (blocked upstream)** | HR/9 is derivable from statsapi pitching stats, BUT it must be the BATTER's opposing **probable starter** — and the slate feed carries no probable starters (`schedule/<date>.json` has only home/away/matchup/commenceTime/gameId). Needs a probable-starter source. |
| 5 | Park factor | Published static park-factor table | reference data | **No (not sourced in-repo)** | Real, static, well-known — but exact per-park values must come from a cited published table (e.g. Statcast or ESPN park factors), not approximated from memory. Needs that table committed + a stadium→park map. |
| 6 | Weather | A weather API + stadium coordinates | needs key | **No** | No weather API key is wired; game-time temp/wind at each park is not in any current feed. |
| 7 | Recent form | MLB Stats API game logs (free) | yes | **Derivable, not wired** | Computable from per-player game logs, but that's hundreds of fetches per slate and the daily workflow is dormant; not wired to avoid a heavy unproven pipeline in a hardening pass. |

## Verification performed
- Slate artifacts (`home-run-props/2026-06-23.json`, `schedule/2026-06-23.json`) carry **no** advanced
  model fields (no barrel/xSLG/hardHit/HR9/park/weather/form) and **no** probable starters — confirmed by
  inspection.
- `statsapi.mlb.com` is reachable (HTTP 200) and free, but exposes **season/aggregate + game-log** stats,
  **not** Statcast batted-ball metrics (barrel/xSLG/hard-hit live only on Baseball Savant).

## Outcome (honest, no fabrication)
- **0 of 7** advanced inputs are wired with a real, traceable source today → the board correctly stays in
  **Partial Model** mode and ranks by de-vigged market probability.
- No partial/neutral composite is surfaced as a "score", because a mostly-neutral number dressed as a
  model output would mislead — the design ranks by the real market signal instead and says so.

## Path to "live" (when a data feed is added)
1. **Statcast feed** (barrel %, xSLG, hard-hit %) — the three batter inputs; the single biggest unlock.
2. **Probable starters** (from statsapi `schedule?hydrate=probablePitcher` or a lineup feed) → unlocks the
   pitcher HR/9 join.
3. **Sourced park-factor table** committed to the repo → unlocks the park input immediately (cheap, static).
4. **Weather API key** → unlocks the weather input.
5. **Game-log pipeline** (statsapi) in the daily workflow → unlocks recent form.

Each input flips to "live" in `homerModelInputStatus()` only once its real source is wired; the score then
fuses exactly the inputs that have real data, and the "Partial Model" label updates to the live count.
</content>
