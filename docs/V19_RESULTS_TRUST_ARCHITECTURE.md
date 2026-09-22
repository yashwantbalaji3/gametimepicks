# v1.9 — Results & Trust architecture (Phase 6): inventory → canonical projection → UX hierarchy

**Date:** 2026-09-22 (overnight, Lane A) · **Status:** inventory + target design; no surface changed.
**Direction constraint:** "sports broadcast × analytics terminal" — a scoreboard and a ledger, not a casino, not SaaS, not
glassmorphism. Every number below was read from the committed artifact it cites (not from a receipt's prose).

---

## 1. Inventory — every public results/record surface and its backing owner

Legend: **D** = derives from settled events · **C** = copies a precomputed record field · window = date range the number covers.

### 1a. Product / money records (the "official paper record" family)

| Route · renderer | Source artifact · loader | D/C | Settlement semantics · grader | Pending / push / void | Window · n | Eras mixed? | Contradiction |
|---|---|---|---|---|---|---|---|
| `/` · `page.tsx:271` "Record 35–34", `:387` RecentResultsStrip | `mr-dub/portfolio.json.record` · inline `fs` `page.tsx:83` | C | Rule S fold: `fold-protected-era.mjs` over `mr-dub/settled/*`; only `won/lost` enter W/L (`protected-fold.mjs:56-58`) | `pendingLabel` `page.tsx:88-89`; pending never folded | base 2026-07-07 (19-14, `protected-fold.mjs:32`) + fold 2026-08-15→09-20 (37 days) · 69 settled | **Yes**: July base (multi-sport, operator era) + MLB receipt era | **C9** fallback: `recordLabel` seeded from `crown?.recordLabel` (`page.tsx:80`) → a portfolio read failure prints **"Record 5–0"** |
| `/today` · `today/page.tsx:267`, `:421` | same · inline `fs` `today/page.tsx:172` (duplicate) | C | same | `:177-180` | same | same | duplicated reader (**C10**) |
| `/results` Trust Center · `trust-center.tsx:150,156,159` | same · `results-trust-center.ts:207` | C | same | "pending is not a loss" copy `trust-center.tsx:384,419`; `toRecord` zero-fills | same | same | prose still says 19-14 (`results-trust-center.ts:13,18`, `trust-center.tsx:10`) |
| `/bank-builder` · `climb-hero.tsx:224` | same · inline `fs` `bank-builder/page.tsx:158-164` (third duplicate) | C | same | voids appended to label `:164` | same | same | proof strip **"5–0 · 5–0"** (`page.tsx:87` → `climb-hero.tsx:263`, from `banked-ladders.json` steps) sits directly beneath "Record 35–34"; `public-summary-latest.json` (frozen 2026-06-13) still drives `completed`/`onTheCrownRun` booleans (`:155,168,194`) |
| `/mr-dub` · `mr-dub/page.tsx:207`; KPI via `flagship.ts:223` | `portfolio.json` + `daily-summary.json` + master ledger · `flagship.ts:355` | D, then **reconciled to** `portfolio.record` (`flagship.ts:155-159`) | same | `DailyDay.voids/pending` separate (`flagship.ts:39`) | since 2026-06-09 | Yes | "35–34 · $16,165 profit" pairs a Bank-Builder-only record with a bankroll that also deducts Moonshot seeds (audit S10) |
| `/moonshot` · `page.tsx:169` "Settled cards"; `/mr-dub/page.tsx:184`; `/results` `trust-center.tsx:284` | `product-ledger/moonshot.json` (7 rows) · `moonshot-state.mjs:239-249` `ledgerRecord` → `displayRecord :350-355` | D | no wired settler (`MOONSHOT_HAS_WIRED_SETTLER`) | contradictions listed, not resolved (`moonshot/page.tsx:186-190`) | **2026-06-23 → 07-06 · 0–7** | **Yes — and the wrong era wins**: `portfolio.moonshot.record` = **4–32** (fold era, `protected-fold.mjs:125`) is loaded (`results-trust-center.ts:279`) but never printed; `displayRecord` prefers the product ledger because "the portfolio block describes a single World Cup card" — true of `moonshot.legacy.record` (0–1), false of the post-fold block | **C1** — 36 settled Moonshot lanes (−$800 of bankroll) invisible on every public surface. **C2** `read-model.mjs:128-131` looks for `moonshot.record` in a file whose keys are `[productId, results]` → row silently skipped on `/results` explorer |
| `/bank-builder` (nothing renders) | `bank-builder/summary-latest.json` **30–37**, step 4, $1,665.94 · `data-bank-builder.ts:55` | C | optimizer ladder `build-bank-builder-ledger.mjs` (nightly) | — | through 2026-09-20 · 67 picks | separate product | **C3** third "Bank Builder" record, regenerated nightly, read by nothing mounted (see `docs/V17_PRODUCT_STORE_OWNERSHIP.md` §6) |
| `/build` · `build/page.tsx:92-102`, `parlay-lab-entry.tsx:226,256`; `/results` `risk-ladder-stream.tsx:28`, `results/page.tsx:427` | `parlays/risk-ladder/latest.json` · `risk-ladder.ts:149,162` | C | `build-risk-ladder.mjs` | `pending` per tier; `pushes` out of `decisive` | 2026-05-25 → 09-21 · 84 days · **346–1429** (low 180-260 · med 77-367 · high 58-386 · longshot 31-416) | policy change 2026-08-17 inside the window | **C4/C5**: `lab-ledger.priorPolicy` labelled "Before the 2026-08-17 selection change" but `lastDay 2026-09-21`, `gradedDays 84`, **346–1429** — byte-identical to the current overall; rendered at `parlay-lab-entry.tsx:256` |
| `/results/parlay-lab` · `page.tsx:81,121`; `/cards/[sport]` `:123` | `parlays/lab-ledger.json` + `lab-settled/<date>` · `lab-record.ts:70` | C | `build-lab-ledger.mjs` | refuses 0-0 → "nothing settled" (`:29,41`) | policy v2 since 2026-08-17 · mlb 20–68 (33 d), epl 3–5 (7 d), ufc 1–10 (4 d) (agent-read, UNVERIFIED by me) | no | two "Lab records" on adjacent routes, no cross-reference |

### 1b. Model-performance records (money-independent)

| Route · renderer | Source · loader | D/C | Grader | Push / void | Window · n | Notes |
|---|---|---|---|---|---|---|
| `/results` hero · `results/page.tsx:422-428`, `results-hero.tsx:105,109` | `parlays/optimizer-summary.json` · `results-breakdown.ts:209` | D (sum over `byPublicSection.lifetime`) | `pipeline/grade_optimizer.py` | pushes separate, out of `decisive` (`:225`) | era gate `PUBLIC_PARLAY_RESULTS_START_DATE = "2026-05-27"` (`public-parlay-era.ts:33`) · published 346–1429 / generated pool 856–3865, 242 pending (agent-read) | |
| `/results` MLB receipts · `trust-center.tsx:474-489`; `/results/mlb` (re-export of `/mlb/results`) | `mlb/results/lifetime_summary.json` · `data-mlb-results.ts:37,46` | C | `pipeline/mlb/settle_mlb_results.py` → `export_mlb_results.py` | decisive = Win+Loss; Push, Void counted separately (`settle_mlb_results.py:230-242`); void reasons `:370,447` | 2026-05-16 → 09-20 · **45,550 decisive · 22,890–22,660 · 50.25 %** · `partial: true`, `pendingDates: ["2026-06-16"]` | the "hit rate" here is leg-level model-lean accuracy, not a product record |
| `/results/nba` · `results/nba/page.tsx:175,190` | `results/lifetime_summary.json` · `settlement-data` | C | `pipeline/export_results.py:104-131` | pushes excluded | **frozen** 2026-05-15 → 06-13 · 3,635 · 1,784–1,851 · 49.08 % | `HISTORICAL_ONLY`; honest |
| `/results/nfl` · renders artifact verbatim | NFL week reconciliation · `week-report-data` | C ("Nothing is computed here" `:10`) | `build-nfl-week-reconciliation.mjs` | range semantics ("hit" = final inside the printed range) | per week | not a W/L |
| `/results/picks`, `/results/picks/[sport]` · `picks/page.tsx:74,113` | `<sport>/graded-picks.json.counts` · `graded-picks-loader.ts:39` | C | `build-graded-picks.mjs` | `voided` separate; rate only for `ASSESSABLE`/`EMERGING`; empty ⇒ `null` never `0-0` | mlb 22,890–22,660 (45,550 counted, 2,770 voided) · nfl 32–27 (59, 2 void) · ufc 25–16 (41) · epl 15–21 (36) | **no `/results/epl` or `/results/ufc` route exists**; those live here and on `/epl`, `/ufc` |
| `/results/model-audit`, `/results/date/[date]`, `/` "How yesterday went" (`yesterday-card.tsx`) | per-artifact | C / D-per-date | various | push labelled "excluded from hit rate" (`date/[date]/page.tsx:312`); yesterday card refuses to add two producers' figures (`:62`) | per artifact / one day | fine |
| research model receipts | `admin/model-health.json` renders **only** on `/ops` (`ops/page.tsx:94-104,248`, route classed internal) | C | `build-model-health.mjs` | — | per family `state` + `n`; `wins/losses/hitRate` fields null (UNVERIFIED whether intentional) | invisibly gates public pages (`game-detail.ts:480-483`, `top-reads.ts:165`, `command-center/model-status.ts:58`, `featured.ts:93`) |

### 1c. Verified non-surfaces
| Surface | Finding |
|---|---|
| **Ask GameTime** (`app/src/lib/ask/**`) | **No tool, prompt or help entry serves a product record** — repo grep for `portfolio.json|mr-dub|bank-builder|moonshot|hit rate|track record` under `src/lib/ask` (non-test) returns nothing. The only "record" is *recorded fact* / head-to-head counts copied from the owner. Keep it that way until the projection in §2 exists; then Ask reads the projection, never an owner |
| `/live`, `/my`, "Since your last visit" | per-event deltas only (`since.mjs:29` whitelist); no aggregate record |
| `/research`, `/research/lab` | prose only |

### 1d. Cross-cutting contradictions (numbered for the backlog)
| # | Contradiction | Where |
|---|---|---|
| C1 | Moonshot: 4–32 (fold era) loaded, 0–7 (June ledger) printed | `results-trust-center.ts:279` vs `:377`; `moonshot-state.mjs:344-355` |
| C2 | Moonshot row dropped from `/results` explorer (wrong key on wrong file) | `results/read-model.mjs:128-131` |
| C3 | Three "Bank Builder" records: 35–34 (protected), 5–0 (June ladders/frozen summary), 30–37 (optimizer ladder, unrendered) | §1a |
| C4/C5 | Two Lab records; `priorPolicy` window runs 35 days past the policy change | `lab-ledger.json priorPolicy`; `parlay-lab-entry.tsx:256` |
| C6 | "19-14" prose in 7 non-test sites; one ships into a prediction receipt (`prediction-factory.mjs:167`); `flagship.ts:9` says "17–10" | listed by grep |
| C7 | Three open-exposure figures (0 / 225 / daily) — disclosed with eras (`results-trust-center.ts:143-148`) | ok |
| C8 | Record hole 2026-07-08 → 08-14 (base `asOf 07-07`; fold starts 08-15) never stated; forensic `manifest.json gaps` lists placed lane-days on 07-10, 07-11, 07-14 — whether they are inside the 19-14 base is **UNVERIFIED** | `protected-fold.mjs:25-32`; `portfolio.json.protectedFold.days[0]` |
| C9 | Homepage prints 5–0 on a portfolio read failure | `page.tsx:80` |
| C10 | Four copies of the portfolio-record reader; `record-families.ts:53` names an owner but exports no reader | `page.tsx:83`, `today/page.tsx:172`, `bank-builder/page.tsx:158`, `results-trust-center.ts:51` |

---

## 2. Target — the Canonical Results Projection

```
SETTLEMENT / RESULT OWNERS (unchanged; each keeps its own truth)
  mr-dub/settled/<date>.json        (product lanes, write-once, official box score)
  mr-dub/portfolio.json             (protected record + bankroll, Rule S)
  mlb/results/*, results/* (NBA), nfl week reconciliation, <sport>/graded-picks.json
  parlays/risk-ladder + lab-ledger  (Parlay Lab)
  admin/model-health.json           (model families: state + n only)
            │  read-only, dated, cited
            ▼
CANONICAL RESULTS PROJECTION   public/data/results/projection/latest.json  (+ <date>.json, write-once)
  one builder: app/scripts/results/build-results-projection.mjs
  aggregates SETTLED truth only; owns NO forecast; stores NO number an owner does not already carry;
  every cell = {value, n, window{from,to}, owner{path, generatedAt}, semantics{pending,push,void}, era}
            │
            ▼ consumers read the projection, never an owner, for any "record" they print
  Overall (Home/Today tile) · Sport (MLB/NBA/NFL/EPL/UFC) · Market (moneyline/run line/total…)
  Forecast receipt (model family state+n) · Bank Builder history (cycle table) · Moonshot history
  Today-Home strip · Ask GameTime (read-only tool over the projection)
```

Rules of the projection (each becomes a pinned test):
1. **Never owns a forecast, never a probability** — only graded outcomes and their owners' states.
2. **No mega-record.** There is no cell that sums Bank Builder + Moonshot + Lab + model leans. Sport, product and model
   families stay separate (`record-families.ts` already names four families; the projection is its reader).
3. **Every cell carries its window, its n, its era, and its owner path + generatedAt.** A cell without an owner is not
   emitted; a consumer that cannot find a cell prints nothing, never `0-0` (`graded-picks-loader.ts:44-46` already
   does this — generalise it).
4. **Pending is a count, never a loss; push/void are counts, never decisive.** Semantics are copied from the owner's
   own rule and named in the cell (`aggregate_outcomes`, `protected-fold.mjs:37,56`).
5. **Eras are typed**, never blended silently: `PROTECTED_BASE` (multi-sport operator era, 19-14), `RECEIPT_ERA`
   (MLB, 2026-08-15→), `UNRECEIPTED_GAP` (2026-07-08→08-14), `LEDGER_ONLY` (June ladders), `HISTORICAL_ONLY` (NBA
   May–June), `POLICY_V1`/`POLICY_V2` (Lab). A blended figure (35–34) is allowed only with its era composition beside it.
6. **One reader.** `lib/results/projection.ts` replaces the four inline `fs` copies (C10) and the read-model's key
   lookup (C2). The homepage fallback becomes "no figure" (C9).
7. **Write-once, dated**; the builder refuses to rewrite a dated file that differs (the `settle-mlb-player-props.mjs:336-344`
   pattern), so a projection is replayable and a bot cannot silently restate history.

What it fixes by construction: C1 (both Moonshot eras present, typed; the surface picks by era, not by "which file
wins"), C2, C3 (30–37 is an *optimizer-ladder* family cell or is not emitted at all), C4/C5 (the Lab's two windows
become two cells with explicit `policy` fields), C6 (prose numbers come from cells), C8 (the gap is an era cell),
C9, C10. What it does not fix: the founder-gated questions in `docs/V17_FOUNDER_DECISION_PACKET.md`.

---

## 3. UX hierarchy — simple first, progressive disclosure

| Level | Question the reader asks | Surface | Cell(s) | Disclosure |
|---|---|---|---|---|
| 0 | "Is anything settled yet today / since I looked?" | Home strip, `/today`, `/my` | yesterday card (one owner at a time), since-last-visit deltas | already correct; never sums producers |
| 1 | "What is the record?" | Home tile, `/results` top | **one** headline per family, each labelled with its noun: *Bank Builder ladder record 35–34 (paper) · MLB lean hit rate 50.3 % (45,550 leans) · Parlay Lab cards 346–1429* | tap → level 2 |
| 2 | "This sport / this product?" | `/results/<sport>`, `/bank-builder`, `/moonshot`, `/results/parlay-lab` | sport or product cells with window + n; Moonshot shows **both eras** (0–7 June · 4–32 receipt era), Bank Builder shows the cycle table (`docs/V17_PRODUCT_STORE_OWNERSHIP.md` §8) | era chips, "why two numbers" one-liner |
| 3 | "Recently?" | same pages | rolling 7/30-day cells with n; hidden when n < the family's own bar | never a % under the bar (already the `/results/picks` rule) |
| 4 | "What is pending / pushed / void?" | same | counts, never inside W/L | copy exists (`trust-center.tsx:384,419`) |
| 5 | "Why should I trust this?" | `/results` receipts block | owner path, generatedAt, settlement source ("official box score"), model-family state + n from model-health — **state words only, no accuracy number** | link to the owner artifact |

Visual register: scoreboard typography, monospace ledgers, era chips, no gradients/blur, no "profit" tiles on the
front door (`page.tsx:77-79` already says so). The existing a11y gate and P185 role tokens apply unchanged.

---

## 4. Metrics discipline — one word per thing

| Metric | Definition | Owner exists? | Stable? | Public? |
|---|---|---|---|---|
| **Forecast record** (model lean hit rate) | graded leans, decisive = win+loss, per sport/market, with n | yes (`mlb/results`, `graded-picks`) | yes | yes — never called "win rate"; label "lean hit rate · n" |
| **Product / slip record** | settled cards or lanes W–L per product | yes (`mr-dub/settled`, `lab-ledger`) | yes | yes — label with the product noun; **Bank Builder only** for the 35–34 |
| **Cycle completion** | ladders completed / attempted, furthest published step | yes (receipts; prototype `derive-cycle-table.mjs`) | yes once the published-step convention is fixed (§8 of the ownership doc) | yes, as a table, not a % |
| **Leg hit rate** | legs won / legs decided inside product cards, by market & price bucket | yes (`forensic-v17/baseline.json`, receipts) | yes | maybe — only beside its market-implied comparator (63 % vs 60 %) so it is not read as edge |
| **Calibration** (ECE, log loss vs baseline) | model family vs preregistered bar | yes (`model-health.json` states) | yes | **state word only** (WATCH/HOLDING/BREACHED/INSUFFICIENT_SAMPLE); the number stays on `/ops` until a family passes its bar |
| **MAE / range coverage** | NFL 80 % ranges, MLB totals | yes (`nfl_player_*` families) | yes | as "8 in 10 inside the range" phrasing only |
| **Realised bankroll accounting** | paper bankroll, crown, open exposure, by era | yes (`portfolio.json`, `banked-ladders.json`) | yes | yes, labelled "paper"; never beside a W–L that covers a different product set (audit S10) |
| "Accuracy" / "win rate" | — | — | — | **banned as a generic label**; each of the above has its own word |

Recommend making public **now**: forecast record (leg-level, with n), product record (per product, with era), cycle table.
Recommend keeping internal **until a family clears its bar**: any calibration or Brier figure, any "vs market" number.
Never public: a blended cross-family total.

---

## 5. Sequence (for the orchestrator; nothing executed tonight)
1. Builder + reader + tests for the projection (rules 1–7), consumers untouched.
2. Repoint the four record readers (C10) and the read-model (C2); fix the homepage fallback (C9).
3. Moonshot: print both eras (C1) — needs the founder's word on the legacy-era display (UX M-2).
4. Lab: split the two windows into two labelled cells (C4/C5).
5. Cycle table onto `/bank-builder` and `/moonshot` history from the receipt-derived artifact (published-step convention).
6. Retire the frozen stores per `docs/V17_PRODUCT_STORE_OWNERSHIP.md` §7 (founder-gated piece first).
7. Ask GameTime: one read-only tool over the projection, refusing any question the projection has no cell for.
