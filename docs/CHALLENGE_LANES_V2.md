# Challenge lanes V2: event log, public projection, runbook

Implements `~/gtp-evidence/bbm-v2/SPEC.md` §1–3 and §7, which the betting-engine session owns. Code lives in `app/src/lib/challenge-lanes/` and `app/scripts/challenge-lanes/`.

Nothing here calls a price provider, and no price is written to any committed or public file.

## 1. Lanes

| laneId | product | base | target | steps | card source in the frozen file |
|---|---|---|---|---|---|
| bb-a | bank-builder | $100 | $10,000 | 5 (max 2 legs, hard) | `bankBuilder.nba.card` (the file's own card) |
| bb-b | bank-builder | $100 | $10,000 | 5 (max 2 legs, hard) | the engine's best card over the file's `legs`, sharing no game with bb-a |
| ms-a | moonshot | $25 | $1,000 | 5 | `moonshot.nba.card` |
| ms-b | moonshot | $25 | $1,000 | 5 | the engine's best card, sharing no game with ms-a |

B uses the same function (`level-a/engine.mjs` `best`) and the same product rule that chose A:
- Bank Builder: 2 legs in Low or Medium.
- Moonshot: 3–5 legs in Longshot.

Rule A applies to both lanes. OUT is excluded everywhere, and R1 is excluded from Bank Builder.

This follows SPEC revision 2:
- Packages: `bb-<date>` carries bb-a (mediaIndex 0) then bb-b (mediaIndex 1); `ms-<date>` carries ms-a then ms-b.
- Elastic pace: the pace a step needs is (target ÷ bankroll)^(1 ÷ steps remaining). A below-pace card is allowed, with `belowPace` disclosed. `strictPace` (refuse) exists only for the founder's D1 choice.
- Milestones (display defaults): Bank Builder $300 / $900 / $2,700 / $6,500 / $10,000; Moonshot $75 / $180 / $360 / $650 / $1,000.
- Step 5 won below target → `FINISHED_SHORT`.
- Prop legs are bound to their evaluated line (`prop.line`) and refused unpriced without one. None exist yet: the frozen file has no prop probability, and none is derived from a median.
- Same-game legs need the book's whole-parlay price.

Before it selects anything, the selector re-runs the engine on the file's legs. If that does not reproduce A exactly, it refuses (`SELECTION_MISMATCH`). Money is held as integer cents.

## 2. Private log: `<root>/<laneId>/<runId>.jsonl`

In production, `<root>` is `~/gtp-private/challenge-lanes`. The CLIs require `--root` and never default to it.

**Hashing rule.** Each line is `canonical(event)` followed by `\n`.
- `canonical` writes JSON with keys sorted recursively and no whitespace. Undefined keys are dropped, and arrays keep their order.
- `sha256` is the hex SHA-256 of the UTF-8 bytes of `canonical(event without sha256)`.
- `prevSha256` is the previous line's `sha256`, or 64 zeros on line 0.
- `seq` is the line index.

The implementation is `chain.mjs`.

Every event carries `schema: "gtp.challenge-lane.event@1"`, `type`, `date`, `step`, `at`, `source`, `seq`, `prevSha256` and `sha256`.

| type | extra fields |
|---|---|
| RUN_STARTED (line 0) | `laneId, runId, product, slot, baseCents, targetCents, steps, startedAt, approvedBy` |
| CARD_FROZEN | `product, packageId, mediaIndex, suggestedCards {file, contentSha256}, card` (see below) |
| PRICE_VERIFIED (private only) | `cardEventSha256, price {legs[{legId, selectionCode, provider, book, oddsFormat, price, fetchedAt}], parlay {method: BOOK_QUOTED_PARLAY \| LEG_PRODUCT, oddsFormat?, price?, provider?, fetchedAt}, priceSnapshotSha256}` |
| STAKE_SET | `stakeCents` (= tracked bankroll, all-in), `placedWager: false`, `basis` |
| PAYOUT_COMPUTED | `result: VERIFIED \| REFUSED`, `inputs {cardEventSha256, priceEventSha256, priceSnapshotSha256, stakeCents, bankrollCents, decimalPrice, method, pace, belowPace, strictPace}`, then `grossPayoutCents, profitCents` (VERIFIED) or `refusals[{code, detail?}]` (REFUSED) |
| LEG_SETTLED | `legId, gameId, outcome WIN\|LOSS\|VOID\|PUSH, final {home, away, ftHome, ftAway, winnerSide, statusRaw}, source {kind: "official-final", provider, record, providerEventId, recordedAt}`; `at` = the record's `firstRecordedAt` |
| STEP_SETTLED | `outcome WIN\|LOSS, payoutEventSha256, bankrollBeforeCents, bankrollAfterCents` |
| STATUS | `status, reason` |
| GRAPHIC_RENDERED / APPROVED / POSTED | ingested from an inbox (§4); the receipt's own fields plus `receiptSha256` |

**`card`** contains:
- `cardId, sourceCardId, slot, product, scope, method`;
- `suggestedCardsSchema, suggestedCardsSha256, productDay, evaluatedAt, tier, jointProbability, jointShown`;
- `legs[]`, each with:
  - `legId, gameId, eventLabel, startUtc, market, selection {code, label, teamAbbr}, probability, probabilityShown`;
  - `projection {owner, modelId, snapshotId, stampedAt, contentSha256}`;
  - `guard {state, flags, flagText}`;
  - `settlement`.

These values are copied verbatim from the sealed file.

**STATUS values:**
- `READY` (card frozen);
- `IN_PLAY` (payout verified);
- `NO_ELIGIBLE_CARD`;
- `UNPRICED`;
- `PAUSED`;
- `PENDING_VOID_REVIEW`;
- `BUSTED`;
- `COMPLETE`;
- `FINISHED_SHORT`;
- `AWAITING_RESTART_APPROVAL`.

**Public status** (`publicStatus`, from `publicStatusOf`):

| Public | Internal |
|---|---|
| ACTIVE | a frozen card awaiting price or games, or IN_PLAY |
| WON | READY after a won step, before the next card |
| LOST | BUSTED, AWAITING_RESTART_APPROVAL |
| HELD | UNPRICED, NO_ELIGIBLE_CARD, PENDING_VOID_REVIEW, PAUSED, or a run with no card yet |
| COMPLETED | COMPLETE |
| FINISHED SHORT | FINISHED_SHORT |

**Payout refusal codes** (`payout.mjs`):
- `CHAIN_BROKEN`
- `CARD_SHA_UNVERIFIED`
- `LEG_INELIGIBLE_RULE_A`
- `NO_PRICE_VERIFIED`
- `PROVIDER_NOT_PERMITTED` (the permitted list stays empty until P1)
- `PRICE_LEGS_MISMATCH`
- `PRICE_AFTER_FIRST_START`
- `PRICE_TOO_EARLY` (more than 90 min before the scheduled post)
- `MODEL_PROBABILITY_AS_PRICE`
- `BAD_PRICE`
- `STAKE_NOT_BANKROLL`
- `LEG_COUNT_EXCEEDED`
- `SAME_GAME_NEEDS_PARLAY_PRICE`
- `PROP_LINE_UNVERIFIED`
- `BELOW_PACE` (only with `strictPace`)

**Payout arithmetic:** `gross = floor(stake × decimal)` to the cent, computed from the exact American ratio; `profit = gross − stake`.

## 3. Public projection: `<public-out>/<laneId>.json` (`gtp.challenge-lane.public@1`)

The projection is canonical JSON plus `\n`, and a pure function of the logs, so re-runs are byte-identical.

```
{ schema, laneId, product, slot, baseCents, targetCents, steps, maxLegs, label, projectionLabel: "MODEL PROJECTION",
  prices: { state: "WITHHELD_P1", note }, milestonesCents[5], milestonesNote,
  current: { runId, status, publicStatus, pace, statusReason, step, stepText "STEP k OF N", inPlay, trackedBankrollCents|null, trackedBankrollWithheld: "P1"|null, headSha256 },
  runs: [{ runId, startedAt, approvedBy, headSha256, eventCount, status, publicStatus, statusReason,
           pace: { withheld: "P1"|null, milestoneCents, requiredMultiplier|null, behindByCents|null, onPace|null }, step, steps, stepText, inPlay, stepsWon,
           trackedBankrollCents|null, trackedBankrollWithheld,
           days: [{ date, step, status, reason, staked, card, cardEventSha256, legResults[{legId, outcome}], modelCardResult WIN|LOSS|PENDING|null, stepOutcome, receipts[] }],
           events: [ public event (below) ] }],
  contentSha256 }   // sha256 of canonical(doc without contentSha256)
```

What the projection hides:
- **Price events:** `PRICE_VERIFIED` and `PAYOUT_COMPUTED` appear only as `{seq, type, date, step, at, source, withheld: "P1"}`, plus `result` and refusal codes on a payout. They carry no hash, no numbers, no provider and no book.
- **Bankroll:** once a step has been won, the tracked bankroll, the stake and `bankrollAfterCents` become `null` with the marker `"P1"`, because those amounts reveal the price.

**One reader for the site and the renderer:** `readLaneProjection({ appDir, laneId })` / `readAllLaneProjections()` in `public-reader.mjs`. It returns `{ ok: true, doc }` (verified, the right lane, base, target and steps) or `{ ok: false, refusal }` with MISSING, UNREADABLE, UNVERIFIED or WRONG_LANE. Neither surface keeps its own copy or recomputes a lane. Both then call **`laneDisplay(doc, { date })`** (`display.mjs`), which returns `{ laneId, product, slot, runId, runNumber, step (the busting step when LOST), steps, stepText, cleared, status (public), internalStatus, reason, inPlay, rungs[{step, state completed|active|failed|upcoming, milestoneCents}], baseCents, targetCents, maxLegs, trackedBankrollCents|null, trackedBankrollWithheld, distanceToTargetCents|null, pace{state on|behind|withheld, milestoneCents, nextMilestoneCents, requiredMultiple, behindCents}, day{…, packageId, mediaIndex, cardEventSha256, statusEventSha256, sourceEventSha256, sourceEventType CARD_FROZEN|STATUS}|null, history[], runs[{runId, startedAt, approvedBy, endStatus, stepsWon}], prices, label, projectionLabel, sourceSha256 }`. It throws on a file that does not verify, or one whose lane terms (product, slot, base, target, steps) differ from `lanes.mjs`. Rungs are the milestone after each step; the base is `baseCents`, not a rung.

## 4. Receipts from other writers (console, renderer)

Each writer keeps its own chained file at `<root>/<laneId>/inbox/<writer>.jsonl`. It uses the same hashing rule, with genesis set to 64 zeros.

Each receipt has these fields:
- `type` (GRAPHIC_RENDERED, APPROVED or POSTED);
- `laneId, runId, date, step, at, source`;
- `refEventSha256`: the CARD_FROZEN or STATUS event it refers to;
- the writer's own fields: `packageId, approvedVersionSha256, mediaIndex, imageSha256, scheduledFor`; POSTED adds `xPostId, url, postedAt`; APPROVED adds `approvedBy, approvedAt`.

The public projection carries all of these except `approvedBy`, which stays in the private log. GRAPHIC_RENDERED may add `imagePath`; it is projected only when it is a site path matching `/data/challenge-lanes/graphics/<name>.png`, and is otherwise `null`.

`lanes-prepare` and `lanes-reconcile` ingest every inbox before they act:
- A valid receipt is appended to the lane log once, keyed by `receiptSha256`.
- A receipt for another lane or run, a receipt with an unknown reference, a receipt of another type, or an inbox whose chain is broken is reported and not appended.
- WAGER_DOCUMENTED is refused here. It needs founder proof.
- **RESTART_APPROVED** (console, founder only): `nextRunId` must be `run-N+1`, and `refEventSha256` must be the run's STATUS BUSTED, its STATUS AWAITING_RESTART_APPROVAL, or its STEP_SETTLED LOSS. It is accepted once per run and only while the lane is LOST, and `approvedBy` is required. The next `lanes-prepare` then opens `run-N+1` at base, with `approvedBy` = `"<approvedBy> via cc-console RESTART_APPROVED <receiptSha256>"`.
- Receipts for an earlier run of the lane are skipped, because that run already holds them.

## 4b. Real prices (founder decision 2026-11-04)

The prices come from the existing paid The Odds API subscription (`odds.mjs`), under a committed BBM receipt that `parseBbmOddsReceipt` must accept. **That receipt is not committed yet; it needs the founder's own words (see the open blockers).**
- **On demand only.** One run makes the free `/events` listing and then ONE bulk `h2h` call (`eventIds=` the events that hold a candidate leg). The nine eligible-operator keys count as 1 region-unit, so the worst case is **1 credit per run**.
- **Before the paid call:** BBM day ≤ daily ceiling, BBM cumulative ≤ weekly ceiling, provider usage since the shared baseline ≤ shared weekly ceiling, balance − worst ≥ floor. An unreadable balance stops the run. Any 401/429/5xx stops it, with no retry.
- **Storage.** The snapshot is PRIVATE at `<GTP_PRIVATE_DATA_DIR>/odds/nba/bbm/<date>/<fetchedAt>.json`. The ledger, with credits and status only, is `data/internal/research/odds/nba/bbm-ledger.json`. The key comes only from `ODDS_API_KEY`, only with `--apply`, and is never printed.
- **Matching** (`priceForCard`) is exact: same game (the joined provider event, home and away aligned), market `h2h`, the selected side's outcome. **All legs come from ONE book**: the first eligible operator in the fixed allowlist order that prices every leg. Prices are never shopped across books.
- **Payout refusals** add `BOOK_NOT_ELIGIBLE` and `CROSS_BOOK_MIX`. Freshness: every price must be fetched before the earliest leg's start and at most 90 minutes before `--post-at`.
- **Same-game legs** are refused by default. With `allowSameGameEstimate`, the leg product is labelled `ESTIMATE — same-game leg product, not a book's offer` (method `LEG_PRODUCT_ESTIMATE`). Lanes never set it.
- **Prop legs** are refused (`PROP_CAPTURE_NOT_APPROVED`) until an official prop probability is approved.
- **Site display:** `lanes-display` writes `data/odds-display/challenge-lanes/<laneId>.json.enc` (`gtp.odds-display.enc@1`, aad `challenge-lanes/<laneId>`, key `GTP_ODDS_DISPLAY_KEY`). The site reads it with `readLanePriceDisplay(laneId, text, key)` (`price-display.mjs`) at build time. The plain projection stays price-free.
- **Site reader and fold:** `readLanePrices({ appDir, laneId })` returns the decrypted prices, or null with no key, another key, no file, or NBA "site" display off (`lib/odds/display-authorization.mjs`). It throws on tampering. `pricedLaneDisplay(doc, prices)` (`display.mjs`) is `laneDisplay` with the withheld bankroll, distance, pace and per-day `price` filled in. It refuses prices whose `projectionSha256` is not this projection's `contentSha256`.
- **Graphics** read the private run log (`store.mjs readRuns`) for the stake, prices, gross and profit. Prices on a social graphic also need the display record's NBA "social" surface, which is off today (`socialPricesAuthorized()`). Turning it on is a founder change to that record.

`price.legs[]` fields: `legId, selectionCode, provider, book, market, oddsFormat, price, outcomeName, line, providerEventId, eventId, playerId, fetchedAt, bookLastUpdate`.

## 5. Runbook (branch code; nothing is installed)

Run these from `app/`. Each CLI prints a JSON report and exits 1 if any lane was refused.

1. **After the day's sealed suggested-cards file exists:**
   `npx tsx scripts/challenge-lanes/lanes-prepare.mjs --root ~/gtp-private/challenge-lanes --date D [--cards FILE] --public-out public/data/challenge-lanes`
   - Writes CARD_FROZEN for each lane that is not in play, or NO_ELIGIBLE_CARD when there is no file or no card.
   - The `at` field is the file's `evaluatedAt`. With no file, it is `--now` (default `D`T11:00Z).
   - The first run, or a restart after BUSTED (`--restart LANE`), needs `--approved-by "<founder approval ref>"`.
2. **Price:** `lanes-price.mjs --root … --date D --post-at-bb <ISO> --post-at-ms <ISO> --receipt docs/receipts/<BBM receipt>.md [--apply --env-file <repo>/.env]`
   - Posts (PD 2026-11-04): bb-<date> at the slate's first tip − 60 min, and ms-<date> at first tip − 58 min. Capture within the 90 minutes before the earlier one.
   - `--env-file` loads ODDS_API_KEY (or, for `lanes-display`, GTP_ODDS_DISPLAY_KEY) inside the process. It is never put in argv or printed, and is read only after the receipt parses and only with `--apply`.
   - Without `--apply` it prints the plan (games, worst-case credits, ceilings). It spends nothing and touches no lane.
   - With `--apply` (and `ODDS_API_KEY` and `GTP_PRIVATE_DATA_DIR` in the environment) it makes the one capture, then PRICE_VERIFIED + STAKE_SET + PAYOUT_COMPUTED for each open card. A refusal leaves the card open.
   - `--snapshot FILE` prices from an existing private snapshot, with no call.
   - `--close-unpriced "<reason>"` closes the day's still-unpriced cards as UNPRICED (HELD; no step consumed).
   - Then `lanes-display.mjs --root …` (with `GTP_ODDS_DISPLAY_KEY`) refreshes the encrypted site prices.
3. Render, then the console approves and posts. The console writes POSTED into its inbox (§4).
4. **Next morning:** `lanes-reconcile.mjs --root … --date D [--finals FILE] --public-out public/data/challenge-lanes`
   - Reads the write-once NBA finals record (ESPN STATUS_FINAL rows) and appends LEG_SETTLED.
   - For a staked card it also appends STEP_SETTLED and a STATUS (BUSTED, COMPLETE or PENDING_VOID_REVIEW).
   - A game with no recorded final is reported as held, never as a loss.
5. **When a lane is refused** (CHAIN_BROKEN, CARD_SHA_UNVERIFIED, SELECTION_MISMATCH, …), the run stops for that lane only. Do not edit the log. A correction is always a new event.

Tests: `npx tsx --test src/lib/challenge-lanes/challenge-lanes.test.mjs`
