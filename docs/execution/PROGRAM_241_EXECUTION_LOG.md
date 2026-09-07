# Program 241 · execution log

Charter: live-audit resolution (A01–A24), four-sport UX coherence, friends-beta readiness.
Continues in the P240 session (same context; P240 evidence carried, re-verified where charter
requires).

## Phase 0 (2026-09-07 11:10 ET / 15:10 UTC)

- Clock 15:10Z · local = origin = `96473c63b` (bot: UFC post-card grading) on top of P240 tip
  `5a858d91b`. Working tree clean but for preserved untracked (vp/, HANDOFF). CI green through
  `aeaca6e9e`; prod verified serving P240 tree earlier today (re-verify after next deploy).
- Daily pipeline state at 15:10Z: morning-projections (13:30Z cron) not yet fired (drift) →
  mlb-daily-production and daily-products pending → Sep-7 board/cards legitimately unpublished.
  The audit's "September 7 unpublished" observations were taken in exactly this window. The
  daily-products workflow_run watcher (P240 acceptance) remains armed.
- A04 hypothesis (NFL "conflicts with P240's 16 forecasts"): P240 never claimed Week-1 FORECASTS
  exist — they generate inside each game's event window (first pass Sep-9 14:30Z). The audit saw
  the correct pre-generation state (schedule yes, forecasts 0) plus the hub's archive-first
  section order. To verify rendered: prod /nfl shows all 16 Week-1 rows ("The rest of Week 1",
  verified in P240 on the deployed export). Resolution = ordering/labeling, not a data-owner
  disagreement — will re-verify rendered before closing.
- P240 evidence classes for the charter's §3 note: Sep-6 card repair = REPAIRED evidence;
  run-34128380515's no-op replay = replay evidence; the NEXT natural generation+settlement cycle
  (Sep-7 cards, tonight) = the fresh full-lifecycle observation, pending. Sep-4/5 receipts are
  pre-P240 format (zero-leg placeholder era) — catch-up holds them honestly; evidence recovery
  optional, low value (no legs existed).

## A-register (updated as work lands; dispositions: OPEN / IN-RELEASE / FIXED / VERIFIED-CLOSED / RECHECKED-STALE / NAMED-GATED)

| ID | Class | Fix (commit) | Disposition |
|---|---|---|---|
| A01 | today-scoping (home strongest reads) | top-reads eventEtDate/timeframe + panel chips (R1 `f3ac5ddbb`) | FIXED |
| A02 | today-scoping (home featured sims) | archive framing wired from allCurrent (R1) | FIXED |
| A03 | stale capability copy (home tiles) | blurbs derive from owners; NFL board claim removed; UFC 11-of-13 (R1) | FIXED |
| A04 | NFL hub order + "conflict" | data half resolved-by-design (forecasts generate Sep 9, verified rendered); settled-window table collapses to disclosure (R2/R7 `afed5d657`) | FIXED |
| A05 | EPL priced-state reconciliation | hero states forecast-window + priced-ladder facts separately (R1); forecast rows return ~Sep 8 by design | FIXED |
| A06 | today-scoping (EPL player reads) | kickoff filter at topScorersAcross (R1) | FIXED |
| A07 | EPL validation scope labeling | per-head banners with model id (R2/R7) | FIXED |
| A08 | UFC bout-row actions | per-bout anchors + adapter READY links (R2/R7) | FIXED |
| A09 | UFC tense/event-state | NOT_YET_FOUGHT coverage state (R1) | FIXED |
| A10 | simulate no-games vs unpublished | fallback covers today pre-publication (R1) | FIXED |
| A11 | MLB hub child copy inherits period | period threaded into all children (R1) | FIXED |
| A12 | /today one-population-per-section | simulationsToday counts, past-slate brief, dated Top-10 rows (R1) | FIXED |
| A13 | risk taxonomy drift | canonical PARLAY_ODDS_BANDS everywhere; legs descriptive (R5/R6 `75aba2cc5`) | FIXED |
| A14 | parlay center archive vs current | date-derived chip + empty-by-default stake (R5/R6 + R2/R7) | FIXED |
| A15 | card-page records vs results streams | lab-ledger record renders on card pages + per-tier (R5/R6) | FIXED |
| A16 | settled vs decisive denominators | labCounts decisive/pending split (R5/R6) | FIXED |
| A17 | results explorer placement | explorer leads /results (R2/R7) | FIXED |
| A18 | bank-builder state machine copy | INPUTS_STALE renders waiting, not no-play (R5/R6) | FIXED |
| A19 | moonshot reconciliation | P240 dual-lane settle + lifecycle history union (R1) | FIXED |
| A20 | stale capability (sports/mr-dub) | hub-aware coverage words; Goal Rush basis truthful (R1) | FIXED |
| A21 | system-status scope | pipeline-scope sentence added (R2/R7) | FIXED |
| A22 | navigation consolidation | rail 24→19 (deep links to context); FULL IA re-cut named for its own release | PARTIAL |
| A23 | UFC narrative pronouns/claims | generator templates neutral+evidence-specific (R5/R6); artifact lands on Tuesday's natural fight-week run | FIXED (artifact pending regen) |
| A24 | about/learn stale content | four-sport copy; watchlist archived-labelled (R2/R7) | FIXED |

## Release plan

R1 truth/freshness (A01 A02 A06 A09 A10 A11 A12 + A05's header half) →
R2 IA: nav + homepage + hub order (A22 A04 A17-placement) →
R3 publication/reachability (A04-data A05-data A08) →
R4 player polish →
R5 products (A13 A14 A18 A19) →
R6 results (A15 A16 A17) →
R7 copy/support/beta ops (A03 A07 A20 A21 A23 A24) + final QA matrix.
Each release: gate, commit, verify journey.

## Final report (2026-09-07, ~12:30 ET)

**Verdict: FRIENDS_BETA_READY** — every §12 condition has live evidence; three follow-ups are
named and dated below, none of them a friends-journey P0/P1.

### 1 · What a friend can use now — five tested production URLs (all verified rendered post-deploy)
- https://gametimepicks.yashwantbalaji.com/ — honest launchpad; "next reads — upcoming" with real
  event dates; archive-framed simulations
- https://gametimepicks.yashwantbalaji.com/simulate/d/2026-09-07/ — today's real 11-game slate
  pre-publication (was a false "No MLB games")
- https://gametimepicks.yashwantbalaji.com/nfl/ — Week 1 leads; the August table is a one-click
  archive disclosure
- https://gametimepicks.yashwantbalaji.com/build/ — Review chip wearing its slate date; stake
  truly empty by default
- https://gametimepicks.yashwantbalaji.com/results/ — the filterable explorer leads; the
  protected 19-14 record keeps its own named section

### 2 · Before/after
Homepage: "strongest reads today" listing Sep-12 UFC + Sep-6 EPL → dated upcoming reads under an
honest title; August NFL sims badged "Simulation Ready · Generate" → "From the simulation
archive · View archived report", dates on every card. Hubs: /nfl 22-row August table first →
current week first; /mlb "today's board/today's availability/refreshes hourly" on a closed slate
→ period-derived copy throughout; /epl "no priced fixtures" over priced cards → both facts from
their own owners, scorer ranking scoped to current fixtures, validation banners scoped per head;
/ufc future card "was fought" → NOT_YET_FOUGHT; dead "card-level report" cells → per-bout anchors.

### 3 · A01–A24 disposition — see the register above. 23 FIXED (A23's artifact regenerates on
Tuesday's natural fight-week run), 1 PARTIAL (A22: rail 24→19; the full IA re-cut is its own
release). Every fix carries a guard updated by that guard's own logic; four rot-class pins
(hardcoded aggregates/dates) were rebased onto their artifacts.

### 4 · Four-sport table (at report time, 2026-09-07 ~16:30Z)
| Sport | Period | Scheduled | Forecasts | Prices | Player markets | Products | Results |
|---|---|---|---|---|---|---|---|
| MLB | day (Sep 7) | 11 (free StatsAPI, rendered) | generate on the day-of chain (late today; site honest) | day-of authorized | props day-of; all modeled markets market-context by receipt | BB/Moonshot lanes daily | explorer + model audit (41,228 rows) |
| NFL | Week 1 (16 games, verified) | 16 rendered | generate inside Sep-9 event window under the evaluated RS identity | founder-gated (draft receipt ready) | rejected/held — refused typed | cards lane closed by machinery | graded-picks 45 rows |
| EPL | MW4 Sep 12–13 (9 in window) | 9 rendered | window opens ~Sep 8 (96h) | captured Sep-6, next matchday cards priced (7) | validated scorer head (renders in window) | risk-ladder published | lab 2–4 + graded 24 |
| UFC | Noche Sep 12 (13 bouts) | 13 rendered | 11/13 modeled; 2 disclosed | NOT_YET → Tue 11:00Z cron (auth 480/500) | n/a | ladder awaiting prices | lab 0–2 + graded 16 |

### 5 · Natural vs repaired evidence (kept apart)
NATURAL: moonshot lane-B settlement + cumulative positions (run 34112073923); the repaired settle
chain end-to-end (run 34128380515: fetch-before-grade, decisive-receipt no-op, honest catch-up
holds, consistent index pair); 497-pass three-engine browser matrix. REPAIRED: Sep-6 daily-card
receipt (re-graded through the same settler from pre-roll evidence, provenance note in the
receipt). PENDING NATURAL: today's producer chain (late but in drift envelope — watcher armed);
the daily-products workflow_run first firing; Sep-9's first regular-season NFL generation;
Tuesday's UFC regeneration carrying the neutral narratives.

### 6 · Remaining, named
- A22 full IA consolidation + hub-body vocabulary unification (own release).
- Founder gates (unchanged): AUTHORIZE:NFL (priced draft ready) · CONSOLE_REDEPLOY:RUN ·
  multi-lane exposure accounting build/pause/retire.
- Forward evaluation: first 492/2,000 rows; eligibility ≈ Sep 10 — do not run before.

### 7 · Deployment & hygiene
P241 commits: `f3ac5ddbb` (R1) · `75aba2cc5` (R5/R6) · `afed5d657` (R2/R7) · `d5fdba87c`
(e2e+register). Prod verified serving `afed5d65` (all UI work; d5fd is docs/spec-only and deploys
behind it). Local gate green 4×; CI green through `aeaca6e9e`+`f3ac…` chain (cumulative run on
`d5fdba87c` in progress at report time — watcher armed). Browser coverage: Chromium + Firefox +
WebKit incl. a11y contrast probes at mobile/tablet/desktop. Zero provider credits spent. Protected
money untouched. No orphan processes beyond armed watchers (CI + producer), which self-terminate.
