# Sprint 044 — Historical Integrity Audit & Leakage Safety Foundation

**Starting SHA:** `1ccddf41` · **Date:** 2026-07-28

Sprint 043 built a gate that stops future identity corruption. It said nothing about what had already
shipped. This sprint answers that question definitively, then builds the lineage and provenance
foundation that makes the question cheap to ask next time.

---

## 1. Starting state (reproduced, not trusted)

| | |
|---|---|
| HEAD / origin/main / production | `1ccddf41`, all three in sync, 0 drift |
| Tests | 3203 / 3199 pass / 0 fail / 4 skip |
| Typecheck · Build | 0 · 0 |
| Python identity tests | 14 / 14 |
| Money | `c5b425a1…` · bankroll `$19,065.40` · 19-14 |
| Bank Builder locks | `cb80473f…` |
| `vp/` | 8 files dirty, uncommitted — untouched, as required |

---

## 2. The historical collision audit — definitive answer

### Money impact: **NONE. Proven, not assumed.**

1. The only money-bearing MLB legs in the ledger are on **2026-06-09** and **2026-06-12**.
2. Both boards validate with **0 identity violations**.
3. The set of collision dates `{05-23, 07-22, 07-28}` and the set of money-bearing MLB dates
   `{06-09, 06-12}` are **disjoint**.
4. `portfolio.json` and `banked-ladders.json` contain **zero** MLB references and zero `gamePk`
   references — the money products are World Cup and NBA.

Money hash, bankroll, and the 19-14 record are unchanged.

### Model-performance ledger: **real corruption, immaterial to conclusions.**

All three collisions are **real doubleheaders**, verified against the official StatsAPI schedule. In
every one, the surviving `gamePk` is **`gameNumber = 2`** — the late game. That is the last-write-wins
signature exactly: game 1's predictions inherited game 2's identity and were then graded against game
2's box score.

| Date | Settled under | Correct game | Misassigned leans | Settled & gradable | **Wrong outcome** |
|---|---|---|---|---|---|
| 2026-05-23 | 824516 (g2) | 824518 (g1) | 21 | 13 | 8 |
| 2026-07-22 | 823519 (g2) | 823518 (g1) | 48 | 44 | 27 |
| 2026-07-22 | 824732 (g2) | 824735 (g1) | 27 | 25 | 14 |
| **Total** | | | **96** | **82** | **49** |

Re-graded against the correct box scores via the MLB Stats API: **49 of 82 gradable legs (60%) carry a
wrong recorded outcome.** Example: Alec Burleson, hits over 1.5 — recorded Loss on 1 hit in game 2,
actually 2 hits in game 1, a Win. Cody Bellinger, total bases over 1.5 — recorded Win on 2 in the wrong
game, actually 1, a Loss.

**Why this hid for months:** both halves of a doubleheader share rosters, so the misassigned legs graded
to Win/Loss instead of erroring. The failure mode was plausible-but-wrong, not missing. A row that
errors gets investigated; a row that says "Loss" does not.

**Materiality:** 49 wrong outcomes out of **21,633 decisive settled legs = 0.23%**. Worst-case correction
moves the lifetime hit rate from 0.5016 by roughly ±0.45pp. It does **not** change the finding that the
modeled MLB markets do not out-predict the market.

**Remediation: none applied, deliberately.** `settled_leans.jsonl` is preserved byte-for-byte.
`data/internal/mlb/integrity/collision-settlement-audit.json` records every affected leg id with its
recorded and corrected outcome. Rewriting history would destroy the evidence that makes the corruption
provable, and "we fixed the bad rows" is indistinguishable from "there were never bad rows" a year from
now.

---

## 3. Settlement lineage validator

`app/src/lib/identity/settlement-lineage.ts` requires every settled result to carry
`predictionId → eventId → marketId → outcome → settlementSource → settledAt`, and fails on:

| Code | Catches |
|---|---|
| `MISSING_LINEAGE` | any link absent — the result cannot be reconstructed |
| `DUPLICATE_PREDICTION` | one prediction settled twice |
| `DUPLICATE_MAPPING` | **the 49-bad-legs defect** — one provider id settled against two events |
| `UNRESOLVED_PROVIDER` | a settled row pointing at an unknown event |
| `IMPOSSIBLE_RELATIONSHIP` | settled before the event started |
| `UNTRUSTED_SOURCE` | graded from something outside the official-source allowlist |

The source list is an **allowlist**, not a denylist: a source nobody thought to forbid is precisely the
one that ends up settling a leg from a search-result snippet.

---

## 4. Research provenance model

`app/src/lib/identity/provenance.ts` answers "when did we know this?" per row.

Three design rules, each from an observed failure:

1. **Eligibility is derived, never stored as an assertion.** A row cannot declare itself research-safe.
2. **Missing information means ineligible.** Fail closed — UFC's features are career aggregates that
   include the fight being predicted, and nothing flagged them.
3. **Ineligible data is retained and labelled, never deleted.** `partitionForResearch` returns both
   halves, because "n = 30" means something different when 400 rows were silently dropped to get there.

Verdicts: `ELIGIBLE`, `POST_EVENT_CAPTURE`, `UNPROVABLE_TIMING` (the NBA `"8:30 PM ET"` case),
`NO_PROVENANCE` (the UFC case), `MALFORMED`.

---

## 5. MLB provenance migration — and a correction to Sprint 043

Sprint 043 concluded: *"no sport enforces a per-row capture timestamp against event start."* **That was
too broad, and measurement here corrects it.**

`npx tsx scripts/audit-mlb-provenance.mjs` over every committed pregame snapshot:

| | |
|---|---|
| Rows evaluated | **6,438** |
| Research eligible (independently re-derived) | **6,438 — 100%** |
| Disagreements with the pipeline's stored flag | **0 of 6,438** |
| Capture lead time before first pitch | min **72 min**, median 279 min, max 1,774 min |
| Rows captured at or after start | **0** |

The precise, corrected statement:

- **MLB's internal pregame research archive DOES enforce per-row provenance.** Every row carries
  `capturedAt`, `availableAt`, `eventStartTime`, and `sourceLastUpdate`, and an independent
  re-derivation agrees with the stored flag on all 6,438 rows.
- **MLB's public serving artifacts do NOT.** `boards`, `team-markets`, and `player-props` carry a single
  file-level `generatedAt` and **zero** per-row `capturedAt` or `eventStartTime`.
- The other sports remain as Sprint 043 measured them.

One honest caveat: the archive is **pre-filtered** — the upstream `revalidateMarketEligibility` gate
excludes ineligible rows before they are written, which is why the rate is 100%. The audit therefore
cannot find a bad row that never reached disk. Its value is as an independent re-derivation that would
catch a regression in that gate, not as proof that every capture attempted was clean.

---

## 6. Research database architecture (design)

Seven tables, all joined through the canonical `event_id` — never a provider id.

```
events(event_id PK, sport, league, scheduled_start, status)
  │
  ├── event_identity(event_id FK, provider, provider_id, kind)
  │      UNIQUE(provider, provider_id)   ← makes the July 28 collision unrepresentable
  │
  ├── market_snapshots(snapshot_id PK, event_id FK, provider, market_type,
  │                    selection, line, price, provenance_id FK)
  │
  ├── research_features(feature_id PK, event_id FK, subject_id, feature_name,
  │                     value, provenance_id FK)
  │
  ├── predictions(prediction_id PK, event_id FK, market_type, selection,
  │               probability, generated_at, artifact_hash)
  │
  ├── settlements(prediction_id FK, event_id FK, market_id, outcome,
  │               settlement_source, settled_at)
  │      CHECK(settled_at > events.scheduled_start)
  │
  └── provenance(provenance_id PK, captured_at, available_at, source_timestamp,
                 provider, research_eligible GENERATED, eligibility_reason)
```

Two constraints carry the weight:

- **`UNIQUE(provider, provider_id)` on `event_identity`** makes the Sprint 041/043/044 defect a schema
  violation rather than a behaviour to test for. The 49 bad legs could not have been written.
- **`research_eligible` is a GENERATED column** over `captured_at`, `available_at`, and the event's
  start. It cannot be set by an inserter, which enforces design rule 1 at the storage layer.

Every ineligible row is stored with its reason. Nothing is deleted.

---

## 7. Multi-sport readiness (updated)

| Sport | Sprint 043 | Sprint 044 | Change |
|---|---|---|---|
| MLB | `HISTORICAL_ONLY` | `HISTORICAL_ONLY` | Unchanged verdict, **stronger evidence** — per-row provenance now measured at 6,438/6,438 |
| UFC | `SCAFFOLD_ONLY` | `SCAFFOLD_ONLY` | Unchanged |
| Soccer (World Cup) | `HISTORICAL_ONLY` | `HISTORICAL_ONLY` | Unchanged |
| Soccer (EPL/UCL/MLS) | `DISABLED` | `DISABLED` | Unchanged |
| NBA | `HISTORICAL_ONLY` | `HISTORICAL_ONLY` | Unchanged |

**No sport was promoted.** MLB's provenance result is genuinely good news, but readiness is capped by
`beatsMarketBaseline = false`, which this sprint did not change and did not try to.

---

## 8. Mutation testing

Three mutations, each rewriting the shipped source on disk, confirming the guard stops catching what it
exists to catch, restoring, and asserting SHA-256 byte-identity:

1. Disable the post-event check in `provenance.ts` → data captured 2 hours after first pitch reports
   eligible.
2. Disable the duplicate-mapping check in `settlement-lineage.ts` → the exact 49-bad-legs input passes.
3. Disable the required-field check → a row with no lineage at all passes.

### A test-infrastructure defect worth recording

The first implementation ran probes **in-process** with `await import("./mod.ts?cachebust=…")`. Two of
the three tests passed. They were not testing anything: **tsx caches transpiled `.ts` by path and
ignores the query string**, so the "re-import" returned the *unmutated* module. The tests reported
success without ever executing the mutated code.

This was caught only because the third test failed and the failure did not reproduce under a direct
probe. The fix runs each probe in a **child process**, which cannot be fooled by a loader cache. A guard
test that can pass for the wrong reason is worse than no guard test — it converts an unknown into a
false assurance.

---

## 9. Validation

| | Start | End |
|---|---|---|
| Tests | 3203 / 3199 / 0 fail / 4 skip | **3225 / 3221 / 0 fail / 4 skip** |
| Typecheck · Build | 0 · 0 | **0 · 0** |
| Money | `c5b425a1…` 19-14 | **unchanged** |
| Locks | `cb80473f…` | **unchanged** |

---

## 10. Proven facts

- The three historical collisions **did not touch money**, by date disjointness and by clean validation
  of both money-bearing boards.
- They **did** corrupt 49 settled model-performance legs — quantified against official box scores, with
  every affected leg id recorded.
- The corruption is 0.23% of the decisive sample and changes no conclusion.
- All three collisions are doubleheaders where the late game's `gamePk` survived — one mechanism, three
  instances, not three separate bugs.
- MLB's internal pregame archive is leakage-safe per row: 6,438/6,438, minimum 72-minute lead, and an
  independent derivation agrees with the stored flag on every row.
- MLB's public serving artifacts carry no per-row capture timing at all.
- Three mutation tests prove the new guards catch what they claim to, verified in child processes.

## 11. Unknowns

- **Whether soccer and UFC settlement have the same defect.** UFC's name-pair join is *known* to collide
  on 10 rematches, and nothing has traced those through to its graded output the way this sprint did for
  MLB. Soccer's `matchId` join has not been audited for collisions at all.
- **Whether the 49 corrupted legs affected published calibration conclusions.** The aggregate is
  immaterial, but the per-market and per-confidence-bucket breakdowns were not recomputed.
- **Whether the lineage validator holds against the real settlement pipeline.** It is proven against
  synthetic inputs reproducing the real defect; it is not yet wired into `settle_mlb_results.py`.
- **Whether the research schema survives contact with a second sport.** It is designed, not built.

## 12. Sprint 045 recommendation

**Wire the lineage validator into the MLB settlement pipeline, then run the same trace for UFC.**

The validator currently proves a defect *can* be caught; it does not yet stop one. Wiring it into
`settle_mlb_results.py` — the way Sprint 043 wired the identity gate into board generation — converts it
from a test into a guarantee.

Then repeat this sprint's Phase 1 for UFC, where the collision is already confirmed (10 rematch pairs)
and the graded output is small enough (10 rows) to resolve completely rather than sample. UFC is the one
sport where the same question can be answered exhaustively in an afternoon.

Do **not** add per-row provenance to the public MLB artifacts yet. It is real work with no consumer:
nothing public reads capture timing today, and the internal archive already has it.
