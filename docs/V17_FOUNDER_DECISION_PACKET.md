# v1.7 — Founder decision packet: F1 · F2 · F3

**Prepared:** 2026-09-22 (overnight, Lane A) · **Nothing here is a decision.** Every number is read from a committed
artifact or receipt and cited; where a number could not be verified it says UNVERIFIED. No model status, registry
state, selector, or `MARKET_PRICED_LEG_POLICY` was changed. Each gate ends with the one-line action per option.

Read first, in this order: the forensic audit (`docs/V17_BANK_BUILDER_MOONSHOT_FORENSIC_AUDIT.md`), the replay
receipt (`docs/V17_HISTORICAL_REPLAY_RECEIPT.md`), the eligibility matrix (`docs/V17_SPORT_ELIGIBILITY_MATRIX.md`).

---

## F1 — May a market-priced leg with no forecast owner be a product leg?

### Exact question
Bank Builder and Moonshot currently place legs whose only probability is one bookmaker's de-vigged price. Should they
(A) keep doing so, labelled as such; (B) refuse such legs until a validated forecast owner exists; or (C) split the
concept so a market-construction lane is named as one and a model-owned lane waits for an owner?

### Current behaviour (code)
| Fact | Where |
|---|---|
| `MARKET_PRICED_LEG_POLICY = { state: "ADMITTED_PENDING_FOUNDER_DECISION", gate: "F1", since: "2026-09-21" }` | `app/src/lib/products/eligible-leg/contract.mjs:35-39` |
| A `MARKET_IMPLIED_NO_FORECAST` leg gets the **informational** code `MARKET_PRICED_NO_FORECAST`; it does not refuse | `contract.mjs:74,78,147,180` |
| The **live** selector does not read the contract at all: `accounting.ts` imports `loadMlbTeamLegs` and sets `modelProbability := noVigProb`, `probabilitySource "market-devigged"` | `app/src/lib/daily-portfolio/accounting.ts:27,124,404,490`; `mlb-team-legs.ts` |
| The published leg field is named `modelConfidence` and carries the market number | `accounting.ts:124` (`modelConfidence: p.modelProbability`) |
| Public surfaces already say it: "Every eligible leg today is priced by the sportsbook market with no forecast behind it. A card built from these legs is a market construction; its chance of landing is what the prices imply, not a prediction." | `app/src/components/products/eligible-universe.tsx:28`; pinned by `v17-play-surface-copy.test.mjs:53` |
| Availability artifact reports `marketPricedOnly: true` for MLB | `app/public/data/products/availability/latest.json` (mlb block) |
| No MLB family is a `VALIDATED_MODEL` owner: moneyline **WATCH** (n=699, mean log-loss gain vs coin +0.0099, 95% CI −0.0038..+0.0243), run line **HOLDING** (−0.0344), total **BREACHED** (+0.0336 but flagged) | `app/public/data/admin/model-health.json` families `mlb_moneyline`, `mlb_run_line`, `mlb_total` |

### What the product actually is today
A deterministic construction over one bookmaker's prices, ranked by market-implied joint probability
(forensic §2). It is a **market-construction product**, not a prediction product. The receipt-era results sit
inside the market's own expectation: Bank Builder 16 actual wins vs 14.3 expected under the published joint p;
Moonshot 4 vs 7.6 (`data/internal/products/forensic-v17/baseline.json` → `publishedJointP`). Replay, every policy:
actual ≥ expected (`selector-replay/summary.json`: legacy 32 vs 24.6). Nothing beats the market; nothing is broken.

### Completion arithmetic under the market's own joint p (the only probability the products have)

Bank Builder ladder `app/src/lib/bank-builder-ladder.ts:50-56`: 100→200→700→1400→3500→10000 (required ≈ +100, +250, +100, +150, +186).

| Input (committed) | Value | Source |
|---|---|---|
| Mean published joint p, decided lane-days (n=36) | **0.397** | `baseline.json bank-builder.publishedJointP.mean` |
| By step (derived from `forensic-v17/lane-days.json`, receipt era, decided): step 1 | 0.404 (n=26, 13 won) | lane-days rows `settledStatus ∈ {won,lost}` |
| step 2 · step 3 | 0.378 (n=7, 3 won) · 0.382 (n=3, 0 won) | same |
| Replay mean joint p, legacy policy (71 lane-days) | 0.347 | `selector-replay/summary.json policies.BB-LEGACY.meanJointP` |
| Observed per-step survival, replay legacy · BB-C1 | 0.451 · 0.521 | same, `survivalPerStep` |

Five independent steps at the published mean: **0.397⁵ = 0.0099 ≈ 1.0 % per attempt** (0.347⁵ = 0.5 %; at the
replay's observed 0.451 survival, 0.451⁵ = 1.9 %; at C1's 0.521, 3.8 %). One completion per ~100 attempts; the
receipt era started 26 attempts in 37 product days (two lanes), so ≈ **140 product days per expected completion** at
the observed cadence — roughly a full season. Under a *de-vigged* price the expected value of a cycle is zero by
construction (the de-vig removes the hold); the price actually paid includes the bookmaker's hold, so the realised
expectation is the hold, negative. Observed: 26 cycles, 0 completed, mean furthest step 1.38 (`baseline.json`).

Moonshot ladder `app/src/lib/moonshot/moonshot-ladder.mjs:41-45`: 25→100→400→1000 (+300, +300, +150).
Published joint p: mean **0.210** (n=36); by step 0.200 (n=32) · 0.229 (n=2) · 0.364 (n=2). Three-day completion
≈ 0.200 × 0.229 × 0.364 = **1.7 %** per attempt; 32 attempts, 0 completed, expected 0.5. Moonshot @2 record 4-16;
pre-@2 multi-leg 0-16 (`baseline.json moonshot.decidedByLegCount`).

### Option A — continue admitting, explicitly labelled

| Dimension | Evidence |
|---|---|
| Product identity | Must be stated as a **market-construction** product on every card, not only in the universe strip. Today the leg field is still `modelConfidence` (`accounting.ts:124`) and the skipped card still says "model discipline" / "the model's strongest single legs" (`bank-builder-skipped-card.tsx:31,41`) — the UX audit backlog B-1/M-1 |
| Expected outcome | ≈1 % (BB) / ≈1.7 % (Moonshot) completion per attempt; the record will track the market (63 % vs 60 % implied on market legs, `baseline.json legsByProbabilitySource`) |
| User comprehension / trust | The reader is shown "estimated 44 % combined hit probability" that is the book's number. Honest only if the word "model" is removed from every card and the probability is labelled "what the prices imply" |
| Copy that must change | `modelConfidence` → `marketImpliedProbability` on published legs (additive field first, then rename); skipped-card copy (three older guards pin "model" phrasing — UX audit B-1); a per-card `probabilityBasis` chip (shadow output already carries `probabilityBasis: "market-implied"`, `selector-shadow/2026-09-21.json`) |
| When MLB ends | The product goes dark for lack of a **priced** pool, not for lack of a forecast — see F3. A market construction needs only prices, so postseason slates keep it alive on thin days (2026-09-21: 3 games, Moonshot still placed, forensic §5.3) |
| Engineering | No code change to keep admitting. Labelling changes: `accounting.ts toLeg`, two components, three test guards |
| Risk | Reputational: a "prediction terminal" publishing bookmaker-derived ladders. Charter: allowed only if never called a forecast. Reversible: yes (copy) |

### Option B — refuse market-only legs

| Dimension | Evidence |
|---|---|
| Do the products empty immediately? | **Yes, 100 %.** 2026-09-21 manifest: MLB 18 eligible legs, `marketPricedNoForecastCount: 18` (`data/internal/products/eligible-legs/2026-09-21.manifest.json`). Replay window: mean 72 eligible legs/day, every one market-priced ("no other sport had an eligible leg on any date", replay receipt §1; `summary.json coverage[].eligibleLegs`). The matrix's 90/60/84 sample-day counts are quoted from the receipt only — those manifests are not committed (UNVERIFIED beyond 09-21) |
| How often `NO_QUALIFYING_PLAY` | Every product day until an MLB family becomes `VALIDATED_MODEL` (none is; see model-health above) or another sport reaches `FULL_MODEL` with a validated owner (none does — matrix). No date can be forecast for that |
| How UX explains it | `EligibleUniverse` already renders per-sport reasons (`eligible-universe.tsx`); `publicReasonFor` (`contract.mjs:252`) maps the manifest to plain words. The live pages' no-play states exist (`bank-builder-skipped-card.tsx`, `moonshot/page.tsx:212`) but their copy says "model discipline" / "no low-risk combo cleared a rung" — wrong reason for this state; new sentence needed: "No forecast owner is validated for any sport today; the ladder does not build from prices alone" |
| Dormant vs bookmaker constructions | The forensic's conclusion (§5 BB-1): a product whose inputs are the book's prices cannot, by construction, do better than the book's hold. A dormant ladder makes no claim; a market construction makes a claim the reader may mistake for a forecast. That trade-off is the founder's, not the code's |
| Engineering — the trap | Flipping the constant to `REFUSED` changes **only** the contract/shadow/availability path. The live selector (`accounting.ts:404,490`) would keep placing cards while `/bank-builder` prints "0 eligible legs" above them — a self-contradiction. Option B needs **two** changes: the constant **and** either (i) routing `loadMlbTeamLegs` through `guardLegs`, or (ii) a hard gate in `accounting.ts` that empties the pool when every candidate is market-only. Tests: `contract.test.mjs:34` pins `gate === "F1"` (not the state); `daily-chain.test.mjs`, `bank-builder-cross-lane.test.mjs`, `mlb-team-market-grading.test.mjs` exercise the live pool |
| Reversible? | Constant: trivially. Publication gap: not reversible (days not published are not replayable as products; the shadow ledger would keep running and is unaffected) |
| Risk | Homepage/`/today` word ceiling and Command Center tiers assume a product line exists; a permanent no-play must not read as an outage (`INPUTS_MISSING` vs `NO_PLAY` distinction, `product-state.mjs:80-81,106-107`) |

### Option C — hybrid, only if the contract supports it
The contract **does** already separate the concepts: `forecastClass` (`VALIDATED_MODEL` / `EXPERIMENTAL_MODEL` /
`MARKET_IMPLIED_NO_FORECAST`), `probability` (validated owner only) vs `marketImpliedProbability`, and the shadow
output's `probabilityBasis` (`contract.mjs:45-53,151-155`; `selector-shadow/2026-09-21.json`). So a hybrid needs no
new eligibility logic: a **"Market construction" lane** (today's BB/Moonshot, renamed) and a **"Model-owned" lane**
that publishes `NO_QUALIFYING_PLAY` until a `VALIDATED_MODEL` owner exists. What it does *not* have: any model edge
to put in the second lane — it would be empty on day one and this packet does not invent one. **Any public concept
rename is founder-gated (charter §29.6, cited at `contract.mjs:24`; §29.3/§29.6 text itself is not in the repo —
UNVERIFIED).** Reversible: naming yes; a second lane's routes/ledgers are additive.

### Recommended next experiment / safe default (not a decision)
Safe default = **A with the labelling completed** (rename `modelConfidence`, fix skipped-card copy, add the
per-card basis chip), because it changes no publication and removes the one remaining false word ("model").
Next experiment = keep the Phase H shadow running to its 20-decided-lane-day gate (`shadow.mjs adoptionGate`,
earliest ≈ 2026-10-02) so the founder sees BB-C1 vs legacy on live data before choosing B or C.

### One-line action per option
- **A:** "Keep `MARKET_PRICED_LEG_POLICY.state = ADMITTED…`; ship the labelling backlog (B-1/M-1) as a copy-only change."
- **B:** "Set `MARKET_PRICED_LEG_POLICY.state = "REFUSED"` **and** gate `accounting.ts` on the contract in the same commit; publish the no-owner sentence on both pages."
- **C:** "Approve the concept split ('Market construction' lane + empty 'Model-owned' lane) as a §29.6 change; engineering then renames surfaces without touching selection."

---

## F2 — EPL eligibility: is `VALIDATED_OUT_OF_SAMPLE_HISTORY` in conflict with UNPROVEN / INSUFFICIENT_SAMPLE n=36?

### Finding
**No conflict — the two statements describe disjoint populations, and both are literally true.** The artifact's word
describes a blind *historical* replay of the P304 Elo-Poisson model (3,420 matches, 2013-14 → 2021-22). The lane's
UNPROVEN and the health family's n=36 describe the *live forward* record — and every one of the 36 graded live rows was
forecast by the **previous** model (`epl-model-v1-split-poisson`), not by P304. P304's own forward count is **0 of 60**.
The one real defect is a misattribution: the published `trackRecord` sentence counts those 36 as "graded under this model".

### Reconciliation table

| Item | Artifact claim (`VALIDATED_OUT_OF_SAMPLE_HISTORY`) | Lane / registry verdict |
|---|---|---|
| Written by | `app/scripts/epl/build-epl-forecasts.mjs:355` (`selection.adopted ? "VALIDATED_OUT_OF_SAMPLE_HISTORY" : "NOT_VALIDATED_OUT_OF_SAMPLE"`); gate = `selection.adopted` from `app/src/lib/sports/epl/match-model.mjs:60-87` (replay verdict `ELIGIBLE` + forward not breached + slope reproduces 0.5851) | UNPROVEN: `app/src/lib/sports/sport-assessments.mjs:77` (P189, 2026-08-21/24, written about the **previous** model). `epl_result` n=36: `app/scripts/ops/build-model-health.mjs:61-69` → `app/public/data/admin/model-health.json` family `epl_result` |
| What was validated | P304 `epl-model-v2-elo-poisson`, **1X2** (log loss, RPS, ECE) + over-2.5 "not worse" bar | live 1X2 forecasts of record |
| Population / dates | EPL, held-out seasons 2013-14 → 2021-22, **n=3,420**, two eras 1,900 + 1,520 (`data/internal/research/epl/reports/epl-history-replay-evaluation.json` `results.eloPoisson`) | **n=36** decided live matches, kickoffs 2026-08-21 → 2026-09-14 (`app/public/data/soccer/epl/results/graded-forecasts.jsonl`, 36 lines, all `modelId: epl-model-v1-split-poisson` — verified) |
| Metric | log loss **0.97351**, RPS 0.19997, **1X2 ECE 0.01501**, over-2.5 Brier 0.25021; controls: split-Poisson 0.99376, plain Elo 0.98303, uniform 1.09861. **No 1X2 Brier, no draw-specific metric, no market baseline** (prereg `:41` "No market input") | mean log loss **1.0586**, mean Brier **0.6546**, 15/36 hits (derived from the jsonl). Bar: n ≥ 60 vs even odds (1.0986) → INSUFFICIENT_SAMPLE. On the 30 rows with a pre-kickoff price: model log loss 1.0717 vs market 1.0791 (model ahead), Brier 0.6684 vs 0.6575 (**model behind**) (`data/internal/research/epl/learning/latest.json`, UNVERIFIED by me — agent-read) |
| Bars | 5 preregistered, all PASS (`evaluation.json:375-442`, verdict `ELIGIBLE :443`); the bootstrap bar's upper CI vs plain Elo is −0.0010 — passes by a hair | n ≥ 60 for the live family; P304's own forward protocol also n ≥ 60 (`data/internal/research/epl/forward/receipt.json`: `state ACCUMULATING, n 0, needed 60`) |
| Blind / out-of-sample | Yes by protocol: one `--score` look, refuses if the evaluation exists or the prereg is uncommitted (`scripts/research/soccer/replay-epl-history.mjs:44-59`). Caveat: prereg `registeredAt` 16:30:00Z postdates the evaluation `generatedAt` 16:12:46Z; commits are 19 s apart in the right order — UNVERIFIED which instant scoring used | n/a |
| Market / odds / time-lock owner matches the validation context? | **No.** Validation used no odds. Live odds: `app/public/data/soccer/epl/odds/latest.json` — `public: false`, consensus of 11 US books (no bookmaker named), **file-level** `capturedAt` only (contract needs per-leg capture; `contract.mjs:80` 12 h bound; EPL shadow-run's own bound is **6 h**, `shadow-run.mjs:30,50`). The matrix's "3-day freshness" phrase is **UNVERIFIED** — no such rule found in code | same |
| Registry | `app/src/lib/sport-capability-registry.ts:137-141`: `epl` = `EXPERIMENTAL_PUBLIC`; reason text still says "exact-Poisson match forecasts … has not beaten the market out of sample" (stale: names the old model and a test P304 did not run) | `canEnterPredictionProducts` = `FULL_MODEL` only (`:193-195`) → `SPORT_NOT_ELIGIBLE` + `FORECAST_EXPERIMENTAL` (`normalize-epl.mjs:23`, `contract.mjs:145`) |
| Forward evidence for P304 today | ~23 P304 forecasts of record (2026-09-17/18/19 files) for kickoffs 09-18 → 09-20 sit **ungraded**: the results capture stopped at 2026-09-15 (`soccer/epl/results/latest.json generatedAt 2026-09-15T01:10:22Z`). Grading also requires `CURRENT_PRE_EVENT`, which requires odds ≤ 6 h old — a stale capture day produces forecasts that can never enter the forward test | — |

### Is "validated forecast" sufficient for "product leg" under current policy?
**No, on three independent grounds, even if the founder accepts the historical receipt:**
1. Policy: product legs need `FULL_MODEL` (registry) — a registry promotion is itself founder-gated (matrix §F2).
2. Contract: an eligible leg needs an owned price with bookmaker + per-leg capture instant + receipt (`contract.mjs` rules 4,
   `oddsForSide` all-four-or-`PRICE_UNAVAILABLE`); the EPL odds file has neither a bookmaker nor per-fixture capture.
3. Evidence hygiene: the validation had no market baseline, and the only live P304 sample is zero.

### Remaining gaps (fix regardless of decision; none changes a status)
| # | Gap | Where |
|---|---|---|
| G1 | `trackRecord` counts 36 v1 rows as "graded under this model" | `build-epl-forecasts.mjs:316-334` counts the whole ledger; `forward-receipt.mjs:17-18` already filters on `modelId`/`adoptedAt` — reuse it |
| G2 | Results capture stalled 2026-09-15 → P304 forward n stays 0 | `soccer/epl/results/latest.json`; grader `grade-forecasts.mjs:38` |
| G3 | Stale prose: `sport-assessments.mjs:77` (P189, old model), `sport-capability-registry.ts:140-141` | comment/evidence list only |
| G4 | Odds README promises per-row `capturedAt` and no totals; artifact ships file-level capture and totals | `soccer/epl/odds/README.md:17-19` |
| G5 | "3-day freshness" in the matrix — UNVERIFIED | `docs/V17_SPORT_ELIGIBILITY_MATRIX.md:12` |
| G6 | §29.3 cited, defined nowhere in the repo | `V17_SPORT_ELIGIBILITY_MATRIX.md:12` |

**Repair status 2026-09-22 (F2 = HOLD; no status changed):** G1 fixed — `build-epl-forecasts.mjs` now derives `trackRecord` from a per-`modelId` split (`app/src/lib/soccer/epl-graded-by-model.mjs`; v1 rows kept as a labelled prior bucket, P304 figures null at n = 0). G2 root-caused — ESPN rejects the date-RANGE scoreboard form with HTTP 400 since 2026-09-16 (runs 35042672207 → 35675723968 all green on `SOURCE_STALE` + exit 0); capture now asks per month and exits 4 on a source failure, `epl-settle` raises it red after the commit, `epl-matchweek` reports a notice. G7 (new): the workflow's grader never wrote the `control` block the forward receipt reads — fixed via shared helpers. Recovery: 10 P304 fixtures (09-18 → 09-20) graded from official finals; ledger 36 → 46 (v1 36, P304 10, all 10 with control); forward receipt n 0 → 10/60 `ACCUMULATING`. Odds time-lock limitation recorded, not fixed. Details: `docs/V17_EPL_EVIDENCE_REPAIR.md`.

### Recommended next experiment (not a decision)
Do **not** move the registry. Unstall the results capture, let P304 accrue its own forward sample under its
preregistered protocol (n ≥ 60), and add a per-fixture odds capture instant so a leg *could* be time-locked. Revisit
F2 when `epl_forward_match_model` reports a state other than `ACCUMULATING`.

### One-line action per option
- **Hold (default):** "EPL stays `EXPERIMENTAL_PUBLIC`; fix G1–G4; revisit at forward n ≥ 60."
- **Promote:** "Founder promotes `epl` to `FULL_MODEL` on the historical receipt alone" — **this packet records that the
  contract's price rules would still refuse every EPL leg until per-fixture capture exists, so promotion changes nothing
  in the products today and creates a public claim with zero live evidence.**

---

## F3 — The post-MLB gap: what do the products do from 2026-09-28?

### Calendar (as the repo knows it)

| Window | Fact | Source |
|---|---|---|
| MLB regular season ends | **2026-09-27** | matrix §F3; handoff §5; `mlb/statsapi-schedule/` cached through 09-27 |
| MLB postseason | thinner slates (1–4 games/day); prices exist (DraftKings feed) so a *market construction* can still place; exact dates **UNVERIFIED** in repo | forensic §5.3 (09-21: 3 games, Moonshot placed) |
| NFL Sun/Mon/Thu | `EXPERIMENTAL_PUBLIC`; live gate `permitsProductLeg ⇔ VALIDATED_PICK`, never emitted; 2026-09-21: 1 event considered, 0 qualify | `app/public/data/nfl/product-eligibility.json`; `sport-capability-registry.ts:150-159` |
| UFC Saturdays | `SCAFFOLD_ONLY`; no model; 24/24 legs refused (`SPORT_NOT_ELIGIBLE`, `MISSING_IDENTITY`, 23 `STALE`) | `eligible-legs/2026-09-21.manifest.json` ufc block; registry `:82-90` |
| EPL | unresolved (F2); 0 eligible; next fixtures Oct 3–4 per matrix | above |
| NBA preseason | **2026-10-03** (MIA @ TOR); experimental-only, registry `HISTORICAL_ONLY` | `docs/V17_NBA_READINESS_RECEIPT.md:12`; registry `:70-72` |
| NBA regular season | **2026-10-20**; still needs preregistration + validation receipt before any product leg | NBA receipt `:15,80` |

So from 2026-09-28 the eligible universe is **MLB postseason, market-priced only**, shrinking to zero on off-days and
after the World Series; no other sport can enter without a status change that this packet does not make.

### Fallback product states — what each requires in code

| Fallback | Behaviour | Already rendered? (file) | Gap |
|---|---|---|---|
| **1. Explicit no-play / insufficient universe** (the truthful default under any F1 outcome) | `EligibleUniverse` shows 0 eligible with a plain reason; the card area says no card and *why*; the state badge is `NO_PLAY`, not "Waiting on today's data" | `/bank-builder`: `EligibleUniverse` (`page.tsx:477`) ✅; no-play panel (`page.tsx:496-511`) renders `BankBuilderSkippedCard` whose copy says "model discipline … no low-risk two-leg team-market combo" ❌ wrong reason on an empty-universe day; `INPUTS_MISSING/STALE` branch says "Waiting on today's data" ❌ wrong on an off-day. `/moonshot`: `SlateLivenessBanner` ("No slate", `slate-liveness-banner.tsx:102`) + "No card is placed today…" (`page.tsx:212`) ✅ | The generator already distinguishes `NO_EVENTS` ("the <date> slate holds no games", `input-availability.mjs:64-68`, wired via `accounting.ts:28`) from `INPUTS_MISSING`; the **page** state machine does not (`product-state.mjs:80-81` collapses both to "Waiting on today's data"). Fix = one new branch in `product-state.mjs` + one sentence in `bank-builder-skipped-card.tsx`; guards `v17-play-surface-copy.test.mjs` and the three older "model pass" pins need repointing (UX backlog B-1) |
| **2. Postseason-only market construction** (only if F1 = A or C) | Products keep placing on postseason slates; cards carry the market-construction label; thin-slate concentration handled by the existing `CONCENTRATION_TOO_HIGH` reason (shadow) / 1-leg-per-game rule (live) | Live path needs no change; shadow already declines Lane B on a 1-game slate (shadow receipt §4) | The live selector has **no** no-play floor (forensic §5.3 "never declines one that reaches the rung price, however thin the slate"). A relative floor exists only in shadow (BB-C2b). Adopting it is Phase H, not tonight |
| **3. No publication rather than forced weak cards** | Skip the day even when a construction reaches the rung price | Not implemented on the live path | Requires adopting a floor policy (BB-C2b/MS-C1) through the preregistered adoption gate; the replay showed an *absolute* floor is unreachable for market cards (BB-C2 published 2/74 days) — only the relative floor is a candidate, and it has no historical score by design |
| **4. Off-season dormancy** | State `OFF_SEASON` with the league's own reason | State exists in the lifecycle machine (`daily-lifecycle-derive.mjs:60-61`, `daily-state-machine.mjs:56,73`) and is derived for NBA from the results capture (`build-daily-product-receipts.mjs:257-268`); **not** derived for MLB (no MLB `OFF_SEASON` source) | An MLB season-end owner (StatsAPI schedule "no games until <date>") is needed before the products can say "off-season" rather than "no games today" every day of November |

### What must not happen
- No silent promotion of NFL/UFC/EPL/NBA to fill the gap (all gated; the contract carries their candidates and will
  admit them the day a status legitimately changes — matrix "What this means").
- No re-widening of Moonshot to 3+ legs to find a +300 pair on a 2-game slate (MS-C2 rejected: 0.225 survival).
- No "Waiting on today's data" on a day that genuinely has no games (that is an outage label, not a no-play label).

### Safe default (not a decision)
Ship fallback 1 (copy + one state branch) before 2026-09-28 regardless of F1; keep the shadow running through the
postseason (its receipt already says `INSUFFICIENT_CANDIDATES` is the expected state); build the MLB off-season
owner (fallback 4) before the World Series ends. Fallbacks 2 and 3 follow the F1 answer and the Phase H gate.

### One-line action per option
- **No-play default:** "Approve the no-play copy/state fix as a copy-only change; products publish `NO_PLAY` with the universe reason from 09-28."
- **Postseason construction:** "Confirm F1 = A/C; products continue on postseason slates under the market-construction label; no floor until Phase H adopts one."
- **Go dark:** "Confirm F1 = B; both products publish the no-owner sentence daily until a validated owner exists; shadow continues."

---

## Founder decisions recorded — 2026-09-22

| Gate | Decision | Consequences implemented (objective, reversible, in-program) | Not changed |
|---|---|---|---|
| **F1** | **Option A (transitional).** Market-priced / no-forecast legs stay admitted; every surface presents them as MARKET CONSTRUCTIONS, never as GameTimePicks model predictions. | truthful-labelling backlog: `probabilityBasis` on published legs/cards, "model confidence" / "model-qualified" wording removed from the Play surfaces, market-construction chips beside the probability (see the v1.7 handoff §L for the diff) | selection logic; `MARKET_PRICED_LEG_POLICY` stays `ADMITTED_PENDING_FOUNDER_DECISION` (the constant names the state; the decision is this row) |
| **F2** | **HOLD.** EPL stays `EXPERIMENTAL_PUBLIC`; no product eligibility. Revisit only when the preregistered forward requirement is met. | evidence defects repaired independently: P304 graded-count separation from the v1 rows; the stalled results capture (`docs/V17_EPL_EVIDENCE_REPAIR.md`) | registry, model status, odds capture (paid path) |
| **F3** | **Explicit `NO_PLAY` approved.** With no legitimate eligible universe, publish a truthful no-play reason — never stale/waiting/forced selections. Postseason market-priced candidates may continue under the truthful label while F1 = A. No forced plays to keep daily activity. | `NO_EVENTS` state (shipped in v1.7); no-play copy repointed to price language; the generator already publishes nothing when nothing qualifies | no forced-card logic exists and none is added |
| **Moonshot legacy history** | The receipt/fold-era record is the primary current record; the 0–7 June ledger era is collapsed behind clearly labelled legacy detail; eras are never combined into one headline. | `displayRecord` prefers the fold-era record and exposes `legacyRecord`; /moonshot, /results (hub + explorer), trust center, /mr-dub updated | the receipts themselves; pending never a loss |
