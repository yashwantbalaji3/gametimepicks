# Handoff: 2026-10-03 — Full-Day Continuation (Session 9 closeout → runtime proof → NBA readiness)

Additive to `HANDOFF_2026-10-02_SESSION_9_COMPLETION_NFL_SETTLEMENT_BETA.md` (closed out today, #935). Current truth
lives in the repo and Production; this is a point-in-time record. Process today: **one code PR at a time**, each
refreshed by merging `main` (never a rebase), green on its exact head, merged, verified on `main` and in Production
before the next opened.

## 1. PRs merged today (in order)

| PR | What | Merged (UTC) | Merge commit |
|---|---|---|---|
| #938 | UFC main-health: free coverage recompute (main was red) | 12:23:39 | `edc64d21ad` |
| #930 | C1 completion banking | 12:48:06 | `f82709187c` |
| #931 | NFL prop settlement (scheduled post-final sweep, ledger-derived PROVEN) | 13:05:01 | `beebabc964` |
| #932 | NFL role contract + kickoff-refresh `workflow_run` tick | 13:24:56 | `1ae886b43b` |
| #933 | Beta: live RLS proof, account sync, `/feedback`, follows-first, Mr. Dub separation guard | 13:47:43 | `4c51d0ec67` |
| #934 | Ask NFL eligibility (+ capture time / 12 h rule) | 14:10:44 | `fbd002472f` |
| #936 | NFL boards: no practice-squad rows | 14:33:58 | `44d18337a0` |
| #937 | Results: Suggested Parlays day history | 15:06:15 | `e26cc3ce9c` |
| #939 | NFL prices: daily-products as a second kickoff-refresh tick | 15:32:56 | `b5f9045856` |
| #935 | Session 9 handoff (docs, last of Session 9) | 15:37:37 | `1a60361c7b` |
| #940 | NBA factual readiness: `/nba` lists recorded finals; stale copy fixed | 16:07:31 | `f36afc2f97` |

Open PRs at end of day: #716 (long-standing intentional HOLD, untouched) and this docs PR.

**Defects found while clearing the queue (each fixed in its own PR, not worked around):**
- main was red from inherited UFC data rot: the free daily refresh added a 14th bout while `odds-latest.json`
  kept "11 of 13 priced"; the Saturday 11:00Z priced slot that would have rewritten it was **never delivered**.
  #938 recomputes coverage only, from the current card + stored snapshot (0 calls, price rows untouched).
- #930's C1 tests had pinned "folded through 10-01" (a world-state pin) and failed once the nightly fold reached
  10-02; they now re-fold a frozen record for the scenarios and check live byte-identity on the record's own date.
- #937 kept a second tier-label table ("Low risk"), violating D2 (one risk taxonomy); it now reads
  `publicRiskLabel`. Caught by the existing D2 guard in CI.

## 2. Mr. Dub / C1

| | |
|---|---|
| C1 | **live** in Production (`COMPLETION_BANKING_C1` from 2026-10-02; prospective; 0 completions banked yet) |
| Bankroll / peak / delta | **$15,240.40 · $20,465.40 (06-24) · −$5,225.00** — `/mr-dub` equals `money:audit` at 390/1280 px |
| Exposure (10-03) | four placed lanes: BB A s1 $100 · BB B s3 $951.89 → $2,944.44 · MS A s1 $25 · MS B s2 $100.17 → $400.35 |
| Audit | RECONCILED · 127 movements · folded through 2026-10-02 · health gate HEALTHY · forensic "mathematically perfect" |
| Separation | user ledger ↔ Mr. Dub guarded both ways (accounts never read Mr. Dub; no money owner reads user data — mutation-probed) |

## 3. NFL

**Settlement — runtime proof, part 1 DONE; part 2 PENDING.**
- CI run `37129088859` (nfl-event-window, 14:17Z — a workflow_dispatch of the owner workflow, not by this session)
  ran the post-final sweep and committed `data/internal/nfl/prop-settlement/` (`d41be5bbb6`): **1,867 rows, 32
  games, 6 slate days** — all unique, all frozen, all `admittedBy` that run, 0 unmeasured rows graded, all
  PROVISIONAL. Exemplar (Kalif Raymond ATD, model 0.2841, DK +500 captured 22:24:41Z pre-kickoff → 1 TD → YES)
  identical to the local proof.
- **Pending:** the first settle run ≥ 3 h after those first reads promotes them to CANONICAL; only then can a family
  read `settlementSupport = PROVEN`. All five families are `SCHEDULED_UNPROVEN` (verified on main). Scheduled
  `nfl-event-window` delivery was sparse today (no cron run between 00:10Z and the time of writing).

**Prices.**
- Latest real capture: **2026-10-02 18:08:45Z** (Friday 13:00Z sweep, delivered 5 h late) — 870 DraftKings rows,
  15 events, 5 families, all pre-kickoff (≥ 43.4 h ahead); boards ingested them. Ledger 630 / 1,160 credits; no
  spend today by this session.
- **Not product-fresh:** the universe now marks 636 Sunday legs `ODDS_STALE` (> 12 h, `LEG_BOUNDS`).
- Trigger chain **proven at runtime**: publication-watchdog delivered at 15:16Z (its first run since 00:57Z) and
  ticked `nfl-kickoff-refresh` (15:17Z), which correctly HELD (NO_KICKOFF_SOON). #939 adds daily-products as a
  second tick. **Pending:** a ≤ 12 h capture before Sunday's 13:30Z/17:00Z kickoffs.

**Role.** No source confirms a role. `PROJECTED_DEPTH_STARTER ≠ ROLE_CONFIRMED` (founder, 2026-10-02) — enforced.
Depth chart refreshed 10-03 13:20Z (Wed/Sat cadence).

**Practice squad.** Merged producer removes 9 players / 12 rows from today's boards with 0 active players lost;
public boards change on the next event-window run (pending).

**ATD.** `nfl-anytime-td-opportunity-v1`: forward **524 / 1000**, level **1.18** (bar 0.90–1.10), ECE **0.043**
(bar ≤ 0.040) — unchanged (the forward receipt grades complete weeks; Week 4 completes after MNF 10-05). Role 0,
prices held but stale, settlement provisional → **GATED**. Other families: projection only (no calibrated
probability), role uncertain, settlement provisional; passing also below its publication bar; receiving /
receptions have no forward test.

## 4. Product Engine V2 (measured, nothing retuned)

| Date | Sport | Candidates | Eligible | Notes |
|---|---|---|---|---|
| 10-03 | MLB | 142 | 24 | all eligible = market-implied team markets; 118 player props `MODEL_DEMOTED` |
| 10-04 | NFL | 772 | 0 | SPORT_GATED 772 · SETTLEMENT_UNSUPPORTED 688 · ROLE_UNCERTAIN 654 · ODDS_STALE 636 · NO_PROBABILITY 469 · MARKET_MISSING 136 · ODDS_OUT_OF_RANGE 103 |

Model-backed product legs: 0. SP-V2: 1 forward day, no card, SHADOW. BB-C1: 13/20 decided, survival .462 vs
control .600, NOT_YET. MS-C1: 3 decided, published 16.7 %, NOT_YET.

## 5. MLB / Live / Results / Ask

- **MLB postseason:** 10-03 Division Series — 4 games scheduled, 4 lanes placed, frozen forecasts on `/live`.
- **Live:** MLB factual live WORKING (pregame → live feed); NFL live not observable today (no games).
- **Results:** `/results/date/<day>` shows that day's published Suggested Parlays — 109 cards / 44 ladder days,
  all graded; verified in Production at 390/1280.
- **Ask:** the seven NFL eligibility questions answered in Production from the public gate record; the price answer
  states the capture time and the 12 h rule.

## 6. Friends beta

Hosted Supabase: **none** (no secrets/vars/env/bundle URL; dashboard not signed in). **CODE-READY, NOT
HOSTED-LIVE.** Live RLS proven on local Postgres executing the real schema (8/8 injected defects caught); account
sync, `/feedback`, follows-first ordering, privacy notice merged and verified in Production (accounts correctly
closed). Single external dependency: create the project, then `rls-live.mjs --hosted` and the two-account
acceptance in `SUPABASE_BETA_SETUP.md`.

## 7. NBA — Oct 20 readiness (re-audit today, read-only; #940 for factual fixes)

| Capability | State |
|---|---|
| Schedule, team identity, `/nba` hub | PUBLIC (factual) |
| Finals record (write-once) | READY; first final expected on the 10-04 run; `/nba` can now show it (#940) |
| Rosters, injuries | SHADOW (internal) |
| Box scores (forward) | MISSING (only for forecast games, never fed back) |
| Game model / simulation | SHADOW — v0 fails its preregistered bars (Brier 0.267 vs Elo 0.215; margin coverage 0.88 vs 0.76–0.84; dispersion) ; forward n = 0 / 300 |
| Points / rebounds / assists / 3PM | WITHHELD (n = 0) · PRA MISSING |
| Settlement | contract only; no player-prop settlement |
| Results (`/results/nba`) | PUBLIC archive (May–June); copy fixed (#940) |
| Ask | NBA excluded from tools; help copy fixed (#940) |
| Live | MISSING (no NBA adapter) |
| Registry | `HISTORICAL_ONLY` (unchanged) |

Production (`f36afc2f97`): `/nba` and `/results/nba` verified at 390/1280 — no overflow / NaN / console errors, stale "off-season" / "no longer covered" copy gone, "no forecast" shown; 0 finals listed yet (the first preseason final, MIA @ TOR 10-03 23:00Z, folds on the 10-04 run).

**Bottom line:** nothing NBA-predictive is eligible for Oct 20; launch NBA as schedule + finals with every model
clearly withheld. Open factual gaps (no methodology): G2 games that tip before the once-daily run are never
forecast (incl. opening-day BOS @ DET 19:00Z); G3 the forward builder never ingests 2026-27 data (changes v0 output →
needs a version call); G4 injuries captured after forecasts; G5 grader lacks preregistered coverage/ECE metrics;
G6 exhibition opponent simulated with an empty roster; G7 forecast artifacts not write-once; G8 grader reads finals
only from the 9-day window; stale cadence expectation / launch-watch time; ⚠ **G10 latent legacy NBA spend path**
(`auto-refresh.yml` paid NBA board step gated only by `ENABLE_ODDS_REFRESH` + `ODDS_DRY_RUN`, not by
`NBA_LEGACY_REFRESH`).

## 8. Launch readiness (replaces the stale 2026-07-31 blocker register for current purposes)

| Area | State today |
|---|---|
| Home / Today / sport hubs | clean at 390/1280 (12 launch routes swept) |
| Results | product history complete for BB / Moonshot / Suggested Parlays day pages |
| Ask | grounded NFL eligibility; NBA help truthful |
| Daily products | MLB operating; NFL correctly gated; shadows accumulating unchanged |
| Mr. Dub | reconciled; C1 live |
| Accounts / privacy | code-ready; privacy notice current (not a legal review); hosted project missing |
| Terms / legal / commercial | unchanged — founder scope (no compliance claimed) |
| Analytics | provider still off (measurement not live) |
| Error states / data freshness | fail-closed states verified on account, NFL prices (stale refused), NBA (withheld) |
| Mobile / accessibility | no overflow / NaN / console errors on swept routes; CI a11y layer unchanged |
| Support / feedback | public support address; in-site feedback ready for testers |
| Platform | ⚠ GitHub scheduled delivery is best-effort and was badly degraded today (watchdog 0 runs 00:57–15:16Z; UFC Sat 11:00Z never delivered) |

## 9. Founder / model gates

1. Create the Supabase project (the beta's only external dependency).
2. ATD promotion: not before its forward test passes its bars (n 524/1000, currently outside them) and a grant.
3. NBA G3 (feeding 2026-27 data into v0) changes model output → version decision before doing it.
4. G10: decide whether to hard-gate the retired NBA paid board step behind `NBA_LEGACY_REFRESH`.
5. Unchanged: SP-V2 adoption; BB-C1 / MS-C1 timing; QB depth-starter is not a confirmed role.

## 10. Known risks

- Settlement canonicalization and Sunday's ≤ 12 h capture both depend on GitHub schedule delivery.
- First real C1 completion is plausible within days (BB B, MS B mid-ladder): the first live exercise of C1.
- UFC capture compares a provider hash id with the ESPN card id → `eventMismatch` always true (UFC odds never
  "ready"; UFC is product-gated).
- NBA G2: opening-day 19:00Z game will be missed by the once-daily run.

## 11. Next highest-priority session

1. Confirm CANONICAL prop settlement + per-family PROVEN; confirm Sunday's ≤ 12 h capture made legs price-fresh.
2. Verify practice-squad rows gone from public boards; first real C1 completion if it happens (money audit).
3. NBA G2/G4/G5/G7 factual/validation plumbing (no methodology) before Oct 20; G10 gate.
4. Supabase project → hosted RLS + two-account acceptance → invite testers.
