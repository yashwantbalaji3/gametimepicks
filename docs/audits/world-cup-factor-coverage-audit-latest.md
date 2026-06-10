# World Cup Factor Coverage Audit
_2026-06-10. Requested soccer factors vs current World Cup implementation._

## Active
- Schedule (104 matches), teams (48), groups (12) — structural, **display only**, no model.
- `readiness-latest.json`: scheduleReady/teamsReady=true; odds/stats/grading/projections/parlay=false.

## Provider-needed (ALL model factors — fail-closed)
Team strength (FIFA/Elo/xG), match + player-prop odds, starting XI / projected minutes /
set-piece+penalty takers, per-90 attacking/defensive, tactical, referee tendencies,
player-vs-player matchups, goalkeeper metrics.

## Intentionally deferred
Advancement-vs-90-minute market separation, knockout extra-time/penalty logic — built
only once real match markets + stats exist.

## Conclusion
World Cup remains **fail-closed**; no projections until schedule+odds+stats+lineups+gates
are all real. See `docs/methodology/world-cup-model-methodology-latest.md` +
`docs/research/world-cup-provider-plan-latest.md`.
