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

## P244 TONIGHT CHECKPOINT (2026-09-07 ~23:35Z / 19:35 ET — ahead of the 23:59 ET mark)

### The §10 table (verified populations, tonight)
| sport | period | scheduled | report-ready | unpriced reports | fresh priced | player families | qualified cards | missed pre-event |
|---|---|---|---|---|---|---|---|---|
| NFL | Week 1 · regular | 16 | 16 (all team reports) | 16 (P171 receipt expired — honest NO_MARKET) | 0 | 0 supported (participation source absent this far out; families stay per-family typed) | 0 (lane closed by machinery) | 0 |
| EPL | Matchweek 4 | 10 | 10 (model-only pre-odds) | 10 | 0 (night-before capture ≤30h, by rule) | scorer head only, in-window | 3-band ladder (priced Sep-12 set) | 0 |
| UFC | Noche UFC · Sep 12 | 13 | 11 (+2 reasoned gaps) | 0 (Tue capture cadence) | 0 | n/a | ladder awaiting prices | 0 |
| MLB | 2026-09-07 (day) | 11 | 5 | — | day-of authorized | market-context per receipt | BB A/B + ladder 3 cards | 6 (preserved) |

### NFL Week 1 — the direct answers
- Can a user browse the week tonight and open real reports? **YES — verified rendered on prod:**
  hub table "16 scheduled · 16 with a report", 16 working /nfl/game/<id>/ links (0 dead links
  after d30c15300 deployed; 4/4 sampled 200 with full content).
- Did the obsolete short-window gate actually get removed from the full path? **YES at every
  layer traced:** workflow outer gate (current-week membership), forecast builder (weekly
  population, hour lookahead = weekless-schedule backstop only), and the guard corpus that
  enforced the old regime. Player-family generation remains honestly participation-gated —
  an input gate with a named source, not a clock.
- Model: nfl-regular-season-public-v1 (PUBLIC_EXPERIMENTAL), generated 2026-09-07T22:06:57Z by
  the natural workflow run, immutable receipts + pre-kickoff revision lineage; every report
  carries score/margin/total distributions, win probabilities with explicit tie mass, input
  freshness and the no-market-claim humility line.
- Example URLs: /nfl/game/401872656/ (NE@SEA · 61.7% SEA · total 45 [28–62]) · /nfl/game/401872659/
  (BAL@IND coin-flip published under the 3σ coherence rule).

### Certification on tonight's tree
suite 5484/0 · built 463/0 · Playwright 523/0 with 21 reality-typed skips (3 engines, 6-viewport
matrix + charter journeys). CI: cumulative run on c88740942 in flight at checkpoint.

### D-2 progress + named remainder
deriveBankBuilderState ships: one object, four record systems, measures named (live vs settled
exposure; crowned ladders vs store positions vs label counter), divergences TYPED — the live tree
surfaces lane A generated step 1 vs the P211 store's advance→step 2. Whose counter governs is the
founder-gated multi-lane exposure accounting; surfaces migrate when it resolves.

### Hub-order deltas measured (E residual, exact)
MLB: ladder (products) renders after sims/report cards — one section swap owed. NFL: no
methodology anchor; picks=markets naming. EPL: cards section unanchored in nav. UFC: bespoke
shell. Reorder deferred with these coordinates; nothing hides.

# Program 245 continuation (same register)

## §3 audits — before/after with the arithmetic

**Constant total 45.** Verdict: DECLARED SHARED PRIOR, exactly as the public differentiation
summary states. The regular-season fit carries ONE total parameter (muTotal 44.9088, sigmaTotal
13.49; no team term), so every game draws N(44.91, 13.49²) → median 45, p10/p90 ≈ 28/62 after
integer snapping (3 distinct tuples across 16 games = snap-level variation only). No jitter, no
hashing, no sportsbook injection — an event-specific totals head is a CANDIDATE requiring its own
frozen chronological protocol (named, not launched tonight).

**Coherence rule.** BEFORE (P244): sign(median) vs pHome≷0.5 with a 3σ "sampling" tolerance —
wrongly justified, because the published probability is ANALYTIC (Elo-logistic × (1−tieMass));
only the margin median is sampled. AFTER (P245): (1) the favourite is pHome vs pAway — the
tie-mass scaling printed a clear favourite (d≈+11 Elo, logistic 0.516) at pHome 0.4997 and the
old rule read contradiction where both heads agreed; (2) both heads cross at d=0, so a genuine
direction conflict is reachable only inside the sampled median's width (≈0.17pt sampling + ±0.5
integer snap ⇒ band ±1); |median| ≥ 2 with the favourite reversed refuses. One rule
(coherence.mjs) + corruption fixtures (+7 vs away-favoured refuses both directions).

**Stale 18h copy.** The header clause rendered its window sentence even at 16/16 published; the
clause is now conditional AND no longer names an hour window at all.

## Release A — the family matrix (implementation decision)

| family | owner/engine | evaluation | decision |
|---|---|---|---|
| player_rush_yds | props-v1 opportunity-efficiency | PUBLIC_ELIGIBLE (n=3273; beats both baselines; coverage+calibration pass) | PUBLISH now |
| anytime TD | td-engine + anytime-td-v1 calibration | held-out 2025 n=3570, logLoss 0.5492 < both baselines; DNP=void conditioning | PUBLISH now |
| player_pass_yds | props-v1 | RESEARCH_ONLY — interval coverage bar failed (n=969) | WITHHELD, bar named |
| player_reception_yds / receptions | props-v1 | SHADOW_ELIGIBLE — calibration bar failed (n=4789) | WITHHELD, bar named |
| pass INT / pass TDs | simulated component | never separately evaluated | WITHHELD |
| first/last/2+ TD | none | explicitly DISABLED, no ordering model | WITHHELD, never derived from anytime |
| team total | rs fit | shared league prior (muTotal only) | candidate protocol named; champion intact |

Inputs: role-shares-v1-decayed-stint (walk-forward 2023–24, held-out 2025 beats last-game
baseline; predictSeason 2026, 32 teams) + current rosters + injuries feed. Participation states
pre-actives: AVAILABLE_ROLE_UNCERTAIN / ACTIVE_PROJECTED / QUESTIONABLE / INACTIVE — every
published row wears one; volume markets withheld for INACTIVE (TD stays, void-conditioned).

## P245 FINAL (2026-09-08 ~02:15Z / 22:15 ET Sep 7)

### Delivered
- The vertical slice is LIVE end to end through the NATURAL workflow run (34176152332):
  16 public player boards (nfl/player-board/<eventId>.json) → /nfl/game/<id> renders "The player
  board" with family tabs (Rushing yards · Anytime touchdown), team chips, name search, availability
  states on every row, and the withheld-families disclosure naming each failed bar. Verified
  rendered on prod (NE@SEA: 20 modelled players).
- Publication is promotion-gated FROM RECEIPTS: rush yds (props-v1 PUBLIC_ELIGIBLE, n=3273) and
  anytime TD (calibration beats both baselines, n=3570, DNP=void conditioning) publish; pass yds
  (coverage bar), receiving/receptions (calibration bar), INT/pass-TD (never evaluated),
  ordered TD (disabled) are WITHHELD on the artifact with their reasons.
- Confirmed absence conditions output: an INACTIVE player's volume markets are withheld on the
  row (void-conditioned TD stays, explained); availability reconciles to the strongest evidence.
- §3 all closed with math (above): shared-prior total named; coherence re-derived (favourite =
  pHome vs pAway; ±1 snap band; one rule + corruption fixtures); 18h copy gone.
- Weekly population through the whole input chain; injuries-fed role evidence (212 role-ready TD
  candidates; the Vault still rightly publishes no card without a priced market).

### Verdicts (separate, as required)
- Team model quality: AUDITED — margin/win event-specific under the evaluated Elo head; total =
  declared shared prior; an event-specific totals head is a NAMED candidate (frozen protocol
  required), champion intact.
- Player projection coverage: 2 families PUBLISHED per their receipts across all 16 games;
  4 families WITHHELD with exact bars; per-game matrix ON the artifact.
- Priced selections: NONE (P171 receipt expired — unpriced projections are labelled projections;
  renewal remains a founder decision; no self-authorization).
- Public game-report usability: board filterable, mobile-scrolling table, reduced-motion-safe,
  no ceremony; e2e 514/0 (30 typed skips) · suite 5493/0 · built 463/0 on the final tree.
- Settlement/replay: unchanged owners; TD void semantics stated at publication.
- Mobile/laptop interaction: the 6-viewport × 3-engine matrix passes on the final tree; board
  controls covered by the journeys spec + p206 control crawl (shared-template disclosure stands).
- Physical devices: REAL_DEVICE_CHECK_PENDING (unchanged checklist).

### Carried forward (named)
BB step/cycle founder gate · hub-order coordinates · per-instance interaction records · EPL/UFC/
MLB unchanged and green (EPL settle ran naturally 01:0xZ; boards untouched by NFL schema).
