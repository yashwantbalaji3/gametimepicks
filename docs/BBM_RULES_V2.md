# Bank Builder & Moonshot · `bbm-rules@2` (leg construction)

Status: **PROPOSED**. Code: `app/src/lib/challenge-lanes/rules-v2.mjs`; tests: `rules-v2.test.mjs`. The founder directive of
2026-11-04 (~18:10Z) asked for this rebuild. Nothing in this document is applied to any lane until the founder approves it.
Every value marked PROPOSED is a founder-approval parameter; code never widens one. `bbm-rules@1` (`lanes.mjs
selectLaneCards`, the frozen file's tier card) stays in the code and remains the record of every run-1 event.

## 1. Rules

| | Bank Builder | Moonshot |
|---|---|---|
| Ladder (step targets) | $100 → $200 → $500 → $1,250 → $3,125 → $10,000 | $25 → $50 → $100 → $200 → $400 → $1,000 |
| Multiplier at the base | 2.0 · 2.5 · 2.5 · 2.5 · 3.2 | 2.0 · 2.0 · 2.0 · 2.0 · 2.5 |
| Legs per step | 1 or 2 (hard) | 1 or 2 (hard). **Never 5.** |
| Steps | 5 | 5 |

- Lanes A and B are independent: each has its own log, bankroll and step.
- **Position.** Each step starts from the lane's actual tracked bankroll. Required multiplier = step target ÷ bankroll.
- **Carry-forward.** The settled gross payout carries forward unchanged. For example, $52.40 at Moonshot step 2 needs 1.908×, and $47.60 needs 2.101×.
- **Advancing.** A step advances only once settled. LOST stays LOST, and a restart needs the founder's approval.
- A bankroll at or above the step's target is refused (`TARGET_ALREADY_MET`) and never re-staked.
- **Completion.** After step 5, a payout at or above $10,000 (or $1,000) is COMPLETE. Below that is FINISHED_SHORT, which is v1's semantics. Inside the band (from 90% of the target) FINISHED_SHORT is possible, so how to treat it is a founder decision.
- **No qualified card:** the lane is HELD with code `NO_QUALIFIED_CARD`, and every candidate's reasons are listed.

## 2. Algorithm

1. **Legs.** Candidates come from the frozen suggested-cards file's own NBA game-winner legs: the official side and its frozen probability.
   - No re-forecast.
   - No probability derived from a median.
   - Props stay excluded, because gate 0ce4b94208 failed.
   - Founder option, not on: also use the other side of each game (p = 1 − official p).
2. **Candidates.**
   - Every single.
   - Every 2-leg pair from different games. With 14 legs that is 14 + 91 = 105 sets.
3. **Price.** One book prices every leg of a candidate.
   - The book is the first eligible operator, in the allowlist's fixed order, that prices them all. Prices are never shopped across books.
   - Combined price = the **calculated leg product**, using the exact ratio. No book-quoted parlay exists in the h2h snapshot.
4. **Money.** gross = ⌊bankroll × combined ratio⌋, floored to the cent. profit = gross − bankroll.
5. **Probability.**
   - Joint p = the product of the leg p's, under the stated assumption: **independent, different games, no dependence modelled**.
   - p_low uses each leg's calibration half-width: max(0, p − h).
   - EV = p·D − 1 and EV_low = p_low·D − 1, where D is the combined decimal price.
6. **Gates.** A candidate qualifies only with **zero** reasons.

   | Gate | Refusal code | Rule |
   |---|---|---|
   | Sport policy | `SPORT_POLICY` | NBA game winners only |
   | Forecast validity | `FORECAST_INVALID`, `FORECAST_GUARD` | 0 < p < 1, a forecast receipt sha, guard pass/review |
   | Injury/status | `INJURY_STATUS` | Rule A per product: OUT everywhere, R1 in Bank Builder. Plus any post-freeze status override |
   | Calibration | `CALIBRATION_MISSING`, `UNCALIBRATED` | Evidence must exist for the leg's model, with status QUALIFIED |
   | Sample/data quality | `SAMPLE_TOO_SMALL` | n ≥ 200 graded games (PROPOSED) |
   | Sample/data quality | `MODEL_MARKET_GAP` | \|model p − the book's no-vig p\| > 0.15 (PROPOSED): a data-quality refusal, not an edge |
   | Price and availability | `PRICE_UNAVAILABLE` | One book prices every leg |
   | Price and availability | `BAD_ODDS` | Unparseable price, or the two-way implied total is below 1 |
   | Market thresholds | `MARKET_THRESHOLD` | Leg decimal in [1.05, 6.0], and ≥ 3 eligible books quote the side (PROPOSED) |
   | Freshness | `MARKET_STALE` | Snapshot ≤ 90 min old at evaluation (PROPOSED) |
   | Freshness | `STARTED` | No leg has started |
   | EV | `NEGATIVE_EV` | EV ≤ 0 |
   | EV | `EV_NOT_ROBUST`, `EV_UNCERTAINTY_UNKNOWN` | Default gate: EV_low > 0 (PROPOSED) |
   | Correlation | `CORRELATED_SAME_GAME` | Different games only; same-game needs a provider-quoted price, and none exists |
   | Leg count | `LEG_COUNT_EXCEEDED` | At most 2 legs |
   | Payout band | `OUT_OF_BAND` | Gross within target × (1 ± 0.10) (PROPOSED). Bank Builder step 1: $180–$220. Moonshot step 1: $45–$55 |
   | A/B | `DIVERSIFICATION` | Only lane B: no game shared with lane A |

7. **Ranking.** Only qualified candidates are ranked. Keys, in order:
   1. EV_low, in 1-pp buckets (calibrated EV);
   2. fewer legs (forecast reliability: fewer modelled outcomes, and no independence assumption);
   3. \|gross ÷ target − 1\| (closeness to target);
   4. snapshot time (freshness);
   5. candidate id (determinism).

   Payout size and leg count are never rewarded. `rankingDigest` hashes the ranking, so the same inputs in any order give the same sha.
   Correlation risk is zero for every qualified candidate, since same-game candidates are refused.
8. **A/B.** Lane A takes rank 1 at its own position. Lane B is evaluated at **its own** position, with A's games excluded.
   B takes its rank 1 among candidates that passed **every** gate, or B is HELD. B is never a weaker card picked just to differ.
   If A is HELD, B is evaluated without exclusion.

## 3. Candidate audit (one row per candidate, per lane and step)

Each row records:
- `candidateId` (sha of rules, product, step, legs and sides);
- the legs: id, game, team, start, model p, modelId and forecast sha;
- the book, capture time and snapshot sha;
- each leg's American and decimal price, implied and no-vig p, and books quoting;
- the combined price {method `CALCULATED_LEG_PRODUCT`, decimal, American, exact ratio};
- p joint, p low, the assumption and break-even;
- stake, gross and profit; EV and EV_low; target deviation;
- `qualified`, `reasons[]`, and `rank`.

Audits contain prices, so they are **private** (`~/gtp-evidence/bbm-v2/betting-engine/nov04/v2/phase-b.json`) and never committed.

## 4. Phase B · Nov 4 step 1 on the noon snapshot `4b0d48d2…` (no new spend)

Evaluated at 18:00Z, both products at step 1 (Bank Builder $100 → target $200; Moonshot $25 → target $50).
- 105 candidate sets; 91 priced. CLE @ OKC has no h2h in the snapshot.
- **No single lands in either band.**
- **18 two-leg pairs** land in each band.

| Calibration input | bb-a | bb-b | ms-a | ms-b |
|---|---|---|---|---|
| **As is: no calibration evidence for `nba-preseason-experimental-v0.1`** | HELD | HELD | HELD | HELD |
| Hypothetical sensitivity: QUALIFIED, n = 500, h = 0.05 | DET + SA | HELD | ATL + NY | DET + SA |
| Hypothetical: point EV only (h = 0) | DET + SA | HELD (CHA + SA shares SA) | ATL + NY | DET + SA |

- **As is**, all four lanes are HELD with `NO_QUALIFIED_CARD`. Every candidate carries `CALIBRATION_MISSING`.
- The hypothetical rows are **not** results. They show what the gates would do if nba-engine-eval supplies QUALIFIED calibration evidence.
- The v1 bb-b card (CHA + LAL) is refused for `NEGATIVE_EV` and for `MODEL_MARKET_GAP` on LAL.
- `MODEL_MARKET_GAP` also fires on PHX and LAC.
- Price-derived numbers (break-even, no-vig, EV) are in the private audit only.

### 4a. P-EV-1 (nba-engine-eval: p = no-vig consensus, Elo weight 0), assessed

nba-engine-eval found the NBA Elo winner chance not calibrated: forward ECE 0.102 at n 107, and versus no-vig, Δ log loss +0.088 with a 95% interval of [+0.0002, +0.183]. P-EV-1 therefore proposes taking p from the market.

It is implemented as `probabilitySource: NO_VIG_CONSENSUS` (PROPOSED, off by default):
- p is the median over eligible books of each book's multiplicative de-vig.
- p_lo is the lowest de-vig.
- The model gate drops out, and Elo only picks the side.

Inside this EV gate, P-EV-1 is a pure line-shopping rule, and its lower-bound form can never qualify anything:
- The offering book is one of the books in the minimum, so p_lo ≤ that book's own de-vig.
- That de-vig × the book's own decimal = 1 ÷ its overround, which is below 1 for any book with a margin.
- So EV_lo < 0 for every single, and for every 2-leg product (each factor is below 1).
- That holds even if a different book were shopped. A quote whose two sides imply less than 100% is already refused as `BAD_ODDS`.
- With a point-EV gate (`evGate: POINT`), EV > 0 exactly when the fixed book's price beats the consensus fair price. That is a line-shopping edge, not a forecast.
- `rules-v2.test.mjs` proves both properties.

On the Nov 4 noon snapshot, the free re-run gives 0 of 91 priced candidates with positive EV in either form. This holds with or without the model–market gap gate, so all four lanes are HELD.

Under P-EV-1, Bank Builder and Moonshot would therefore post only when the fixed book is out of line with the market, which is rare and small. So the practical choice for the founder is:
- (a) hold NBA winner legs until a model passes the pre-registered bar (n ≥ 300, ECE ≤ 0.05, and a Δ log loss upper bound below 0 versus the market); or
- (b) explicitly approve a no-edge product where p = consensus and EV ≤ 0 is disclosed. That would relax the negative-EV refusal, so it can only be the founder's call.

## 5. Migration and rollback (PROPOSED; founder approval per step)

Today's run-1 cards are frozen, priced and IN_PLAY under v1, and they were **not posted**.

**Retire run-1 (per lane).** `withdrawAndRetire` appends exactly two events and rewrites nothing:
1. `STATUS WITHDRAWN_RULES_CHANGED`. It carries {date, step, cardEventSha256, payoutEventSha256, rulesFrom `bbm-rules@1`, rulesTo `bbm-rules@2`, approvalRef}.
   - It means: never published, so it is not a stake.
   - Step and bankroll are unchanged.
   - `day.staked = false` and `day.withdrawn = true`.
   - The PRICE_VERIFIED and PAYOUT_COMPUTED events stay in the log.
   - Later LEG_SETTLED events for those legs are record only. No STEP_SETTLED follows.
2. `STATUS RETIRED_SUPERSEDED` {nextRunId, approvalRef}. It is terminal.

Withdrawal is refused if the card was POSTED, if any leg has settled, or if the first leg has started.

**Open v2.** Recommendation: a **new run** (`run-2`), not a new card in run-1.
- `runStartedV2` records `rulesVersion: bbm-rules@2`, `maxLegs: 2`, `stepTargetsCents`, and `supersedes {runId, headSha256}`, so history links both ways.
- One run then has one rule set. `positionOf` refuses to price a v1 run under v2 (`RULES_VERSION`).
- Base: $100 and $25 (run-1 never staked).

**Approvals required, in order** (founder's own, by TOTP or Discord; never relayed):
1. `bbm-rules@2` and each PROPOSED parameter (band ±10%, n ≥ 200, the EV_low gate, the 0.15 gap, leg bounds, ≥ 3 books, 90 min, A/B game-disjoint).
2. Calibration evidence accepted for the moneyline model.
3. Withdraw and retire run-1 on all four lanes.
4. Start run-2 on all four lanes.
5. Any live refresh (1 credit) and any v2 card before posting.

**Rollback.**
- Until step 3 nothing has been written to any lane, so rollback = do nothing.
- After step 3 the chain is append-only, so there is no un-retire. The rollback is a founder-approved `run-2` started under `bbm-rules@1` (`runStarted`), or keeping the lanes HELD.
- The code rollback is reverting the rules-v2 commit. Its only change to v1 code is the two new STATUS codes in `lanes.mjs`, which no existing log contains.
- The four committed projections regenerate byte-identically with this change.

## 6. Data contract (site · graphics · console), proposed `gtp.challenge-lane.public@2`

Additions to `@1`. Prices remain only in the encrypted `gtp.odds-display.enc@1` file, bound by `projectionSha256`. The repo is public.

| Field | Public projection | Encrypted price display |
|---|---|---|
| `rulesVersion` | `bbm-rules@2` (run head) | same |
| `bankrollCents`, `step`, `steps`, `stepTargetCents`, `requiredMultiplier`, `band {loCents, hiCents, pct}` | step 1 only; withheld once a priced step settles (P1) | always |
| `card.legCount`, `card.legs[] {legId, gameId, eventLabel, team, startUtc, modelP, modelId, forecastSha256}` | yes | yes |
| `card.candidateId`, `card.rank`, `rankingDigest`, `candidatesEvaluated`, `candidatesQualified` | yes | yes |
| leg prices `{book, american, decimal, fetchedAt}`, `combined {method, decimal, american}`, `jointP`, `breakEven`, `ev`, `evLow` | **no** | yes |
| `grossPayoutCents`, `profitCents` | **no** | yes |
| `status` / `publicStatus` (ACTIVE · WON · LOST · HELD · COMPLETED · FINISHED SHORT), `heldCode`, `heldReasons` | yes | yes |
| `history[]`: per day {date, step, status, withdrawn, legResults, stepOutcome, receipts} | yes | yes |
| ids/timestamps: `runId`, `supersedes`, `headSha256`, `cardEventSha256`, `priceEventSha256`, `payoutEventSha256`, `priceSnapshotSha256`, `capturedAt` | event shas yes; snapshot sha and capture time **no** | yes |

The combined price is labelled "calculated leg product" unless it was book-quoted. Graphics keep the MODEL PROJECTION / MODEL WIN PROBABILITY labels.

### 6a. As implemented (site reads these from `laneDisplay` / `pricedLaneDisplay`)

v2-only fields are added only to v2 runs, so v1 projections and the encrypted display stay byte-identical (checked on all four Nov 4 lanes).

- **`ruleVersion`**
  - On the doc (current run), on `current`, on each run, and on each history day.
  - A run or day without it is `bbm-rules@1`. The display always fills it.
- **`milestonesCents`, `steps`, `maxLegs` per run**
  - A v2 run's ladder is its own step targets. `laneDisplay` uses the current run's ladder for the rungs.
  - The doc's fixed terms (base, target, steps) are unchanged in v2.
- **Per day:** `legCount` (1 or 2), `maxLegs` (2), `targetPayoutCents` and `targetPayoutLabel` (`"STEP TARGET"`), `heldCode` (`NO_QUALIFIED_CARD`), and `withdrawn` (true on a v1 day withdrawn by the migration).
- **Priced day** (encrypted display): `ruleVersion`, `targetPayoutCents`, `targetPayoutLabel`, `requiredMultiplier`, `band {pct, loCents, hiCents}`, `candidateId`, `combinedLabel` (`"calculated leg product"`), `belowPace` (gross below the step target), and `bankrollAfterCents` (the carry-forward amount, on the settled day).
- **Carry-forward:** `trackedBankrollCents` is the latest STEP_SETTLED gross. It is withheld in the public file after a priced win (P1) and shown in `pricedLaneDisplay`.
- **Public status** gains `RETIRED` (a run superseded under new rules).
- **Synthetic fixtures:** `app/scripts/challenge-lanes/v2-sample.mjs <outDir>` writes made-up v2 lanes (ms-a: v1 withdrawn and retired, then a v2 win, a HELD day and an in-play day; bb-a: a v2 single win, then a double loss).

## 7. Recommendation classes (founder directive ~19:00Z) · `levels.mjs`

The 300-game blanket gate is rejected. Each leg and card now carries a classification:

- **LEVEL_A · MODEL-VALIDATED VALUE.** A validated p, with EV under uncertainty (§2). No NBA model is validated today, so there are no Level A cards.
- **LEVEL_B · HISTORICAL HIT-RATE RESEARCH — no EV claim.** Every signal below passes. The card carries `probability: null`, `ev: null` and `evClaim: false`. It may appear only in an explicitly labelled research challenge, and only if the founder approves that product mode.
- **HOLD.** Anything else, with every reason listed.

The signals are separate inputs. They are never summed into a number shown as a probability:

| Signal | Inputs | Refusal codes (PROPOSED thresholds) |
|---|---|---|
| A evidence strength | Hit-rate windows `{window, hits, n}` and the evaluator's shrunk rate | `A_NO_EVIDENCE`, `A_SMALL_SAMPLE` (longest n < 20), `A_NO_SHRUNK_RATE`, `A_WEAK_EVIDENCE` (shrunk < 0.60) |
| B role / minutes | stable, games played, minutes SD / average | `B_NO_ROLE`, `B_ROLE_UNSTABLE`, `B_FEW_GAMES` (< 3), `B_MINUTES_VOLATILE` (CV > 0.25) |
| C availability | Injury status | `C_AVAILABILITY` (only ACTIVE or PROBABLE pass) |
| D data quality | ok, issues | `D_DATA_QUALITY` |
| E market | The exact line at one book (fixed order), depth at that line, price bounds, quote age | `E_NO_SINGLE_BOOK_AT_EXACT_LINE`, `E_BAD_ODDS`, `E_PRICE_BOUNDS` [1.25, 4.0], `E_THIN_MARKET` (< 2 books at the line), `E_STALE_QUOTE` (> 90 min) |
| F model validation | Calibration evidence | Level A only; none today |
| Card | Leg count, correlation, band, diversification | `LEG_COUNT_EXCEEDED`, `CORRELATED_SAME_PLAYER`, `CORRELATED_SAME_GAME`, `OUT_OF_BAND`, `DIVERSIFICATION` |

**Displaying hit rates.** A hit rate is displayed only as "hits of n" (`hitRateText`), never as a percentage chance. 5 of 5 is shown as "5 of 5", and it is also `A_SMALL_SAMPLE`.

**Level B ranking.** The ranking is labelled "RULES-BASED RANKING — an ordering of evidence, not a probability; no EV claim". The keys, in order:
1. the weakest leg's shrunk rate, in 0.05 buckets;
2. fewer legs;
3. the larger smallest denominator;
4. lower minutes CV;
5. closeness to the step target;
6. freshness;
7. id.

Payout is never a key.

**Inputs.**
- Props: `gtp.nba.prop-price@1` records from the private props capture. The key is event, ESPN athlete id, family, line and book, and lines must match exactly (an exact match only, never a nearby line).
- Moneylines: the h2h price snapshot.
- Shortlist: `gtp.bbm.level-b-shortlist@1`, from nba-engine-eval, private.

**Card record (`gtp.bbm.card@2`).** It holds the classification, the legs in the founder's schema (sport, game, player or team, market, exact line, side, book, price, quote time, forecast version, hit-rate windows with n, role, injury), the combined price ("calculated leg product") and the money. The receipts start empty and pending: `approvalStatus: PENDING_FOUNDER`, `priceEventSha256`, `graphicVersion`, `siteRecordVersion`, `xReceipt`.

## 8. Research-mode payout band · `research-band@1` (FOUNDER-APPROVED)

The founder approved this at about 20:40Z on 2026-11-04, verbatim, as relayed by the PD:

> "I approve the no-lower-payout-bound approach for Level B research selections only… Maintain an upper payout tolerance
> of +20% in research mode. Continue to prioritize the most defensible selection regardless of whether it is one or two
> legs, with a maximum of two."

Also: "If a $25 Moonshot selection pays only $33.99, display the actual potential payout clearly alongside the $50 target and disclose that it falls 32% short."

How it is implemented (`levels.mjs` `guideWindow` = [0, 1.20], state FOUNDER_APPROVED, version `research-band@1`):

- **Scope:** RESEARCH mode only. STRICT keeps ±10% (`bandPct`, still PROPOSED).
- **Lower bound:** none. A card paying well below target is allowed. Every card shows its actual payout next to the step target, and the shortfall in percent.
- **Upper bound:** gross ≤ target × 1.20. A riskier card is never taken just because it pays more.
- **Ranking:** evidence first, whether the card has one leg or two (at most 2). Target proximity is a late tie-break.
- **Next step:** the settled bankroll carries forward, so the next step's required multiplier rises after a short step. It is shown on each card.

This is a parameter decision only. bbm-rules@2, the run-1 withdrawal and retirement, the run-2 start, each card, and the final graphics and captions remain separate approvals.

### 8a. `research-band@2` (FOUNDER-APPROVED ~20:45Z; supersedes research-band@1)

The founder's correction, verbatim, as relayed by the PD:

> "I am superseding my earlier approval of 'no lower payout limit and +20% upper limit.'… I want a strict ±10% gross
> payout band around the target for the current ladder step, applicable to BOTH Bank Builder and Moonshot, across BOTH
> Lane A (moneylines) and Lane B (player props). This is an actual eligibility requirement, not a soft preference."

- `guideWindow` = [0.90, 1.10] (FOUNDER_APPROVED, version `research-band@2`).
- The band is computed per step from the step target, and the bankroll is the actual settled bankroll. Step 1: Bank Builder $180–$220, Moonshot $45–$55.
- Out of band means refused. Inside the band, evidence ranks first and target proximity last.
- Section 8 (`research-band@1`) is superseded. It is kept only as history.
