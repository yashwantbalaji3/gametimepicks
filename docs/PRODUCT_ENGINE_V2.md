# Product Engine V2 — contracts (Session 7, 2026-10-02)

Canonical description of the V2 leg contract, the per-product V2 policies, and what is public vs shadow.
Ownership: COMMON / UNASSIGNED. Current truth = this file + the code it names + Production; the Session 7
handoff is the point-in-time record.

## 0. State in one paragraph

Every daily product still publishes under **V1**. V2 adds **one leg contract** (RecommendationReceiptV2 +
leg-floor@2) over every sport. It also adds a **daily recommendation universe** that measures GameTimePicks-vs-market
probability coverage, and a **Suggested Parlays V2 forward shadow**. For Bank Builder and Moonshot, V2 means the
**preregistered C1 policies** (BB-C1, MS-C1), which are already in forward shadow.

Making any V2 selector public is a **founder / methodology gate** (§9). The capability registry admits only
MLB (FULL_MODEL) into official products. Every MLB leg that clears the floor is a **market-implied team market**,
admitted transitionally under founder decision F1 = A. So today no product leg carries a GameTimePicks model
probability.

## 1. RecommendationReceiptV2 — `app/src/lib/products/engine-v2/receipt.mjs`

```
schema: "recommendation-receipt@2"   receiptId: sport:eventId:marketKey:participant|-:side:line   legClass: TEAM | PLAYER
identity:  sport, eventId, eventStartUtc, participantId, participantDisplay, teamId, opponentId, matchup
market:    family, marketKey, side, line, binary, sportsbook, price (null if unread — never -110),
           marketCapturedAt, marketReceiptId, marketImpliedProbability, selectionLabel
forecast:  forecastOwner, forecastId, modelVersion, projection,
           probabilityKind   MODEL | MARKET_IMPLIED | NONE          ← always explicit
           probabilityDetail MODEL_PUBLISHED | MODEL_EXPERIMENTAL | MODEL_DEMOTED |
                             MODEL_DISTRIBUTION_UNCONVERTED | MARKET_IMPLIED | NONE
           probability       ONLY when detail = MODEL_PUBLISHED (the one readable GTP number)
           unusableModelProbability  a demoted/experimental model's number, kept and labelled
           confidence, modelStatus, publicationStatus, generatedAt, frozenAt (stamped at product freeze)
context:   availabilityState, roleState, rosterTeam, familyValidationState,
           settlementSupport PROVEN | SCHEDULED_UNPROVEN | UNSUPPORTED, withheldReason, sourceRefs
```

Missing is null, never zero. A market number can never sit in `probability`. That is the anti-masquerade
rule, mutation-probed in `engine-v2.test.mjs`. Source adapters (`sources.mjs`) only reshape the existing owners:
- v1.7 normalizers for MLB, NFL, EPL and UFC team/fight markets;
- `from-nfl-board.mjs` via `nfl-boards.mjs` for NFL player rows (the Sunday ops command reads the same loader);
- the optimizer leg pool for MLB props.

## 2. ProductEligibleLegV2 — leg-floor@2 — `engine-v2/eligibility.mjs`

There is one floor for all three products. They differ by CARD, not by leg: Moonshot may take more variance,
not worse data. Every failing gate is reported:

| # | Gate | Exclusion code(s) |
|---|---|---|
| 1 | sport may enter official products (`canEnterPredictionProducts`, FULL_MODEL only) — or, for a sport below FULL_MODEL, ONE sport-family with an active family grant (founder grant + zero evidence blockers; `family-gate.mjs`, Session 8, `docs/NFL_FAMILY_PRODUCT_GATE.md`) | `SPORT_GATED` |
| 2 | identity (event, family, side; participant for players) | `IDENTITY_MISSING` |
| 3 | model/publication: demoted model | `MODEL_DEMOTED` |
|   | experimental model | `MODEL_NOT_PUBLIC` |
|   | family state outside the ALLOWLIST PUBLISHED / VALIDATED_PICK / ADOPTED | `FAMILY_NOT_CLEARED` |
|   | over-allocated rushing pool | `RUSH_POOL_WITHHELD` |
| 4 | players: availability blocked (OUT/QUESTIONABLE/DOUBTFUL/INACTIVE/SUSPENDED/UNKNOWN) | `AVAILABILITY_BLOCKED` |
|   | role not confirmed (`AVAILABLE_ROLE_UNCERTAIN` is not confirmed) | `ROLE_UNCERTAIN` |
| 5 | a readable probability: market-implied only for TEAM legs, only while `MARKET_PRICED_LEG_POLICY` admits it (F1) | `NO_PROBABILITY`, `MARKET_IMPLIED_NOT_ADMITTED` |
| 6 | a real market: book + price + capture time (+ line where the market has one) | `MARKET_MISSING` |
|   | price in −650…+400 | `ODDS_OUT_OF_RANGE` |
|   | ≤ 12 h old | `ODDS_STALE` |
|   | captured before as-of and before start | `ODDS_CAPTURED_AFTER_AS_OF`, `ODDS_CAPTURED_AFTER_START` |
| 7 | event start known and ≥ 30 min after as-of | `EVENT_START_UNKNOWN`, `EVENT_STARTED`, `EVENT_INSIDE_CUTOFF` |
| 8 | settlement path PROVEN | `SETTLEMENT_UNSUPPORTED` |

Card-level codes: `SAME_EVENT_CONFLICT`, `SAME_ENTITY_CONFLICT`, `DUPLICATE_LEG` (`cards.mjs`). The bounds are V1's
`LEG_BOUNDS`, not new numbers. **Parity:** on all 9 committed daily universes (09-21 → 10-01) leg-floor@2 admits
exactly the V1-eligible set (`floor-parity.test.mjs`).

## 3. Daily recommendation universe — `app/scripts/products/build-recommendation-universe.mjs`

daily-products runs it after the selector shadow (skipped on `INPUT_UNAVAILABLE`), and it is network-free.
It writes `data/internal/products/recommendation-universe/<date>.json`, write-once per date. The file holds:
- the floor;
- registry state per sport;
- the §12 coverage table (sport × family: candidates, GTP probability any / usable, market-only, none, priced, eligible);
- every exclusion code counted;
- eligible receipts in full.

Ineligible rows are counts only, to keep the commit small; `--json` prints every row.

### Measured (Session 7 baseline, committed inputs)

| Slate (as-of) | Candidates | Eligible | GTP prob usable | Market-only | None | Binding blockers |
|---|---:|---:|---:|---:|---:|---|
| Sun 09-27 (14:00Z) | 1,363 | 84 (all MLB team markets) | 273 (NFL anytime TD) | 84 | 603 | NFL: SPORT_GATED 904, SETTLEMENT_UNSUPPORTED, ROLE_UNCERTAIN; MLB props: MODEL_DEMOTED 375 |
| Thu 10-01 (14:00Z) | 92 | 6 (MLB, 1 game) | 18 (NFL TD) | 6 | 41 | MARKET_MISSING 80, SPORT_GATED 61 |
| Sun 10-04 (14:00Z, Week 5 boards as of 10-02) | 751 | 0 | 293 (NFL TD) | 0 | 430 | MARKET_MISSING 751 (Week 5 props not yet captured), SPORT_GATED 751 |

- **Usable GTP probability coverage among ELIGIBLE legs: 0.** The only usable model probabilities (NFL anytime
  TD, family PUBLISHED) sit in a sport the registry gates. They are also role-uncertain and on a settlement path
  that has never graded a prop.
- MLB props (the Suggested Parlays V1 pool) are 100% `MODEL_DEMOTED`: hits, total bases, H+R+RBI and pitcher Ks
  are all DEMOTED_TO_MARKET_CONTEXT.
- ⚠ NFL boards are committed as the latest version per event, not time-locked. A past-slate NFL replay reads
  later captures, which the floor flags as `ODDS_CAPTURED_AFTER_AS_OF`. MLB's committed daily universes ARE time-locked.

## 4. Suggested Parlays V2 — SHADOW — `engine-v2/suggested-parlays.mjs` (policy `SP-V2@<hash>`)

**V1 (public, unchanged).**
- Ranking: optimizer slips ranked by `score = Σ edgePct/100 − 0.05·(legs−2)`, from the demoted MLB prop model's
  projection-vs-line edge (`parlay_optimizer.py`). The ladder takes the top score per band, ties to fewer legs.
- What the ranker does not use: GTP probability, market probability, freshness and availability. V1 is
  edge-driven, and the edge is a demoted model's.
- Current output: since F-1 (09-30) every card is withheld. The pool is structurally empty.

**V2 (shadow).** Tiers are the canonical bands and V1's leg caps:

| Tier (public label) | Band (combined) | Legs | Per-leg floor (readable p) | Objective |
|---|---|---|---|---|
| Low Risk | −200 … +100 | 2 | — | maximise joint probability |
| Medium Risk | +100 … +300 | 2–3 | ≥ 0.40 | maximise fair ratio (0.01 resolution), then joint p |
| High Risk | +300 … +600 | 2–4 | ≥ 0.35 | same |
| Longshot | > +600 | 2–5 | ≥ 0.25 | same — never "biggest payout" |

Rules that apply to every tier:
- **Fair ratio** = joint p × combined decimal, i.e. the share of the price the book did not keep.
- **Ties** go to fewer legs, then receipt ids.
- **One leg per event**, no team or player twice, and legs are disjoint across tiers (filled Low → Longshot).
- **No card** → `NO_QUALIFYING_CARD` with a typed reason (`NO_ELIGIBLE_LEGS`, `TOO_FEW_EVENTS`, `NO_CARD_IN_BAND`,
  `LEG_FLOOR_EXCLUDES_ALL`). A floor is never lowered.
- **Pricing:** `pricingKind: DERIVED_INDEPENDENT_PRODUCT`, never presented as an SGP price.
- **Probability label:** `jointProbabilityBasis` is `MARKET_IMPLIED` whenever a leg's only probability is the book's.

**Replay (time-safe) — `replay-suggested-parlays-v2.mjs` → `data/internal/products/engine-v2/sp-replay.json`.**
- Inputs: V2 reads the committed eligible-legs universe for each day at that file's own as-of. V1 is the ladder
  as published plus its lab settlement.
- Days: 09-21 → 10-01. 09-28/29 have no universe and are not reconstructed.

| Tier | V1 published / W-L | V2 publishable / W-L | V2 median price | V2 market-expected wins |
|---|---|---|---|---|
| Low Risk | 0 / — | 3 / 2-1 | −119 | 1.47 |
| Medium Risk | 7 / 0-7 | 8 / 3-5 | +129 | 3.15 |
| High Risk | 7 / 0-7 | 8 / 4-4 | +302 | 1.79 |
| Longshot | 7 / 1-6 | 8 / 1-7 | +616 | 0.97 |

- Legs V1 published that pass leg-floor@2: **0 of 72** (all MODEL_DEMOTED).
- V2 rule violations (started leg, same event): **0**.
- **Conclusion:** n = 27 V2 cards against 7.4 market-expected wins. The outcomes are not evidence of selection
  skill and were not used to choose anything.
- **What the replay does establish:** V2 publishes on every day with ≥ 2 MLB events, from legs that pass every
  gate, with truthful pricing and probability labels. V1 publishes nothing from now on.
- **But:** with market-only legs, every V2 ranking is a price-structure preference, not evidence of an edge.

**Forward shadow — `suggested-parlays-shadow.mjs`.**
- `build`: daily-products writes `data/internal/products/engine-v2/sp-shadow/<date>.json` from the committed
  universe. First publication wins, and no universe means no day.
- `grade`: nightly-settle grades from the official linescores into `sp-shadow/ledger.json`. Pending is never a loss.

## 5. Bank Builder V2 — SHADOW = `BB-C1` (`selector/policies.mjs` `V2_CANDIDATES`)

**Objective.** The best controlled-risk card for the CURRENT rung: highest joint readable probability among
cards that reach the rung's required decimal (`goal / carried stake`).

**Ladder.** bb-5 ($100 → 200 → 700 → 1,400 → 3,500 → 10,000):
- won: carries the settled decimal; a pushed leg pays 1.0
- lost: back to Step 1
- push/void: holds
- pending: holds the lane

**Card rules.**
- 2–4 legs, favourites (p ≥ 0.5), one leg per event, no team or opponent twice.
- Lane B never shares an event with Lane A.
- Leg pool = leg-floor@2 (identical to V1 today).

**What changes vs V1 (BB-LEGACY).**
- Lane B ranks for the rung's price instead of being forced into +200…+700.
- Same-entity and opponent are forbidden instead of only recorded.

**No card.** `NO_QUALIFYING_PLAY` with code `PRICE_UNAVAILABLE`, `CONCENTRATION_TOO_HIGH`,
`INSUFFICIENT_CANDIDATES`, `MODEL_STATUS_INELIGIBLE` or `LANE_HELD`.

**Reasoning receipt.** Each shadow day file (`data/internal/products/selector-shadow/<date>.json`) carries the
policy id (hash), rung, required price, pool size, considered/reaching counts, ranking and probability basis.

**Evidence.**
- Historical replay 08-15 → 09-20 (`docs/V17_HISTORICAL_REPLAY_RECEIPT.md`): C1 37-34 vs legacy 32-39 paired.
- Forward shadow 09-21 → 09-30 (`docs/V17_SHADOW_REPORT.md`): C1 6-7, survival 0.462, vs control 9-6 (0.60).
- Gate `NOT_YET` (13 < 20 decided).

## 6. Moonshot V2 — SHADOW = `MS-C1`

**Objective.** A genuinely higher-upside card: 2 legs from different events, both sides allowed, reaching the
rung's price (ms-3: $25 → 100 → 400 → 1,000).

**Evidence floor.** Joint readable probability ≥ 0.20 (0.32 on the final rung). This keeps "higher variance"
from becoming "any price".

**Pool.** The full eligible universe. This differs from live V1, whose pool is the MLB legs Bank Builder did not use.

**Evidence and gate.**
- Forward: 3 decided (1-2).
- Gate `NOT_YET`.
- 12 of 16 shadow lane-days were `PRICE_UNAVAILABLE` (no 2-leg pair reached the rung on the market-priced pool).

## 7. Correlation and same-event policy (all V2 cards)

- **Event:** one leg per event (founder D5). No same-game parlay is ever built, so no SGP price exists or is
  implied.
- **Entity:** no team, opponent or player twice across a card.
- **Correlation model:** none is validated. Cross-event dependence is controlled by these exclusions and never
  priced. There is no joint-probability export beyond the labelled product of marginals.

## 8. Sports — current eligibility (from the registry, not this doc)

| Sport | Registry | V2 legs today | Why |
|---|---|---|---|
| MLB postseason | FULL_MODEL | team markets on game days (market-implied, F1) | props MODEL_DEMOTED; off days → no MLB legs (NO_EVENTS); season over → OFF_SEASON |
| NFL | EXPERIMENTAL_PUBLIC | 0 | sport gated; no family granted. Per-family typed blockers are in the universe's `nflFamilyGate` (Session 8): ATD = forward ACCUMULATING (level 1.18 / ECE 0.043 outside forward bars at n 524/1000), 0 confirmed roles, Week 4 props NOT_PROBED, settlement not proven (free producer dispatch-only) |
| EPL | EXPERIMENTAL_PUBLIC | 0 | sport gated; international break → odds stale until the 10-10 window |
| UFC | SCAFFOLD_ONLY | 0 | gated everywhere, including the sport-ladder READ boundary (Session 7 #919) |
| NBA | HISTORICAL_ONLY | 0 | predictions SHADOW / WITHHELD (Session 6, F-NBA-1) |

## 9. What needs a founder / model gate (not done here)

1. **Suggested Parlays leg source.** Switching the public ladder from the demoted-prop optimizer to the V2
   universe (MLB team markets, market-implied) with the SP-V2 tier objectives.
   - This is a new public ranking methodology (§72), so it stays shadow.
   - The recommendation is in the Session 7 handoff.
2. **BB-C1 / MS-C1 adoption.** The preregistered gate first (≥ 20 decided, survival ≥ control, ≥ 50%
   publication), then the founder.
   - The MLB postseason (≤ 4 games/day, ends late October) likely cannot supply 20 decided lane-days before the
     season ends.
3. **NFL into official products.** This needs a registry promotion (EXPERIMENTAL_PUBLIC → FULL_MODEL) or a
   family-level product gate, plus:
   - confirmed roles (T-55 inactives pass);
   - a PROVEN prop settlement path;
   - pre-kickoff prop prices.
   The anytime TD family is the only one that already publishes a model probability.

## 10. Owners

| Concern | Owner |
|---|---|
| Daily schedule | `daily-products.yml` (workflow_run after mlb-daily-production + 11:41Z backstop) → universe + SP shadow. `nightly-settle.yml` grades the shadows. |
| Freeze | V1 public: the dated ladder file / `placed-lanes.mjs` + md5 money guard. V2 shadow: first publication wins per date. A frozen file is never rewritten. |
| Settlement | Suggested Parlays: `settle-lab-cards.mjs` → `parlays/lab-settled/` (gated sports refused, #919). BB/MS: `settle-mlb-player-props.mjs` → `mr-dub/settled/`, Rule S fold → `mr-dub/portfolio.json`. Shadows: `selector/shadow.mjs` grading rule. |
| Results | `lib/results/projection-core.mjs`: public record = published cards only (D1). Eras typed `POLICY_V1`/`POLICY_V2` (08-17 split). Shadow and candidate populations are never public records. |
| Ask | `getOfficialProductCards` (`lib/ask/tools/official-cards.mjs`) over `data/ask-projection/v1/parlays.json` (`build-ask-projections.mjs`). Official cards only; shadow cards never. |
