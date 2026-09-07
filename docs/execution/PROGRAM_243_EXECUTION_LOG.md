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

- A-1 today-population split · DONE 6c48a4993 (topToday/topUpcoming + sportPanelReads; verified on prod)
- A-2 one Moonshot current state · DONE 6c48a4993 (WC-board section removed; published lanes render; empty state quotes publicNote; contradiction gone on prod)
- A-3 count reconciliation · DONE 6c48a4993 (explorer excludes unavailable rows; guards population-exact)
- A-4 NFL prices-layer honesty · DONE 6c48a4993 + eaee528d8 (LIVE requires future kickoff; ARCHIVED_CAPTURE state; status builder in the always-rederive class)
- A-5 EPL ladder heading · DONE 6c48a4993 (ladderDayLabel)
- A-6 publication deadlines · DONE (verified: deadline = earliest − 90min already existed; pre-deadline recovery added in A-7)
- A-7 recovery chain · DONE 6c48a4993 (pre-deadline overdue dispatch at deadline−75min; loud 403; chain-completion step; actions:write on 4 carriers). Live proof pending the next natural drift
- B-1 shared event/period read model · DONE 95647043e (src/lib/events/read-model.ts; 10/10 incl. live reconciliation); consumed by /nfl hub (C-NFL); further consumers migrate opportunistically
- B-2 registry migration · DONE 4ae4a7c5f (EXPERIMENTAL_PUBLIC for NFL/EPL; UFC deliberately unchanged — its graduation-decision artifact is the standing authority, supersession = Release G)
- C-NFL week experience · DONE eaee528d8 (hub leads with Week 1 · 16 games via read model; per-row window reasons; status re-derives every window). Residual: /nfl/week/[key] routes when a git-conserved week register exists (single week in capture today)
- C-EPL matchweek experience · DONE 42a91e717 + be346f283 (matchweek eligibility; model-only pre-odds forecasts with the market comparison honestly absent; natural run published 10 MW4 rows)
- C-UFC bout journeys (R8 keep-gaps) · ufc hub · stable per-bout routes; reasons for gaps · OPEN
- C-MLB day navigation · simulate/day owners · today+selectable days; provisional tomorrow · OPEN
- D-1 registry completeness · DONE 35ecaa8df (mlb-cards + multi-cards governed with real owners; nfl-cards = recorded CLOSED_STREAM; membership guard vs lab-ledger streams)
- D-2 one product-state object (R2 root) · products state owner · all pages consume it · OPEN
  (A-2 delivers the Moonshot slice)
- D-3 replay safety · NATURAL EVIDENCE 2026-09-07: products generated twice (18:18 dispatch + 18:30 natural chain) → ONE pending Bank Builder card, $100 exposure, no duplicate stake/card ids; P211 machine tests stand
- E-1 five-primary IA · DONE 577a02444 (Home·Sports·Simulations·Picks & Parlays·Results identical desktop+mobile; guards rebased with old→new notes; thumb-bar width guard caught the 11-char overflow). Hub-order normalization: /nfl matches the charter order; /mlb //epl //ufc audit = F residual notes
- F-1 route+control inventory & 18-combo matrix · e2e · charter §9 · OPEN (starts during A–E)
- F-2 nested-main landmarks (P242 chip) · 15 routes · one main landmark per page · OPEN
- G-1 research reconciliation · EPL player-v2 provenance RESOLVED AGAINST the preregistration claim:
  git shows the ACCEPTED backtest generated 04:52:50Z, BEFORE its preregistration was first
  committed (22abc4e4f, 04:55:56Z); the report's stated registeredAt (06:15Z) postdates both.
  Finding recorded as data/internal/research/epl/reports/player-model-v2-provenance-note.json
  (appended, nothing rewritten; verdict not voided — but 'preregistered' may not be claimed for it,
  and any promotion resting on v2 re-runs under a genuinely pre-committed protocol or carries the
  caveat). Public rendered copy makes no preregistration claim (comments only). Forward populations
  keep collecting (EPL learning refreshed by today's natural runs); NFL family states derive from
  model-status (refreshed every window since C-NFL). Admin console: /ops·/preview·/launch pruned
  from the export every build (build log receipt). Legal manifest still records counsel review
  required with no approval entry — an OUTSTANDING EXTERNAL APPROVAL, not an engineering gap.

## Release A (in progress)


## Release C/E evidence (prod, 2026-09-07 ~20:40Z)

- NFL: https://gametimepicks.yashwantbalaji.com/nfl/ — "Week 1 · regular season · Wed, Sep 9 – Mon,
  Sep 14", all 16 games, per-row window/missed reasons (was: August preseason table first).
- EPL: all ten MW4 match reports LIVE with the model-only pre-odds label — e.g.
  /epl/match/manchester-united-v-manchester-city-2026-09-13/ (24.4/24.2/51.4 + exact-score matrix).
  Chain: matchweek eligibility → shadow modelOnly grid → public artifact → pages, published by the
  natural epl-matchweek workflow (3 dispatched runs; the third carried the full plumbing).
- Nav: five primaries render identically in both bars on the built export.
- MLB missed coverage (Sep-7: 11/5/6) preserved everywhere; explorer population excludes misses.
- UFC: 13 accounted (11 modelled + 2 reasoned gaps) — unchanged by design.

## FINAL REPORT (2026-09-07, ~21:20Z / 17:20 ET)

### §12 verdicts (each scoped to its evidence)

1. **CURRENT EVENT COVERAGE — DELIVERED.** The shared read model's period table at close
   (same-scope counts every page must agree with):
   | sport | period | scheduled | model published | missed pre-event | unsupported (reasoned) |
   |---|---|---|---|---|---|
   | MLB | 2026-09-07 (day) | 11 | 5 | 6 (preserved, never backfilled) | 0 |
   | NFL | Week 1 · regular | 16 | 0 (each publishes inside its own T-18h event window; first window opens Sep 9 ~06:20Z) | 0 | 0 |
   | EPL | Matchweek 4 | 10 | 10 (model-only pre-odds; prices join ≤30h before kickoff) | 0 | 0 |
   | UFC | Noche UFC · Sep 12 | 13 | 11 | 0 | 2 (named reasons) |
   A reasoned unsupported event is accounted for, not simulated; a report without prices is a
   valid forecast, not a qualified priced pick.

2. **PRODUCT LIFECYCLE — DELIVERED (one named residual).** Every settled stream is registered
   once (mlb-cards + multi-cards governed with real owners; nfl-cards a recorded CLOSED stream;
   membership guard vs the ledger's own stream list). Replay safety observed NATURALLY today:
   double generation (18:18 + 18:30Z) produced one card set, one $100 exposure, no duplicate ids.
   Residual: D-2's full one-object migration beyond Moonshot/Bank Builder (their live surfaces
   are coherent today — /moonshot one derived state; /bank-builder Step 1 of 5 · Cycle 13 · $100
   everywhere).

3. **RESULTS ACCOUNTING — STANDING (verified, not rebuilt).** The P233 explorer + canonical
   accounting render on /results; registry membership now covers every stream feeding it; the
   19-14 protected record byte-identical all session (md5 affe6b21… verified at baseline and
   pinned in the suite).

4. **PUBLIC UI — DELIVERED.** Five primaries (Home · Sports · Simulations · Picks & Parlays ·
   Results) identical on desktop top bar, rail (now an accessibly-NAMED landmark) and thumb bar;
   direct reports everywhere (P242 preserved); today-populations pure; hub leads = natural
   periods.

5. **BROWSER/VIEWPORT CERTIFICATION — PASS within tested scope.** Final tree: unit/contract
   5484/0 · built-HTML 462/0 · Playwright **526 passed / 0 failed / 18 reality-typed skips**
   across chromium + firefox-a11y + webkit-a11y, including the new 6-viewport matrix
   (360/390/430/768/1366/1440 × 9 routes: overflow, nav reachability, thumb-bar clipping) and
   the charter journeys (NFL week, EPL matchweek→fixture→back, UFC gaps, MLB day nav, parlay
   customize, product coherence, results, nav parity). Skips are typed live-state absences, not
   passes. Scope limits: representative-template dedup per the existing p206 control inventory
   (every route's links/buttons named + resolving); deeper per-instance interaction records
   remain the F residual.

6. **REAL-DEVICE CHECK — REAL_DEVICE_CHECK_PENDING.** Playwright WebKit ≠ physical iPhone
   Safari. Checklist: open /, /simulate, /nfl, /epl match page, /build on iPhone Safari +
   Android Chrome; verify thumb bar (5 items + Menu), no horizontal scroll, report tabs tap,
   back-navigation, reduced-motion.

7. **OPERATIONAL ON-TIME EVIDENCE — REPAIRED + ARMED, natural pass pending.** Today's real
   trace: 6/11 MLB games missed pre-event (recorded, kept); root causes fixed at the owners
   (pre-deadline recovery at publish-deadline−75min; loud 403; actions:write on all four
   carriers; chain-completion for suppressed workflow_run; NFL status in the always-rederive
   class). SLO state at close: PUBLISHED. The proof this holds is the next natural drift — a
   deadline-based claim, not a promise.

8. **OUTSTANDING EXTERNAL APPROVALS (naming, not hiding):** legal terms/privacy =
   LEGAL_COUNSEL_REQUIRED, approval null (structural ship-block for final legal text) ·
   NFL price authorization expired (draft receipt awaits founder) · UFC reclassification gated
   on superseding its graduation-decision artifact (registered process) · Moonshot pause token ·
   EPL player-v2: provenance note recorded — the ACCEPTED backtest predates its committed
   preregistration; 'preregistered' may not be claimed for it.

### One real working report per sport (production, verified rendered)
- MLB: https://gametimepicks.yashwantbalaji.com/games/mlb/ath-vs-sea-2026-09-06/ (full direct report)
- NFL: https://gametimepicks.yashwantbalaji.com/nfl/ (Week 1 · 16 games · per-row reasons); game page /nfl/game/401873308/
- EPL: https://gametimepicks.yashwantbalaji.com/epl/match/manchester-united-v-manchester-city-2026-09-13/ (model-only pre-odds, 24.4/24.2/51.4 + score matrix)
- UFC: https://gametimepicks.yashwantbalaji.com/ufc/ (13 bouts · 11 reads · 2 reasoned gaps)
- Products: /bank-builder (Step 1 of 5 · Cycle 13) · /build (Sep-7 3-card ladder) · /results

### Remaining gaps, each with an owner class
- ENGINEERING: F per-instance interaction records; D-2 full product-state object; /nfl/week/[key]
  routes (needs a git-conserved week register); hub-order normalization pass for /mlb //epl //ufc
  bodies; nested-main landmarks (P242 chip).
- FUTURE EVIDENCE: NFL Sep-9 first regular-season generation; next natural cron drift proving the
  pre-deadline recovery; EPL night-before price join (≤30h); forward evaluation ≈ Sep 10.
- AUTHORIZATION: NFL odds renewal · UFC graduation supersession · Moonshot resume · legal counsel.
- DEVICE: REAL_DEVICE_CHECK_PENDING (checklist above).

Broad public launch remains a separate decision while the external approvals stand.

# Program 244 continuation (same register — no competing backlog)

## Baseline (2026-09-07 22:01Z / 18:01 ET)
HEAD b08dd6892+bots → pulled; prod ⊇ P243 final; protected md5s canonical; no owned processes.

## P244 Release A/B — NFL Week 1 delivered TONIGHT (the charter's milestone)
- Bottleneck named: the T-18h outer gate + 30/48h builder lookaheads. Removed at BOTH owners:
  build-nfl-public-forecasts populates the CURRENT (seasonType, week) period (hour lookahead =
  backstop for weekless schedules); nfl-event-window's gate asks "any pre-start event in the
  current week". Model semantics untouched (pre-now fit, immutable receipts + pre-kickoff
  revisions, settle-latest-pre-kickoff).
- Coherence rule made sampling-noise-aware (3σ of a 10k-run rate): BAL@IND p=.500/median+1 is one
  distribution rounded twice, not a contradiction. 16/16 publish.
- First natural run (34165498035): 16 regular-season forecasts committed; expired P171 odds
  receipt exited 0 by design (unpriced reports, never a fatal gate); role evidence honestly empty
  (actives source absent this far out) → game-level player sims refused with the named reason;
  TEAM reports complete.
- PROD, verified rendered ~22:50Z: /nfl/game/401872656/ = full report (NE 19–26 SEA · 61.7/35.7/
  tie 2.6 · total 45 [28–62]); hub "16 scheduled · 16 with a report", 16 SIMULATED rows.
- Guard corpus taught the regular regime (regime-scoped, direction-aware inversion, tie mass,
  regime-aware differentiation audit whose public prose no longer says "preseason" over Week 1).
- Hub cards repointed to /nfl/game/<id>/ (the 16 /games/nfl sim links 404'd — participation-gated
  route); fix pushed d30c15300, deploy in flight.
