# v1.7 — Product store ownership graph (Phase 8.1) + cycle-table prototype (Phase 8.4)

**Date:** 2026-09-22 (overnight, Lane A) · **Status:** inventory + migration plan · **nothing deleted, nothing moved**
**Method:** every reader/writer/test/workflow reference grepped under `app/src`, `app/scripts`, `.github/workflows`;
paths confirmed on disk under `app/public/data/`. Every claim cites file:line. Where a number is quoted it is read from
the artifact, not from a receipt's prose.

## 1. Stores on disk

| # | Store (under `app/public/data/`) | Size | Stamp in file | Last mtime | Top-level shape |
|---|---|---|---|---|---|
| S1 | `methodology/launch/dual-bank-builder-active.json` | 150,619 B | no `generatedAt`; `run.date = 2026-06-18` | 2026-08-17 10:11 | `meta`, `run{currentStep, cycle, laneA, laneB, settlement, lifecycle}` |
| S2 | `moonshot-lane/active.json` | 78,704 B | `generatedAt 2026-08-17T14:00:00Z` | 2026-08-17 10:16 | `status, currentStep, ladder[], candidates, lanes, …` |
| S3 | `products/lifecycle/latest.json` | 3,633 B | `generatedAt 2026-09-07T10:35:27Z` | 2026-09-07 | `settled:1, held:3, positions{4}, settledIndex:4, cards:4, withheldWrite` |
| S4 | `bank-builder/summary-latest.json` | 838 B | `generatedAt 2026-09-21T16:01:49Z`, `lastSettledDate 2026-09-20` | 2026-09-21 | optimizer ladder: `record, currentBankrollUnits, currentProgressionStep, nextPick` |
| S5 | `bank-builder/public-summary-latest.json` | 737 B | `generatedAt 2026-06-14T13:10:00Z`, `runStatus: completed` | 2026-06-14 | `record (5–0), currentBankrollUnits, ladder, completedAt` |
| S6 | `mr-dub/daily-portfolio.json` | 8,392 B | `date 2026-09-21`, `generatedAt 2026-09-21T16:01:40Z` | 2026-09-21 | `activeBankroll, crownBankroll, openExposure, products, lanes[], settlement, note` |
| S7 | `mr-dub/settled/<date>.json` | 37 files, 2026-08-15 → 2026-09-20 | per-file `settledAt` | 2026-09-21 | `date, settledAt, source, lanes[4], record` (write-once) |
| S8 | `mr-dub/portfolio.json` | 13,599 B | `generatedAt 2026-07-07T18:00:00Z` (the fold rewrites the body, not the stamp) | 2026-09-21 | `record, currentBankroll, crownBankroll, protectedFold, moonshot, …` |
| S9 | `mr-dub/banked-ladders.json` | 2,671 B | `bankedAt 2026-06-25T16:00:00Z`, `crownTotal 20465.4` | 2026-06-30 | `historicalRecord{13-3}, ladders[2] (June 9–13, June 18–24)` |
| — | `app/src/lib/products/ladder-position.mjs` | module | — | — | reads S7 only (`RECEIPTS_REL`, :36) |

## 2. Writers and the workflow step that invokes them

| Store | Writer (file:line) | Scheduled by |
|---|---|---|
| S1 | `app/scripts/build-step2-dual-bank-builder.mjs:112,177`; `app/scripts/settle-daily-portfolio.mjs:201`; `app/scripts/restart-both-lanes-{0628:32,0701:41,live,0721}.mjs`; `restart-lane-a-0706.mjs`; `replace-lane-b-soccer.mjs`; `replace-step2-mlb-leg.mjs`; `manual-0627-late-rebuild.mjs`; `project-and-launch-today.mjs:171` | **none** — no `.github/workflows/*.yml` invokes any of them; `settle-daily-portfolio.mjs` runs only from `scripts/settle_soccer_day.sh:95`; no workflow `git add`s `app/public/data/methodology/` |
| S2 | `app/scripts/restart-both-lanes-live.mjs:430`; `restart-both-lanes-0721.mjs:271` (`activate-moonshot-candidates.mjs:35` names the path, never writes) | **none**; not in any commit allowlist |
| S3 | `app/src/lib/products/ladder-settlement.mjs:301-302` (dated file + `latest.json`, only when `--apply` and ≥1 new settlement) via `app/scripts/products/settle-ladder-cards.mjs:50` | `nightly-settle.yml:263` "Settle the Bank Builder ladder and Moonshot lane" (cmd :268), committed :684 — it grades **S1/S2** (frozen 2026-08-17), so it has produced nothing new since 2026-09-07 |
| S4 | `app/scripts/build-bank-builder-ledger.mjs:87` (reads `parlays/snapshots/<date>` + `parlays/graded/<date>`, selects with `selectPlus100BuilderSlip`) | `nightly-settle.yml:413` "Update Bank Builder ledger" (cmd :417), committed :681 |
| S5 | `app/scripts/archive/build-public-bank-builder.mjs:71` | **none** (archived script) |
| S6 | `app/scripts/activate-daily-portfolio.mjs:52` (primary); `app/scripts/mr-dub/fold-protected-era.mjs:77` (rewrites `activeBankroll`/`availableBankroll` only) | `daily-products.yml:177` "Generate daily products" (:183 dry / :186 apply), committed :303; `nightly-settle.yml:297` "Roll the daily portfolio forward" (:302), committed :719 |
| S7 | `app/scripts/settle-mlb-player-props.mjs:345` (write-once; :336-344 refuses a differing rewrite) | `nightly-settle.yml:217` "MLB player-prop settlement (paper lanes)" (:237 dry, :239, :246 catch-up), committed :714 |
| S8 | `app/scripts/mr-dub/fold-protected-era.mjs:63` (the authorized automated writer, invariant-guarded :30/:58); also `settle-daily-portfolio.mjs:202`, `build-mr-dub-ledger.mjs:505` (manual only — `nightly-settle.yml:260` mentions the latter in a comment, never runs it) | `nightly-settle.yml:280` "Fold settled receipts into the protected record (Rule S)" (:285), committed :711 |
| S9 | **no writer anywhere** (`restart-both-lanes-live.mjs:13` declares it read-only) | n/a — but see §6 D1 |

## 3. Readers (mounted = reachable from a public route under `app/src/app`)

| Store | Reader (file:line) | Mounted on |
|---|---|---|
| S1 | `lib/parlays/ui-loader.ts:337` `readActiveLaunchedRun` (returns the run when `run.status ∈ {launched, settled}` and `date ≥ run.date` — i.e. **forever** after 2026-06-18) | `/`, `/today`, `/bank-builder`, `/moonshot`, `/mr-dub`, `/mlb`, `/build`, `/launch` |
| S1 | `lib/bank-builder/review-card.ts:28` | `/bank-builder` |
| S1 | `lib/daily-portfolio/accounting.ts:325`, `bank-builder-generation.ts:32,60` (`readLaneRungs` fallback — used only when receipts are unknown, :445) | generation chain |
| S1 | `lib/bank-builder-results.ts:32` `getBankBuilderSettledSteps` (steps with `status === "settled"`) → `results-trust-center.ts` | `/results` |
| S1 | `lib/game-detail-product-tags.ts:35` (tags legs of the `active` step — none is active in a frozen store) | `/games/[sport]/[gameId]` |
| S1 | `lib/world-cup/world-cup-specials.ts:1710` | `/world-cup-specials` (archive route) |
| S1 | `components/bank-builder/dual-ladder-board.tsx:64` | **unmounted** (zero non-test importers) |
| S1, S2 | `lib/products/ladder-settlement.mjs:36-37,124,173` | settler (S3 writer) |
| S2 | `lib/moonshot/moonshot-lane.ts:151,157` `loadMoonshotLane`; `components/moonshot/moonshot-lane-tracker.tsx` (its :115 comment calls this the LEGACY store) | `/moonshot` (page :18), `/mr-dub` (:46,:72,:191), `/data/build/explorer-slate.json` route :15, `/launch` |
| S2 | `lib/game-detail-product-tags.ts:45` | game detail |
| S3 | `lib/products/lifecycle-view.ts:34-35` → `LifecycleRecord` | `/bank-builder` (:26, :438, :564), `/moonshot` (:31, :121, :246), `/mr-dub` (:32), `results-trust-center.ts:42` → `/results` |
| S3 | `lib/products/product-state-view.mjs:32` (`divergences`, staleSince "2026-08-17" :54-62) | `/bank-builder` reconciliation block :522-547 |
| S4 | `lib/data-bank-builder.ts:55` `loadBankBuilderSummary` | **unmounted** — only caller is `lib/bank-builder-public-source.test.mjs:14`; `app/scripts/build-active-builder-slip.mjs:17` reads it but no workflow runs that script |
| S5 | `lib/data-bank-builder.ts:111` `loadPublicBankBuilderSummary` | `/` (page.tsx:126-127, `crownRung` from `currentBankrollUnits`), `/today` (:191-192), `/bank-builder` (:151-153: `currentBankroll`, `rec` — the record label itself was repointed to S8 in v1.7, :154-163), `lib/bank-builder-official-candidate.ts:21,72` |
| S6 | `lib/mr-dub/daily-portfolio.ts:109`; `results-trust-center.ts:203`; `product-state-view.mjs:30`; `mr-dub/master-ledger.ts:147`; `mr-dub/open-exposure.ts:36`; `money-integrity.ts:20`; `mr-dub/page.tsx:113` | `/`, `/today`, `/bank-builder`, `/moonshot`, `/mr-dub`, `/results`, `/launch`, `/ops` |
| S7 | `lib/products/ladder-position.mjs:119` (`readReceipts`), `accounting.ts:441,494` (`receiptPositions`), `mr-dub/protected-invariant.mjs:43,51` | `/bank-builder` (:29, :300-309), `/moonshot` (:28, :251), generation, fold gate |
| S8 | `page.tsx:83`, `today/page.tsx:172`, `results/page.tsx:117`, `bank-builder/page.tsx:160`, `mr-dub/page.tsx:68`, `moonshot/page.tsx:63`; libs `accounting.ts:194`, `flagship.ts:349`, `master-ledger.ts:78`, `product-allocation.ts:80`, `results-trust-center.ts:202`, `results/read-model.mjs:128`, `product-state-view.mjs:31`, `protected-invariant.mjs:50,70`; `achievement-banner.tsx:16`, `mr-dub-today-card.tsx:17` | every public money surface |
| S9 | `bank-builder/page.tsx:78`; `achievement-banner.tsx:17`; `bank-builder/crown-summary.ts:29`; `mr-dub/flagship.ts:351`; `accounting.ts:203`; `money-integrity.ts:19,35` | `/`, `/bank-builder`, `/mr-dub`, `/results`, `/ops` |

## 4. Tests that pin each store (would need repointing or deletion on retirement)

| Store | Tests (under `app/src/`) |
|---|---|
| S1 | `lib/balanced-risk-generation.test.mjs:85`, `bank-builder-candidate-not-placed.test.mjs:29`, `bank-builder-card-lock.test.mjs:7`, `bank-builder-lifecycle.test.mjs`, `bank-builder-next-steps.test.mjs:23,87`, `bank-builder-same-day-settle.test.mjs`, `bank-builder/public-dual-ladder.test.mjs`, `bank-builder/review-card.test.mjs`, `june19-moonshot-lane.test.mjs:117`, `june20-same-day-only.test.mjs:18`, `lifecycle-automation.test.mjs`, `model-qualified-props.test.mjs:129`, `production-integrity.test.mjs`, `products/ladder-settlement.test.mjs`, `world-cup-closeout.test.mjs:82`, `world-cup/bank-builder-proposal-settled.test.mjs`, `components/june21-premium-ui.test.mjs:22`, `bank-builder/june19-dual-ladder-board.test.mjs:5`, `june23-readiness-settlement.test.mjs:53` |
| S2 | `balanced-risk-generation.test.mjs:114`, `june20-same-day-only.test.mjs:22`, `moonshot/moonshot-candidate-safety.test.mjs:38`, `products/ladder-settlement.test.mjs:196`, `products/moonshot-state.test.mjs:313`, `world-cup-closeout.test.mjs:91`, `world-cup/world-cup-specials{,-preview}.test.mjs:298/281`, `worldcup-player-prop-{cards:97,visual:104}.test.mjs`, `moonshot-tracker.test.mjs:4` |
| S3 | `products/lifecycle-view.test.mjs`, `lifecycle-clock-simulation.test.mjs`, `lifecycle-coverage.test.mjs`, `lifecycle-registry.test.mjs`, `moonshot-state.test.mjs`, `launch/incident-register.test.mjs`, `launch/founder-token-boundary.test.mjs`, `products/ladder-settlement.test.mjs` |
| S4 | `lib/bank-builder-public-source.test.mjs:3,14` (the only one) |
| S5 | `bank-builder-public-state.test.mjs:18,114`, `bank-builder-step{4,5}-{candidate,settlement,target}.test.mjs`, `dual-bank-builder.test.mjs:12`, `june13-*.test.mjs`, `june17-june16-settlement.test.mjs:53`, `ufc250-settlement.test.mjs:59`, `world-cup-flex.test.mjs:25`, `bank-builder-public-source.test.mjs:3` |
| S6 | 20+ (`products/daily-chain.test.mjs`, `daily-receipts.test.mjs`, `mlb-team-market-grading.test.mjs`, `mr-dub/fold-commit-allowlist.test.mjs`, `money-integrity.test.mjs`, …) — canonical, stays |
| S7 | `products/ladder-position.test.mjs`, `daily-chain.test.mjs`, `daily-production-commit-scope.test.mjs`, `mr-dub/protected-fold.test.mjs` — canonical, stays |
| S8 | 85 files; load-bearing: `mr-dub/protected-fold.test.mjs`, `fold-commit-allowlist.test.mjs`, `money-integrity.test.mjs`, `record-family-separation.test.mjs`, `health-check.test.mjs`, `results-trust-center.test.mjs` — canonical, stays |
| S9 | `bank-builder-card-lock`, `bank-builder-lifecycle`, `bank-builder/crown-record-visibility`, `health-check`, `june16-launch-polish`, `money-integrity`, `mr-dub/flagship`, `mr-dub/fold-commit-allowlist:29`, `parlays/risk-ladder:171` — canonical, stays |

## 5. Classification

| Store | Class | Why |
|---|---|---|
| S7 `mr-dub/settled/*` | **canonical live owner — settlement truth** | write-once nightly receipts from official box scores; the only input to `ladder-position.mjs` and the Rule S fold |
| S8 `mr-dub/portfolio.json` | **canonical live owner — protected record + bankroll** | nightly fold, invariant-guarded (`protected-invariant.mjs`); owner of `record` per `record-families.ts:57` |
| S6 `mr-dub/daily-portfolio.json` | **canonical live owner — today's publication** | daily generator output; rung from S7 since P255 (`accounting.ts:441-445`) |
| S9 `mr-dub/banked-ladders.json` | **historical archive (append-only, no writer)** | the two June completed ladders and the July-era base; feeds crown/achievement copy |
| S1 `dual-bank-builder-active.json` | **actively contradictory** | frozen 2026-08-17 (`run.date` 2026-06-18) yet still read on 8 routes; `positions` derived from it in S3 disagree with the receipts (`product-state-view.mjs:54-62`; rendered as "an older store still reads step N" at `bank-builder/page.tsx:533-537`) |
| S2 `moonshot-lane/active.json` | **actively contradictory** | frozen 2026-08-17; `/moonshot` renders a "Legacy open cards / Legacy stranded stake" reconciliation from it (`moonshot/page.tsx:154-185`); `moonshot-state.mjs` exists to reconcile it |
| S3 `products/lifecycle/latest.json` | **compatibility layer over S1/S2 (frozen with them)** | its only input is S1/S2; `settled:1, cards:4, settledIndex:4` all dated 2026-08-17; `withheldWrite` documents that it deliberately does not touch S8 |
| S4 `bank-builder/summary-latest.json` | **dead — regenerated nightly, read by nothing mounted** | a second product also called "Bank Builder" (optimizer ladder, `record` in the file is its own) with zero public readers |
| S5 `bank-builder/public-summary-latest.json` | **historical artefact still mounted** | frozen 2026-06-14 (`runStatus: completed`); `/` and `/today` compute `crownRung` from its `currentBankrollUnits`; `/bank-builder` reads `currentBankroll`/`rec` from it (:152-153) but the visible record label was repointed to S8 in v1.7 |

## 6. Retirement candidates — safe-cleanup criteria, checked one by one

Criteria: (a) no public/live reader needs it · (b) no canonical history lost · (c) history retained/archived · (d) canonical owner supplies every field · (e) production results unchanged except removal of contradictory copy · (f) rollback straightforward.

| Candidate | (a) | (b) | (c) | (d) | (e) | (f) | Verdict |
|---|---|---|---|---|---|---|---|
| **S4 `bank-builder/summary-latest.json`** + its writer step (`nightly-settle.yml:413-417`) + `loadBankBuilderSummary` (`data-bank-builder.ts:55`) + `bank-builder-public-source.test.mjs` | ✅ zero mounted readers | ✅ its history is the parlay snapshots/graded files it derives from, which stay | ✅ `bank-builder/ledger-<date>.json` files already exist as dated copies | ✅ nothing public reads its fields | ✅ no rendered output changes | ✅ one workflow step + one loader + one test; the script stays in the tree | **MEETS ALL SIX** — recommend the orchestrator retire the *workflow step* and the loader; keep the script file and dated ledgers as archive. Note `app/scripts/build-active-builder-slip.mjs:17` also reads it and is run by nothing — delete or leave, no production effect. |
| S1 + S2 + S3 (frozen trio) | ❌ 8 mounted routes read S1, 4 read S2, 4 read S3 | ⚠ S1 carries June–Aug step legs/settlement that exist nowhere else in receipt form (S7 starts 2026-08-15; S3 graded 4 of its cards) | needs archive move first | ❌ receipts cannot supply pre-08-15 steps, `review-card`, `crownRung` inputs, or the game-detail tag map | ❌ removes rendered blocks (reconciliation, legacy tiles, `/results` Bank Builder steps) | ⚠ multi-file | **does NOT meet (a)(d)(e) tonight** — migration plan §7 |
| S5 `public-summary-latest.json` | ❌ `/`, `/today`, `/bank-builder`, `bank-builder-official-candidate.ts` | ✅ (June ladder also in S9) | ✅ | ⚠ `crownRung`/`currentBankrollUnits` could come from S8 `currentBankroll` but that is a *different number* (S5 = the completed June ladder's final; S8 = live bankroll) — a semantic change, not a repoint | ❌ | ✅ | **not tonight** — founder should say what `/` and `/today` mean by "crown rung" |

Discrepancies found while checking (no action taken):
- **D1** `fold-commit-allowlist.test.mjs:29` asserts S9 is "never auto-committed" but inspects only `nightly-settle.yml` (:15); `daily-products.yml:303` does `git add app/public/data/mr-dub/` (whole directory). Moot while S9 has no writer; a guard with a blind spot nonetheless.
- **D2** `app/scripts/products/build-daily-product-receipts.mjs:281` reads `<repo>/data/picks/mr-dub/settled/<date>.json`; `data/picks/` does not exist, so `progressionFresh` (:284-286) is always `false`. UNVERIFIED whether any consumer keys off it.
- **D3** `ui-loader.ts:337-345` returns the S1 run for *every* date ≥ 2026-06-18, so a store frozen in August is "active" on every page load by design of the reader, not by the data.

## 7. Migration plan for the frozen trio (S1, S2, S3) — for the orchestrator/founder, not executed

**Founder-gated piece first:** the *legacy Moonshot era display* (0–7 product-ledger vs 4–32 lanes, `moonshot/page.tsx:154-185`, UX backlog M-2) is a public-concept change; everything below assumes the founder chose "collapse behind history".

| Step | Exact change | Tests pinning current behaviour |
|---|---|---|
| 1 Archive | `git mv` S1 → `app/public/data/archive/methodology/launch/dual-bank-builder-2026-08-17.json`, S2 → `archive/moonshot-lane/active-2026-08-17.json`, S3 → `archive/products/lifecycle/2026-09-07.json` (dated files under `products/lifecycle/` already exist). Add all three to the prune allowlist exclusion so the export does not ship them | `daily-production-commit-scope.test.mjs`, `ops/commit-generated.test.mjs` (allowlists) |
| 2 `/results` steps | `bank-builder-results.ts:32` → read `mr-dub/settled/*` via `laneSteps` for the receipt era; June–Aug steps come from the archived S1 (read-only, labelled "pre-receipt era") or are dropped with an explicit "receipts begin 2026-08-15" line | `results-trust-center.test.mjs` |
| 3 `/bank-builder` | delete the reconciliation block :522-547 and `deriveBankBuilderState`'s S3 read (`product-state-view.mjs:32,54-62`); `LifecycleRecord` (:564) takes `cards` from a receipt-derived builder (`clearedDetailFromReceipts` already exists, `receipt-lane-display.ts`) instead of `settledCardsFor(bbLedger)`; drop `review-card.ts:28` S1 read (review mode has had no source since 08-17) | `bank-builder-flagship-ui.test.mjs`, `products/lifecycle-view.test.mjs`, `bank-builder/review-card.test.mjs`, `v17-play-surface-copy.test.mjs:28-44` (must keep passing unchanged) |
| 4 `/moonshot`, `/mr-dub` | `loadMoonshotLane` → null-safe removal on `moonshot/page.tsx:18,:154-185` and `mr-dub/page.tsx:46,72,191`; `MoonshotLaneTracker` unmounted; `deriveMoonshotState` loses `lane`/`productLedger` inputs; explorer route `data/build/explorer-slate.json/route.ts:15` drops the S2 read | `products/moonshot-state.test.mjs:313`, `moonshot-tracker.test.mjs`, `moonshot/moonshot-candidate-safety.test.mjs:38` |
| 5 game tags, ui-loader | `game-detail-product-tags.ts:35,45` → read today's `daily-portfolio.json` active lanes; `ui-loader.ts:337` `readActiveLaunchedRun` → return null (or delete with its callers) | `bank-builder-candidate-not-placed.test.mjs`, `bank-builder-next-steps.test.mjs`, `june20-same-day-only.test.mjs` |
| 6 generation fallback | `accounting.ts:445 readLaneRungs(root)` (S1 fallback when receipts unknown) → replace with "held" (no card) — receipts have been known every day since 2026-08-15 | `bank-builder-cross-lane.test.mjs`, `products/daily-chain.test.mjs` |
| 7 workflow | delete `nightly-settle.yml:263-268` (settle-ladder-cards over S1/S2) and its `git add` at :684; keep `settle-ladder-cards.mjs` + `ladder-settlement.mjs` in the tree until step 3 lands | `lifecycle-automation.test.mjs`, `products/ladder-settlement.test.mjs` (delete or point at the archived fixture) |
| 8 rollback | `git revert` of one commit; the archived files are byte-identical to the originals | — |

Every June-era test file above (`june13-*`, `june19-*`, `june20-*`, `june21-*`, `june23-*`, `world-cup-*`) reads a fixture that will move; they either repoint to `archive/` or are deleted as era guards — an orchestrator call, listed here so none is deleted by surprise.

## 8. Phase 8.4 — receipt-derived cycle table (prototype, internal only)

**Script:** `app/scripts/products/derive-cycle-table.mjs` (read-only; reuses `laneSteps`/`readReceipts` from `ladder-position.mjs` and the two ladder constants). **Output:** `data/internal/products/cycle-table/latest.json` (`dataClass: internal-research`; not rendered anywhere). Run: `cd app && npx tsx scripts/products/derive-cycle-table.mjs --write`.

**Answer: yes, with one convention that must be stated.** Receipts alone give cycle id, start, end/open, result, steps, cards, source receipts, and no-play *counts*. They do **not** give no-play *reasons* (a no-play lane in a receipt is `{result: "pending", legs: []}` with no note — the reason lives only in `daily-portfolio.json` versions, i.e. the forensic reconstruction, and in the private `data/internal/products/receipts/<date>.json`).

| Product | Cycles (rule-derived) | Lost | Completed | Open | Furthest (rule) | Furthest (as published) | Placed / decided lane-days | No-play lane-days (receipted) |
|---|---|---|---|---|---|---|---|---|
| Bank Builder | 21 | 20 | 0 | 1 (Lane B, won Step 1 on 09-20) | max 4 · mean 1.71 | max 3 · mean 1.48 | 36 / 36 | 38 |
| Moonshot | 32 | 32 | 0 | 0 | max 3 · mean 1.13 | max 3 · mean 1.13 | 36 / 36 | 38 |

**Why 21 and not the forensic's 26:** `positionFromReceipts` carries a won payout forward regardless of what was published, so the four Bank Builder cycles that span the frozen-rung era (2026-08-18 → 09-09, audit S1/P255) merge under the rule: e.g. `bank-builder:A:2` = won 08-17 (step 1) → won 09-06 (published step 1, rule step 2) → lost 09-07 (published step 1, rule step 3). The forensic counts those as 26 cycles with 5 truncations (`baseline.json cyclesTruncatedByFrozenRung: 5`); 26 − 5 = 21 reconciles. **A rule-derived "furthest step 4" inside a divergent cycle is a counterfactual** — the card was priced for Step 1 and never cleared a Step-4 goal — so the artifact carries both `furthestStep` (rule) and `furthestPublishedStep`, flags `publishedStepDivergences` per cycle (4 Bank Builder cycles), and any public rendering must use the *published* step with the divergence disclosed. Moonshot has zero divergences.

**Eras (explicit):**

| Era | Range | What exists | In the table as |
|---|---|---|---|
| `RECEIPTED` | 2026-08-15 → 2026-09-20 | 37 write-once receipts | cycles derived |
| `PENDING_SETTLEMENT` | 2026-09-21 | 3 placed lane-days awaiting the nightly receipt | counted, never a loss |
| `UNRECEIPTED` | 2026-06-23 → 2026-07-14 | 29 placed lane-days with no receipt (forensic `lane-days.json`, publication side only); outcomes exist only as ledger events in the July protected base | **count only — not reconstructed** |
| `LEDGER_ONLY` | June 9–13, June 18–24 | 2 completed ladders in `banked-ladders.json` (multi-sport, operator process) | listed from the ledger, never merged with receipt cycles |

Cross-check against `forensic-v17/baseline.json`: Moonshot 32/32/0 and mean furthest 1.13 match exactly; Bank Builder lost 20, completed 0, open 1 match; cycle count differs only by the truncation convention above.

## Retirement receipt (2026-09-22 overnight)

S4 `bank-builder/summary-latest.json`: the nightly writer no longer emits it (`app/scripts/build-bank-builder-ledger.mjs`), `loadBankBuilderSummary` is removed, and `bank-builder-public-source.test.mjs` pins both. The dated ledger files keep writing because the internal `/launch` ledger panel reads `ledger-latest.json` (`src/lib/launch/ledger-panel.mjs:27`) — a reader §6 above missed. Two files are left on disk for the founder to delete (this session may not delete files): the stale `app/public/data/bank-builder/summary-latest.json` (unread, never shipped) and the unscheduled `app/scripts/build-active-builder-slip.mjs` that reads it.
