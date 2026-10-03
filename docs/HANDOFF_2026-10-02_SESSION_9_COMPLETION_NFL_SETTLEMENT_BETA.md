# Handoff: 2026-10-02, Session 9 — Completion Banking C1 · NFL Prop Settlement · Friends-Beta Backend

Point-in-time record. Current truth lives in the repo, Production and the canonical docs:
- `docs/MR_DUB_MONEY_LEDGER.md` (§2 peak semantics, §5 C1)
- `docs/NFL_FAMILY_PRODUCT_GATE.md` (§3 operational settlement, §3b role contract)
- `docs/SUPABASE_BETA_SETUP.md` (live RLS proof, sync strategy, feedback)
- `docs/PRODUCT_ENGINE_V2.md`

**Start state (verified ~16:55Z):** main = Production = `9fc6d692` (bot data commit after Session 8's `a78aa1dd50`).
Only open PR: #716 (intentional HOLD, untouched).

**End state (closeout, 2026-10-03):** every Session 9 code PR is merged, in order, each on a green exact head
after a fresh merge of `main` (never a rebase), each verified on `main` and in Production:

| PR | What | Merged | Merge commit |
|---|---|---|---|
| #938 | UFC main-health: free coverage recompute (main was red from stale UFC odds coverage) | 2026-10-03 12:23:39Z | `edc64d21ad` |
| #930 | C1 completion banking | 12:48:06Z | `f82709187c` |
| #931 | NFL prop settlement: scheduled post-final sweep + ledger-derived PROVEN | 13:05:01Z | `beebabc964` |
| #932 | NFL role contract + kickoff-refresh `workflow_run` | 13:24:56Z | `1ae886b43b` |
| #933 | Beta: live RLS, sync, `/feedback`, follows-first, Mr. Dub separation guard | 13:47:43Z | `4c51d0ec67` |
| #934 | Ask NFL eligibility (+ price capture time / 12 h rule) | 14:10:44Z | `fbd002472f` |
| #936 | NFL boards: practice-squad players get no board row | 14:33:58Z | `44d18337a0` |
| #937 | Results: Suggested Parlays day history | 15:06:15Z | `e26cc3ce9c` |

Production at closeout: `84e518c8` (includes all of the above). The full-day continuation after this closeout is
recorded additively in `HANDOFF_2026-10-03_FULL_DAY_CONTINUATION.md`.

**Founder decision recorded (2026-10-02):** `PROJECTED_DEPTH_STARTER ≠ ROLE_CONFIRMED`. A fresh depth-chart QB1
is context, never a gate-accepted role. The shipped contract enforces it (`ACCEPTED_BY_GATE` excludes it; tested).

### Runtime / Production evidence (actual, not expected)

- **C1 / money (Production):** `/mr-dub` shows $15,240.40 · peak $20,465.40 (06-24) · −$5,225.00 · $0.00 open at
  390 and 1280 px, equal to `money:audit` (127 movements, folded through 2026-10-02, 0 completions banked yet).
  Health gate HEALTHY; forensic audit "mathematically perfect". Live lanes on 10-03: BB B step 3 ($951.89),
  MS B step 2 ($100.17) — the first real C1 completion is possible within days.
- **NFL settlement (runtime, part 1 proven):** CI run `37129088859` (nfl-event-window, 2026-10-03 14:17Z, a
  workflow_dispatch of the owner workflow) settled 32 finished games → **1,867 rows** in
  `data/internal/nfl/prop-settlement/` (commit `d41be5bbb6`): all unique, all frozen, all `admittedBy` that run,
  0 unmeasured rows graded, all PROVISIONAL. Exemplar unchanged from the local proof (Kalif Raymond ATD, 0.2841,
  DK +500 @ 22:24:41Z pre-kickoff → YES). **Pending:** the reconciliation run that promotes them to CANONICAL
  (≥ 3 h later) and therefore `settlementSupport = PROVEN`; every family is `SCHEDULED_UNPROVEN` until then.
- **NFL prices:** real capture 2026-10-02 18:08:45Z (Friday sweep, delivered 5 h late): 870 DraftKings rows, 5
  families, all pre-kickoff (≥ 43.4 h ahead), boards ingested them. **Not product-fresh:** the universe now marks
  636 Sunday legs `ODDS_STALE` (> 12 h). **Pending:** a ≤ 12 h capture before Sunday kickoffs. ⚠ GitHub delivered
  0 publication-watchdog runs 00:57Z–15:00Z+ on 10-03, so #932's tick never fired; #939 adds daily-products as a
  second tick.
- **Practice squad:** today's boards 9 players / 12 rows → 0 with the merged producer (0 active players lost);
  public boards change on the next event-window run.
- **Ask (Production):** all seven NFL eligibility questions answered by `getNflProductEligibility` from the
  public gate record; the price answer states the capture time and the 12 h rule rather than "current".
- **Results (Production):** `/results/date/<day>` shows that day's published Suggested Parlays (109 cards across
  44 ladder days, all graded) at 390/1280, no overflow, no console errors.
- **Beta (Production):** `/account`, `/feedback`, `/my`, `/following`, `/saved` clean at 390/1280; accounts
  correctly closed; no secret or private data in the HTML. **Hosted Supabase: still none** → CODE-READY, NOT
  HOSTED-LIVE; the single external dependency.

## 1. Outcome in one paragraph

- **C1 is implemented** without touching history: a completed ladder banks final value − seed, once, from
  2026-10-02; every folded day is byte-identical; the money audit still reconciles to the cent.
- **NFL prop settlement is operational in code**: a free, scheduled post-final sweep feeds the existing
  append-only ledger, and PROVEN is now derived from CI-admitted canonical ledger rows. A real time-safe
  lifecycle was proven locally on 32 games / 1,867 rows; the first CI-admitted rows land on the first scheduled
  run after #931 merges.
- **Role confirmation is precisely bounded**: no current source can positively confirm a role for any family.
- **Prices**: the kickoff-aware refresher's crons were being *dropped* (1 of 10 on TNF); it now ticks on a
  workflow that delivers.
- **ATD stays gated** (model quality fails its forward bars; no grant).
- **Ask** answers NFL eligibility questions from a public republication of the family gate.
- **Beta backend**: live two-account RLS proven by execution on Postgres; sync, `/feedback` and follows-first
  ordering built. **The Supabase project still does not exist** — the one external dependency.

## 2. C1 completion banking (PR #930)

| | |
|---|---|
| Policy | `COMPLETION_BANKING_C1` — banked = final settled value − original seed (BB $100, MS $25), once |
| Effective | completions in receipts dated **≥ 2026-10-02** (the first unfolded day) |
| Historical receipts changed? | **No.** No receipt 07-08→10-01 completes a ladder; every folded day byte-identical (tested). A completion dated before the boundary still halts (`LADDER_COMPLETION_OPERATOR_GATED`) |
| Completion receipt | on the folded day + its ledger row: policy · effectiveFrom · product · lane · cycle · step · seed · finalValue · banked · source · settledAt |
| What completes | one predicate `completesLadder` shared with the lane machine: won final rung, or a payout ≥ the final goal (parity-tested on every rung/payout band) |
| Duplicate prevention | each day folds once; `foldLedgerRows` refuses restatement (incl. completions); audit re-derives banked from the card; ledger fold rows reconciled one-per-date |
| Peak | June crown = immutable history key; **HWM = derived peak** (equal until a completion passes June). money-integrity, forensic audit, UI "Peak paper bankroll" read HWM |
| Pre-existing defects fixed | stake carry ignored push/void replay; `reconcileMoney` never reconciled the ledger's fold rows |
| Tests | 26 C1 tests incl. **12 landed mutation probes** (C2, C3, seed double-count, wrong seed, duplicate card, duplicate ledger row, changed final value, banked before settlement, June rewrite, crown raised, completion dropped, HWM not recomputed) |

**Mr. Dub (recomputed, `npm run money:audit`):** bankroll **$15,240.40** · peak **$20,465.40** (2026-06-24) ·
delta **−$5,225.00** · open exposure **$0.00** · **127 movements** reconciled · 0 completions banked. Health gate
HEALTHY; forensic audit "mathematically perfect". `/mr-dub` Production verification at 390/1280 is owed after merge.

## 3. NFL prop settlement (PR #931)

- **Finding:** nothing had ever settled an NFL prop. The grader ran only inside the live producer's 8-hour
  window; the free runner is dispatch-only by design; all `live-props/*.json` sat IN_PROGRESS; the ledger
  directory did not exist; PROVEN was unreachable (keyed on graded-picks labels the ledger never emits) and
  SCHEDULED_UNPROVEN was derived from "a workflow file mentions the settler" (vacuous).
- **Ledger (reused, not rebuilt):** `data/internal/nfl/prop-settlement/<ET date>.json` — one row per
  event:player:family; `frozen`, `original`, `settledAt` immutable; corrections append; rows now carry
  `admittedBy` (CI workflow + run id).
- **Cadence:** `capture-live-props.mjs --post-final` (games 3.5 h–14 d after kickoff, not yet CANONICAL) in
  `nfl-event-window`'s settle step — scheduled daily 14:30/15:00/21:00Z + Fri–Sun 13:00Z, keyless, free,
  `!cancelled()`. FINAL → PROVISIONAL → (3 h reconciliation re-attempts) → CANONICAL (fetch-free promotion).
- **PROVEN:** a CANONICAL, OBSERVED, line-graded, frozen, **CI-admitted** row of that family; per family.
- **Families wired:** passing yards, rushing yards, receiving yards, receptions, anytime TD (unmeasured ≠ no TD).
- **Real lifecycle proof (local, artifacts reverted):** 32 finished games, 1,867 rows settled; +4 h all
  CANONICAL; rerun idempotent. Exemplar, time-safe by git history: **PHI @ CHI, Kalif Raymond ATD** — model
  0.2841 · board committed 2026-09-28T22:25:12Z · DraftKings +500 captured 22:24:41Z · kickoff 00:15Z ·
  final 1 TD → YES. Role: AVAILABLE_ROLE_UNCERTAIN (role FAIL). Model quality FAIL. ⇒ ATD STILL GATED.
- **Open:** a correction after CANONICAL is not re-polled. PROVEN flips only after the first CI run admits rows.

## 4. NFL role confirmation (PR #932)

`lib/sports/nfl/role-confirmation.mjs` — fail-closed receipt per (event, player, family) with source,
capturedAt, sourceAsOf, expiresAt. **No current source confirms a role.** QB passing at best reaches
`PROJECTED_DEPTH_STARTER` (depth chart ≤ 36 h old at kickoff, newer than any QB designation) — deliberately not
gate-accepted (measured 82/90; acceptance is a founder decision). Rushing / receiving / receptions / ATD have no
positive source. Real Week-4 boards: **763 rows, 0 gate-satisfying**; QB rows fail on chart staleness (Wed/Sat
capture is 35–84 h old at kickoff). 12 landed mutation probes. **Found:** 11 practice-squad rows on the boards
(producer defect, open).

## 5. NFL pregame prices (PR #932)

- Provider: The Odds API under `ODDS_AUTHORIZATION_NFL_2026` — **549 / 1,160** credits used; no new spend this
  session; no new paid path.
- Automation: Fri/Sat/Sun 13:00Z week sweeps + `nfl-kickoff-refresh` (T-120 min, 180-min freshness).
- **Finding:** kickoff-refresh crons were *dropped*: Sun 09-27 4/28, Mon 09-28 1/10, Thu 10-01 1/10 — the one TNF
  run held at T-155 min and Week 4 TNF props were never captured. Now also ticks on `publication-watchdog`
  completion (`workflow_run`, default branch only; 16 deliveries in the same Thursday window); Thu/Mon bands to 23Z.
- Latest prop capture: `capture-20260928T2224` (PHI @ CHI). Freshness policy exists: `LEG_BOUNDS` 12 h max age,
  30-min activation cutoff, odds −650…+400 (ATD +500 is outside it).

## 6. NFL ATD and other families

| | ATD | Passing | Rushing | Receiving / Receptions |
|---|---|---|---|---|
| Model | `nfl-anytime-td-opportunity-v1` | share-level v1 (below bar) | share-level v1 | props-v1 |
| Probability | MODEL (288/288 on 10-04) | none | none | none |
| Forward | 524/1000, level 1.18, ECE 0.043 — outside bars | 66/300, ECE 0.108 | 216/300, ECE 0.062 | not registered |
| Role | 0 confirmed | 0 (chart stale) | 0 | 0 |
| Price | 0 priced on the 10-04 slate | 0 | 0 | 0 |
| Settlement | wired; PROVEN after first CI run | same | same | same |
| Gate | **GATED** | GATED | GATED | GATED |

No family promoted; no grant added; nothing retuned.

## 7. Product Engine V2 (remeasured, unchanged)

- Universe 10-04: **741 NFL candidates, 0 eligible, 288 model-backed (ATD), 0 market-only**; MLB 10-03/10-04
  boards not yet produced. Exclusions: MARKET_MISSING 741, SPORT_GATED 741, SETTLEMENT_UNSUPPORTED 713,
  ROLE_UNCERTAIN 620, NO_PROBABILITY 425, AVAILABILITY_BLOCKED 93, MODEL_NOT_PUBLIC 28, FAMILY_NOT_CLEARED 27.
- **SP-V2:** 1 forward day (10-02, off day) — no qualifying card in any tier; 0 model-backed. SHADOW.
- **BB-C1:** NOT_YET — 13/20 decided, survival .462 vs control .600, publication 77.8% (93% of control), 0 guard
  failures, 0 model-backed.
- **MS-C1:** NOT_YET — 3 decided, published 16.7% of lane-days, PRICE_UNAVAILABLE on 12 of 15 no-card days, 0 model-backed.
- No public methodology change.

## 8. Ask (PR #934)

`getNflProductEligibility` reads a daily projection of `public/data/nfl/family-eligibility.json` — the family
gate republished in public terms (Ask may not read the internal universe; raw codes trip its leak guard). Every
reason is a blocker with evidence and its clearing condition; when a blocker clears upstream the answer changes
with no Ask edit. The seven founder questions route to it. Eval 142/142 · 1,072/1,072.

## 9. Friends beta / Supabase (PR #933)

| Item | State |
|---|---|
| Project connected | **No** — no keys anywhere; dashboard not signed in (Claude does not sign in). The one external dependency |
| Auth | magic link, PKCE, static export kept — unchanged; live login not testable without the project |
| Invite flow | allowlist + signups off; proven by the live battery (uninvited cannot onboard; revoked keeps read/delete) |
| **Live RLS** | **PASS** on local Postgres executing the real schema with Supabase's default grants; 8/8 injected defects caught (first version missed open UPDATE USING — fixed). Hosted run: `RLS_DB_URL=… rls-live.mjs --hosted` |
| Follows / saves | account sync built: union + last-synced baseline; nothing removed on first sign-in |
| Manual bets / personal P/L | unchanged from Session 8 (implemented, tested; separate from Mr. Dub, guarded) |
| For You | `/my` "Upcoming · your follows first" (no results input; title respects SAFE3) |
| Feedback | `/feedback` (signed-in testers; own-row insert; founder reads in the dashboard) |
| Static export | kept; no private data in the export (scanned); no service-role key in the bundle |
| Privacy | notice updated for the sync baseline and account-kept follows/saves (not a legal review) |

## 10. Security

Cross-user: A↔B read/update (WHERE'd and blanket)/re-assign/delete isolation on every private table, executed.
Anonymous: 0 rows everywhere, no writes. Secrets: none committed; `RLS_DB_URL` read from env, never printed.
User bets cannot reach Mr. Dub (guard); personalization has no results input (guard).

## 11. PRs (open, exact-head CI)

| PR | What | CI at writing |
|---|---|---|
| #930 | C1 completion banking | green |
| #931 | NFL prop settlement sweep + ledger-derived PROVEN | green |
| #932 | NFL role contract + kickoff-refresh `workflow_run` | green |
| #933 | Beta: live RLS, sync, /feedback, follows-first | running |
| #934 | Ask NFL eligibility | running |

All five are file-disjoint except #931/#934 both touching `nfl-event-window.yml` in different steps (expected to
merge cleanly). Merge order: #930 → #931 (before a scheduled event-window slot, ideally 21:00Z) → #932 → #933 →
#934. After merge: Production-verify `/mr-dub` (390/1280), `/account`, `/feedback`, `/my`, `/ask`; watch the
first `nfl-event-window` run write `data/internal/nfl/prop-settlement/` with `admittedBy`, then the next run
promote to CANONICAL → `settlementSupport` PROVEN per family.

## 12. Founder / model gates

1. **Merge the five PRs** (refused to this session by the permission classifier).
2. **Create the Supabase project** (`OPTIONAL_DP_SUPABASE_SETUP.md`), invite two test accounts, run
   `rls-live.mjs --hosted`, then the acceptance list in `SUPABASE_BETA_SETUP.md`.
3. **QB role**: may a fresh, uncontradicted depth-chart QB1 count as a confirmed passing role (82/90 measured)?
4. ATD promotion: not now (forward test outside bars; resolves at n = 1,000). Unchanged: SP-V2 adoption,
   BB-C1/MS-C1 timing.

## 13. Known risks

- GitHub drops scheduled runs; any cadence that depends on one cron slot is unreliable (the settle step has
  four daily slots; kickoff-refresh now chains off the watchdog).
- 11 practice-squad rows on NFL boards (no product exposure — all gated — but visible on boards).
- The prop ledger's first CI run settles ~32 games at once (Weeks 2–4 inside the 14-day lookback).

## 14. Next recommended session

Merge + Production acceptance; confirm the first CI-admitted CANONICAL prop rows and PROVEN; fix the
practice-squad board defect; Supabase project + hosted RLS + two-account acceptance; the QB-role founder decision.
