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
