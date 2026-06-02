# Sports Coverage Policy

The single rule: **a sport only gets odds/projections/parlays/results when a
real player-prop model AND graded results exist for it.** Everything else is
schedule-only (if a real, attributed schedule can be sourced) or "coming
soon" (if not). No fabrication, ever.

Source of truth in code:
[`app/src/lib/sports-coverage.ts`](../app/src/lib/sports-coverage.ts) (the
`SPORTS_COVERAGE` registry, locked by `sports-coverage.test.mjs`).

## Coverage table (as of main `5a1777d`)

| Sport | Level | What's published | Where |
|-------|-------|------------------|-------|
| **MLB** | **Projections + Parlays** | projections, parlays, graded results | `/projections`, `/parlay-lab`, `/results` |
| **NBA** | **Projections + Parlays** | same (on NBA game days) | same |
| **NHL** | Schedule only | schedule | `/nhl` |
| **WNBA** | Schedule only | schedule (refreshed snapshot) | `/events` |
| **UFC** | Schedule only | fight-card schedule (refreshed) | `/events` |
| **FIFA / World Cup** | Schedule only | official 104-match schedule | `/world-cup` |
| **IPL (Cricket)** | Schedule only | match schedule | `/ipl` |
| **MLS** | **Schedule only** (added PR #231) | real fixtures | `/events` |
| **EPL** | **Coming soon** | nothing (no sourceable fixtures yet) | — (no link) |

## Levels

- **`full` (Projections + Parlays):** NBA, MLB only. Requires a real
  projection pipeline + graded parlay results.
- **`schedule`:** a real, **attributed** schedule snapshot only — dates /
  matchups / venues. **No odds, no projections, no parlays, no picks, no
  results.** Every schedule snapshot carries `source name + URL +
  retrievedAt + rangeStart/rangeEnd + a schedule-only note` (baked in
  `app/src/lib/event-schedules.ts` from public ESPN/NHL feeds, hand-verified).
- **`coming-soon`:** we publish nothing — no schedule, no odds. Must link
  nowhere that implies coverage (MLS/EPL were both coming-soon until real
  MLS fixtures were sourced; EPL remains coming-soon).

## Rules

1. **Schedule-only means schedule-only.** Never attach odds/projections/
   parlays/results to a schedule-only league.
2. **Coming soon means no fake schedule.** EPL stays coming-soon precisely
   because no published 2026-27 fixtures could be sourced — we do not invent
   them.
3. **Attribution is required** for any schedule snapshot (source, URL,
   `retrievedAt`, range). Snapshots are point-in-time and labeled as such,
   never "live".
4. **Results** (`/results`) only ever reflect graded NBA/MLB; no UFC/MLS/EPL
   results appear.
5. **Promotion path:** a schedule-only league can become "full" only after a
   real `pipeline/<sport>/` (ingestion + model + grader + tests) ships and
   produces graded results — never by UI change alone.

## Changing coverage

Any change to a sport's level **must** update `sports-coverage.ts` (and its
test) and this doc. See `DOCUMENTATION_GOVERNANCE.md`.
