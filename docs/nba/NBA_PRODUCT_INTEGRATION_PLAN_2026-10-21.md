# NBA product integration plan (2026-10-21)

**Status: INERT.** This branch (`claude/nba-product-legs-gated`, stacked on #1149) adds an NBA leg adapter, tier
qualification metadata, a cross-sport helper and an exposure invariant. No page, build or workflow imports any of
them, and a test fails if one starts to. No NBA leg can reach Bank Builder, Moonshot, Parlay Lab or the Smart
Betslip today. Nothing a reader sees changes.

Founder rules this plan follows:

- Each game has one official forecast, used by every product.
- Products differ only in qualification, payout and correlation controls.
- `evaluateMarket` decides every lean.
- No odds or market data are ever invented.
- No auto-wagering.
- No leg is ever called safe or guaranteed.

## 1. Where NBA is held out today (verified on this branch, head of #1149 = 7808a4b75c)

| # | Exclusion point | How it refuses NBA | Kind of switch |
|---|---|---|---|
| R | `app/src/lib/sport-capability-registry.ts:70-72` | `state: "HISTORICAL_ONLY"`, so `canEnterPredictionProducts("nba")` is false (it needs FULL_MODEL) | registry |
| 1 | `app/src/lib/daily-portfolio/sport-eligibility.ts:67-73` | `NBA.eligible: false` | hand-set |
| 2 | `app/src/lib/daily-portfolio/accounting.ts:226-230` | `bbEligibility` asks the registry for every leg | registry-derived |
| 3 | `app/scripts/products/build-product-eligible-legs.mjs:84` | `nba: { candidates: [] … }` is a hardcoded empty list | hand-set |
| 4 | `app/src/lib/products/eligible-leg/contract.mjs:139` | `SPORT_NOT_ELIGIBLE` comes from the registry, at both build and read (`guardLegs`) | registry-derived |
| 5 | `app/src/lib/products/engine-v2/eligibility.mjs:87` | `SPORT_GATED` unless there is a per-family grant. `FAMILY_PRODUCT_GRANTS` (family-gate.mjs:25) is empty | registry + hand-set grant |
| 6 | `app/scripts/parlays/lab-eligibility.mjs:55-208` | `SOURCES` has no `nba` entry. `LADDER_DIR` has no NBA ladder | hand-set |
| 7 | `app/src/lib/parlays/multi-sport.mjs:156` | `SETTLEABLE_SPORTS` excludes `nba`, so the cross-sport ladder refuses ungradeable legs | hand-set |
| 8 | `app/src/lib/consistency/official-snapshot.mjs` (#1149) | The NBA snapshot is PRIVATE, its `capability` is stamped product-closed, and every v0.1 family is `PRIVATE_SHADOW`. `evaluateMarket` therefore never qualifies an NBA evaluation | snapshot |
| 9 | `app/src/lib/parlays/v2/candidate.mjs:~193` (#1141, not on this branch) | `evaluateCandidate` checks NBA against the real registry, whatever was injected | registry, hard-wired |
| L | `app/src/lib/legal/texts.mjs:61` | Terms: the Site does not "link to or partner with any sportsbook" | legal |
| D | `app/src/lib/launch/founder-decisions.mjs:33-44` | `decision-nba-markets-authorization` is open. Its token is `AUTHORIZE:h2h:<ceiling-credits>` | founder |
| P | `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §7 / §13 | Every PUBLIC → PRODUCT ELIGIBLE bar needs a price receipt and priced rows. §13 withholds product legs | preregistration |

`app/src/lib/products/nba/nba-product-exposure-invariant.test.mjs` exercises points R, 1–8, the adapter itself, and point 9 once
#1141's file is present. While R is HISTORICAL_ONLY, each point must refuse on its own, and the test lists every
leak it finds. I mutation-checked it locally: flipping any one of the following turns it red:

- `NBA.eligible`
- `SETTLEABLE_SPORTS`
- `FAMILY_PRODUCT_GRANTS`
- the NBA candidate list
- lab `SOURCES`
- the registry state

## 2. Market mismatch: even with every switch flipped, NBA has no complete leg path

| Layer | What it covers for NBA today |
|---|---|
| Authorization token (D) | `h2h` (moneyline) only |
| Official snapshot + evaluator (8) | **player over/unders only** (pts reb ast threePm pra ptsReb ptsAst; minutes is not a product market). Team score, margin and total are WITHHELD. `evaluateMarket` has no moneyline family, so an Elo `pHome` is not evaluated against an h2h price |
| Settlement (`app/src/lib/sports/nba/settlement-contract.mjs` MARKETS) | **team markets only**: moneyline, point_spread, total_points. No player-prop grader exists |
| Prereg §7 product bars | per market. Winner needs ≥ 300 priced games. Player families need ≥ 500 priced rows with a hit rate at or above break-even |

So no market today is authorized, evaluated and settleable all at once. Choosing which of these closes first is a founder decision (§7, Q1). The adapter refuses non-player
markets (`NOT_PLAYER_MARKET`). `tierView` refuses every NBA player leg with `NO_SETTLEMENT_PATH` until a player-prop
settler exists.

## 3. What this branch adds (all pure, all inert)

- **`app/src/lib/products/nba/nba-leg.mjs`**: `nbaLegFromEvaluation({ evaluation, snapshot, verification, registry })`.
  - **Produces a leg only when all of these hold:**
    - the real registry admits NBA;
    - the evaluation is qualified, with no withheld reasons and a lean of OVER or UNDER, for a player product family;
    - the snapshot is the official NBA schema, has the same snapshotId and eventId as the evaluation, is PUBLIC, and is stamped product-open;
    - a verification object is present, with: `operatorVerified` set by a named verifier, an NBA authorization receipt ref, the same event/athlete/family/line/book/capture as the evaluation, American prices that reproduce the evaluator's raw implied pair exactly, the side price inside LEG_BOUNDS, and no link field or URL value.
  - **Otherwise:** it returns a typed refusal listing every reason, plus the evaluator's own withheld reasons.
  - **A leg carries:**
    - `snapshotId`, `eventId`, `providerAthleteId`, `family`, `line`, `book`, `capturedAt`, `modelVersion`, `frozenAt` and `lockAt`/`eventLockAt`;
    - the evaluator's `pOver`/`pUnder`/`pPush`/`decisive`/`implied`/`edge`/`ev`, copied verbatim (deep-frozen; tests use `Object.is`);
    - correlation keys;
    - `handoff: { status: HANDOFF_NOT_AVAILABLE, prefill: UNSUPPORTED, link: null, operatorName }`.
  - A leg built with an injected registry is stamped `provenance: TEST_FIXTURE`.
- **`app/src/lib/products/nba/product-tiers.mjs`**: tier views for Bank Builder, Moonshot and Parlay Lab low/medium/high/longshot. A view holds the **same frozen leg object** and adds only qualification, payout and relative-risk text. Every bar is read from its existing owner, and no new number is introduced:
  - `SELECTION_POLICIES` bank-builder@1 / moonshot@1
  - `PARLAY_ODDS_BANDS`
  - `BAND_MAX_LEGS`
  - `LEG_BOUNDS`

  moonshot@1 is `teamMarketsOnly`, so it refuses an NBA player leg at qualification while showing the same lean. Risk text is relative ("lower relative risk than…", "most cards in this tier are expected to lose"). `RISK_OVERCLAIM` bans safe/guaranteed/risk-free/certain.
- **`app/src/lib/products/nba/cross-sport.mjs`**: windows, expiry, product day, same-game and duplicate-market rules, plus the mappings into #1141 (§4–§5).
- **Tests** (all synthetic inputs are labelled TEST FIXTURE, in `__fixtures__/permissive.mjs`):
  - `nba-leg.test.mjs` (9): **(a)** every committed v0.1 game × player × family × three invented price pairs refuses under the real registry. **(b)** with a permissive fixture registry, the leg's numbers equal the evaluator's exactly, and every gate refuses on its own. **(c)** Bank Builder, Parlay Lab Longshot and Moonshot hold the same leg and lean and differ only in qualification and payout. Risk text is relative.
  - `cross-sport.test.mjs` (6).
  - `nba-product-exposure-invariant.test.mjs` (7).

## 4. Cross-sport handling

| Concern | Rule (`cross-sport.mjs`) | Why |
|---|---|---|
| Tip-off vs kickoff | Every leg locks at start − 30 min (`LEG_BOUNDS.activationCutoffMs`). An NBA tip (typically 23:00–03:30Z) and an NFL kickoff (17:00/20:25/00:15Z) or MLB first pitch follow the same rule | one cutoff across products already (D4/D5) |
| Card activation | A card can be activated only before its **earliest** leg lock (`cardWindow.activateBy`). An unknown start fails closed | a card with one started leg is a late activation |
| Market expiry | Leg expiry = min(capturedAt + 12 h, eventLockAt). Card expiry = its earliest leg expiry | `LEG_BOUNDS.maxPriceAgeMs`, the evaluator's own staleness bound |
| Product day | Legs belong to the ET date of their start, so a 00:30Z tip is the previous evening's slate. A card never mixes product days (`MIXED_PRODUCT_DAYS`) | same rule as `build-product-eligible-legs` |
| Same game | D5: one leg per event. Two NBA props in one game never share a card, whether they are different players or PTS and PRA of one player | no validated same-game joint price exists. Composite families (PRA ⊃ PTS) are maximally correlated |
| Correlation caps | #1141's `PROPOSED_CROSS_SPORT_CORRELATION_CAPS` (≤ 3 legs/league, ≤ 2/market family, ≤ 1/team) stay **disabled** until a founder decision. NBA legs carry `team:nba:<abbr>` and `family:` keys so the caps would apply unchanged | no validated correlation model sets them |
| Duplicate markets | The same (event, athlete, family, line) quoted by several books counts as **one** market. If the books' leans disagree, the market is refused. If they agree, one representative is kept, by newest capture then book key ascending, **never by price**. Alternates are recorded | one official forecast per market. Best-price selection is a separate display-policy decision (#1130) |
| Settlement | A card is refused if any leg's sport is not in `SETTLEABLE_SPORTS` (existing). NBA joins only when a player-prop grader exists | a card that cannot be graded must not publish |

## 5. Plugging into #1141 (`gtp.parlay.candidate@1`): stacking, no edits to #1141

The branches stack as #1130 (operator allowlist) ← #1141 (Parlay Lab V2) and main ← #1149 ← this branch. I did not modify #1141.

**Mapping.** `toParlayCandidateInput(leg)` fills exactly the 22 fields #1141's `toCandidate` reads, as of #1141 head 499a30d29f. The test pins the list.

- `modelId = leg.modelVersion` (split by `parseModelId`)
- `modelProbability` = the side's evaluator probability, verbatim (pOver for OVER, pUnder for UNDER)
- `price` = the side's American price
- `startUtc = lockAt`
- `market` = provider player-prop key (`player_points`, …)
- `receipts` = snapshot, evaluation identity key, authorization and price receipt refs

**Gap in candidate@1.** It has no `pPush` or `ev` field. Two options:
- **(a)** keep them reachable through `receipts` (today's mapping);
- **(b)** add an additive `evaluation` block in a `candidate@2`.

I recommend (b) when #1141 next revs. No product may re-derive EV from `probability` and price.

**Follow-up branch, after #1130 → #1141 and #1149 merge.** One commit on top of #1141:
- `candidatesFromNbaLegs(legs)` → `toCandidate(toParlayCandidateInput(leg))`, wired into `candidatesFromPublished` behind the registry.
- #1141's existing hard NBA check (`canEnterPredictionProducts("nba") && canEnterLeague("nba")`) stays as it is.
- Point 9 of the invariant starts running automatically once `parlays/v2/candidate.mjs` exists on the branch.

## 6. Smart Betslip handoff

- **Status:** compare-only. #1141's `smart-slip.mjs` has the constant `HANDOFF_NOT_AVAILABLE` ("Sportsbook handoff not available"). Its roadmap note is SB-L2 verified operator prefill, which needs operator docs, book IDs and a legal/Terms review.
- **Prefill is unsupported, and the current Terms forbid it** ("does not … link to or partner with any sportsbook").
- **Strongest fallback:** no link, operator name only. `toSmartSlipRow(leg)` returns:
  - book = operator display name
  - price
  - capture time
  - `handoff { status: HANDOFF_NOT_AVAILABLE, link: null, prefill: UNSUPPORTED }`

  The page prints #1130's "Sportsbook availability varies by state." beside any book name.
- **Guards:**
  - The adapter refuses a verification object carrying any `*url/*uri/*href/*link` key or a URL value.
  - The invariant scans every NBA source file and every committed NBA data artifact (public + internal forecast/board files) for sportsbook URLs, app deep-link schemes and betslip parameters. It finds none.
  - Note: ESPN's raw scoreboard JSON does carry DraftKings `BetSlipDeepLink` gateway URLs (seen in `app/scripts/ops/fixtures/nba-finals-waiter/*.recorded.json`). No committed data artifact carries them today. The data scan is what keeps it that way.

## 7. Activation sequence (exact order; each step is its own reviewed PR or decision)

Nothing below may be done by an agent without the named approval. Each step's evidence must exist before the next step opens.

1. **Authorization receipt.**
   - The founder answers `decision-nba-markets-authorization`. The current token is `AUTHORIZE:h2h:<ceiling-credits>`.
   - **Open question Q1:** h2h alone does not unlock player-prop legs (§2). Player legs need either an expanded token naming the player-prop markets and a ceiling, or a separate decision card.
   - Validation: `npx tsx scripts/ops/founder-decision-dryrun.mjs --decision decision-nba-markets-authorization --token <answer>`.
   - Output: an NBA-scoped receipt on the UFC/EPL pattern (own ledger, own ceiling). Its ref becomes `verification.authorizationReceiptRef`.
2. **Odds capture.**
   - Run the provider-neutral NBA capture under that receipt: dry-run first, then a write-once dated capture with its own `capturedAt` and the snapshot-contract sanity band.
   - Capture runs on the pre-tip schedule so a price exists before every receipt's lock.
   - Output: `verification.{overAmerican, underAmerican, capturedAt, book, priceReceiptRef}`. It is never synthesized.
3. **Operator allowlist (#1130).**
   - Merge #1130, then make #1141's one-line seam change (`isVerifiedOperator = isEligibleProvider`).
   - Output: `verification.operatorVerified` / `verifier = "eligible-operators@1"`. An offshore book never verifies.
4. **Registry move.**
   - Open the PR moving NBA out of HISTORICAL_ONLY, with its evidence files. `canEnterPredictionProducts` needs FULL_MODEL. The narrower alternative is a per-family `FAMILY_PRODUCT_GRANTS` entry (engine-v2 only).
   - The same PR updates the invariant's first test.
   - It **stays draft** until steps 5 and 6.
5. **Prereg bars.**
   - Evidence that each market being admitted meets §7's PUBLIC FORECAST bar and its PUBLIC → PRODUCT ELIGIBLE bar on the forward shadow (§8: pre-tip artifacts, graded nightly).
     - Player families: ≥ 500 priced rows with a hit rate at or above break-even at the market line.
     - Winner: ≥ 300 priced games, not worse than the de-vigged close.
   - This needs weeks of step-2 captures. Report per market, never pooled.
   - The snapshot families then move from `PRIVATE_SHADOW` to `PUBLISHED`, which is the coordinator's/consistency owner's change in `official-snapshot.mjs`.
6. **Founder approval.**
   - The founder approves the registry PR and the switch PR below, naming the markets admitted.
   - The switch PR, one reviewed change after approval:
     - `sport-eligibility.ts` NBA `eligible: true`
     - an NBA normalizer in `build-product-eligible-legs.mjs` built on `nbaLegFromEvaluation`
     - a lab `SOURCES.nba` entry
     - `SETTLEABLE_SPORTS` + `nba`, only with a player-prop grader that has its own tests
     - new frozen selection-policy versions: bank-builder@2 admitting NBA player legs (moonshot@1 stays team-only)
     - the #1141 wiring in §5
   - The exposure invariant is rewritten in that same PR to assert the new, narrower admission (named markets only).

**Rollback.** Revert the switch PR. The registry stays the outer gate: reverting R alone re-closes points 2, 4, 5, 8, 9 and the adapter, and the hand-set points are closed by the revert.

## 8. Open founder questions

- **Q1.** Which NBA market opens first: h2h (authorized token shape, settler exists, but no evaluator family and no §7 winner product bar yet) or player props (evaluator + snapshot ready, but needs a new authorization shape and a settler)?
- **Q2.** Should the cross-sport correlation caps (#1141, PROPOSED) turn on when NBA joins? NBA adds many same-night legs per team.
- **Q3.** Duplicate-market representative rule (newest capture, then book key): confirm, or choose a price-based rule under #1130's display policy.
- **Q4.** candidate@2 additive `evaluation` block (§5) or receipts-only.

## 9. Wired behind the gates (branch `claude/nba-parlay-integration`, stacked on this branch + #1141 + PR 1155)

Everything below is wired through the existing exclusion points with **no flag or registry change**. Under the real
registry NBA contributes zero legs to every product; every test that shows NBA cards uses TEST FIXTURE inputs
(`app/src/lib/parlays/v2/__fixtures__/nba-fixtures.mjs`, `app/src/lib/products/nba/__fixtures__/permissive.mjs`),
never anything under `app/public/data` or `data/`.

**Parlay Lab V2 (four tiers).** `app/src/lib/parlays/v2/nba-source.mjs`: nba-leg legs → `dedupeMarkets` +
`toParlayCandidateInput` → `gtp.parlay.candidate@1` (`evaluatePool`) → `composeCards` (distinct events, one exposure
per player per card, verified two-way prices only, `BAND_MAX_LEGS`, cross-sport windows) → `recommend.mjs`
`evaluateCard` / `recommendTiers`. With a permissive TEST registry + fixture prices every tier holds an NBA-only and
an NBA+NFL card (NBA+UFC too). `recommend.mjs` adds three NBA leg gates: a settlement path (the NBA contract grades
moneyline / spread / total only, so **player props are refused today even when every other gate opens**), a
verified two-way price, and provenance (snapshot id, model version, authorization receipt, odds time). The sport gate
and NBA settlement are injectable for tests only; under an injected gate a non-FIXTURE leg still needs the real
registry, so injection cannot launder a real leg. `candidate.mjs` takes an optional `nbaRegistry` that admits
FIXTURE-provenance NBA candidates only.

**Same-game correlation.** `SAME_GAME_POLICY.mode = "REFUSE"`, `correlatedMethod: null`. Two legs from one NBA game
never share a card and never get a combined price. A correlated pricing method would have to be validated and named
there first.

**Board empty state.** `/build` (flag `NEXT_PUBLIC_PARLAY_LAB_V2=1`, default off) reads `nbaSourceStatus()`:
"NBA legs need an authorized NBA price. …" with the three gates (registry, price authorization, player-prop
settlement), rendered as a note above the tiers, never as an empty NBA card.

**Card identity for the Smart Betslip (Lane E, PR 1165).** Card legs keep `{sport, eventId, playerId, family, market,
side, line}`; for NBA `playerId` is the providerAthleteId. `app/src/lib/slip/**` is not touched.

**Bank Builder / Moonshot.** `app/src/lib/products/nba/nba-team-leg.mjs`: the official moneyline side (snapshot winner
side, `pHome` / `pAway` copied verbatim) + an authorized two-way moneyline quote + the settlement contract →
team leg; `nbaProductAdmission` reports four layers: leg, eligible-leg contract (real registry), frozen tier policy
(bank-builder@1 / moonshot@2 via product-tiers.mjs, where moonshot@2 accepts a TEAM leg and still refuses a player
leg), and the hand-set sport rule. `sport-eligibility.ts` now returns the typed code `NBA_GATED` with its three gates;
`eligible` stays `false` (the activation PR's last switch). The NBA player-leg Bank Builder policy exists only as
`bank-builder-nba-player@0-proposed` (`proposed-policies.mjs`, inactive, not in `SELECTION_POLICIES`).

**Settlement routing.** PR 1155's `legGradingRoute` is merged in: an NBA leg is refused (`UNSUPPORTED_SPORT`), never
graded against MLB, NFL, UFC or EPL rules. Every composed leg names its sport, so none can fall to the legacy
MLB default.

**Exposure invariant.** "INERT" became "GATED": only `nba-source.mjs`, `board-model.mjs` and the TEST FIXTURE slate
may import the NBA product modules, and point 12 proves each refuses under the real registry.

## HARD BLOCKER: NBA player-prop legs (release owner, 2026-10-21)

**No NBA player-prop leg may appear in any product until both of these hold:**
1. An NBA **player-prop grader** exists. Today the NBA settlement contract grades team markets only.
2. That grader has been **graded forward**: shadow-settled on real frozen pre-tip rows against official box scores, with stat corrections handled (PR 1154 re-check).

This holds even if authorization, an odds feed, the registry and every flag are open.

**Until then:** prop cards stay refused, and `bank-builder-nba-player@0-proposed` stays inactive.
