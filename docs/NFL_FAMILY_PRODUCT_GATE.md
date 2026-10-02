# NFL family-level product gate (canonical)

Established Session 8 (2026-10-02). Code: `app/src/lib/products/engine-v2/family-gate.mjs`. Daily output:
`nflFamilyGate` inside `data/internal/products/recommendation-universe/<date>.json`.

## 1. The contract

The sport registry admits a sport into official products only at FULL_MODEL. NFL is EXPERIMENTAL_PUBLIC.
Promoting the whole sport would let one good family launder every weaker family into Bank Builder, so
leg-floor@2 gate 1 now has a narrower door. **One sport-family** may lift `SPORT_GATED`, and only when both
of these hold:

1. **A founder grant** in `FAMILY_PRODUCT_GRANTS`. Grants are code, so each one is a reviewed PR, and the
   list is empty today.
2. **Zero evidence blockers**, derived fresh at every universe build from the slate's own receipts and the
   committed forward receipt. A grant never outlives its evidence.

A granted family still faces every per-leg gate: role, availability, price, staleness, start/cutoff,
settlement. A grant for `anytime_td` never admits `player_receptions`, and that is tested.

| Blocker | Evidence read |
|---|---|
| FAMILY_NOT_PUBLISHED | model-status / board family state |
| NO_MODEL_PROBABILITY | receipts with `probabilityKind = MODEL` and a probability (a projection is not one) |
| MODEL_FORWARD_BREACHED / _ACCUMULATING / _UNREGISTERED | forward receipt **for the model the board names** (`modelVersion`) |
| ROLE_CONFIRMATION_UNAVAILABLE | receipts whose role is AVAILABLE_ROLE_CONFIRMED / STARTER / CONFIRMED |
| PRICES_NOT_CAPTURED | receipts with a sportsbook and a price |
| SETTLEMENT_NOT_PROVEN | `settlementSupport === PROVEN` (the family has graded through the canonical path) |
| NO_FOUNDER_GRANT | `FAMILY_PRODUCT_GRANTS` |

## 2. Anytime TD — product-eligibility checklist (Sunday 2026-10-04 slate, 293 rows)

| Requirement | State | Evidence |
|---|---|---|
| Event / player / team identity | ✅ | `nfl-<espnEventId>`, `nfl-athlete-<espnId>`, roster team on every row |
| Event start | ✅ | board `kickoffUtc` |
| Model status | ✅ PUBLISHED | `nfl/model-status.json` `anytimeTd.state` |
| Model version | ✅ (fixed S8) | `nfl-anytime-td-opportunity-v1` on the Week 4 boards. Was `null` on every receipt: the loader read model-status, which has no ATD entry |
| Frozen GTP probability, `MODEL` / `MODEL_PUBLISHED` | ✅ 293 / 293 | board `players[].markets.anytime_td.probability`; `forecast.generatedAt` = board generation (fixed S8, was null) |
| Role confirmed | ❌ **0 / 293** | No producer emits a confirmed role. The board vocabulary is INACTIVE / QUESTIONABLE / ACTIVE_PROJECTED / AVAILABLE_ROLE_UNCERTAIN. The T-55 pass (`nfl-pregame-free-refresh`, Thursday/Monday) can only *remove* players ("Out · Coach's Decision"). It cannot confirm one. |
| Availability (not OUT / INACTIVE / Q) | 253 available-role-uncertain, 40 QUESTIONABLE | Q rows are refused by the floor. No participation probability is invented. |
| Real pre-kickoff price | ❌ **0 / 293** | The authorization covers `player_anytime_td` (Amendment 2, ceiling 1,160, 549 used). The last prop probe was `capture-20260928T2224`; Week 4 is `NOT_PROBED` (15 events). Week 3 priced 236/273, of which 151 were stale (>12 h) at the as-of. |
| Settlement path | ❌ **SCHEDULED_UNPROVEN, and stalled** | See §3 |
| Product cutoff | n/a until the above clear | |

### 2a. Model quality (the published model: `nfl-anytime-td-opportunity-v1`)

- **Historical replay (P301):**
  - Constants were fit on 2013. Blind held-out 2014–2021, n = 35,128.
  - Log loss 0.504 vs a rolling-rate baseline of 0.520.
  - ECE 0.020, level 1.035. Verdict **ELIGIBLE** against its preregistered bars (ECE ≤ 0.03 overall and ≤ 0.04 per era; level in [0.92, 1.08]).
- **Top-bin over-prediction in the replay:**

  | Bin | Predicted | Actual |
  |---|---|---|
  | 0.54 | 0.54 | 0.44 |
  | 0.64 | 0.64 | 0.55 |
  | 0.74 | 0.74 | 0.61 |
  | 0.83 | 0.83 | 0.53 |

  These are exactly the legs a max-probability product would choose.
- **Forward 2026 (P301 protocol, weeks 2–3):**
  - State ACCUMULATING, n = 524 of the 1,000 needed.
  - Log loss 0.487 vs a constant rate of 0.501.
  - **Level 1.18 and ECE 0.043 currently sit outside the forward bars** (level [0.90, 1.10], ECE ≤ 0.04). No verdict is issued before n = 1,000.
- **No bar anywhere compares the model to the sportsbook market.** A model-vs-market edge for ATD is unmeasured.

**Conclusion:** even with roles, prices and settlement fixed, promoting ATD now would mean promoting a model
whose forward evidence is (a) incomplete and (b) currently miscalibrated high. That is a model gate, not
plumbing. The forward test resolves itself at n = 1,000 (roughly 2 more weeks of slates). Nothing was tuned.

## 3. NFL prop settlement — current truth

- **Grading logic exists:** `lib/sports/nfl/live-prop-state.mjs` reads the ESPN summary.
  - ATD settles YES/NO on any touchdown.
  - No stat row gives NO_MEASUREMENT, which is neither void nor loss.
  - A game that is not final stays PENDING.
- **The producer that would run it is not automated:**
  - `nfl-live-props` (paid) is `disabled_manually`.
  - `nfl-live-props-free` is **workflow_dispatch only, by design** (a header comment forbids a schedule). Its last run was 10-02 00:56Z, before PIT @ CLE went final.
  - All `nfl/live-props/*.json` are `IN_PROGRESS` with `settled: 0`.
  - `data/internal/nfl/prop-settlement/` does not exist.
- **`settlementSupport` is mis-derived.** `nfl-boards.mjs` reports SCHEDULED_UNPROVEN whenever *any workflow file mentions* the settler, and the only files that do are a disabled workflow and a dispatch-only workflow. The state still blocks, so this does not change any decision, but "scheduled" is false.
- **A separate model record** (`reconciliation/2-0N.json`, ESPN box scores) grades ATD.

  | Week | Graded | Scored | Expected | Void |
  |---|---|---|---|---|
  | 1 | 180 | 49 | 39.9 | 42 |
  | 2 | 256 | 45 | 62.3 | 53 |
  | 3 | 246 | 60 | 58.8 | 63 |
  | TNF | 16 | 5 | 3.2 | 2 |

  It is not the product settlement path, and the gate does not read it.

**To reach PROVEN** (each step is an ops/founder decision, and none of them was made this session):
1. A cadence for the free (ESPN, $0) live-props producer after finals. The comment says a human chose to
   stop that cadence.
2. Fold the FINAL rows into `data/internal/nfl/prop-settlement/`.
3. Have `nfl-boards.mjs` read that ledger instead of `graded-picks.json`.

## 4. Other NFL families

| Family | Probability? | Published model | Forward | Settlement | Price | Blocker |
|---|---|---|---|---|---|---|
| passing yards | projection only | share-level v1, ESTIMATE_BELOW_BAR | ACCUMULATING 66/300, ECE 0.108 | unproven/stalled | Week 3 only | calibration bar failed; no P(over) |
| rushing yards | projection only | share-level v1 | ACCUMULATING 216/300, ECE 0.062 | unproven/stalled | Week 3 only | no calibrated P(over) mapping |
| receiving yards | projection only | props-v1 (share-level is FORWARD_BREACHED) | none for props-v1 | unproven/stalled | Week 3 only | no calibrated P(over) |
| receptions | projection only | props-v1 (share-level is FORWARD_BREACHED) | none for props-v1 | unproven/stalled | Week 3 only | no calibrated P(over) |

Converting a projection distribution into P(over line) is model research and a methodology gate. Nothing
was manufactured.
