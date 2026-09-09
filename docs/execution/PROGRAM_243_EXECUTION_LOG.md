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

---

# PROGRAM 246 — NFL weekly boards & public product polish (charter: PROGRAM_246_NFL_WEEKLY_BOARDS_AND_PUBLIC_PRODUCT_POLISH.md, REVISED)

Baseline 2026-09-08T02:53Z at `9564524a1` (tree == origin == prod; protected md5s canonical).

## Slice 1 — founder copy removals, at the owners
- **Block 1** (calibration paragraph): the /nfl hub card path no longer renders it — the
  `calibrationById` map is deleted and the card footnote carries only ABSENCE reasons. The game
  report holds the paragraph in an optional `<details>` "Model details" disclosure with the
  frozen-contract lineage. The artifact FIELD stays (guard "every forecast explains its
  calibration" + the charter's preserve-lineage-in-artifacts clause).
- **Block 2** ("Simulations generated … backfilled" footer): replaced with compact
  `Updated <ET> · frozen pre-kickoff · Model details` linking the same-page coverage section
  (an early draft linked `slateGames[0]` — the P244 dead-link class — repointed before commit).
- **Equivalent-phrasing sweep** (all sports): EPL footer `Generated <ISO>` → `Updated
  <formatUpdatedEt>`; UFC `Card and model read <ISO>` → `· updated <formatUpdatedEt>`. New shared
  `formatUpdatedEt` in src/lib/format.ts (en-US, America/New_York, hour12 — not the Intl
  hour-24 class). UFC publication-freshness guard REBASED without weakening: it now recomputes
  the exact compact form from the artifact's own field (a build-time-computed stamp still fails).
- **Stale 18h copy**: the card absence footnote quoted "from 18 hours before kickoff" — removed;
  hub-slate-parity guard rebased with the old→new contract note.

## Score display convention (§4B-NFL)
- REPRODUCED: 5 of 16 Week-1 games carried a marginal-median inconsistency — GB @ MIN printed
  25 + 21 = 46 beside median total 45; CHI @ CAR summed 44 ≠ 45; ARI @ LAC diff 11 ≠ margin 10;
  NYJ @ TEN diff 3 ≠ 2; ATL @ PIT diff 5 ≠ 6.
- Convention `scores-derived-from-total-and-margin-v1` at the generator, BOTH regimes:
  home = round((total + margin)/2), away = total − home. Sum equals the printed total exactly;
  difference within 1 of the printed margin; scoreRange stays marginal. Display labels updated
  (game page Stat sub, top-reads context). Guard: SRC pins (2 regime uses, no marginal-median
  headline) + LIVE stamp-conditional sum/diff assertions binding on regenerated artifacts.

## Confirmed-out players (§4.1)
- Per-game board DEFAULT view excludes `participation === "INACTIVE"`; explicit labelled toggle
  "Show listed-out players (N) — conditional on playing" (default OFF), source-pinned in
  player-board-public.test.mjs because client defaults are invisible to built-HTML greps.
- The weekly ranking owner NEVER ranks INACTIVE (no toggle at week level).

## §5 canonical ranking owner
- `scripts/nfl/build-nfl-weekly-boards.mjs`: week-scoped (seasonType, week) membership; a family
  publishes weekly ONLY when every constituent per-game board publishes it; top-N are MAXIMUMS;
  scope declared (FULL_WEEK vs REMAINING_EVENTS with dropped-count); every row carries
  `pricingState: NOT_AUTHORIZED`; refuses an unpinned run (`--now` required). Initial artifact
  committed pinned to the forecast stamp 2026-09-08T01:18:09Z; nfl-event-window step added after
  the player boards (bash -n across all run blocks clean).
- First derivation: FULL_WEEK over 16 · top_td=5 · top_rush_yds=10 · receptions / receiving /
  passing WITHHELD with their exact receipt bars.
- Guard suite `weekly-boards.test.mjs`: one-owner (the hub never sorts players), LIVE board
  contract, family unanimity vs per-game boards, workflow-owns-regeneration.

## §3 hub reorder (first pass)
- Slate section: card grid → ONE compact weekly TABLE (Kickoff ET / Matchup+logos / Model winner
  = pHome-vs-pAway favourite / Projected score / Total+range / Status / View game). Guard-held
  absence sentences live in the Status cell. No price column while authorization is expired —
  stated in prose, never implied. Shared-prior totals note under the table.
- NEW "Weekly top boards" section (`nfl-boards`) directly under the game table, charter order:
  TD top-5 (portraits) → receptions → rushing → receiving → passing; withheld families render
  one-line reason boxes.
- SportHubNav registry: + "Top boards"; the sportsbook-prices anchor mislabelled "Model picks"
  now reads "Prices".
- §6 truth defect found by the reorder: "Sportsbook prices for this slate" would render the
  ARCHIVED Aug-29 capture under a Week-1 heading (the two-surfaces-called-yesterday's-data-
  today's class) → `slateMarketRows` scoped to week membership; section + anchor gate on it;
  public-route-inventory guard rebased STRICTER (existence AND week membership).

Gates: typecheck ✓ · suite 5498/0 · build ✓ · built 464/0 (after the two named guard rebases).

## §6 defects surfaced by rendering the reorder (fixed same session)
- The games-first HubHeader table said "0 with a supported read / No supported read" on all 16
  rows DIRECTLY ABOVE "16 of 16 carry a published simulation" — the adapter hardcoded
  `read: null` from when that was true. The read column now joins the canonical index's own
  projection (favourite = pHome vs pAway, labelled `model forecast · experimental`); renders
  "16 with a supported read". The adapter also still carried the 18h event-window sentence —
  swept to the same closer-to-kickoff copy.
- Hero advertised "Sportsbook prices 1 · captured 17:50Z" (the archived Aug capture via
  `index.counts.marketEvents`) beside a Week-1 slate with no current prices, with a CTA
  anchoring a section that no longer rendered (dead in-page button). Stat is now the WEEK's own
  count with "none current — capture not authorized" at zero; the second CTA slot follows what
  the build actually shows (prices when current, else Weekly top boards). hub-slate-parity
  guard rebased (stricter: week-scoped count + named zero state).
- A11y: the new listed-out toggle checkbox tripped the structural audit (implicit label not
  credited) → explicit aria-label; audit back to 0 serious. NOTE (pre-existing, all four sport
  hubs): moderate `heading-one-unique: 2 <h1>` on /mlb /nfl /ufc /epl — recorded for §6.

Final gates this commit: suite 5498/0 · built 464/0 · e2e (p242+p243 journeys+viewport) 18/18 ·
a11y structural 0 serious.

## P246 §4 model work — three preregistered candidates, three verdicts
- **§4.2 pass yds (coverage)**: REPRODUCED (80% interval covers 56.86%; mechanism = pooled-MEDIAN
  gameSigma zeroed the game-level term). Candidate `pass-gamesigma-pooled-mean-v1` preregistered,
  evaluated once, **REJECTED** on its coverage bar (0.5707) — the recovered sigma (0.1027) is real
  but small beside the true gap: CENTER error (MAE 81.4 ≈ interval half-width). Next candidate
  named (train-fit predictive-uncertainty term), not run. Champion untouched.
- **§4.3 receptions + receiving (calibration, judged separately)**: one-sided over-optimism
  REPRODUCED on held-out 2025 AND inside the fit period (--diagnose-season lane, measurement
  only). Candidate `receiving-target-deflation-v1` (ONE fitted gamma on modeled target shares,
  frozen grid, in-train selection — monotone to the grid edge, gamma=0.90, boundary NOTED):
  **player_receptions ACCEPTED** (ece 0.0352 · cov 0.8643 · beats both baselines · pinball under
  cap) → PUBLIC_ELIGIBLE via the standard gates → receptions PUBLISHED on per-game boards + Top 10
  Receptions weekly board (natural workflow run, zero board-builder edits — the receipt IS the
  gate). **player_reception_yds REJECTED** (ece 0.0761→0.0556, still over 0.05) → stays SHADOW.
  ⚠️ found + fixed: champion-adoption read swallowed a TDZ ReferenceError in a try/catch and
  silently no-opped the first regeneration (the silent-catch class).
- **§4B-NFL matchup totals**: candidate `matchup-totals-v1-decayed-points` preregistered →
  **ELIGIBLE** (held-out 2025: NLL 4.029 < refit-prior 4.049 · cov80 0.786 · MAE 10.81 < cap;
  a1 = 0.784 ± 0.172). ADOPTED receipt-gated in the public forecast builder (per-game mu from
  walk-forward decayed combined-points ratings cut at each kickoff; margin head untouched;
  `total.head` + `model.totalsHead` stamps; audit + guards regime-scoped on the stamp in BOTH
  directions; hub totals footnote derives from the stamp). Typed divergence RECORDED: the player-
  sim chain still runs on the evaluated constant-total head its own receipt measured — re-eval
  under the matchup head is the named follow-up. Boundary scan caught an internal path in the
  first stamp (receipt cited by name@stamp instead).
- **§4.4 rush/TD receipts**: VERIFIED — engine id `nfl-player-props-v1-opportunity-efficiency` v1
  identical across receipt /protocol, producer constant, and live artifact stamps; TD gate
  numbers re-checked (0.5492 < 0.5525/0.5657).

## P246 §4B — four-sport engine traces (3 parallel read-only agents) + highest-value fixes
- **EPL**: unified match-sim confirmed structurally coherent (ONE grid; totals/BTTS matchup-
  specific — no shared prior; odds enter NOTHING). FIXED: (1) modelOnly LIVE LOSS — cleanSheet /
  doubleChance / margin / topScorelinesMass computed then dropped on every READY_EXCEPT_ODDS row
  (all 10 current) → copied on the modelOnly rung + row fallbacks + field-parity guard; (2)
  player-projection allocation fit on the STALE base corpus (bypassed loadEplCorpus; 1520 vs
  1550 matches — scorer shares allocated from a distribution disagreeing with the published team
  card) → the one corpus owner. v2 provenance note confirmed present; public copy makes no
  preregistration claim. Ledger extras recorded for later: dead epl-poisson duplicate impl,
  book[1..n] de-vig dropped, threeWay dead branch, teamContext inert.
- **UFC**: fighter probabilities CONFIRMED a fitted model (logistic + nested Platt, source-hash
  publication gate), price-free by construction. FIXED five labeling defects: /simulate registry
  called the model winner "market_implied" and the model round head "none" → experimental_model
  with honest notes; method bars now say "among fights that end with a winner"; R3+ bar says
  "includes every decision"; capture-ufc-odds header falsely claimed method/round REJECTED (both
  PASS) → budget-scope truth; ladder "never been compared against a no-vig line" → cites the
  live comparison (market ahead); graded-picks caveat promised a market column that never
  rendered → column renders when rows carry it; typed 3557-count + typed z 0.876 (live 1.3747)
  softened to receipt-pointing claims. PRESERVED both governed gaps (collision-audit artifact,
  graduation decision) — no reclassification.
- **MLB**: input audit delivered (three separate engines confirmed; frozen daily-path inventory;
  eleven captured pregame feature families feed no engine; line movement captured then
  overwritten). FIXED the CRITICAL: the pre-event boundary was the BOARD's clock, so lineup-
  refresh reruns republished "pregame" 10k sims for games under way (Sep 7: 3 games, one ~6h
  after first pitch). The driver now re-derives the started set from its OWN --now on an input
  copy (sourceBoardHash unchanged, repro probe unaffected), REFUSES fresh sims for started
  games, and carries forward only a genuinely PREGAME prior byte-for-byte (a post-start prior —
  the bug's own output — refuses rather than being preserved). Guard added. Remaining audit
  items (team-markets staleness stamp, researchEligible ignored, batter_total_bases at the
  artifact layer) recorded for follow-up, NOT changed — smallest sufficient fix on the frozen
  daily path.

Gates: suite 5499/0 · build ✓ · built 464/0.

## P246 §6/§8 — cleanup, evidence, certification
- **A11y**: heading-one-unique closed at the OWNERS — SportOverviewHero gains `headingLevel`
  (hubs that mount HubTitle pass "h2"; pages where the hero IS the title keep h1); /ufc's local
  duplicate demoted. Structural audit: **0 findings** (was 4 moderate + the toggle's serious).
- **Weekly boards polish**: yardage quantiles rounded AT THE RANKING OWNER (ranking still uses
  the precise value) — "64.06 yards" beside integer per-game boards was false precision.
- **After-evidence committed**: docs/execution/screenshots/p246/ — weekly game table, weekly top
  boards (3 published + 2 withheld with bars), game-report Model-details disclosure, UFC
  method/round semantics, /simulate coverage registry, EPL compact stamp. Before-state =
  prod at 9564524a1 (git history; founder's own §3 screenshots are the charter's record).
- **§8 certification on the final tree**: full e2e matrix (chromium + firefox-a11y +
  webkit-a11y, includes the 6-viewport × 3-engine matrix + charter journeys):
  **511 passed · 0 failed · 33 typed skips**. suite 5499/0 · built 464/0 · a11y structural 0.

---

# PROGRAM 246 — §10 CLOSEOUT

## Per-game NFL matrix (Week 1 · regular season, live artifacts at close)
All 16 games: simulation PUBLISHED · total.head = matchup-totals-v1-decayed-points · projected
scores sum EXACTLY to the printed total (derived convention) · 3 player families published
(rush yds, receptions, anytime TD) · player boards 12–24 modeled rows each.
Totals now span 44 (DEN@KC, MIA@LV) to 52 (DAL@NYG) — a real per-matchup read where every game
printed 45. Weekly boards: FULL_WEEK over 16 · top_td + top_receptions + top_rush_yds PUBLISHED ·
receiving yds / passing yds WITHHELD with their exact receipt bars.

## Four-sport engine comparison (from the §4B traces, all claims file-cited in the log above)
- **NFL**: evaluated Elo-logistic win head + adopted matchup totals head + promotion-gated player
  families; every published number traces to a committed receipt; the player-sim chain's
  constant-total basis is a TYPED divergence with a named re-evaluation follow-up.
- **EPL**: ONE Poisson score matrix per fixture (totals/BTTS matchup-specific by construction);
  unified goal allocation when the XI is posted; no odds in any model input (structural + guarded).
  Gaps: BTTS carries no goal-correlation term (Dixon–Coles null on live path); conditional
  no-lineup scorer rows bypass the matrix (labelled); v2 provenance caveat stands unpropagated.
- **UFC**: fitted logistic + nested-Platt fight model (winner/method/round all PASS), price-free
  by construction, publicly graded vs the de-vigged line (market currently ahead — stated).
  Labeling debt cleared this program; both governed gap artifacts preserved untouched.
- **MLB**: three separate engines confirmed; all four modeled player markets remain demoted to
  market-context (no team market has any calibration record — recorded); the pre-event boundary
  now holds against each run's own clock with pregame-only carry-forward. Eleven captured
  pregame feature families still feed no engine (contract gates unmet — recorded, not wired).

## Verdicts (separate, as required)
- Founder copy removals: DONE at owners across sports; lineage lives in artifacts + optional
  disclosures; guard rebases recorded with old→new notes.
- Score/total display: DONE — derived convention live on all 16 (sum==total exactly).
- Confirmed-out players: DONE — excluded from default per-game view (labelled toggle) and never
  ranked weekly.
- §5 ranking owner: DONE — one builder, week-scoped, promotion-gated, maximums, declared scope,
  NOT_AUTHORIZED pricing state, workflow-owned regeneration.
- §4 model quality: receptions ACCEPTED→PUBLIC; matchup totals ELIGIBLE→ADOPTED; pass-yds
  candidate REJECTED honestly with the next candidate named; reception-yds improved but held to
  its bar. Nothing shipped without a receipt.
- §6/§8: structural a11y 0 findings; full matrix 511/0/33; suite 5499/0 · built 464/0.

## The new-visitor question
Can a new visitor, landing on /nfl, understand what this site claims and does not claim?
The page now leads with one game table (kickoff, matchup, the model's winner, a derived score
pair that adds up, a per-matchup total), then the weekly top boards with portraits, each withheld
family naming the exact bar it failed, no price column pretending authorization exists, and a
one-line "Updated … · frozen pre-kickoff · Model details" instead of a provenance paragraph.
The honest-limit sentence stays in the lead. YES — with the standing caveat that the model has
not been shown to beat the market, and says so in its own lead.

## Named follow-ups (carried)
Player-sim chain re-evaluation under the matchup totals head · pass-yds predictive-uncertainty
candidate (preregistration required) · wider gamma grid (boundary selection) · MLB team-markets
staleness stamp + researchEligible consumption + batter_total_bases at the artifact layer ·
EPL dead-code ledger items (epl-poisson duplicate, dropped multi-book de-vig, inert teamContext)
· BB founder gate + other standing founder gates unchanged.

---

# PROGRAM 247 — NFL Week 1 completion & four-sport product readiness

Baseline 2026-09-08 15:24 EDT verified against the real clock; tree FF'd over 24 unattended
commits; all four sports fresh from today's natural runs; first NFL kickoff Sep 9 20:20 ET.

## Phase 0 — today's reality (timeboxed)
- ONE red run diagnosed: the scheduled daily-products recovery goes red on every legitimate
  hold day (skip guard recognized only ACTIVE cards; today = NO_PLAY over a real 4-candidate
  pool). Fixed at both owners: completed-evaluation skip + the assert's documented
  --max-age-min for a backstop that found today's ladder current. Verified against today's
  actual receipt.
- EPL matchweek dispatched once: the P246 four-field fix verified LIVE through its
  production-owned path (all four fields non-null on every model-only row, 19:29Z artifact).

## Release A — promotion verification + integration (CLOSED)
- Evidentiary-status annex (p246-evidentiary-status-annex.json): 2025 is a REUSED evaluation
  season for every P246 result; totals gain met its bar but paired ΔNLL = 0.020 ± 0.017
  (t=1.18, 95% CI spans zero, better on 55% of games) — bar-clearing, NOT individually
  significant; the in-train slope (4.6σ) carries the mechanism; 2026 forward record decides.
- Bridge TRACED: ownMargin = margin exactly — the total CANCELS from player volumes up to
  integer score snapping. Integration preregistered (per-family retention + 2% non-inferiority),
  evaluated once: ALL BARS PASS with deltas under half a percent (invariance confirmed).
  props-gamesim-matchup-totals-v1 ACCEPTED; champion receipt regenerated integrated; the
  event-window runner applies the same per-game override receipt-gated (probe: research team
  scores now span 43–52, agreeing with the public team reports). The P246 typed divergence
  CLOSES.
- ⚠️ The record register had gone stale since P222 (nothing appended; the in-flight exemption
  hid it until a P247-conventioned subject became newest). P222 R-B registered; record + PDF
  chain rebuilt and verified (176 rows).

## Data-state guard repairs surfaced by the day's tree (all four pre-existing, none mine)
- Vault replay suite seeded the LIVE rolling results capture, which no longer holds Aug-29
  finals (pinned-today's-data class) → frozen era fixture extracted verbatim from git commit
  205774b01, seeded at both sites.
- MLB presentation sliced off its own DEGRADED verdict when input notes filled the 5-row cap
  (tex-vs-sea today) → mandatory rows (status/not-modelled/validation) now precede input noise.
- EPL odds-join guard: first live fixture RESCHEDULE (Palace–Leeds MW5, Sat 14:00 → Sun 13:00)
  orphaned an immutable capture → exclusion made principled (same club pair at a different
  kickoff = documented reschedule; a vanished pairing still fails). No capture rewritten.

Gates: suite 5499/0 · build OK · built 464/0.

## P247 Release B/C — the population was the defect; the governed re-receipt
- **Pass-yds candidate REJECTED on its own bars** (cov 0.703 < 0.72; ece 0.119; LOSES to
  share-volume by 13 yds MAE on the honest starter population). The P246 "center error" story
  was the aggregate shadow of two structural facts: 468/969 evaluated points were non-starters
  (88% zeros) admitted through an inconsistent absent-from-boxscore=0 branch, and conditional
  on the true previous-game starter the whole distribution sat ~45 yds low (effective share
  0.74 vs train reality 0.9577). Next candidate named (starter-conditioned regression head),
  not run.
- **The absent-as-zero artifact infects EVERY family's receipt** (48% of rush points, 31% of
  reception points). Resolution: participation ground truth acquired — nflverse snap counts
  2023-25 committed verbatim, builder with postseason round mapping + unique-lastname nickname
  fallback, **99.96% join validation** (16,834/16,841 stat-recording players), refuses <99%.
- **Governed re-receipt** (preregistered, incl. disclosure that 2025 was measured once under
  the new conditioning before registration): market-true population (absent+played settles 0;
  absent+did-not-dress VOIDS) + in-train gamma re-selection. The gamma grid INVERTED:
  γ=1.00 optimal, monotonically worse toward 0.90 — **the P246 deflation was fit against the
  population artifact, not against reality**; the parameter is dropped.
- **Promotion under the honest receipt**: receiving yards → PUBLIC_ELIGIBLE (ece 0.016,
  cov 0.835, beats both baselines); receptions → SHADOW (cov 0.8845 misses the band by 0.0045
  — the bar is the bar); rushing yards → SHADOW (ece 0.1112); passing → RESEARCH_ONLY (loses
  to baselines, stated in the receipt). The blanket "baselines beaten everywhere" guard was
  rebased to per-family honesty: a family that loses says so and can never publish.
- Week-1 boards after regeneration: anytime TD + Top-10 receiving yards publish; rushing,
  receptions and passing withheld naming their exact bars. Fewer boards, honest boards.
- Homepage copy ceiling evidence-updated (1600→1650): prod measured the identical 1,603 at the
  same moment on a 15-game in-progress slate — live variance, proven by an empty word diff.

Gates: suite 5499/0 · build OK · built 464/0.

## P247 Release E — MLB historical integrity (post-start simulations)
- Window determined from git: 2026-08-22 (lineup-refresh began re-running the sim) → 2026-09-07
  (boundary fix). **186 of 231 games** across all 17 dates carry, as their final committed and
  publicly served revision, a "pregame" simulation generated after first pitch.
- **Grading impact: NONE, verified at the rule** — selectForecastOfRecord takes the newest
  revision strictly BEFORE first pitch from immutable per-run snapshots; hit rates, calibration
  and the results pages derive from grades. Products never consumed these artifacts.
- Correction is APPEND-ONLY: nothing rewritten, nothing reconstructed with post-event
  knowledge. Public register published (public/data/mlb/corrections/post-start-simulations.json,
  186 entries with reason codes, derived idempotently by a committed script); /results/model-audit
  discloses it with the enumeration linked; the presentation layer carries an Archive-integrity
  mandatory row for any surface that renders an affected archived game.
- Boundary regression tests were added with the fix itself (P246/P247); today's pipeline
  verified honoring its own clock (0 post-start entries at the 14:51 ET run).

## P247 — observed production-owned regeneration (charter requirement)
The 20:19Z nfl-event-window run (the workflow, not a local write) republished all 16 boards
under the new champion receipt: **anytime TD (5) + receiving yards (10) PUBLISHED; receptions
withheld (coverOk); rushing withheld (calOk); passing withheld (beatsRolling…)** — publication
followed the receipts with zero board-builder edits, live before first kickoff.

Gates: suite 5499/0 · build OK · built 464/0.

---

# PROGRAM 247 — §13 CLOSEOUT

## Per-game Week-1 matrix (live artifacts, 20:19Z production regeneration)
All 16 games: report link live · winner = nfl-regular-season-public-v1 (Elo-logistic, analytic)
· total.head = matchup-totals-v1-decayed-points (44–52, scores sum exactly) · participation
freshness 18:26Z injuries-fed · **TD PUBLISHED + receiving yards PUBLISHED** on every game
(10–21 modeled players/board) · rushing/receptions/passing WITHHELD on every game with their
exact bars · market state NO_MARKET everywhere (P171 authorization expired — founder-gated;
no priced pick or value language anywhere) · integration status: INTEGRATED (one totals
assumption across team artifact, player chain, and research context).

## Model comparison (all on reused-2025; 2026 forward record decides — see annexes)
| candidate | scope | verdict | key numbers |
| props-gamesim-matchup-totals-v1 | totals input to player chain | ACCEPTED | deltas <0.5%, invariance derived + confirmed |
| pass-starter-conditioning-v1 | starter eligibility + share floor | REJECTED | cov 0.703, ece 0.119, loses to shareVol by 13 yds |
| participation-true-conditioning-v1 | population + γ re-selection | ACCEPTED | γ grid inverted (1.00); recYds PUBLIC ece 0.016; receptions/rush demoted; pass loses to baselines |

## Statuses (separate, as required)
- **Capability**: four sports generating daily on their owned pipelines; NFL week fully
  covered; participation ground truth now a committed corpus.
- **Quality**: honest per the participation-true receipts — 2 player families publication-grade
  (TD, receiving yds), 2 SHADOW with named bars, passing RESEARCH_ONLY and recorded as losing
  to its baselines. NOT "complete": passing/rushing/receptions remain unsupported for
  publication, and that is stated on every surface that would show them.
- **Publication**: boards/reports followed the receipts through a production-owned
  regeneration (observed, 20:19Z); prod serving the flip.
- **Pricing**: none current for NFL (expired authorization; founder decision; prepared ask =
  bulk h2h+props scope quote, NOT renewed here).
- **Certification**: suite 5499/0 · built 464/0 · e2e 524/0/18 (3 engines × 6 viewports);
  a11y structural 0; REAL_DEVICE_CHECK_PENDING stands (no hardware this session).

## NOT claimed complete (charter §13 explicitly)
Passing/receiving/rushing full support (2 of 5 volume families publish); Release D week
URLs/prev-next navigation (single-week capture makes it near-vacuous today — carried); §G full
page-by-page review and §H per-instance interaction inventory beyond the standing matrix
(carried); MLB team-markets staleness stamp + researchEligible consumption + batter_total_bases
artifact-layer block (carried, named); EPL provenance-caveat propagation to the published
validation block + dead-code consolidation (carried); UFC graded-picks market-column now
renders but the two governed gaps stand untouched. Founder gates unchanged (odds renewal, BB
step/cycle accounting, legal, analytics provisioning, UFC graduation supersession).

## The honest headline
A new visitor tonight sees: 16 team reports with matchup-specific totals whose scores add up,
a TD board and a receiving-yards board that cleared real bars on the market's own void rules,
three families that say exactly why they are absent, no prices implied anywhere — and a
results/model-audit page that discloses this week's own defects (186 post-start archived
simulations) rather than hiding them. The product is smaller than yesterday's claims and more
true than yesterday's claims.

---

# PROGRAM 248 — trustworthy evaluation, NFL completion, product closure

Baseline 17:11 EDT Sep 8 (25 min after P247 close): no incidents, artifacts fresh, latest code
CI green, first kickoff Sep 9 20:20 ET.

## Release A — evaluation foundation (CLOSED)
- **Population contract v2** is THE owner (participation-truth.mjs): five typed states that
  never collapse (PLAYED_OFFENSE / PLAYED_NO_OFFENSE / DID_NOT_DRESS / AMBIGUOUS_IDENTITY /
  SOURCE_MISSING), snap components retained, team-week coverage so absence is evidence only
  where a sheet exists, v1 docs refuse loudly, matchMethod carried on every classification.
- **Adversarial fixtures** for every charter state (incl. 0/0/0 sheet row, ST-only, nickname,
  collision, traded, postseason wk→round, missing source) + **live correctness invariants**:
  season-stable fallback mapping and one-claimant-per-snap-row, both clean over 2023-25. The
  initial-mismatch audit was itself corrected — all flagged cases were nickname aliases
  (Drew/Andrew, Hollywood/Marquise, Bam/Zonovan, Zeke/Ezekiel); join success ≠ correctness,
  and the instrument has to measure the right failure.
- **Props receipt re-emitted under the contract** (states unchanged; accounting on the receipt:
  8,883 row-scored · 700 played-no-row zeros · 4,168 voids · 69 ambiguous typed — previously
  silent voids · 0 source-missing).
- **TD disposition: NOT independent** — `!row → void` excluded true negatives (mirror of
  absent-as-zero). Preregistered correction with in-train grid re-selection: n 3,570 → 3,965
  (+395 restored negatives), shrink k moved 0.5 → 2, and the family **beats both baselines
  under honest conditioning** (LL 0.5214 vs 0.5243 / 0.5369, ECE 0.039). TD stays published on
  corrected evidence; the 2026-08-13 receipt preserved append-only as superseded. Runtime reads
  shareParams from the receipt, so the corrected k flows on the next natural run.

Gates: suite 5505/0 · build OK · built 464/0.

---

# PROGRAM 248 — §11 CLOSEOUT

## Verdicts (charter-required, separate)
- **EVALUATION_FOUNDATION: ESTABLISHED.** Population contract v2 is the one versioned owner
  (five typed states, adversarial fixtures, live fallback invariants, enumerated residue);
  both evaluators consume it and stamp it; coverage measurement v2.1 (mid-p for counts)
  preregistered before use. Future promotions reference the contract version.
- **PLAYER_FAMILY anytime TD: PUBLISHED (corrected evidence).** Not independent of the defect
  class — its !row→void excluded settled negatives. Corrected receipt: +395 negatives,
  in-train re-selection (k 0.5→2), beats both baselines (0.5214 < 0.5243/0.5369, ECE 0.039);
  2026-08-13 receipt superseded append-only.
- **PLAYER_FAMILY receiving yards: PUBLISHED** (P247 receipt, unchanged: ece 0.016).
- **PLAYER_FAMILY receptions: PUBLISHED** under contract v2.1 (mid-p 0.7571 — the inclusive
  breach was a discreteness artifact: 25.4% endpoint ties on median-width-4.1 intervals; every
  other bar already held). Live via the 21:34Z production regeneration.
- **PLAYER_FAMILY passing yards: WITHHELD — completed experiment, incomplete family.**
  pass-yds-baseline-v1 (preregistered) beat the champion chain by 10 yds MAE on identical
  points and produced the first in-band coverage (0.809) but failed calibration (ece 0.113 >
  0.05). Named dependency: share-continuous predictive spread. No engine clears calibration.
- **PLAYER_FAMILY rushing yards: WITHHELD.** Structured diagnosis recorded: workhorse backs
  (≥12 carries) cov 0.645 with +27.4-yd low centers (share dilution); low-opp in band. Named
  candidate (train-fit share-conditional center), not run.
- **TEAM_FORECASTS: PUBLISHED.** Coupling PROVEN empirically (gamesim-coupling.test): ±8-pt
  total swing moves player volumes <2% (parameter handoff, margin-driven volumes, no pace
  model — and no public copy claims otherwise); margin coupling live.
- **PRICED_PICKS: NONE** (P171 expired; founder-gated; nothing implies prices).
- **WEEKLY_UX: SHIPPED.** /nfl/week/[key] shareable routes from the weekly-boards register
  (dynamicParams=false, prev/next only when the neighbor exists, honest single-week note),
  hub Week permalink, route owned in the inventory table (regenerated, 63 routes, 0 findings).
- **HISTORICAL_INTEGRITY (MLB): CLOSED for this window.** Consumer matrix: grading verified
  empirically (60/60 graded rows pre-pitch) AND at the rule; predictions artifacts named as
  equally affected (same rerun, same 186 game set); boards/parlays/products not affected
  (different artifact lineage; predictions never settle into money). Register extended with
  alsoAffects/notAffected; served-vs-viewed distinction stands (no viewership logs — claim is
  "served", never "seen").
- **PRODUCTS/RESULTS: unchanged this program** (P247 states stand; residuals below).
- **OTHER_SPORTS: unchanged this program** (EPL four-field fix verified live in P247/248
  baseline; UFC/EPL residuals carried).
- **CERTIFICATION: suite 5507/0 · build OK · built 464/0** on the final merged tree; browser
  matrix and physical-device checklist carried from P247 (524/0/18; REAL_DEVICE_CHECK_PENDING).

## Week-1 coverage at close (production artifacts, 21:34Z regeneration)
16/16 games: team report + matchup totals + **TD, receptions AND receiving-yards boards
PUBLISHED**; rushing/passing withheld naming their bars; three weekly top boards live
(TD top-5, receptions top-10, receiving top-10); shareable week route /nfl/week/2-01/.

## Named residuals (exact owners)
Pass share-continuous spread candidate (Modeling; prereg required) · rush share-conditional
center candidate (Modeling; prereg required) · passing-TD family (blocked on the five core
families rule — now 3/5 resolved + 2 blocked-with-candidates) · MLB team-market staleness
stamp + researchEligible consumption + batter_total_bases artifact layer (Engineering) · EPL
provenance propagation + dead-code consolidation (Engineering) · UFC governed gaps (founder) ·
week-table/hub component consolidation (Product) · per-instance interaction register + physical
devices (QA) · founder gates unchanged (odds renewal, BB accounting, legal, analytics).

---

# PROGRAM 249 — joint simulation, player research and projected scorecards

Baseline 18:23 EDT Sep 8 (30 min after P248): clean tree, green CI, no incidents.

## §12 verdicts
- **EVALUATION_FOUNDATION: HELD.** Dual coverage conventions now on every receipt (mid-p gate
  + inclusive shown-range fraction — receptions 0.7571 / 0.8845); public labels verified
  quantile-semantic ("10th/90th percentile", no 80%-band claim). The output contract matrix
  (nfl-output-contract-matrix.json) maps every family's inputs/conditioning/evaluation/label/
  settlement and named the four joint-engine gaps this program then addressed.
- **JOINT_GAME_ENGINE: COHERENT_BUT_NOT_PROMOTED.** nfl-joint-sim-v1 built as an accurately-
  named opportunity-based joint generator (never a drive simulator): per-draw QB gross passing
  ≡ team receiving; passing TDs ≡ receiving TDs (never QB scoring); TDs ~ trunc-Poisson of the
  committed bridge λ(drawn score) ≤ floor(score/6); score decomposes with a non-negative
  kicks/defense bucket; explicit unallocated masses; P(2+) from count draws. Invariants +
  correlation-as-output proven on 6000 draws — including a self-caught test bug (own/opp score
  correlation is variance-implied NEGATIVE here; the first assertion forced "positive").
  Real-game probe (NE@SEA) coherent against the published team heads. **Preregistered
  identical-points evaluation: receiving yards NON-INFERIOR (mae better); receptions fails ece
  by 0.012; gross passing loses to rolling4; passing TDs (first evaluation) lose to the train
  base rate 0.80 vs 0.59; joint anytime-TD degrades the calibrated engine 0.61 vs 0.5214.**
  No family flips engines; the joint engine stays private research; published forecasts keep
  the truthful label "independently calibrated marginal heads over one shared game
  environment". Identical-points discipline caught two population bugs (legacy conditioning;
  emission-set drift) before they could flatter the candidate. The rolled-back-batch class
  struck once (a failed multi-edit assert reverted five edits silently; recovered by
  re-verifying each anchor).
- **TEAM_FORECASTS: PUBLISHED, unchanged.**
- **PLAYER_FAMILY receptions/receiving/TD: PUBLISHED, unchanged** (P248 evidence; the joint
  candidate did not displace them). **passing/rushing: WITHHELD, unchanged** — the joint
  mechanism confirmed passing's center problem (rolling4 still wins) and localized the TD-
  quality gap (the calibrated engine's grid-selected shrink does real work raw shares discard).
  Next candidates unchanged and named.
- **PROJECTED_SCORECARD: vertical slice SHIPPED.** The game report gains the §8 receiving
  table (one row per player: receptions + receiving yards + TD chance, yards display-rounded)
  and a scoring outlook (top candidates with availability states, "scoring — never throwing"
  semantics), all server-rendered from the canonical per-game artifact with the honest
  "expected statistical summaries, not one simulated game" label. Passing/rushing columns
  absent BECAUSE unsupported, stated. A zero-fill guard catch was fixed by removing a dead
  `?? 0` (absence stays typed).
- **WEEKLY_BOARDS: unchanged** (canonical owner; week routes live).
- **PRICED_SELECTIONS: NONE** (founder-gated authorization; unchanged).
- **CERTIFICATION: suite 5512/0 · build OK · built 464/0** on the final tree; browser matrix
  and physical-device status carried (P247: 524/0/18; REAL_DEVICE_CHECK_PENDING).

## Deep-research disposition (charter §4, honestly scoped)
No broad player-by-player web research was run: the canonical datasets already carry the
consequential inputs (walk-forward roles/rates, live injuries feed → participation states,
snap-count ground truth), and the charter's own rule prefers canonical sources over
duplicative searches. The structured inputs the product actually consumes are enumerated in
the contract matrix with used/available-unvalidated/unavailable status. OL/defensive
personnel, weather and market factors remain UNAVAILABLE-to-the-model and are not narrated
anywhere as if consumed.

## Named residuals (owners unchanged)
Joint TD mechanism inheriting the calibrated engine (Modeling; prereg) · pass center /
share-continuous spread (Modeling; prereg) · rush share-conditional center (Modeling; prereg)
· targets family evaluation before any targets column (Modeling) · founder gates (odds, BB
accounting, legal, analytics) · physical devices (QA).

# PROGRAM 250 — coherent public product, evaluated NFL completion, verified journeys

Baseline 19:40 EDT Sep 8: tip 2da735a7c + 3 bot commits (FF'd). Every Phase-1 audit finding was
live-reproduced before its fix (Chelsea λ 0.05 re-derived from the corpus; 22-row EPL hub counted
from the built HTML; the self-denying MLB report traced to its seven hardcoded strings).

## §Verdicts
- **A01 PRODUCT_STATE: RESOLVED (rendering; founder gate unchanged and named).** /moonshot header
  badge and note derive from ONE surface (today's portfolio when it has published cards); the
  3-step ladder renders as a labelled POLICY PREVIEW — independent longshot cards are never
  presented as a live progression while the multi-lane stake-accounting decision is open; the lane
  tracker receives the lifecycle ledger's graded outcomes (pending-vs-lost on one page ends);
  reconciliation tiles name their eras. /mr-dub and /launch use the SAME loaders as /moonshot
  (history union + today's count) — the loader split had two surfaces printing different open-card
  counts from one owner. deriveBankBuilderState gained its first production consumer
  (/bank-builder renders named exposures + typed divergences). Results Trust Center dates the
  protected July-7 money record instead of presenting it as current, shows today's paper cards in
  their own tile, and takes the Moonshot record from the state owner's displayRecord. Home derives
  "no active card". Legs carry their sport (⚾/First pitch, never ⚽/Kickoff on MLB).
  OPEN FOUNDER DECISION (exact): which counter governs Bank Builder progression (generator step vs
  lifecycle-store rule-derived position) and the multi-lane stake/exposure policy; until then no
  surface claims an active progression.
- **A02 EPL_SPARSE: evaluated, REJECTED, governed labeling.** preregistration-sparse-split-v1
  committed BEFORE scoring (shrink k∈{1,2,4,8}, the values the v2 bake-off already swept; 2025-26
  disclosed as first-use for this family). Verdict REJECTED — S1 failed (dev sparse n=31 worsened
  0.0098) even though holdout sparse improved 1.63→1.27, overall holdout improved and the
  degenerate λ left the floor. Bars stand; shrinkK stays 0. Per the prereg's onFailure:
  sparseSplitFlags labels every row whose fit divided by a 1-4 match split (Chelsea–Hull +
  Coventry–Brighton), the match page renders the condition beside unedited numbers, and
  sparse-labeling.test.mjs proves the published probabilities equal the recorded model's.
- **A03 MLB_REPORT: RESOLVED.** One capability fact — the Overview tab's own gate — drives every
  full-game claim in Players & Props, the result summary and Game Center; lineup provenance reads
  the artifact's own lineup sources; the near-level note reports the actual mean gap instead of
  claiming no team signal; seven tests that pinned the obsolete prose now pin the capability
  contract; market-coverage's full_game_sim row states the real independent Monte Carlo
  (experimental, never product-eligible).
- **A04/A12 NFL_DISCOVERY: RESOLVED.** product-day's nflDay reads the regular-season lane first
  (the retired preseason game-simulations lane survives only as the archive fallback, P202/P224
  guards intact); Home holds ZERO raw sport reads; Top Reads' NFL gate DERIVES from
  model-differentiation.json — 16 game-winner reads admitted with their own provenance sentence,
  auto re-exclusion quoting the audit if signal ever degrades; capability registry, methodology
  panel and the NFL coverage rows updated to the current family truth (receptions/receiving/TD
  public experimental; passing & rushing withheld BY NAME).
- **A05 EPL_IDENTITY: RESOLVED.** eplUpcoming preserves the capture's canonical eventId +
  matchweek (it had been dropping the joinable key and rebuilding a provider-namespace id);
  eplHub joins on fixture identity, scoped to ONE official matchweek — 10 rows · 10 reports ·
  Matchweek 4 live, two MW5 fixtures deferred to #schedule and counted in a typed
  identityReconciliation. The uniqueness test that passed VACUOUSLY on string ids now keys on
  club-pair + kickoff minute. /epl, /epl/match, /preview/epl each lost their second <main> (A13).
- **A07 RESULTS_PENDING: RESOLVED.** All nine aged pending cards settled from official sources by
  their real mechanisms: scratch→VOID against a FINAL box (unknown market still pends — a grading
  gap never fabricates a refund; voids reduce the card like pushes), and a complete-pending-days
  sweep (30-day window, completion-only, idempotent, carried outcomes never regress, recorded
  population stands) now runs in nightly-settle after ET-yesterday. Lab record 15-46 · 0 pending;
  ledger rebuilt from receipts; explorer-scope.test.mjs holds a live no-aged-pending invariant.
- **A08 SCOPE: RESOLVED.** /simulate's sport filter governs the whole page — the MLB explorer and
  coverage matrix are threaded through the chooser; an empty NFL day names the next kickoff.
- **A11 FILTERS: RESOLVED.** The sport×tier grid obeys the selected sport (same rule as the table
  above it); a pooled figure ≥90% one sport names its mix beside the number; the date-filter
  refusal links the dated surfaces that exist (MLB model-audit; complete dated NFL/EPL/UFC lists).
- **A15 NFL_SCORECARD: RESOLVED.** The combined receiving view is the ONE board's first tab —
  shared team/player/listed-out filters, availability on every row, no 14-cap (current games reach
  13), "—" never a ??0 zero, one precision policy (yards whole, counts 1dp) shared with the weekly
  boards; scoring outlook declares "top N of M · full list in the TD tab"; the dead preseason
  player-simulations section (keyed on a field the retired artifact never carried) removed;
  player-family provenance renders from the artifact's own basis lines.
- **A16 RECEIPT: RESOLVED.** joint-sim-evaluation.json self-describes exactly (artifact + engine =
  the joint challenger, champion named as baseline) with metadataCorrections lineage; the missing
  preregistered passing-TD calibration bins are typed as a diagnosticGap (evidence INCOMPLETE);
  the receptions ECE narrative distinguishes 0.0059-vs-bar from 0.0121-vs-champion (correcting
  P249 §12's "by 0.012" in this log); 2025 reuse + proxy-line disclosures beside the numbers;
  receiving yards typed ELIGIBLE_NOT_ADOPTED. The generator writes the exact identity itself.
- **A06 / charter §4B JOINT MODEL: unchanged champion, documented.** P249's rejection stands. The
  named next candidates (joint TD inheriting the calibrated engine's grid-selected shrink; pass
  center vs rolling-4; rush share-conditional center) each require a fresh preregistration and a
  bounded budget; none was run in P250 — the charter's stated priority (finish customer-visible
  coherence, not another engine pass on a reused holdout) consumed the program. Public forecasts
  remain the independently calibrated marginal heads, correctly labelled.
- **A09 / A10 / A13(rest) / A14: PARTIAL.** A09 (builder-pool period validation) untouched —
  owner: Parlay Center. A10 largely subsumed by the fixes above; no hub restructure attempted.
  A13: EPL landmarks + sport icons fixed; full asset/keyboard certification not rerun. A14: gate
  (typecheck + 5,52x suite + build + 74 rendered guard files) run fresh on the final tree;
  playwright e2e per closeout; browser matrix and physical devices remain carried/pending.
- **Register/record:** P248 R-C + P249 R-A appended (conservation guard had flagged the gap);
  operating record regenerated + PDF verified (188 rows, sha 5135a9cd…).
- **Rendered-guard catch of this program's own copy:** the new NFL provenance sentence used
  "beat the sportsbook" inside a denial; the built-HTML guard refused it and the wording moved to
  the compliant "out-predict" form — the guard working exactly as designed.

## P250-W1 — NFL Week 1 public readiness (Sep 8/9, commit fb1dd62bf, CI 34307519384 green, prod verified)

End-to-end status before the first regular-season kickoff: all 16 Week-1 forecasts fresh
(23:12Z event-window run), weekly boards + player boards + rosters + differentiation on the same
stamp, event-window (11:00/17:00 ET + 10:30 ET settle pass), sport-schedules and nightly-settle
all green on cadence, and the stale Aug-29 price capture correctly refused as NO_MARKET on every
game — no stale price can leak. A concurrent Codex session's in-flight files (evaluator v3
support, its status doc) were left untouched and carried through the push via stash; its v3
engine is research-only and feeds no public surface.

Blockers fixed (each guard-pinned in week1-public-readiness.test.mjs):
- **Week boundaries:** nflDay required a FUTURE next-forecast, so the morning after any kickoff
  it resurrected the retired preseason "last simulated slate (2026-08-29)" note mid-season. The
  regular-season lane now owns the answer whenever its forecasts exist (game days LIVE with
  today's count; quiet days speak in the week's own words; the preseason archive speaks only in
  a true offseason — regression fixture added). Top Reads ranks UPCOMING events only, so a
  started game's frozen pregame read never poses as a current read.
- **Price-authorization honesty:** End Zone Vault no longer claims "the sportsbooks are not
  offering" TD markets (unobservable; the truth is OUR capture holds no authorized market) and
  names the regular-season model, not "preseason". /cards/nfl renders the ledger's own derived
  blocker (capture age, priced-game count) with a pointer to the hub's forecasts. /markets
  states its price-scoped population and links the model-only sports' hubs, derived from the
  product-day owner — an unavailable price authorization is never presented as an absent
  prediction.
- **One week table (audit item E):** the hub's generic 16-row list collapsed behind the
  canonical weekly table (counts line + quick list one click away, the settled-window shape).

UI/UX investigation (built export driven in-browser, then production): board tabs/filters/
search/empty-state, availability on every row, "—" never zero, scoring-outlook cap labelled,
?sport=nfl scoping, mobile 375px zero document overflow with in-container table scroll, one main
landmark and one h1 per page, quick-list expand to 16 rows. Production checks 12/12 after
extraction-artifact recheck; prod serves fb1dd62b exactly.

Remaining Week-1 truths, stated not hidden: no priced NFL anything (founder-gated authorization);
passing/rushing withheld by evaluation; the site's state between deploys freezes at build
cadence (event-window passes at 11:00/17:00 ET are the pre-kickoff refresh path).

## P250-GD — game day: the Projected Scorecard (Sep 9, commits 5c8d40a51 + 157635b31, prod verified)

The founder's game-day ask — every simulation reading like a completed game scorecard with all
props — shipped to the boundary the evaluation gates allow, and no further. Each of the 16 game
pages opens its player section with ONE box-score-shaped unit: score line, win chance, total,
margin; per-team Likely TD Scorers (availability marked) and Receiving Leaders (rec · yds); and
the families that carry no number stated INSIDE the same frame with the exact bar each failed,
verbatim from the artifact. Labelled "expected statistical summaries · not one simulated game".
A guard pins that the section reads no new data and can never render a withheld family's number:
passing/rushing/interception figures join the scorecard the day their models clear preregistered
bars — never sooner, because a failed model's number would cheapen every earned one.

Also fixed: /today's live-now chips name their time base beside a past slate's counts (bot pushes
redeploy Vercel, so a morning rebuild had put an "NFL" live-now chip beside Tuesday's MLB counts);
raw family keys get reader-facing fallbacks in both withheld disclosures. Checker lesson
(vacuous-guard class, inverted): tag-stripping without removing <script> CONTENT counts RSC
payload as rendered text — the "defect" it kept reporting was data, not UI.

Ops at push time: event-window 11:00/17:00 ET passes ahead of the 8:20 PM ET kickoff; nightly
settles green; all 16 forecasts frozen-pre-kickoff with NO_MARKET honesty intact.

## P250-GD2 — the estimate tier: passing & rushing display end to end (Sep 9, b225f131b, CI green, prod verified)

OWNER DISPLAY DECISION, implemented without touching the evaluation record: the founder directed
that passing and rushing yards display. The engine had always computed those per-player
distributions; publication was the filter. A third family tier now exists — ESTIMATE: a computed
family whose model failed a promotion bar publishes its real numbers WITH the failed bar(s) and a
plain-English caveat carried ON the family artifact (passing: a rolling recent-form baseline beat
it on held-out data; rushing: uncertainty calibration failed its bar). Truly-uncomputed families
(interceptions, ordered TD) remain typed absences; per-player passing TDs are not computed by the
champion engine and cannot display.

End to end and live: per-game boards (ESTIMATE state + distributions + caveat), the Projected
Scorecard's per-team "Passing · estimate" / "Rushing leaders · estimate" lines with an in-frame
legend, "· estimate" board tabs with an amber caveat box, and weekly Top 10 Rushing (Jonathan
Taylor) + Passing (Drake Maye) under "unvalidated estimate" badges on the hub and week routes.

UNCHANGED, deliberately: product eligibility (an ESTIMATE can never become a card leg), the
graded record's population, pricing state NOT_AUTHORIZED on every row, and INACTIVE players still
carry no volume numbers. Guards rebased to pin the estimate contract: reason + caveat REQUIRED on
the artifact, rendering only via family state, marker always worn. The scorecard is now the full
completed-game shape: score line, win chance, total, TD scorers, passing, rushing, receiving.

## P250-GD3 — game-day evidence freshness + roster movers (Sep 9, 374ebb295, CI green, prod 10/10)

Two founder reports on game day, both real, both systemic rather than one-off.

**"Henderson out."** Confirmed against the authorized source: ESPN upgraded him to Out at
2026-09-08T21:05Z; our injuries capture was taken 16:54Z — four hours EARLIER — and nothing
refreshed it on game day, so the site published a rushing line for a player ruled out. Two root
causes: (a) the injuries feed was captured only by sport-schedules on its own cadence, so this
chain inherited a snapshot; at 22.6h it sat inside the 24h bound and every surface reported FRESH
while carrying a two-day-old designation — the window now captures injuries ITSELF, before event
assembly and before role evidence, because a pre-kickoff pass must refresh what it conditions on;
(b) a VOCABULARY MISMATCH hid the scale — role evidence says OUT, the board's withholding rule
checks INACTIVE, and a props row only ever met its designation if the anytime-TD board happened to
rank it. Henderson was caught by that accident; **twelve other out-designated players across the
slate were not** and carried volume projections. Every row now joins the role-evidence designation
directly, translated once at the builder.

**"Doesn't mention AJ Brown at all."** A real hole in the pool, not a display bug: a player who
changes clubs after his last corpus game is absent from BOTH share pools — off the old club's
list, and started at zero evidence on the new one by the evaluated stint rule. A.J. Brown (16
games, 64.3 receiving yards per game at PHI in our own corpus) appeared NOWHERE on New England's
page. The stint rule is RIGHT about what is unknown; rendering that as silence was the defect.
new-arrivals.mjs publishes each notable mover's own prior-club per-game usage as stated FACT,
explicitly outside the simulated numbers, on the scorecard and in a board strip — no decay model,
no invented share, no renormalization, and the row retires itself once real usage is observed.

Also corrected: model-status still said "Passing yards: not published" after GD2 made them
display; the index and its dependent artifacts must be re-derived on ONE stamp (a consistency
guard caught the mismatch mid-gate).

Guards (gameday-evidence.test.mjs): the window captures injuries before the steps that read them ·
NO out-designated player may carry a volume projection on any board (live invariant) · role
evidence may never predate its injuries capture · an arrival needs a real prior sample and must
carry the not-in-these-numbers frame · no arrival field may read as a projection.

⚠ LESSON: a freshness BOUND is not freshness. A 24h window over a designation that changes hourly
on game day reported FRESH for a snapshot four hours behind the source. Bound the staleness to the
decision, not to the feed's convenience.
