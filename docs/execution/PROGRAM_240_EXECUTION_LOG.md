# Program 240 · execution log

Charter: Fable 5 cold start · NFL Week 1 end-to-end + four-sport readiness (Sep 7–13 window,
extended to full official NFL Week 1) + navigation/scene/results consistency.

## Baseline (2026-09-06 22:10 ET / 2026-09-07 02:10 UTC)

- Ancestry: P239 tip `d344129ee` → **+11 bot commits** (all `[skip ci]` auto) → `8c640e790`
  = local = origin = **production** (Vercel built 2026-09-07T01:17Z, verify:deployment OK).
  No reset; bot work preserved by fast-forward.
- Protected money: `app/public/data/mr-dub/portfolio.json` = `affe6b21071f2b3be96bb2774eb347c3`,
  `bank-builder-locks.json` = `cb80473f88f3cb5f67208fa568925295` — **both match** reported values.
- Stashes: 2, untouched. Untracked `vp/` files: present, untouched, never committed.
- Four Sep-6 daily cards (`bank-builder-lane-a/b-step-1`, `moonshot-lane-a/b-2026-09-06`)
  all `status: active`, `settlement.status: pending`. $250 paper exposure isolated as reported.
- **Pending acceptance 1**: first production settlement of generated cards —
  `nightly-settle` 05:30 UTC (~3h away at baseline). Will observe in-session.
- **Pending acceptance 2**: `daily-products` `workflow_run` trigger. Verified it has NEVER
  fired naturally — and could not have: the trigger reached the default branch at 21:31Z
  (`4bb8bae06` push), AFTER today's producer completed (~17:04Z). First natural exercise is
  the next `mlb-daily-production` completion (~14:15+ UTC Sep 7). Not broken; not yet observable.
- The 16:26Z `workflow_run` run is the OLDER morning-projections → mlb-daily-production chain,
  not this trigger.
- **Live incident (noisy detector, P233 class)**: `epl-matchweek` failed 3 consecutive runs
  (17:11, 17:25, 22:49Z). Odds capture correctly SKIPPED — "no kickoff within 30h (next
  2026-09-12T14:00Z). Nothing bought." — but `assert-run-produced` still unconditionally
  demands `epl/odds/latest.json` < 90 min fresh. Asserting a state the producer legitimately
  never emits during a fixture gap. Will fail every run until ~Sep 11. Fix queued (Release C).
- `mlb-lineup-refresh` 22:10Z failure was transient; 3 consecutive successes after.
- EPL/UFC authorization ledgers exist (`data/internal/research/odds/{epl,ufc}/`); terms to
  re-verify in Release C. NFL P171 expired per P227; newer receipt to check in Release B.
- Zero provider credits spent this session.

## Plan (dependency order, shippable slices)

- **A** Coverage matrix: four sports × (Sep 7–13 + full official NFL Week 1), event-level,
  reusing offered-window owner (`app/src/lib/offered-window/`). Parallel audit now.
- **B** NFL Week 1 end-to-end (schedule→identity→model→forecast→report→hub→settle path).
- **C** MLB/EPL/UFC upcoming coverage + epl-matchweek detector fix.
- **D** Production product cycle: observe tonight's settle, reconcile ledgers/ladders,
  multi-lane cycle accounting.
- **E** Selection registry + cross-sport results history.
- **F** Homepage/navigation consistency pass.
- **G** Sport scenes + recording readiness.
- **H** Forward evaluation eligibility + operational closeout.

## Release A — the coverage matrix (audited 2026-09-07T02:2xZ)

Five parallel audits; full event-level matrices in the session scratchpad (p240/matrix-*.json),
counts and blockers reproduced here. Definitions: scheduled = official source row · offered =
current market rows exist · forecasted = current model artifact · report-accessible = a public
route renders THIS event · priced = current authorized odds attached.

| Sport | Scheduled | Offered | Forecasted | Report-accessible | Priced | Blocked |
|---|---|---|---|---|---|---|
| MLB (9/7–13) | 91 | 0 | 0 | 0 | 0 | 91 (11 day-of pending, 80 missing-source) |
| NFL (Week 1 = 16, verified 3× vs ESPN) | 16 | 0 | 0 | 0 | 0 | 16 (no-current-authorized-quote root) |
| EPL (9/7–13) | 9 (all MW4 Sep 12–13; 9/7–11 = international break, verified) | 8 | 0 (96h window opens ~9/8) | 0 | 8 | 1 (identity-join) |
| UFC | 2 events / 18 bouts | 0 (NOT_YET, Tue cron) | 11/13 Noche bouts | card-level yes / per-bout 0 | 0 | DWCS 5 + 2 corpus-gap (disclosed) |

Key findings driving the releases below:
- **MLB**: population capture only reached tomorrow; simulate date owner read only the PAID
  schedule dir → future days rendered "No MLB games" against real 15-game slates.
- **NFL**: Week 1 membership = 16 games (NE@SEA Wed 9/9 opener; DEN@KC MNF 9/14 is the one
  extension past 9/13). Repo schedule capture matches ESPN 16/16, 0 kickoff drift. Preseason
  artifacts correctly NOT counted. Regular-season model receipts DO exist (train 2023–24, held-out
  2025: 64% winners, 80.15% interval coverage) — the gap is the production path, which would apply
  the preseason card + wording to seasonType-2 events. Six of 16 games hidden on /nfl by a
  slice(0,9) cap. Odds remain founder-gated (no receipt newer than expired P171).
- **EPL**: Brighton quarantined by "&" vs "and" fold drift (2 committed evidence rows) — blocks the
  Sep-13 ladder day (needs ≥2 priced fixtures, has exactly 2, one quarantined).
- **UFC**: healthy. Odds NOT_YET until Tue 9/8 11:00Z cron (auth 480/500 remaining); stale
  registry vintage rows noted.
- **Routes**: /homer-nukes still classified redirect (revived P214 — dropped from sitemap);
  /world-cup-specials is an archive, not a redirect.

## Implemented so far

1. `b94d27c0d` — epl-matchweek noisy detector: fixture-gap skip now writes a dated
   capture-decision.json; assert accepts fresh odds OR fresh skip-decision; 8 child-process tests.
2. MLB window (uncommitted): nightly-settle capture widened today+6; Sep 8–13 populations
   captured; schedule-date owner unions statsapi-schedule/; day-view renders SCHEDULE_ONLY MLB
   rows for future committed days.
3. EPL alias (uncommitted): evidence-backed "brighton and hove albion" → "brighton hove albion"
   (collision-checked vs all 20 season clubs); guard updated from empty-table to exact-set.
4. NFL hub (uncommitted): laterGames cap 9→16; "Later this preseason" title now derived from the
   rows' own season context.
5. Route table (uncommitted): /homer-nukes → public, /world-cup-specials → archive.

## Release B — NFL Week 1 regular-season publication path (implemented)

The finding that reframed this release: the audit's "no regular-season model" was true of the
PUBLIC path only. The private engines were already chronologically evaluated on regular-season
history — nfl-model-v1-elo-analytic (train 2023–24, held-out 2025: log loss 0.6478 vs coin
0.6931, ~64% winners, ECE 0.0446) through nfl-gamesim-v1-joint-normal (sim == analytic ≤ 1e-4,
80% intervals covered 80.15%) — and the status artifact's own REGULAR_SEASON_ELIGIBLE branch had
promised "the evaluated regular-season model applies to this window." What was missing was the
production seam: build-nfl-public-forecasts had no seasonType branch and would have published
Week 1 under the preseason coin-flip card.

Implemented (params frozen from the receipts, no refit, no promotion):
- strength-state: explicit `regressToSeason` — the evaluated protocol's ⅓ boundary regression
  for a target season no final has reached (Week 1: ~20-Elo champion overstatement otherwise).
- build-nfl-public-forecasts: per-event phase branch. Regular events publish under a new public
  identity `nfl-regular-season-public-v1` (card cites the receipts; PUBLIC_EXPERIMENTAL; honest
  limit = the held-out 2025 result + market non-claim), simulated through the evaluated gamesim,
  corpus+current-results merged name-keyed with dedup. Mixed-phase windows refuse (exit 4);
  missing receipts refuse (exit 2); unresolved seasonType refuses per-event. Same immutable
  receipt/lock/revision machinery. `--app-root` seam added for the harness.
- game-sim: additive marginQuantiles/totalQuantiles/homeUnrounded (differentiation audit needs
  full precision; public schema needs the intervals from the SAME distribution).
- Phase-truthful copy across the chain: status builder (live regular detection + role-reason),
  index builder (card follows the published model; new model.phaseLabel), /nfl tagline+lead
  render phaseLabel from the canonical index, nav label, game page, homepage, lobby, coverage
  rows, assessments, content contract.
- Preseason-share lanes GATED for regular events (never manufacture participation): game-sims
  refuse typed; full-game sims exclude non-preseason (preseason climatology engine); Vault's
  scorer shares verified regular-season-based (walk-forward receipts) so it stays live, its
  hardcoded "preseason:" role note made phase-neutral.
- Guards updated per their own logic (never weakened): humility band scoped to the preseason
  identity with a sanity band + identity pin for regular; market-independence scans BOTH input
  hashes (vacuous-on-zero protected); route-inventory pins phase-from-index; per-phase honest
  limits; lane-status blocker pin made conditional on the builder's own phase contract.
- New harness src/lib/sports/nfl/regular-season-forecasts.test.mjs: 7 scenarios driving THE
  builder in child processes against a disposable store with the real receipts + real Week 1
  schedule capture. Sample output at the Sep-9 15:00Z slot: NE @ SEA 19–26, SEA 61.7%;
  SF @ LAR 20–25, LAR 58.1%; totals 45 (28–62). Deterministic re-run: byte-identical receipts.

NFL Week 1 state after this slice: 16/16 games visible on /nfl; forecasts generate on Sep 9
inside the event window (14:30Z/15:00Z/21:00Z crons all admit the opener); per-game report
routes exist once forecasts publish; settlement consumes the same receipt shape (unchanged
settler). Odds remain founder-gated — exact priced request drafted at
docs/receipts/DRAFT_ODDS_AUTHORIZATION_NFL_2026_REGULAR.md (Option A: team markets, 250-credit
ceiling, ceiling-anchored expiry that parses under the committed expiryTerm()).

## Releases C2/D committed · E provenance · F/G verification pass (Sep 7, ~03:00–04:30 ET)

Pushed `7c9f0b1bb`..`cc0a655ba` (5 commits: MLB window, EPL alias, NFL Week 1, dual-lane
settler + Moonshot reconciliation, route table). CI quality-gate running on the cumulative tree.
Note: the run on `b94d27c0d` was CANCELLED by the later push's concurrency group — its coverage
comes from the cumulative run, not its own.

**Release D residual finding, fixed**: the moonshot store carries lanes[] (A and B) beside a
legacy top-level ladder duplicating lane A. The settler read only the legacy ladder — lane B's
card (`moonshot-2026-08-17-mlb-b`) was NEVER settled and /moonshot showed a settled Lost row
beside "1 card awaiting official results" for one product. Dry-run against the real store with
the dual-shape fix: lane B grades LOST from official box scores (Bregman 3 ✓, Lowe 2 ✓,
Marsee 0 ✗), restarts at cycle 2; all three prior settlements HOLD under unchanged identities.
Tonight's scheduled run applies it. Also fixed: positions are now as cumulative as the settled
index (a later partial run would have erased other lanes' positions from latest.json).
The exact blocked operation for ladder-resume generation is already named on /moonshot: multi-lane
exposure accounting in the Mr. Dub paper ledger (models a single active card). Repair-and-resume
stands; the accounting build is the remaining engineering, not re-decided here.

**Release E**: provenance now self-describing — `probabilitySource: "market-devigged"` travels on
MLB team legs and portfolio lanes (the field name `modelConfidence` overstated the market case;
surfaces were already honest: "market favourites" vs "model's own read"). Stream registry
verified live: graded-picks for all four sports refreshed nightly (MLB 60 · NFL 45 · UFC 16 ·
EPL 24 rows at 2026-09-06T11:44Z).

**Release F/G verification (built export, browser)**: homepage journey honest (publish-state
banner, per-sport states, direct Simulate/Picks/Parlay actions, NFL "next kickoff 2026-09-09");
/simulate/d/2026-09-09 renders 16 events with full week navigation and honest SCHEDULE_ONLY
copy; /nfl shows all 16 Week 1 games ("The rest of Week 1", REGULAR SEASON · WEEK 1 chips,
"Settled window" archive label); /moonshot coherent; /results renders the canonical 19-14 ·
$19,065.40 · crown $20,465.40 with the $250 daily exposure correctly isolated. Mobile (375px):
stacked cards, six-primary bottom bar, no horizontal traps. Presentation player (MLB Sep-6):
diamond theme, 8 chapters, real distribution content (total-runs histogram, median 8, book 7,
51% over), honest "degraded run" from the artifact's own status, recording layout with
9:16/4:5/16:9 pills and controls outside the crop. Screenshots captured while the pane was
visible; later checks textual (pane hidden — not a defect).

**Release H**: forward evaluation `mlb-isotonic-2026-09-forward` (frozen 2026-09-05, opens
2026-09-06, minimum 2,000 decisive rows, brier, +0.005): **0 eligible rows** — the newest
calibration file is 2026-09-05; the window's first rows land with tonight's settle
(~370–500/day → threshold ≈ Sep 10–12). No evaluation may run; correctly not run.

Pending acceptance events: tonight's nightly-settle (~09:30–11:45Z, drifted crons) settles the
four Sep-6 daily cards AND applies moonshot lane B; the daily-products workflow_run trigger's
first natural exercise follows the next mlb-daily-production completion (~14:15Z+).
