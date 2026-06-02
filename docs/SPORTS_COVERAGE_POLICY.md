# Sports Coverage Policy

The single rule: **a sport only gets odds/projections/parlays/results when a
real player-prop model AND graded results exist for it.** Everything else is
schedule-only (if a real, attributed schedule can be sourced) or "coming
soon" (if not). No fabrication, ever.

Source of truth in code:
[`app/src/lib/sports-coverage.ts`](../app/src/lib/sports-coverage.ts) (the
`SPORTS_COVERAGE` registry, locked by `sports-coverage.test.mjs`).

**Capability gates:**
[`app/src/lib/sport-capabilities.ts`](../app/src/lib/sport-capabilities.ts)
**derives** strict, typed capability booleans from that registry
(`hasSchedule / hasOdds / hasProjections / hasSuggestedParlays /
hasBuildYourOwn / hasGrading`, plus a coarse `status`) and exposes pure gates
(`canShowProjections`, `canShowSuggestedParlays`, `canUseInBuildYourOwn`,
`canGradeSport`) and the mixed-sport rules below. Locked by
`sport-capabilities.test.mjs`. **One source of truth** — graduate a sport by
changing its `level` in `sports-coverage.ts`; the gates + tests do the rest.
See [`SPORTS_PROJECTIONS_EXPANSION_PLAN_2026-06-02.md`](./SPORTS_PROJECTIONS_EXPANSION_PLAN_2026-06-02.md).

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
6. **Official Suggested Parlays are single-sport only.** A cross-sport
   ("mixed") slip must **never** appear as an official Suggested Parlay.
   Mixed-sport is allowed **only** in Build Your Own (custom, untracked), and
   only when **every** leg is from a modeled sport. Enforced by
   `sport-capabilities.ts`: `filterOfficialSuggestedSlips` is **wired (PR B)**
   into the Parlay Lab Suggested surface (no "Mixed" pill; the "All" tab is the
   union of single-sport slips), Home preview, and Bank Builder; and
   `canUseLegInBuildYourOwn` / `filterBuildYourOwnLegs` is **wired (PR C)** into
   the Build Your Own candidate pool (`getLegPool`) so a schedule-only /
   coming-soon / unknown / missing-sport leg can never enter a custom slip
   (fail-closed). Mixed NBA+MLB customs are permitted; they stay untracked. Results may still show a historical
   **Mixed** sport-mix row from previously generated/graded slips (labeled as
   such — not today's official behavior); settlement/grading are unchanged.

## Changing coverage

Any change to a sport's level **must** update `sports-coverage.ts` (and its
test) and this doc. See `DOCUMENTATION_GOVERNANCE.md`.
