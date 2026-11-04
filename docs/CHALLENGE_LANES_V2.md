# Challenge lanes V2: event log, public projection, runbook

Implements `~/gtp-evidence/bbm-v2/SPEC.md` §1–3 and §7, which the betting-engine session owns. Code lives in `app/src/lib/challenge-lanes/` and `app/scripts/challenge-lanes/`.

Nothing here calls a price provider, and no price is written to any committed or public file.

## 1. Lanes

| laneId | product | base | target | steps | card source in the frozen file |
|---|---|---|---|---|---|
| bb-a | bank-builder | $100 | $10,000 | 3 | `bankBuilder.nba.card` (the file's own card) |
| bb-b | bank-builder | $100 | $10,000 | 3 | the engine's best card over the file's `legs`, sharing no game with bb-a |
| ms-a | moonshot | $25 | $1,000 | 5 | `moonshot.nba.card` |
| ms-b | moonshot | $25 | $1,000 | 5 | the engine's best card, sharing no game with ms-a |

B uses the same function (`level-a/engine.mjs` `best`) and the same product rule that chose A:
- Bank Builder: 2 legs in Low or Medium.
- Moonshot: 3–5 legs in Longshot.

Rule A applies to both lanes. OUT is excluded everywhere, and R1 is excluded from Bank Builder.

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
| CARD_FROZEN | `product, packageId, suggestedCards {file, contentSha256}, card` (see below) |
| PRICE_VERIFIED (private only) | `cardEventSha256, price {legs[{legId, selectionCode, provider, book, oddsFormat, price, fetchedAt}], parlay {method: BOOK_QUOTED_PARLAY \| LEG_PRODUCT, oddsFormat?, price?, provider?, fetchedAt}, priceSnapshotSha256}` |
| STAKE_SET | `stakeCents` (= tracked bankroll, all-in), `placedWager: false`, `basis` |
| PAYOUT_COMPUTED | `result: VERIFIED \| REFUSED`, `inputs {cardEventSha256, priceEventSha256, priceSnapshotSha256, stakeCents, bankrollCents, decimalPrice, method, pace, paceRule}`, then `grossPayoutCents, profitCents` (VERIFIED) or `refusals[{code, detail?}]` (REFUSED) |
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
- `AWAITING_RESTART_APPROVAL`.

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
- `BELOW_PACE`

**Payout arithmetic:** `gross = floor(stake × decimal)` to the cent, computed from the exact American ratio; `profit = gross − stake`.

## 3. Public projection: `<public-out>/<laneId>.json` (`gtp.challenge-lane.public@1`)

The projection is canonical JSON plus `\n`, and a pure function of the logs, so re-runs are byte-identical.

```
{ schema, laneId, product, slot, baseCents, targetCents, steps, label, projectionLabel: "MODEL PROJECTION",
  prices: { state: "WITHHELD_P1", note },
  current: { runId, status, statusReason, step, stepText "STEP k OF N", inPlay, trackedBankrollCents|null, trackedBankrollWithheld: "P1"|null, headSha256 },
  runs: [{ runId, startedAt, approvedBy, headSha256, eventCount, status, statusReason, step, steps, stepText, inPlay, stepsWon,
           trackedBankrollCents|null, trackedBankrollWithheld,
           days: [{ date, step, status, reason, staked, card, cardEventSha256, legResults[{legId, outcome}], modelCardResult WIN|LOSS|PENDING|null, stepOutcome, receipts[] }],
           events: [ public event (below) ] }],
  contentSha256 }   // sha256 of canonical(doc without contentSha256)
```

What the projection hides:
- **Price events:** `PRICE_VERIFIED` and `PAYOUT_COMPUTED` appear only as `{seq, type, date, step, at, source, withheld: "P1"}`, plus `result` and refusal codes on a payout. They carry no hash, no numbers, no provider and no book.
- **Bankroll:** once a step has been won, the tracked bankroll, the stake and `bankrollAfterCents` become `null` with the marker `"P1"`, because those amounts reveal the price.

Use `verifyLaneProjection(doc)` to check a file. A page or a graphic must refuse a file that does not verify.

## 4. Receipts from other writers (console, renderer)

Each writer keeps its own chained file at `<root>/<laneId>/inbox/<writer>.jsonl`. It uses the same hashing rule, with genesis set to 64 zeros.

Each receipt has these fields:
- `type` (GRAPHIC_RENDERED, APPROVED or POSTED);
- `laneId, runId, date, step, at, source`;
- `refEventSha256`: the CARD_FROZEN or STATUS event it refers to;
- the writer's own fields: `packageId, approvedVersionSha256, mediaIndex, imageSha256, scheduledFor`; POSTED adds `xPostId, url, postedAt`; APPROVED adds `approvedBy, approvedAt`.

The public projection carries all of these except `approvedBy`, which stays in the private log.

`lanes-prepare` and `lanes-reconcile` ingest every inbox before they act:
- A valid receipt is appended to the lane log once, keyed by `receiptSha256`.
- A receipt for another lane or run, a receipt with an unknown reference, a receipt of another type, or an inbox whose chain is broken is reported and not appended.
- WAGER_DOCUMENTED is refused here. It needs founder proof.

## 5. Runbook (branch code; nothing is installed)

Run these from `app/`. Each CLI prints a JSON report and exits 1 if any lane was refused.

1. **After the day's sealed suggested-cards file exists:**
   `npx tsx scripts/challenge-lanes/lanes-prepare.mjs --root ~/gtp-private/challenge-lanes --date D [--cards FILE] --public-out public/data/challenge-lanes`
   - Writes CARD_FROZEN for each lane that is not in play, or NO_ELIGIBLE_CARD when there is no file or no card.
   - The `at` field is the file's `evaluatedAt`. With no file, it is `--now` (default `D`T11:00Z).
   - The first run, or a restart after BUSTED (`--restart LANE`), needs `--approved-by "<founder approval ref>"`.
2. **Price:** `lanes-price.mjs --root … --date D [--now ISO]`
   - Today this writes STATUS UNPRICED for every frozen card. It contacts no provider.
   - Once P1 is decided, the price path is `priceLane()` in `ops.mjs`, which needs a permitted provider.
3. Render, then the console approves and posts. The console writes POSTED into its inbox (§4).
4. **Next morning:** `lanes-reconcile.mjs --root … --date D [--finals FILE] --public-out public/data/challenge-lanes`
   - Reads the write-once NBA finals record (ESPN STATUS_FINAL rows) and appends LEG_SETTLED.
   - For a staked card it also appends STEP_SETTLED and a STATUS (BUSTED, COMPLETE or PENDING_VOID_REVIEW).
   - A game with no recorded final is reported as held, never as a loss.
5. **When a lane is refused** (CHAIN_BROKEN, CARD_SHA_UNVERIFIED, SELECTION_MISMATCH, …), the run stops for that lane only. Do not edit the log. A correction is always a new event.

Tests: `npx tsx --test src/lib/challenge-lanes/challenge-lanes.test.mjs`
