# Parlay Lab V2: hardening notes (PR #1141)

Scope: the reduced-win payout fix, the cross-sport candidate schema, and the dev fixture route with its browser spec. No published receipt, ledger or data file is changed by this PR. Everything below that needs a decision is listed under **Founder decisions** at the end.

## 1. Reduced-win payout fix (forward-only)

### The defect
`scripts/parlays/settle-lab-cards.mjs` multiplied every leg's price into `combinedDecimal` before it removed voided legs. `scripts/parlays/build-lab-ledger.mjs` then counted `combinedDecimal` as the return of a winning card. So a card that won on its remaining legs after a void was credited at the full card's price.

Example: `slip_2026-08-18_conservative_9cbc273e3512` has legs at −198 (win) and −159 (void). The receipt records 2.451623. The correct return is 1.505051.

### The formula (`app/src/lib/parlays/settlement.mjs`, `PAYOUT_POLICY = "decided-winning-legs@1"`)
Returns are per 1 unit staked.

| Card outcome | Rule | Payout |
|---|---|---|
| any leg lost | the card loses | 0 |
| every leg void or push | the card is void or push | 1 (stake returned) |
| every remaining decided leg won | void and push legs drop out (decimal 1.0) | product of the winning legs' decimals |
| otherwise | pending | null |

`cardResult` is the settler's former rule, moved without changes. A test checks it against the old inline code for every combination of 0 to 4 legs (781 cases).

### Does the settler rewrite history? Yes, in one specific way
- **One date per run.** Each run settles a single date: ET-yesterday, or `--date`. The script never loops over history.
- **But it revisits old dates.** `complete-pending-days.mjs` (nightly) re-runs the settler for every receipt in a 30-day window that still has a pending card.
- **A re-run rewrites the whole file.** When a receipt already exists, the settler re-grades the whole day. If the only change is a card completing, it rewrites the entire file from the new run (`receipt-completion.mjs` `COMPLETION_ONLY`). Every card, including ones already decided, is serialized again.
  - Evidence: `2026-08-18.json` carries `completedAt 2026-09-09T00:54:21Z`. Its reduced win was recorded in that later full-file rewrite.
- **What a naive fix would have done.** Changing the formula inside `combinedDecimal` would have made every completion run on an old day either:
  - be refused as a REWRITE, because `combinedDecimal` is a non-outcome field the classifier pins (this fails the nightly sweep), or
  - silently restate published numbers.

### The fix: two fields, and a receipt keeps its policy
- **`combinedDecimal` keeps its meaning on every receipt:** the card's full published price. It doesn't depend on the outcome, so it never moves when a card completes.
- **`payoutDecimal` is a new field.** It is written only on receipts stamped `payoutPolicy: "decided-winning-legs@1"`.
- **`payoutPolicyForRun(prior)` picks the policy.** An existing receipt keeps the policy it was first written under. Only a brand-new receipt gets the new policy. Legacy receipts never gain the field, even when the sweep revisits them.
- **The classifier enforces this independently.** A receipt that gains or loses `payoutDecimal`, or a decided card whose payout changes, is a REWRITE and is refused. A payout may go from null to a number only when its card completes.
- **The ledger** credits `payoutDecimal` when a receipt has one. Otherwise it uses `combinedDecimal`, so historical receipts are read exactly as published.

Tests in `settlement.test.mjs`:
- All 141 published cards in the 44 receipts are rebuilt by the new code under their own (legacy) policy, and the files come out byte-identical. The earliest receipts predate the `sports` field, so their cards are compared field by field in their own key order.
- Forcing the fix onto `2026-08-18` is refused as a REWRITE.
- Two offline end-to-end runs of the real settler on a disposable `--app-root` (NFL lane, no network):
  - a new day is written under the fix;
  - a pre-fix receipt is left byte-identical.

### Restatement input: historical cards whose recorded return differs (not restated)
All 7 cards are MLB. In every case the recorded figure includes the voided leg's price.

| Date | Card | Tier | Legs | Recorded | Correct | Overstated |
|---|---|---|---|---|---|---|
| 2026-08-18 | slip_2026-08-18_conservative_9cbc273e3512 | medium | win/void | 2.451623 | 1.505051 | 0.946572 |
| 2026-08-22 | slip_2026-08-22_conservative_f12f43ed4ecf | medium | win/void | 2.659305 | 1.487805 | 1.171500 |
| 2026-08-27 | opt_2026-08-27_public_medium_mlb_e97372044e32 | high | win/win/void | 4.218463 | 2.544469 | 1.673994 |
| 2026-08-30 | slip_2026-08-30_conservative_1984dceacedd | medium | void/win | 2.268959 | 1.434783 | 0.834176 |
| 2026-09-05 | slip_2026-09-05_balanced_e0d9e48237f7 | high | void/win/win | 6.975963 | 3.638182 | 3.337781 |
| 2026-09-15 | opt_2026-09-15_public_medium_mlb_2fc5e3e84ea2 | high | win/win/win/void | 5.909021 | 3.247300 | 2.661721 |
| 2026-09-18 | opt_2026-09-18_public_longshot_mlb_dad8e4264517 | longshot | win/void/win/win/win | 11.593121 | 5.520534 | 6.072587 |

**Total overstated:** 16.698331 units of `returned`.

Approximate effect on the committed MLB `lab-ledger.json` if these were restated (tiers rounded as the ledger rounds them):

| Tier | returned | ROI |
|---|---|---|
| medium | 38.99 → 36.04 | −2.5% → −9.9% |
| high | 17.10 → 9.43 | −44.8% → −69.6% (all 3 high wins are reduced wins) |
| longshot | 41.31 → 35.24 | +11.6% → −4.8% |
| overall | 97.40 → 80.70 | −10.6% → −26.0% |

Win and loss counts are unaffected.

Not listed: 13 losing cards that also have a void leg. They return 0 under either reading, so they don't affect the ledger. Their `combinedDecimal` is still the full card price, which is the field's documented meaning.

The table is pinned in `settlement.test.mjs`. Published receipts are append-only, and no historical receipt holds a pending card, so this list cannot grow from legacy receipts.

## 2. Cross-sport candidate schema (`app/src/lib/parlays/v2/candidate.mjs`, `gtp.parlay.candidate@1`)

**Fields:** `league`, `eventId`, `gameStart`, `eventLockAt` (start minus 30 min), `player?`, `team?`, `market`, `side`, `line`, `book`, `americanOdds`, `capturedAt`, `model` / `modelVersion` / `probability` (from the leg's own `modelId` stamp only), `uncertainty` (null everywhere today), `eligibility {state, reasons[]}`, and `provenance`.

**Adapter:** `candidatesFromPublished` wraps the existing normalisers in `candidates.mjs`, which now also carry `modelProbability`, `modelId` and `marketStatus` through.

**League gate:** `canEnterPredictionProducts`, which today admits MLB only.
- NBA is always checked against the real registry. It is HISTORICAL_ONLY, so it stays out even if a caller injects a permissive gate.

**Candidate rejections:**
- league not eligible
- invalid mapping
- start unknown or locked
- price missing, out of range, undated, stale (over 12 h), captured after start, or mismatched with its board
- market suspended
- market-context family, or no coverage (fails closed)
- participant out, questionable or otherwise unavailable
- book not a verified operator (fails closed until #1130)

**Combination rejections:**
- fewer than 2 legs
- an ineligible leg
- same event (D5)
- contradictory sides, including two winners of one event
- duplicate player + market

**Fixtures** (`__fixtures__/cross-sport-fixtures.mjs`, provenance `FIXTURE`, label "FIXTURE — not real picks, not real prices"):
- (a) MLB + NFL + EPL qualify and combine, but only with an injected league gate. Under the real registry, NFL and EPL are refused.
- (b) a pool with zero qualified candidates.
- (c) every gate and every combination refusal.

### PROPOSED cross-sport correlation caps (disabled)
`CROSS_SPORT_CORRELATION_CAPS_ENABLED = false`. The caps apply only when a caller passes `applyProposedCaps: true`.

`PROPOSED_CROSS_SPORT_CORRELATION_CAPS`:

| Cap | Proposed value |
|---|---|
| max legs per league | 3 |
| max legs per market family | 2 (every "who wins" market — moneyline, h2h, match_result, fight winner — is one family across sports) |
| max legs per team | 1 |

There is no validated correlation model behind these numbers.

## 3. Smart Betslip in a browser: `/dev/parlay-lab-fixture`

**What it is:** the real `TierBoard` and `SmartBetslip`, driven by the real adapter, over fixture cards.
- High Risk has one QUALIFIED card.
- Medium is a same-game card, withheld.
- Low is a stale-price card, withheld.
- Longshot has none.

**URL parameters:** `?scenario=none` shows a day with nothing qualifying. `?now=<ISO>` fixes the reader clock.

**The slip:** never persisted, and the operator allowlist is injected as data.

**Banner:** "FIXTURE — not real picks, not real prices".

**Gate:** `GTP_DEV_ROUTES=1` (`lib/parlays/v2/dev-route.mjs`). Without it, `notFound()` runs before any fixture is built.

**Route inventory:** the route is marked `devOnly` and reported under `devRoutes`, using the same hunk as on the theater branch.

**Pruning caveat (needs integration):** on this branch, `scripts/prune-internal-routes.mjs` does not prune `dev`. Its `INTERNAL_ROUTES` is ops, preview, launch and the gated legal routes. So a default export built from this branch alone may contain the data-free 404 shell at `out/dev/parlay-lab-fixture/`. The theater branch's `DEV_ROUTES` sweep removes it; that sweep must land with or before this PR. This PR does not edit the prune.

**Browser spec:** `app/e2e/parlay-lab-v2.spec.ts`, opt-in with `GTP_PARLAY_E2E=1`. Base URL is `GTP_PARLAY_BASE_URL`, default `http://localhost:4183`. It covers:
- adding, removing and reordering legs
- the snapshot invalidation message
- expired prices hidden at a clock 7 h later
- the same-game message
- the no-qualified day
- no outbound links, and the sportsbook handoff disabled
- widths 320, 390, 768 and 1440

## 4. Legal copy check (no edits)
- **Age:** `LEGAL_PARAMETERS.minimumAge` is `"18"`. Source: founder, 2026-09-10; counsel question 7 notes that most states set 21 for wagering.
- **Where age and state notices appear:**
  - `/responsible-use`: "intended for adults aged 18 or older in the United States", plus "the minimum age differs from state to state" and "legality varies by state". The 18 is hard-coded there; it matches the parameter.
  - Terms and Privacy: through `{{minimumAge}}`. Both pages are gated.
- **What the Lab itself shows:** `/parlay-lab`, `/build` and `/results/parlay-lab` show no age notice. The only state notice in the Lab is the V2 Smart Betslip's "Sportsbook availability varies by state." (`BOOK_AVAILABILITY_NOTE`), next to a link to `/responsible-use`. With V2 off, the Lab shows neither.

## Founder decisions
1. Whether to restate the 7 historical reduced wins (table above), and how a restatement would be recorded so it stays append-only.
2. Whether to turn on the PROPOSED cross-sport correlation caps, and at what values. The section caps in `parlay-decorrelation.ts` are also still PROPOSED.
3. Whether the Lab surfaces should show an age (18+) or state notice inline, rather than only through `/responsible-use`.
