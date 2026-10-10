# U4 / D3: a general "withdrawn pairing" rule for UFC model-vs-market grading

**Status:** PROPOSAL. Founder decision D3 is still open. Nothing has been applied: no grading was run with `--write`, and no ledger, graded file, summary or public artifact was changed.

**Branch:** `claude/ufc-001-u4-withdrawn-rule`. Proposal code:
- `app/src/lib/sports/ufc/pairing-status.mjs`: a pure classifier. It does no I/O and reads no clock.
- `app/src/lib/sports/ufc/pairing-status.test.mjs`: 19 deterministic tests, including 17 mutation probes.
- `app/src/lib/sports/ufc/fixtures/pairing-status-2026-09-26.json`: a read-only extraction of the committed 09-26 snapshots, results and ledger rows.
- `app/scripts/ufc/report-pairing-status.mjs`: a dry-run report with no write path. It refuses `--write`.

## 1. The problem

The model-vs-market grader (`app/scripts/ufc/grade-ufc-model-vs-market.mjs`) treats every pairing that any snapshot ever froze as part of the card. It then waits for an official result under that exact pairing key.

A pairing that stops being a fight never gets a result under its own key.

- **The case:** `2026-09-26:mickey gall|sedriques dumas` (providerBoutId 401923433).
  - It was frozen in `snapshot-202609221527`, `-231748` and `-241534`, with the pick Gall at 0.5115 (market 0.5635).
  - Gall was replaced. The final pre-card snapshot `snapshot-202609261455` holds `luis hernandez|sedriques dumas` (providerBoutId 401924683) instead, and that bout was graded.
- **Today:** `summary.json` reads frozen 9 = graded 8 + void 0 + pending 1 for 09-26, and it will read that forever.

## 2. The rule

The rule classifies every frozen pairing of a card into exactly one status. The inputs are the snapshots, the official results and `now`.

| Status | When |
|---|---|
| `GRADED_WIN` / `GRADED_LOSS` | An official result names a winner who is one of the pairing's two fighters. |
| `VOID_DRAW` / `VOID_NO_CONTEST` | It fought and there was no winner, and the source itself says "draw" or "no_contest" (the corpus `resultStatus`). |
| `VOID_NO_WINNER_UNSPECIFIED` | It fought with no winner, but the source is winner-only (ESPN). The rule refuses to guess draw or NC, the same refusal as `settlement-contract.mjs`. |
| **`WITHDRAWN_BEFORE_START`** | All five conditions hold:<br>(1) the pairing is in an earlier pre-start snapshot;<br>(2) it is **not** in the card's final pre-start snapshot, neither as a row nor as a skipped provider bout id;<br>(3) `now` is at or after the card start;<br>(4) the provider has reported at least one result for the card;<br>(5) no official result exists for the pairing, by exact key or by the looser name identity. |
| `AWAITING_RESULT` | Everything else. This includes every ambiguous case. |

A WITHDRAWN pairing:
- is **never graded**, **never void**, and **never in a hit-rate or log-loss denominator**;
- keeps its record: the forecast of record (a frozen deep copy, so the probability and pick are unchanged) and the evidence (first, last and final snapshot, how many snapshots held it, and the replacement pairing if one shares a fighter or the provider bout id).

**Definitions:**
- **Pre-start snapshot:** `capturedAt < startUtc` and `capturedAt <= now`. Later snapshots are listed as ignored, never used.
- **Final pre-start snapshot:** the latest pre-start snapshot. Before the card starts it is only "the latest so far", so nothing can be withdrawn yet.
- **Forecast of record:** the row from the latest pre-start snapshot that held the pairing. This is the same row the grader scores today. The report checks all 60 ledger rows against it: same bout, hit, probability and source snapshot.

**Never-frozen bouts.** Some bouts in the final snapshot were skipped and never frozen. They are listed separately as `UNPRICED_EXCLUDED` or `NO_READ_EXCLUDED`, outside the frozen population. A missing price is never a loss, and never a pending forecast, because there was no forecast.

## 3. Why the rule is general, not a one-fight exception

- **It names no bout.** It uses only facts every card already has: the ordered snapshots, the final pre-start snapshot, the card start and the official results.
- **It fires once on main today, on Gall v Dumas.** It does not fire on the 6 other fought cards (52 frozen pairings, all graded), and it does not fire on tonight's card.
- **Withdrawn needs positive evidence that the pairing left the card before its last freeze.** Disappearing later is a different fact, and the rule refuses it (see §4).

## 4. Edge cases (each one is pinned by a test)

| Case | Result |
|---|---|
| Real Gall → Hernandez (fixture from the committed files) | WITHDRAWN. Evidence: first `…221527`, last `…241534`, final `…261455`. Replacement `luis hernandez|sedriques dumas` (401924683, shares Sedriques Dumas, from the final snapshot). 09-26 reads graded 8, withdrawn 1, pending 0. |
| Same data, `now` before the start | AWAITING with the `CARD_NOT_STARTED` flag. Snapshots captured after `now` are ignored. |
| Card started, provider has reported nothing | AWAITING with the `CARD_UNREPORTED` flag. |
| Draw / no-contest / winner-only no-winner | VOID_DRAW / VOID_NO_CONTEST / VOID_NO_WINNER_UNSPECIFIED. Never a loss. |
| Late replacement **after** the final snapshot | AWAITING with the `POSSIBLE_LATE_REPLACEMENT` flag and the replacement named. **Not withdrawn.** |
| Bout cancelled outright, no replacement | WITHDRAWN, with replacement `null`. |
| Bout in the final snapshot that the provider later drops | AWAITING. **Not withdrawn.** |
| Frozen earlier, unpriced (skipped) in the final snapshot | AWAITING with the `ON_FINAL_CARD_WITHOUT_FORECAST` flag. If it then fights, it grades from the earlier frozen row, as the grader does today. |
| Fought, though absent from the final snapshot | Graded, with the `FOUGHT_THOUGH_ABSENT_FROM_FINAL` flag. The provider's report beats absence. |
| Duplicate agreeing results | Classified once, with the `DUPLICATE_RESULT` flag. A duplicate that names the void kind upgrades an unspecified void. |
| Overturned or contradicting later result | **Flagged `RESULT_CHANGED_NOT_APPLIED`, not applied.** The earliest official record stands, which is what an append-only ledger already holds. Corrections need lineage (`settlement-contract.mjs`) and are out of scope. |
| Spelling variants (`Syguła`→`sygu a` vs `sygula`; `Jingnan Xiong` vs `Xiong Jingnan`) | A loose-name join, flagged `RESULT_JOINED_BY_LOOSE_NAME`. Both variants exist on main (08-29, 09-05). Without this, a spelling could be read as a withdrawal. |
| Corpus boutIds with punctuation (`…raul rosas jr.`; 69 on main) | Re-keyed to the canonical form, so they join exactly. |
| Winner who is neither fighter | AWAITING with the `RESULT_NAMES_MISMATCH` flag. |
| Immutability | The inputs are deep-frozen in the test and are byte-identical afterwards. The output forecast is frozen, and its probability and pick equal the latest pre-start row whatever the status. |

**Mutation probes:** 17 probes each break one load-bearing line. Examples: withdrawing before the card is reported, accepting post-start snapshots, applying the overturning record, flipping win and loss, keeping the first row as the record, and dropping the loose join. Every probe is killed by at least one check.

## 5. Effect on denominators

- **Graded bouts: none.** The report cross-checks every GRADED pairing against `graded.jsonl`. All 60 ledger rows match on bout, hit, probability and source snapshot. Cumulative n, log loss, Brier and accuracy do not move.
- **The withdrawn pairing leaves "pending".** For 09-26, `frozen 9 = graded 8 + void 0 + pending 1` becomes `frozen 9 = graded 8 + void 0 + withdrawn 1 + pending 0`. The frozen population is unchanged, because the record is kept, not deleted.

**Dry-run classification on main** (`report-pairing-status.mjs --now 2026-10-10T22:30Z`):

| card | frozen | W | L | void | withdrawn | pending | unpriced excl. | today (summary.json) |
|---|---|---|---|---|---|---|---|---|
| 2026-08-22 | 10 | 5 | 5 | 0 | 0 | 0 | 1 | graded 10, pending 0 |
| 2026-08-29 | 6 | 5 | 1 | 0 | 0 | 0 | 3 | graded 6, pending 0 |
| 2026-09-05 | 8 | 4 | 4 | 0 | 0 | 0 | 3 | graded 8, pending 0 |
| 2026-09-12 | 7 | 4 | 3 | 0 | 0 | 0 | 4 | graded 7, pending 0 |
| 2026-09-19 | 10 | 7 | 3 | 0 | 0 | 0 | 0 | graded 10, pending 0 |
| **2026-09-26** | 9 | 7 | 1 | 0 | **1** | **0** | 2 | graded 8, **pending 1** |
| 2026-10-03 | 11 | 7 | 4 | 0 | 0 | 0 | 2 | graded 11, pending 0 |
| 2026-10-10 | 11 | – | – | – | 0 | 11 | 0 | (card in progress) |

## 6. A future APPLY step (not done; it needs separate founder approval)

An APPLY step would touch exactly these files:

1. **`app/scripts/ufc/grade-ufc-model-vs-market.mjs`**
   - `reconcileEvents()` adds `withdrawn` and `withdrawnBoutIds` from the classifier, and the reconciliation invariant becomes `frozen = graded + void + withdrawn + pending`.
   - Withdrawn records are appended to a **separate** append-only file, `data/internal/research/ufc/model-vs-market/withdrawn.jsonl`. Each record holds the boutId, the forecast of record, the evidence and `recordedAt`.
   - They are **not** appended to `graded.jsonl`, because `graded-pick-owners.mjs` would list them as picks, and the ledger adapter's `gradedAt` branch would turn them into a NO_WINNER VOID.
2. **`data/internal/research/ufc/model-vs-market/summary.json`**: the reconciliation is regenerated by the grader. This is the only change to an existing artifact. `cumulative` is unchanged by construction.
3. **`app/src/lib/forecast-ledger/adapters/ufc.mjs`**: an explicit WITHDRAWN branch, following the NFL top-board precedent:
   - `publicationStatus: "WITHDRAWN"`;
   - a `withdrawal` block with reason `PAIRING_WITHDRAWN_BEFORE_START` and the evidence;
   - `measurement.directionalResult: "WITHDRAWN"`;
   - settlement `NO_MEASUREMENT`. NFL uses `VOID` with reason `WITHDRAWN_BEFORE_START`; that choice belongs to the founder.
   - It also replaces the unreachable `gradedAt`-without-winner VOID branch with explicit VOID_DRAW / VOID_NO_CONTEST rows, if the companion void decision below is also taken.
4. **`app/scripts/results/build-forecast-ledger.mjs`**: reads `withdrawn.jsonl` beside `graded.jsonl`.
5. **`app/scripts/ufc/build-ufc-lane-status.mjs`**: carries `withdrawn`, so `postCardLag` is not held open by a withdrawn pairing.
6. **Graded-picks surfaces** (`app/src/lib/sports/graded-pick-owners.mjs`): no change if withdrawn rows stay out of `graded.jsonl`. If they are surfaced, they show as "withdrawn" and never as a miss.

**Companion gap (a separate decision):** draws and NCs compute `void` in the grader but are never written. So they also sit as "pending" forever, which is the same defect as Gall with a different cause. Tonight's card may already have one (§8).

## 7. Alternatives

- **(a) VOID Gall v Dumas.** This is wrong in kind. VOID means "it fought, and there was no winner". Gall v Dumas never fought. It would also put a non-fight into void counts and into the ledger's NO_WINNER branch, and it is a one-fight patch that the next replacement would need again.
- **(b) The general WITHDRAWN rule (recommended).** It uses positive evidence only, has no effect on graded denominators, and keeps the record and the evidence.
- **(c) Leave it pending.** This is honest but permanent. Every future short-notice replacement adds another pending pairing that never clears, and `postCardLag` and reconciliation lose meaning.

## 8. Founder approval needed to apply

1. **D3:** adopt rule (b) as specified here, including the five conditions and the conservative AWAITING fallbacks.
2. The storage choice: a separate `withdrawn.jsonl` (recommended) or rows in `graded.jsonl`.
3. The ledger settlement state for withdrawn rows: `NO_MEASUREMENT` (recommended, keeps "never void") or `VOID` with reason `WITHDRAWN_BEFORE_START` (the NFL precedent).
4. Permission for the one historical effect: regenerate the 09-26 reconciliation in `summary.json` so that pending 1 becomes withdrawn 1. No graded row changes.
5. (Separate) whether draw and NC voids are written. Tonight's Gatto v Kareckaite was `STATUS_FINAL` with neither winner flag set on ESPN at 22:28Z.
