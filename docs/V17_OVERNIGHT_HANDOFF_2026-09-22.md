# v1.7 — overnight handoff, 2026-09-22

**Terminal state:** `V1.7 FOUNDATION — CODE GREEN · PUSH BLOCKED` (the branch and PR are up and CI-green; the
push to `main` was refused by the session's permission classifier, reason `[Merge Without Review]`).
**Public selection:** unchanged — `bank-builder@1` / `moonshot@2`. **Shadow:** `SHADOW_RUNNING · NOT ADOPTED`.
**NBA:** `HISTORICAL_ONLY`, not product-eligible. **No registry, model status, policy constant, secret,
provider or billing changed.**

## A. Executive summary

- The v1.7 release candidate was re-verified from a clean bootstrap (branch 13 ahead / 0 behind, working
  tree clean), synced with the one bot commit that landed overnight (merge, not rebase), gate-green
  locally twice, pushed to `origin`, and CI-green on PR #627. It is one merge click from production.
- Founder decision packets for **F1 / F2 / F3** are written with numbers from committed receipts only.
- The forward shadow had a **real integrity defect** (a roll-time publication at 01–06 ET before the day's
  pool exists, which under first-publication-wins would have blocked every real morning judgement). Fixed,
  with a reproducible shadow report and adoption-gate tests. Still shadow-only.
- Three product-truth defects fixed: the `/results` explorer silently dropped the Moonshot row; an off-day
  rendered as "Waiting on today's data"; Bank Builder no-play copy attributed a market-price shortfall to
  a model. One contradictory store retired (the optimizer-derived "Bank Builder 30–37" summary).
- NBA: a **free roster owner** now exists (30/30 teams, 561 players, raw preserved), the sim-dispersion
  problem is decomposed with a preregistered v1 plan, the regular-season preregistration is drafted, and
  the dead stats.nba.com half of `auto-refresh` is de-scheduled.
- Results & Trust v2 has a canonical-projection architecture doc; accounts have a design-only doc.

## B. Exact engineering state

| | |
|---|---|
| Branch | `v17-bankbuilder-moonshot-multisport` (on `origin`, tracks) |
| HEAD | `7d79f38da` (10 commits on top of the merge `07dd568ec`; 23 ahead of `origin/main` `04020f8ea`) |
| `origin/main` | `04020f8ea` (bot: mlb pregame archive metadata) — merged into the branch at `07dd568ec` |
| PR | https://github.com/yashwantbalaji3/gametimepicks/pull/627 (head advances with the branch) |
| CI | run `35693325132` **success** on `07dd568ec` (4/4 checks, merge state CLEAN) · run `35695206409` **success** on the full overnight head `7d79f38da` (quality 17m30s, python 1m03s, Vercel preview pass) |
| Production | `e02f8fb4` (bot auto-refresh; `/data/build-info.json`) — **v1.7 is not deployed** |
| Gate 1 (`42f569e50`) | lint 0 · unit **6,920 / 0** · tsc 0 · build OK (prune 3,089 files / 969.1 MB) · post-build **601 / 0** |
| Gate 2 (`de7c71ef1` tree) | lint 0 · unit **6,942 / 0** · tsc 0 · build OK (prune 3,088 files / 969.1 MB; `out/` 1.4 GB, `out/data` 47 MB) · post-build **606 / 0** |
| Retirement commit | `bank-builder-public-source` 2/0 · `ledger-health` 15/0 · lint 0 · tsc 0 (workflow text unchanged) |
| Browser QA (built export, 375 px) | `/bank-builder`, `/moonshot`, `/mr-dub`: `scrollWidth == 375` (no page overflow; the settled-record table sits in its own `overflow-x-auto` scroller); eligible-universe section + "priced by the sportsbook market with no forecast behind it" on BB and MS; "high variance" on MS; "The record, as settled · The $100 → $10K ladders" + "Bank Builder 35–34" on mr-dub; banned strings: none |
| Push blocker (exact) | `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Merge Without Review]` on the fast-forward of `07dd568ec` to `main`. Not retried. A `git rm` was likewise refused (`[Irreversible Local Destruction]`), so two dead files are left for the founder (§F). |

Commits on the branch tonight (all explicit-path, `git diff --cached` inspected, forbidden paths and
secret-like strings grepped before each):

```
7d79f38da v1.7: retire the optimizer-derived Bank Builder summary store (writer + loader; no mounted reader)
de7c71ef1 nba: preregister regular-season shadow evaluation; sim dispersion diagnostic (no constant changed)
934f5d440 nba: de-schedule the dead stats.nba.com half of auto-refresh; drop the demo hit_rates file
37d58d615 nba: add canonical roster capture contract (free ESPN endpoint, internal only)
6f41d6182 ui: delete four unmounted components (no importer; tsc clean)
24adefc5c v1.7: reconcile stale product result owners — Moonshot row, off-day state, honest no-play copy
0bea16766 qa: pin v1.7 workflow and public-data boundaries
8dc522f7a v1.7: harden selector shadow observability and integrity (still SHADOW_RUNNING, not adopted)
67b958780 accounts: architecture design doc (design only — nothing provisioned)
00197284d v1.7: founder decision evidence packets (F1/F2/F3), store ownership graph, results-trust architecture
07dd568ec Merge remote-tracking branch 'origin/main' into v17-bankbuilder-moonshot-multisport
```

## C. Bank Builder / Moonshot

| | |
|---|---|
| Live policy ids | `bank-builder@1`, `moonshot@2` (unchanged) |
| Shadow policy ids | `BB-LEGACY@7be1d5171769` (control), `BB-C1@b66731b335c2`, `BB-C2b@61c455e7d375`, `MS-LEGACY@311563f3927d` (control), `MS-C1`, `MS-C4` — hashes in `policies.mjs`, **no constant changed** |
| Forward decided lane-days | **0** per policy (2 lane-days, 1 placed, 1 pending for 2026-09-21, 1 no-play `CONCENTRATION_TOO_HIGH`); 2026-09-21 is a seeded day and is labelled RETROACTIVE in the report |
| Adoption gate | `NOT_YET` for every candidate (decided 0 < 20) — still accumulating; earliest plausible eligibility ~2026-10-02 |
| No-play | 1 lane-day per policy, reason `CONCENTRATION_TOO_HIGH` (3-game slate) |
| Settlement disagreement | none (2026-09-21 cards pending until `nightly-settle` fetches the 09-21 linescores; pending is never a loss) |
| Integrity fixes | roll-time shadow publish removed from `nightly-settle` (I1); builder refuses on a missing pool (no empty day); day files carry a universe fingerprint (I6); won-with-push rolls on the settled decimal (I4); shadow day files protected from later-run auto-resolution in `commit-generated.sh` (I2). 2026-09-21 day file verified intact against its first commit |
| Stale stores | **Retired:** optimizer-derived `bank-builder/summary-latest.json` writer + loader. **Still present (mapped, plan written, founder-gated display question):** `dual-bank-builder-active.json` / `moonshot-lane/active.json` (frozen 08-17, still read on 8 / 4 mounted routes), `products/lifecycle/latest.json` (frozen 09-07), `public-summary-latest.json` (frozen 06-14, feeds `crownRung` on `/` and `/today`) |
| Performance claims | none new; the record every surface prints is the protected 35–34 |

Report: `docs/V17_SHADOW_REPORT.md` (regenerate with `npx tsx scripts/products/report-selector-shadow.mjs`).
Integrity audit: `docs/V17_SHADOW_INTEGRITY_AUDIT.md`. Adoption-gate tests: `adoption-gate.test.mjs` (9).

## D. Founder decision packets — `docs/V17_FOUNDER_DECISION_PACKET.md`

| Gate | One-sentence decision | Best evidence | Safe default until you choose | If YES / if NO |
|---|---|---|---|---|
| **F1** market-priced legs, no forecast owner | Are Bank Builder / Moonshot allowed to remain market constructions? | 18/18 eligible legs on 09-21 are `MARKET_PRICED_NO_FORECAST`; replay mean 72 legs/day, all market-priced; no MLB family is `VALIDATED_MODEL`; joint p 0.397⁵ ≈ 1% per BB attempt (0/26 observed completions match); **the live selector never reads the contract**, so flipping the constant alone would print "0 eligible legs" above a card that still placed | Keep admitting, labelled (the caveat ships in v1.7); finish the labelling (rename `modelConfidence` on published legs) | YES: say so on the product page as its identity ("market construction") · NO: flip `MARKET_PRICED_LEG_POLICY` to `REFUSED` **and** route the live generator through the contract in the same commit — both products go dark |
| **F2** EPL eligibility | Promote EPL to product-eligible on the P304 receipt? | **No contradiction**: P304's `VALIDATED_OUT_OF_SAMPLE_HISTORY` is a blind historical replay (n=3,420, 2013-14→2021-22, LL 0.9735, ECE 0.015, no market baseline); the n=36 live rows are all the *previous* model; P304 forward n = **0 of 60**; the odds file has no bookmaker and file-level capture only, so even a promotion would produce no time-locked leg | Hold; fix the two defects regardless (`build-epl-forecasts.mjs:316-334` counts v1 rows as P304's; results capture stalled 2026-09-15) | YES: registry → `FULL_MODEL` + a dated per-fixture odds capture · NO: nothing to do |
| **F3** post-MLB gap | What do the products do from 2026-09-28? | Universe is MLB postseason only, market-priced; no other sport can enter without a status change; off-days now render honestly (NO_EVENTS) instead of "Waiting on today's data" | Publish only when a card qualifies; off-days say so; no forced cards | Postseason-only market construction (needs F1 = A) · or dormant products with the honest empty state (already rendered) |

## E. NBA readiness — `docs/V17_NBA_READINESS_RECEIPT.md` (2026-09-22 section)

| | |
|---|---|
| Roster owner | **CAPTURED** from the free ESPN team roster endpoint: 30/30 teams, 561 players, 0 duplicate names, 0 ids on two teams; traded (Giannis on MIA, absent from MIL), rookie (Ryan Conwell, 2026 R2 #37) verified. Two-way status **not exposed** (never inferred). Raw payloads kept as a 14-day workflow artifact (`sport-schedules.yml`), normalised artifacts committed. `raw/` gitignored. |
| Corpus (measured) | 4,179 finals · 4,179/4,179 box scores · 113,080 player rows (21,381 DNP) · 316 non-observation rows null · `active` key on 202 files (full re-capture NOT run: the builder does not retain raw; proposal recorded) |
| Experimental pipeline | scheduled in `sport-schedules.yml` (`nbaexp`); `state=NO_GAMES` no-op (exit 0) distinct from failure (exit 1); artifact label/class/eligibility enforced by test; roster reconciliation recorded on the 2026-10-03 artifact — **22 of 40 simulated players are no longer on a roster and 16 rostered players have no history** (v0 pool deliberately unchanged; roster-gating is the first versioned v0.1 candidate) |
| Sim dispersion | realised regular-season margin SD **15.98** (the receipt's "≈13" was mean \|margin\|); v0 sim 22.09; ratesFixed 10.03, minutesFixed 18.66; cause: independence across ~18.6 pooled players (Var(team)/ΣVar(player) = 0.383), unconstrained per-run minutes, no shared pace, OT unmodelled; v1 plan C1–C5 preregistered on dev 2023-24+2024-25 / assessment 2025-26 — `docs/V17_NBA_SIM_DISPERSION_DIAGNOSTIC.md` |
| Preseason readiness | artifact carries expected minutes + uncertainty per player, roster/injury assumptions, `productEligible:false`, `dataClass: PRIVATE_RESEARCH`; nothing under `app/public` references the research tree |
| Regular-season preregistration | `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` drafted (frozen versions, windows, split, metrics per market, bars, no pooled adoption, forward-shadow requirement, hold/pause rules; look 1) |
| Cleanup | `auto-refresh.yml` NBA half gated on `vars.NBA_LEGACY_REFRESH` (run 35685601992: nba_api timed out after 8 m, `ScheduleUnavailable`, nothing to commit); demo `hit_rates.json` removed (both copies); caches / `__pycache__` / `.vercel` NBA outlook deleted on disk. **Not done:** `morning-projections.yml` NBA half (sole writer of `meta.json` the footer renders — public coupling), `sports-coverage.ts` level `full` (two components branch on it), `pipeline/.venv` (not actually checked in). |
| Blockers | roster-gated pool (v0.1); dispersion v1 on the split; no authorized NBA price receipt; two-way status unobservable free |
| **Still not product-eligible** | yes — registry untouched, both boundaries guarded |

## F. Results / UX

- **Contradictions found:** three "Bank Builder" records (35–34 protected / 5–0 June summary / 30–37 optimizer);
  Moonshot 4–32 (fold era) loaded but 0–7 (June ledger) printed everywhere; `/results` explorer dropped
  the Moonshot row (C2); record hole 07-08→08-14 undisclosed (C8). Full list: `docs/V19_RESULTS_TRUST_ARCHITECTURE.md`.
- **Fixed tonight:** C2 (row counted from the ledger rows, era question left to F-packet); off-day state;
  Bank Builder no-play copy ("Model pass", "model discipline" → price-based wording); 30–37 store retired;
  four unmounted components deleted.
- **Canonical owner map:** `docs/V17_PRODUCT_STORE_OWNERSHIP.md` (every store classified, retirement criteria
  per store, 8-step migration plan for the frozen trio, cycle table derivable — `derive-cycle-table.mjs`
  → `data/internal/products/cycle-table/latest.json`: BB 21 cycles / 0 completed / 1 open, MS 32 / 0;
  eras marked RECEIPTED / PENDING_SETTLEMENT / UNRECEIPTED / LEDGER_ONLY).
- **Design produced:** `docs/V19_RESULTS_TRUST_ARCHITECTURE.md` (canonical results projection, simple-first
  hierarchy, metric vocabulary with "accuracy"/"win rate" banned as generic).
- **Left for the founder to delete** (this session may not delete files): `app/public/data/bank-builder/summary-latest.json`
  (stale, unread, never shipped) and `app/scripts/build-active-builder-slip.mjs` (unscheduled June tool that reads it).
- **Backlog (v1.9 / v2.1):** frozen-trio retirement (needs the legacy-Moonshot display decision), receipt-derived
  cycle table on the history surfaces, `probabilityBasis` chips after adoption, `EligibleUniverse` freshness
  badge (renders null when the availability artifact is missing; `generatedAt` now emitted), the C8 hole disclosure.

## G. Accounts groundwork

`docs/V20_ACCOUNTS_ARCHITECTURE.md` — design only. No production integration, no keys, no auth. Major
schema/RLS questions: `follows` / `saved_items` as user-owned tables; a column-name integrity assertion so
no account table can restate a probability/result/record; ordered delete (storage first); device→account
migration is opt-in and idempotent; Bank Builder / Moonshot user staking state is explicitly refused.

## H. Risks / next 72 hours

1. **PR #627 is not merged.** Until it is, production runs `e02f8fb4`: the stale "Record 5–0", the
   `$19.5K` copy, and — more importantly — the shadow is not running in CI at all (`daily-products` on
   `main` has no shadow step), so forward evidence does not accumulate. One click fixes all of it.
2. **Sep 27:** MLB regular season ends. The products' only pool thins from Sep 28; F1/F3 decide what they
   say. The honest off-day state ships with the PR.
3. **Shadow sample:** 0 decided lane-days; ~10 product days to the earliest gate. Watch
   `docs/V17_SHADOW_REPORT.md` after each nightly run; a guard failure or a rewritten day file stops the test.
4. **Oct 3:** NBA preseason. The experimental pipeline is scheduled; the roster capture runs with it. The
   first artifact will still simulate last year's rosters until v0.1 roster-gating is versioned.
5. **Automation:** `morning-projections.yml` keeps writing empty NBA boards (public footer coupling);
   `nightly-settle` runs 3–6 h late on its cron (recorded, not changed).

## I. Files / docs created or changed

| Artifact | Owns |
|---|---|
| `docs/V17_FOUNDER_DECISION_PACKET.md` | F1/F2/F3 evidence and one-line actions |
| `docs/V17_PRODUCT_STORE_OWNERSHIP.md` | store classification, retirement criteria, migration plan, retirement receipt |
| `docs/V19_RESULTS_TRUST_ARCHITECTURE.md` | results-surface inventory, contradictions C1–C10, target projection, UX hierarchy, metric vocabulary |
| `docs/V17_SHADOW_INTEGRITY_AUDIT.md`, `docs/V17_SHADOW_REPORT.md`, `selector-shadow/report.json` | shadow invariants I1–I9; reproducible per-policy report |
| `docs/V17_WORKFLOW_AUDIT.md` | W1–W10 (fixed: W1, W2, W3, W4, W6, W7) |
| `docs/V17_NBA_SIM_DISPERSION_DIAGNOSTIC.md`, `reports/sim-dispersion-diagnostic-2025.json` | variance decomposition + v1 plan |
| `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` | N6 preregistration (look 1) |
| `docs/V20_ACCOUNTS_ARCHITECTURE.md` | accounts design |
| `app/src/lib/sports/nba/roster-{contract,parse}.mjs` + test, `app/scripts/nba/capture-nba-rosters.mjs`, `data/internal/research/nba/rosters/` | free roster owner |
| `app/src/lib/products/selector/{shadow-report.mjs,shadow-report.test.mjs,adoption-gate.test.mjs}`, `app/scripts/products/report-selector-shadow.mjs` | shadow report + gate tests |
| `app/src/lib/products/public-data-boundary.test.mjs` | internal artifacts never under `app/public/data/products/` |
| `app/src/lib/products/product-state.mjs` (`NO_EVENTS`), `app/src/lib/results/read-model.mjs` (`moonshotLedgerRecord`) | off-day state; Moonshot row |
| `app/scripts/products/derive-cycle-table.mjs`, `data/internal/products/cycle-table/latest.json` | receipt-derived cycle table (internal) |
| `.github/workflows/{nightly-settle,daily-products,quality-gate,auto-refresh,sport-schedules}.yml`, `scripts/ci/commit-generated.sh` | see §C and §E |

## J. Exactly what the founder needs to do next

1. **Merge PR #627** (CI green; no selection change). Then confirm production: `/data/build-info.json`
   should report a SHA that is `7d79f38da` or a bot descendant of it, and `/bank-builder/` should render
   "Today's eligible universe".
2. **Decide F1** (the packet's §F1 has the one-line action per option). Everything else about the
   post-Sep-27 products follows from it.
3. **Decide the legacy-Moonshot display question** (0–7 June ledger vs 4–32 fold era) so the frozen-store
   retirement plan can execute.
4. Optional, two minutes: delete `app/public/data/bank-builder/summary-latest.json` and
   `app/scripts/build-active-builder-slip.mjs` (the session could not delete files).
5. Optional: add a permission rule allowing pushes to `main` from this session type if you want future
   overnight sessions to land CI-green work themselves.

---

## K. Production verification (2026-09-22, after the founder merged PR #627)

**`V1.7 FOUNDATION — PUBLIC AND VERIFIED`**

| | |
|---|---|
| Merge | PR #627 merged 2026-09-22T13:40:41Z as `441fefa4b` (parents `442a04d5c` main, `935493d7c` branch head) |
| Production SHA (`/data/build-info.json`) | `20a19a672cf75eb26a2d8cb64c3375be6e0e162b` · builtAt `2026-09-22T14:22:12.832Z` · environment vercel · message "auto: mlb daily production slate 2026-09-22 [skip ci]" |
| Ancestry (git) | `441fefa4b`, `935493d7c`, `7d79f38da`, `07dd568ec` are all ancestors of `20a19a672` (`git merge-base --is-ancestor`); all 25 branch commits are contained. `origin/main` at verification `f2c613dab` (one data commit past production: "auto: daily products 2026-09-22") |
| Deployment evidence (GitHub deployments API, Vercel-created) | `441fefa4b` deployment 6592833224 success (record 14:17:42Z; ≈37 min after merge — matches the founder's 36m52s); `20a19a672` deployment 6593060543 success 14:28:13Z. Failures today: `e545b33fb` (nightly settle 09:25 ET) → `npx vercel inspect dpl_6RvVdMtDxN2ouhekUm8iYCVHM13a --logs`; `1b72585a1` (mlb slate) → `npx vercel inspect dpl_GvugNcRFNRB5sdinKD3BbjDaJWsu --logs` (Phase 3 audit) |
| `/bank-builder/` | "Today's eligible universe · 2026-09-21" (built before the 14:22Z daily-products commit; refreshes on the next deploy), "priced by the sportsbook market with no forecast behind it", **Record 36–35** (the protected record after the 09-21 settlement — the same number on every surface), "Live today"; no "Model pass" / "model discipline" / banned strings |
| `/moonshot/` | eligible universe + caveat; "high variance"; no banned strings |
| `/mr-dub/` | "The record, as settled · The $100 → $10K ladders"; "Bank Builder 36 – 35"; "$16,040 paper profit"; no "$19.5K" / "proven" |
| `/results/` | explorer carries the Moonshot signature-product row (`source: product-ledger/moonshot.json`, 0–7 legacy era) — the row no longer disappears (C2). The hub tile still prints "Road to $10K completed 5–0" and "Settled record 0-7 · separate paper lane" — addressed under the founder's Moonshot-era decision (§L) |
| Off-day state | not observable today (games exist); `NO_EVENTS` is in the deployed code and pinned by `product-state.test.mjs` (10/0) |
| Public assets | `/data/build-info.json` 200 · `/data/search/index.json` 200 · `/data/products/availability/latest.json`, `/data/mr-dub/*.json`, `/data/product-ledger/moonshot.json`, `/data/bank-builder/summary-latest.json` all 404 (read at build time, pruned from the export by design) |
| Live selector / registry on `main` | `bank-builder@1` / `moonshot@2` (policies.mjs unchanged); `MARKET_PRICED_LEG_POLICY.state = ADMITTED_PENDING_FOUNDER_DECISION`; NBA `HISTORICAL_ONLY` |
| Shadow after merge | `daily-products` run 35739675416 (14:20Z, `workflow_run`) built `eligible-legs/2026-09-22.json` and `selector-shadow/2026-09-22.json` at asOf `2026-09-22T14:22:27Z` with **96 eligible legs** (universe sha `2f1a9e2e…`); BB-LEGACY / BB-C1 / BB-C2b placed both lanes (A step 2), MS-* `NO_QUALIFYING_PLAY`. The 13:32Z run (pre-merge code) had no shadow step; no roll-time publication occurred (`nightly-settle` runs 35713168639 … 35738373269 grade/roll only). The premature-publication defect is absent; forward evidence accumulates from 2026-09-22. |

## L. Daytime session (after production verification) — founder decisions implemented, operational audit

Branch `v17-bankbuilder-moonshot-multisport`, PR https://github.com/yashwantbalaji3/gametimepicks/pull/628 (CI result in §M).

### L1. Founder decisions → code (no selection logic, policy constant, registry or model status changed)
| Decision | Implemented | Commit |
|---|---|---|
| **F1 = Option A** (market constructions, truthful labels) | published legs carry `probabilityBasis` (`market-implied` / `model` / null — never assumed) and `impliedProbability` (honest name; `modelConfidence` kept `@deprecated` for settled receipts); cards carry `jointProbabilityBasis`; every Play surface shows "Market construction · priced by the sportsbook market · what the prices imply, not a prediction" and a per-leg "Market-implied" chip; "model-qualified" / "the model skipped" / "model N%" wording removed; `v17-market-construction-labels.test.mjs` (7) + copy guard extended | `8a493afa8` |
| **F2 = HOLD** (evidence defects fixed only) | EPL results capture had stalled since 2026-09-15 (ESPN `dates=A-B` → 400, capture exited 0 → green); month-form capture, exit 4 on provider failure, `epl-settle` turns a refused capture red; P304 track record split by model (v1's 36 rows no longer counted as P304's); `grade-epl-forecasts.mjs` now writes the `control` / `shadowTotals` blocks the forward receipt requires; the 10 stalled P304 fixtures graded from official finals → **forward n 10 of 60, ACCUMULATING** (was 0) — `docs/V17_EPL_EVIDENCE_REPAIR.md` | `4efe54179` |
| **F3 = explicit NO_PLAY** | already shipped in v1.7 (`NO_EVENTS` state + price-based no-play copy); Mr. Dub / today no-play copy repointed in the F1 commit | — |
| **Moonshot eras** | `displayRecord` = the receipt/fold-era record (**4–33 since 2026-08-15**, read from the fold marker); the June 2026 ledger (0–7) is `legacyRecord` behind a labelled `<details>` on /moonshot, /mr-dub, /results and the trust center; the explorer keeps ONE Moonshot row (a second row would sum the eras) | `8a493afa8` |

### L2. Broken automation found and fixed (all green loudly, nobody looked)
- **ESPN dropped the scoreboard date-range form on 2026-09-20** (`400 Failed to get events endpoint.`). Three captures broke at once: NFL schedule and NBA schedule (`sport-schedules.yml` refused daily; runs 35513825563, 35621730109, 35737261812) and EPL results (exit 0 → green). One shared month-window plan (`src/lib/sports/espn-scoreboard-window.mjs`, unit-tested) now serves all three; live dry-runs 16 NFL / 370 NBA events. Commits `0c8b0f56a`, `4efe54179`.
- **`quality-gate` was red on `main` from the v1.7 merge onward** (run 35735059397) on data alone: after Week 3 the NFL forecast windows held one finished game (`latest.json`) and nothing (`frozen-latest.json`), so the Follow entity registry — which named clubs from the WINDOW — resolved 2 of 32 clubs (R1/R2 red; 30 clubs unfollowable on the site). The registry now unions every dated `nfl/forecasts/*.json`. MF1 demanded a live matchup without a forecast to prove non-vacuity — false on a Tuesday when every listed game has a report; proved by probe instead. Commit `0693d290a`.
- **Doubleheader share card claimed the homepage**: the TB @ NYY disambiguation stub (first doubleheader since the built og:url guard) inherited the layout's root `og:url`; it now names its own URL (still noindex, no canonical). Commit `bd359354d`.
- **Sitewide "last refresh" was the dead NBA pipeline's clock** (`meta.lastPipelineRun`, dataMode `ScheduleUnavailable`): the footer now shows the build marker, the methodology page drops its "legacy pipeline run" badge, and with that coupling gone the NBA half of `morning-projections` is gated (`SKIP_NBA` unless `vars.NBA_LEGACY_REFRESH`). Commit `3d1da0cd2`.
- Shadow report regenerated nightly after grading (`nightly-settle`), never hand-kept. Commit `e5efbf42b`.

### L3. Deploy-trigger audit — `docs/V17_DEPLOY_TRIGGER_AUDIT.md` (commit `8f6d8fd6c`)
- `[skip ci]` never reaches Vercel; only `vercel-ignore-build.sh`'s diff decides. 7 days: 503 pushes → 445 builds (53 CODE, 361 DATA, 89 SKIP); every DATA build touched a real build input (337 build-time fs readers bake `app/public/data` into HTML) — **0 unnecessary builds**; a keep-set-aware skip was evaluated and **rejected** (it would have skipped 332 real builds and served stale pages).
- The 15 failures since Sep 18 (0/240 before, 15/206 after) sit in a 46.0–46.4-min band = the **45-min Vercel build ceiling**; local cold build is 117 s for 2,474 pages, so the time is not in our steps — prime suspect the 1.4 GB / 6,667-file export upload (`/mlb` alone 628 MB). **Only the Vercel logs can close this**: the audit lists 14 `npx vercel inspect <dpl> --logs` commands for the founder.
- 53% of builds are superseded before completion (Vercel cancels only queued builds); coalescing sibling bot pushes is the lever.
- Latent hole closed: the build also reads `data/*-projection/` and three `data/internal` paths that the `app/`-only pathspec never saw (fail-toward-build, +4 mutation tests, 0 stale events / 0 extra builds this week).

### L4. Gate on the final daytime tree (`bd359354d`)
lint 0 · unit **6,972 / 0** · tsc 0 · build OK (prune 3,122 files / 981.4 MB) · post-build **606 / 0** (the doubleheader og:url guard now passes). Built export: /bank-builder, /moonshot, /mr-dub carry "Market construction · priced by the sportsbook market · what the prices imply, not a prediction" with per-leg "Market-implied" chips; /moonshot, /mr-dub, /results print "Moonshot 4–33 · since 2026-08-15 · settled receipts" with the June 0–7 era behind a labelled legacy detail; the footer reads "last build …"; no "model-qualified" / "Model pass" / "model discipline" / "$19.5K" / "proven" anywhere on the Play surfaces.

### M. What the founder needs to do next (daytime)
1. **Merge PR #628** (CI status in the chat report) — it carries the founder-decision implementation, the three ESPN-capture repairs, the main-gate repair (R1/R2/MF1), the NBA legacy-pipeline retirement, the EPL evidence repair and the deploy audit. Until it merges, `quality-gate` on `main` stays red on the Tuesday data state and the NFL/NBA/EPL captures keep refusing.
2. **Run the 14 `npx vercel inspect <dpl> --logs` commands** in `docs/V17_DEPLOY_TRIGGER_AUDIT.md` (needs your Vercel login) and paste the build-step timings back; that is the only way to see where the 45 minutes go on the failing builds. Nothing in the repo's own steps takes more than ~2 minutes cold.
3. Nothing else is gated on you today. F1/F2/F3 and the Moonshot-era decision are recorded and implemented; the shadow keeps accumulating (first graded day 2026-09-21; 2026-09-22 published at 14:22Z); NBA remains `HISTORICAL_ONLY`.

## N. Final closeout — `V1.7 FOLLOW-THROUGH — PUBLIC AND VERIFIED`

Production `070365ea3d128b6c58a893d5fbea562123f17429` (the PR #628 merge; builtAt 2026-09-22T15:50:19Z; Vercel deployment 6594908674 success 15:54:50Z) contains all 11 #628 commits and the #627 foundation; `quality-gate` on `main` run 35749838905 success. Full receipt: `docs/V17_RELEASE_HANDOFF.md` §6.3. Next program proposal: `docs/V18_NEXT_PROGRAM_REALITY_CHECK.md`.
