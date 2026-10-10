# TRUTH-001 · Stage B — applying the MLB forecast-of-record corrections (PROPOSED, NOT APPLIED)

**Founder decision 3 (2026-10-09):**
- Stage A (#1042) carries the evidence and the proposed records, not applied.
- Stage B is a dedicated Results correction PR. It applies the 14 corrections through the append-only settlement architecture and comes with a reconciliation report.
- "Request separate approval before applying."

This package is **the reconciliation report and the application design**. It changes no grade, no ledger row and no Results surface. The report generator is read-only.

## The reconciliation report

`reconciliation-2026-10-09.md` (human) and `reconciliation-2026-10-09.json` (machine), from `app/scripts/mlb/build-results-correction-reconciliation.mjs`.

**Per game:**
- Event id and official final.
- The **currently graded forecast**: source, generation time, hash, decision version, and the absence of publication evidence.
- The **original public forecast of record**: commit, generation time, hash, model and decision versions, and the READY Production deployment that served it before first pitch.
- For every ledger family the game carries, the previous and proposed selection, probability and result (or projection and error), with the ledger `forecastId`.

**Then:**
- Family-level and aggregate impact over the **whole** graded population.
- Integrity checks: every stored graded row matches its proposal exactly, and every public revision reads back at its commit with the stated hash. Both pass.

**Headline**, favourable and unfavourable together:

| | |
|---|---|
| Games / ledger rows affected | 14 / 84 (moneyline, run line, total, projected runs ×2, projected total) |
| Selections changed / outcomes changed | 7 / **6** |
| Moneyline | 416–394 → **418–392** (+2 wins) |
| Run line | 510–300 → **508–302** (−2 wins) |
| Total | 376–391–38 → **374–393–38** (−2 wins) |
| Projected runs / total, summed absolute error | 51 → **53** / 33 → **35** (worse) |
| Provenance-only (nothing but the source changes) | 823413 |

The correction makes the record slightly **worse** in four of five families. That is not a reason to skip it. The rule is that the public record is what was public.

## Not in scope

- The **227 recovered pregame forecasts** for games whose public forecast was erased (#1042 `pregame-forecast-recoveries.jsonl`) stay **non-public and outside every official denominator**. They need review for accuracy, provenance and data-publication rights. Stage B does not add them.
- The 4 `COMMITTED_UNVERIFIED` and 4 `UNRECOVERABLE` games stay as they are.

## How "apply" must work: the decision needed

There are two constraints:
- The graded log is append-only by contract ("(gamePk, market) never regrades": `grade-game-predictions.mjs`).
- The forecast ledger's id is FNV(sport | event | subject | family | kind). The revision is **not** in the id, so the corrected forecast lands on the **same** `forecastId` with different immutable fields (probability, direction, receipt, publishedAt).

The append-only guard (`forecast-ledger/append-only.mjs`) would correctly refuse that as `IMMUTABLE_CHANGED`. So applying needs an **audited** path. There are three options:

| Option | What it does | Verdict |
|---|---|---|
| **A · Audited restatement (recommended)** | One committed correction log lists the 14 games, with before/after values and deployment evidence per row: `data/internal/mlb/forecast-of-record-corrections/2026-10-09-truth-001.json`. One pure reader, `mlbGradesOfRecord(graded, log)`, applies it and **fails closed**: every "before" must equal the stored row exactly, and every "after" outcome must re-derive from the official final with the production grading rule. Every MLB Results reader moves to that one loader; today about ten files read the raw log directly. The ledger gets a `--restate <correctionId>` mode, modelled on the existing `--rekey` migration. It forgives `IMMUTABLE_CHANGED` / `DIRECTIONAL_REWRITTEN` only on the 84 listed `forecastId`s, increments `settlement.corrections`, and writes a migration receipt with every old and new value | The graded log is never rewritten. The non-public values are preserved verbatim in the log and the receipt. The public record states what was public. It follows the precedent the NFL winner corrections and `--rekey` set |
| B · Withdraw and append | Mark the 84 rows `WITHDRAWN` and append the public forecasts as new rows | Rejected. `WITHDRAWN` asserts the forecast was published and then withdrawn, which is false. A second row needs a new id namespace (`fl2`), which counts as an identity change under the CONTRACT-001 rules |
| C · Annotate only | Leave the grades and add a note | Rejected. Results would keep grading forecasts that were never public, contrary to Option B |

**What Option A would touch:**
- MLB Results readers (`results/v2/day.ts`, `overview.ts`, `data-mlb-results.ts`, `live/hub-data.ts`, `my/read-model.ts`, `saved/results.mjs`, `sports/graded-pick-owners.mjs`, `ops/build-model-health.mjs`, the ledger MLB adapter).
- The ledger builder and guard.
- A visible correction note on each affected game and day.

These are shared Results/OPS surfaces, so the implementation is coordinated with their owner and integrated only with founder approval.

**Expected gate effect:** the deltas above are small. Moneyline log loss 0.6993 → 0.6991 stays worse than the coin's 0.6931. The run-line hit rate stays far above its old floor. The total stays BREACHED. **No family is expected to change state, and nothing is unpaused.** The implementation PR has to verify this rather than assume it.

## Approvals requested

1. The mechanism: **Option A** (or another).
2. Applying the 14 corrections exactly as the report states them.
3. Coordination: the shared Results/OPS owner reviews the reader consolidation before integration.

Until then the 14 records stay `PROPOSED_NOT_APPLIED`.
