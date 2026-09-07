# Program 243 · execution log + backlog

Charter: product completion and certification across MLB/NFL/EPL/UFC (Releases A–G).
This file is THE single backlog (charter §2). Historical unresolved items are mapped here.

## Phase 0 · baseline (2026-09-07 19:06Z / 15:06 ET)

- Clock: 2026-09-07T19:06Z · 15:06 EDT. HEAD `9ac354cd1` = charter baseline `3cb43cccc` + 5 bot
  commits (a third natural daily chain ran 14:24 ET; nfl-event-window passes at 18:51/19:03Z).
  FF'd clean; worktree = preserved untracked only (vp/, HANDOFF).
- Protected: portfolio.json `affe6b21…` · bank-builder-locks.json `cb80473f…` — canonical.
- Prod serving `c98ca632c` (built 18:58Z), a descendant of the P242 tree.
- Owned processes: none (all P242 watchers exited; preview server stopped at P242 close).
- P242 task chips outstanding (user-owned to start): watchdog recovery-chain fix; nested-main
  landmarks. Their scope overlaps A-7/F-a11y below — if a chip session lands first, reconcile.

### Defect reproduction (current tree + prod, not the audit's snapshot)

| ID | Reproduced now? | Evidence |
|---|---|---|
| R1 homepage "strongest reads today" holds Sep-12 UFC (9×) | YES (prod HTML 19:10Z) | heading says "today", rows say Sat Sep 12 |
| R2 Moonshot contradictory states | YES (prod): "Today's Moonshot card is published" + "No qualified Moonshot today" + "exposure $0" | two subsections, different sources |
| R3 MLB Sep-7 missed coverage | PRESERVED correctly: SLO MISSED_COVERAGE 11/5/6; full-game sims: 6 unavailable/4 degraded/1 ready | do NOT backfill |
| R4 "11 of 11 simulated" explorer claim | NOT visible on prod now (/simulate, /simulate/d/2026-09-07 clean; 5 "Simulation ready") | find owner; add population guard |
| R5 NFL preseason presentation + windows | YES: nfl/index.json model=nfl-preseason-public-beta-v1, forecastsUpcoming 0, next kickoff 2026-09-10T00:20Z; outer gate 18h vs builders 40h | Release C-NFL |
| R6 EPL 96h window vs MW4 (Sep 12–13) | YES: build-epl-forecasts --lookahead-hours 96; 0 current reports | Release C-EPL |
| R7 capability registry false (NFL/EPL "DISABLED · no route/schedule") | YES; 6 live consumers (results page, coverage board, accuracy summary, sport-capabilities, markets/pairing, markets/sport-config) | Release B |
| R8 UFC 11/13 with 2 reasoned gaps | YES (homepage "11 of 13 bouts predicted") — correct behavior, preserve | — |

## Backlog (id · dependency · owner-path · acceptance · state)

- A-1 today-population split (—) · src/lib/top-reads.ts + homepage section · today board holds ONLY
  ET-today events; future reads in an explicitly "upcoming" section; guard on populations · OPEN
- A-2 one Moonshot current state (—) · src/app/moonshot/page.tsx + one derived state owner ·
  hero/sections consume ONE object; prod shows single coherent state · OPEN
- A-3 count reconciliation (—) · simulate/today/mlb owners · scheduled/published/missed counted
  separately; same-scope counts agree across pages; explorer never counts unavailable as simulated · OPEN
- A-4 NFL current-summary hygiene (—) · nfl hub page · current week summary carries no archived
  prices/preseason copy at the top; archive stays disclosed · OPEN (minimal here; full = C-NFL)
- A-5 EPL "Today's ladder" future-dated heading (—) · sport-lab-cards.tsx · heading derives from
  card date · OPEN
- A-6 publication deadlines per event (R3) · publication-slo owner · deadline = earliest event −
  measured margin; recovery starts before earliest event · OPEN (verify current, then fix)
- A-7 recovery chaining (P242 finding) · publication-slo action + workflows · fallback proven via
  artifacts · OPEN
- B-1 shared event/period read model · new adapter over producers · consumed by hubs/home/simulate/
  picks/parlays/results · OPEN
- B-2 registry migration (R7) · sport-capability-registry + 6 consumers · claims match current
  evidence; consumers migrated · OPEN
- C-NFL week experience (R5) · nfl-event-window + builders + hub · full selected-week table with
  direct reports; regular-season branch wired; window rationalized · OPEN
- C-EPL matchweek experience (R6) · epl-matchweek + build-epl-forecasts + hub · matchweek
  eligibility replaces 96h; reports for supported fixtures · OPEN
- C-UFC bout journeys (R8 keep-gaps) · ufc hub · stable per-bout routes; reasons for gaps · OPEN
- C-MLB day navigation · simulate/day owners · today+selectable days; provisional tomorrow · OPEN
- D-1 product lifecycle registry completeness · lifecycle-registry + coverage · every settled
  stream registered once · OPEN
- D-2 one product-state object (R2 root) · products state owner · all pages consume it · OPEN
  (A-2 delivers the Moonshot slice)
- D-3 replay-safe progression tests · settle owners · duplicate/replay/partial fixtures · OPEN
- E-1 consistent IA (A22 carry-over) · navigation.ts + hub shells · five primaries; identical hub
  order · OPEN
- F-1 route+control inventory & 18-combo matrix · e2e · charter §9 · OPEN (starts during A–E)
- F-2 nested-main landmarks (P242 chip) · 15 routes · one main landmark per page · OPEN
- G-1 forward populations & research reconciliation (EPL player-v2 provenance, NFL families) · OPEN

## Release A (in progress)
