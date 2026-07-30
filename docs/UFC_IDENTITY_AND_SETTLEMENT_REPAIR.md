# UFC Identity + Settlement Repair — Rematch-Safe Grading Join

**Program:** 058-061, Lane F · **Date:** 2026-07-30 · **Scope:** `pipeline/ufc/` only — no money artifacts, no public UI

UFC settlement joined odds to results by a **date-less fighter-pair key**. Rematches share that key,
sometimes with opposite winners, so a bout could be silently graded from the wrong meeting — or from a
fight that had not happened yet. This lane repairs the join to the date-qualified `boutId` the pipeline
already writes everywhere else, proves the repair with adversarial and mutation tests, and accepts the
honest readiness consequence.

---

## 1. The defect

`grade_moneylines.py` keyed results by `'|'.join(sorted([norm(a), norm(b)]))` — no date, no event, no
bout id — with last-write-wins over the newest-first results list. `build_backtest_dataset.py`
duplicated the same join. Meanwhile every one of the 1,545 rows in `results-latest.json` already
carries a date-qualified `boutId` (`<date>:<sorted-pair>`, written by `build_results.py`), and
`build_features.py` / `build_schedule.py` already derive the same id from `commenceTime[:10]` — the
grader simply copied `boutId` into its output without ever joining on it.

Consequences, measured (Sprint 044/045 collision audit, `data/internal/ufc/integrity/ufc-collision-audit.json`):

- 10 fighter-pair keys collide across dates in `results-latest.json`; **6 have different winners** in
  the rematch (Pereira/Ankalaev, Grasso/Shevchenko, Edwards/Cornolle, ...).
- Both decided rows in the pre-repair `graded-moneylines-latest.json` (the only 2 ever) sat on the
  collided Pereira/Prochazka key: **current futures odds for a hypothetical 2026-06-14 matchup were
  graded from the 2023-11-11 result** — and stamped with the result's boutId/eventDate, masking the
  mismatch. Right only by coincidence (Pereira won both real meetings).
- Rerunning the old join on today's committed inputs decides the **future** 2026-07-11
  Cejudo/Dvalishvili bout from the 2024-02-17 result. The defect was live, not theoretical.

## 2. The repair

One join contract, both files (`grade_moneylines.py`, `build_backtest_dataset.py`):

- Results are indexed by their stored **date-qualified `boutId` only**; the odds side derives the same
  id from `commenceTime[:10]` + sorted normalized pair (identical derivation to
  `build_features.py:133`, imported by the backtest builder from the grader — one derivation, one place).
- **Fail closed, always pending, never a picked row:**
  - odds bout with no derivable date → `pending` + warning (`no commenceTime — cannot derive date-qualified boutId`);
  - result row without a `boutId` → dropped from the index, can never decide;
  - duplicate `boutId` in results → `pending` + `ambiguous boutId` warning;
  - pair matches results **only on other dates** → `pending` + explicit refusal warning
    (`date-less pair join refused (rematch-unsafe)`); the backtest builder excludes the analogous case
    under a new `date_mismatched_pair` counter instead of joining it.

## 3. Adversarial tests

`grade_moneylines_test.py` (new fixtures build a two-event corpus through the real `build_results`):

- same pair, two dates, **opposite winners** → each bout grades from its own date's result;
- same pair, repeat bout, same winner → decided correctly on both dates;
- no-contest first meeting → `void` on that date only, decided rematch still decided;
- wrong-date bout → `pending` with the explicit rematch-refusal warning;
- missing `commenceTime`, result rows missing `boutId`, duplicate `boutId` → all fail closed to `pending`;
- name-normalization variants (case/whitespace) still match the date-qualified id.

**Committed-artifact regression:** reads the real `ufc-collision-audit.json` + `results-latest.json`
and asserts (a) none of the 10 colliding keys can produce a decided grade for a bout dated on a wrong
date — all 20 probe rows pend with warnings — and (b) on each key's *right* dates, the grade comes from
that date's own result row (final/NC/draw expectations derived from the row itself).

`build_backtest_dataset_test.py`: rematch snapshots join each bout to its own date; a wrong-date pair
is excluded as `date_mismatched_pair`, never joined; a final result without `boutId` produces no row.

## 4. Mutation proof

`MutationProofTests` reintroduces the date-less pair join **in memory** (overrides
`gm._match_result` with a last-write-wins pair scan; the source file is never edited and is asserted
byte-identical before/after) and proves the opposite-winner rematch fixture **fails under the mutant**
— the mutant grades the rematch winner as a loser. Restoring the real join makes the same fixture pass.
The test detects the defect; it is not decorative.

## 5. Regenerated artifacts (offline, committed inputs only)

- `graded-moneylines-latest.json`: 10 rows → 40 rows (odds-latest moved to the 2026-07-10 snapshot),
  tally `{win: 0, loss: 0, push: 0, void: 0, pending: 40, unknown: 0}`. The 2 previously "decided" rows
  are gone — the repaired join refuses their kind of match, and no same-date result exists for any
  currently quoted bout. The Cejudo/Dvalishvili near-miss is pended with its refusal warning in the
  artifact itself.
- `backtest-dataset-latest.json`: still 0 rows, but now honestly accounts for the 2 snapshots:
  38 `no_result` + **2 `date_mismatched_pair`** (Pereira/Prochazka hypothetical, Cejudo/Dvalishvili
  future bout) that the old join would have turned into 4 leakage-corrupt rows.
- Full detail in `data/internal/ufc/integrity/ufc-regrade-correction-audit.json` (`public: false`).

## 6. Readiness consequence — accepted, not worked around

`build_readiness.py`'s grading gate requires ≥1 win **and** ≥1 loss in the graded artifact. A correct
grader currently produces zero decided rows, so **`gradingReady` flips to `false` on its next build.
That is the honest state**: the previous `true` was earned entirely by the coincidence-graded
Pereira/Prochazka pair. A gate held open by a defect is not a gate. The committed
`readiness-latest.json` still shows the stale pre-repair `true`; the `ufc-results-refresh` workflow
regenerates it (regenerating here would also flip `oddsReady` on 48-hour staleness — environmental,
outside this lane).

## 7. Sprint 045 deferral — superseded

Sprint 045 (`docs/SPRINT_045_SETTLEMENT_LINEAGE_UFC_AUDIT.md`, §10) deliberately deferred this fix:
*"Do not fix UFC's join yet... it will keep."* That deferral was correct then (soccer was the
load-bearing ambiguity) and is **consciously superseded now**: the defect proved live on current inputs
(Cejudo/Dvalishvili), and Program 058-061's terminal direction makes settlement identity a
correctness-of-record question, not a launch question.

## 8. What this repair does NOT change — remaining SCAFFOLD_ONLY gates

UFC remains **SCAFFOLD_ONLY**. The join is now sound, but soundness is not sufficiency:

- **No official free results API** — results derive from the Greco1899 UFCStats CSVs (GPL-3.0),
  refreshed on a lag; there is no per-bout official feed equivalent to MLB StatsAPI.
- **2 odds snapshots total** — forward pregame capture began 2026-06; no bout yet has a same-date
  pregame snapshot *and* a final result, so the backtest dataset is legitimately empty (0 rows against
  a 150-row gate).
- **Sparse volume + futures pollution** — current odds carry hypothetical matchups (three simultaneous
  Pereira bouts in one snapshot); card-reality guards exist but the corpus is thin.
- Feature timing remains career-aggregates-as-of-build (includes the fight being predicted) — unusable
  for honest backtesting until snapshotted per-date.
- **UTC-date skew** — `commenceTime[:10]` is a UTC date while UFCStats results carry the US event date,
  so a bout commencing after midnight UTC (typical late main cards: 5 of the 20 currently quoted bouts
  commence 2026-07-12 UTC on the 2026-07-11 card) will refuse to join its own genuine result and stay
  `pending` with the cross-date warning. This is the fail-closed direction and stays as-is; any
  tolerance window must be introduced deliberately, backed by the measured minimum rematch gap
  (77 days across the 10 colliding keys) and its own adversarial tests — never as a silent widening
  of the join.

Nothing here claims, and nothing here should be read as, model capability. This is settlement
bookkeeping made truthful.
