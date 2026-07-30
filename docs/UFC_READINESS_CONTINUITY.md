# UFC readiness continuity — Program 062–065, Lane G

**As of:** 2026-07-30 · **Scope:** verification + a founder decision memo. No grader logic
was modified in this lane. **UFC receives no features, no fighter model, and no public
probabilities in this program.**

**Verdict: CONTINUITY HOLDS.** Every integrity property established by Program 058–061
Lane F ([`docs/UFC_IDENTITY_AND_SETTLEMENT_REPAIR.md`](UFC_IDENTITY_AND_SETTLEMENT_REPAIR.md))
is still true in the tree, and each is now covered by a test that discriminates. One
verification gap was found and closed (§3). Two derived artifacts are stale in a way that
overstates readiness; they are recorded, not corrected (§4).

**Scoped suite:** `./pipeline/.venv/bin/python -m pytest pipeline/ufc/ -q` → **98 passed**
(96 before this lane; +2 from the gap closure in §3).

---

## 1. Continuity verdict — item 11.1

Each sub-item is PROVEN, with the file:line that carries the property and the command that
re-derives it.

### 11.1.a — Both graders join exclusively on the date-qualified boutId · PROVEN

`grade_moneylines.py` derives one identity, `"<commenceTime[:10]>:<sorted-normalized-pair>"`,
at [`pipeline/ufc/grade_moneylines.py:34-39`](../pipeline/ufc/grade_moneylines.py). It is the
*only* thing that can produce a decision: `_match_result` at
[`grade_moneylines.py:59-77`](../pipeline/ufc/grade_moneylines.py) returns a row solely from
`by_id.get(bid)`, and the results index at `grade_moneylines.py:42-56` drops any result row
without a `boutId`. There is no pair-only branch and no fallback path anywhere in the file.

`build_backtest_dataset.py` does not re-implement the derivation — it **imports** it:

```python
from .grade_moneylines import _bout_id, _bout_key   # build_backtest_dataset.py:23
```

so both graders are single-sourced by construction. Its own index
([`build_backtest_dataset.py:44-56`](../pipeline/ufc/build_backtest_dataset.py)) likewise skips
rows without a `boutId`, and its join at `build_backtest_dataset.py:90-102` reads only
`by_id[k]`.

**Grep evidence:** the two files contain no call to `_bout_key` that is not either (i) building
the date-qualified id or (ii) building the `pair_dates` map used exclusively to *refuse* a join
with a warning (`grade_moneylines.py:73-77`, `build_backtest_dataset.py:96-99`).

### 11.1.b — The opposite-winner rematch mutation test exists and passes · PROVEN

`MutationProofTests.test_dateless_pair_join_fails_the_rematch_fixture` at
[`pipeline/ufc/grade_moneylines_test.py:308-340`](../pipeline/ufc/grade_moneylines_test.py)
rebinds `gm._match_result` to the pre-repair pair join, grades the two-date/opposite-winner
fixture, and asserts (i) the mutant's output differs from the correct per-date grades, (ii) at
least one *decided* grade is wrong, (iii) the original function is restored, (iv) the repaired
join grades correctly again, and (v) `Path(gm.__file__).read_bytes()` is byte-identical to the
bytes read before the mutation.

The mutation genuinely applies: `grade()` resolves `_match_result` through module globals at
call time ([`grade_moneylines.py:91`](../pipeline/ufc/grade_moneylines.py)), so rebinding the
module attribute changes the code path actually executed — proven by assertion (ii), which can
only pass if the mutant ran. No child process is needed here; Python has no equivalent of the
tsx module-cache problem that would make the swap decorative.

```
$ ./pipeline/.venv/bin/python -m pytest pipeline/ufc/grade_moneylines_test.py -q \
    -k "LiveArtifact or Mutation"
3 passed, 16 deselected
```

### 11.1.c — Missing or ambiguous boutId still fails closed to pending · PROVEN

| Condition | Behaviour | Code | Test |
|---|---|---|---|
| Odds bout has no derivable date | `pending` + `"cannot derive date-qualified boutId"` | `grade_moneylines.py:65-67` | `grade_moneylines_test.py:177` |
| Result row carries no `boutId` | dropped from index → `pending` | `grade_moneylines.py:48-50` | `grade_moneylines_test.py:195` |
| Duplicate `boutId` in results | `pending` + `"ambiguous boutId"` | `grade_moneylines.py:69-72` | `grade_moneylines_test.py:203` |
| Pair exists only on other dates | `pending` + explicit rematch-unsafe refusal | `grade_moneylines.py:73-77` | `grade_moneylines_test.py:168` |
| Backtest: malformed commence time | excluded as `ambiguous` | `build_backtest_dataset.py:81-84` | — |
| Backtest: pair on other dates only | excluded as `date_mismatched_pair` | `build_backtest_dataset.py:96-99` | `build_backtest_dataset_test.py:88` |
| Backtest: result without `boutId` | excluded, never joined | `build_backtest_dataset.py:50` | `build_backtest_dataset_test.py:95` |

Every refusal is *explicit* — it writes a warning onto the row rather than silently pending.
`grade_moneylines_test.py:232` asserts this over all 10 real colliding keys: 20 graded rows,
all pending, all carrying a warning.

### 11.1.d — gradingReady stays false while no same-date result exists · PROVEN

`grading_gate` requires a live decisive grade, not merely a results file:

```python
decisive = (gr.get("tally", {}).get("win", 0) + gr.get("tally", {}).get("loss", 0))
if decisive < 1:
    status["warnings"].append("grader produced no decisive grades to validate")
    return False, status        # build_readiness.py:159-166
```

Re-derived against the committed artifacts:

```
$ ./pipeline/.venv/bin/python -c "from datetime import datetime,timezone; \
    from pipeline.ufc.build_readiness import grading_gate; \
    print(grading_gate(now=datetime(2026,7,30,tzinfo=timezone.utc)))"
(False, {... 'finalBoutCount': 1519, 'latestEventDate': '2026-05-16',
          'gradingReady': False,
          'warnings': ['grader produced no decisive grades to validate']})
```

This is the honest state: `graded-moneylines-latest.json` is 40 rows, tally
`{win: 0, loss: 0, push: 0, void: 0, pending: 40, unknown: 0}`, because all 40 quoted bouts
are dated after `latestEventDate` 2026-05-16 and no same-date result exists for any of them.

**The date guard is what holds this false.** Feeding `grading_gate` a graded artifact produced
by the mutant join (in a temp file; no repo artifact written) returns `True` — i.e. the
pre-repair join would have re-declared the grader validated on the strength of two invented
decisions. That is the concrete cost of the defect, and the reason 11.1.a is not cosmetic.

### 11.1.e — No historical grades rewritten · PROVEN

`git show --name-only 3598c232` (Lane F) touches eight files; **none** of them is a historical
outcome record:

- `app/public/data/ufc/results-latest.json` — the 1,519-final-bout corpus — is untouched. Its
  entire history is one commit, `81b10a64` (2026-06-09), and the working tree is clean.
- `app/public/data/ufc/results-settled-latest.json` — the official ESPN settlement of the
  2026-06-15 UFC Freedom 250 test slate (moneyline 6-1) — is untouched. Its history is one
  commit, `87791503` (2026-06-15).
- `app/public/data/mr-dub/**` — untouched by every UFC job; last written 2026-07-21 by an
  unrelated MLB refresh. UFC has never written to the official ledger.

What Lane F *did* rewrite is `graded-moneylines-latest.json`, a re-derivable grading of
**currently quoted** odds. Its two previously decided rows were not history: they graded a
hypothetical 2026-06-14 matchup against a 2023-11-11 result, as documented in
[`data/internal/ufc/integrity/ufc-regrade-correction-audit.json`](../data/internal/ufc/integrity/ufc-regrade-correction-audit.json)
(`historicalAmbiguousRows`). Withdrawing a wrong grade on a bout that has not happened is not
rewriting history.

**One thing to keep visible:** `results-settled-latest.json` reports a 6-1 moneyline record on
the Freedom 250 test slate. That artifact was produced by a one-off ESPN-sourced settlement,
not by `grade_moneylines.py`; it carries no `boutId` lineage and is display/archive only. It is
**not** grader output and its record is not lineage-verified under the join contract above. It
stays visible as the historical record it is, and it must not be cited as evidence that the
grader works.

---

## 2. Test inventory (scoped run)

| File | Classes | Covers |
|---|---|---|
| `pipeline/ufc/grade_moneylines_test.py` | 6 | results parsing, win/loss/void/push, rematch-safe join (7 fixtures), committed-artifact regression over all 10 real colliding keys, **live-artifact refusal (new)**, mutation proofs ×2 |
| `pipeline/ufc/build_backtest_dataset_test.py` | 3 | pregame-only rows, post-commence exclusion, unlicensed source exclusion, rematch per-date join, wrong-date exclusion, missing-boutId fail-closed, backtest gate |
| `pipeline/ufc/build_readiness_test.py` | 5 | fail-closed gate matrix incl. `test_grader_no_decisive_fails_closed` |

```
$ cd /Users/yashwantbalaji/Downloads/gametimepicks
$ ./pipeline/.venv/bin/python -m pytest pipeline/ufc/ -q
98 passed in 0.39s
```

---

## 3. Verification gap found → closed

**Gap.** The regrade audit records a live defect under `liveDefectCaughtOnIdenticalInputs`:
on today's committed inputs, the pre-repair join decides the **future** 2026-07-11 Cejudo vs
Dvalishvili bout from the 2024-02-17 result. That claim had no test. Every rematch test used
synthetic fixture dates or a synthetic wrong date (2026-12-31) applied to real rows — nothing
exercised `odds-latest.json` as committed, so nothing would fail if the guard stopped protecting
the actual production inputs.

**Closed** by `LiveArtifactFutureBoutTests`
([`grade_moneylines_test.py:263-305`](../pipeline/ufc/grade_moneylines_test.py)), two tests:

1. `test_no_bout_after_the_last_known_result_date_is_ever_decided` — grades the committed
   `odds-latest.json` against `results-latest.json` and asserts every row whose `boutId` date is
   later than `latestEventDate` is `pending`, and that total decisive grades are zero. The
   invariant is durable rather than date-pinned: a bout dated after the newest known result can
   never have a same-date result, so it can never be decided by a correct grader — the assertion
   survives future odds and results refreshes.
2. `test_dateless_pair_join_decides_a_future_bout_on_these_exact_inputs` — the same mutation
   proof, run on the **real** artifacts, asserting the mutant *does* decide at least one future
   bout (so the guard is load-bearing on production data, not merely satisfied by fixtures),
   then restoring the binding and re-asserting both the repaired behaviour and byte-identical
   source.

Observed mutant output on the committed artifacts, matching the audit exactly:

```
mutant decided future rows: 2
  2026-07-11:henry cejudo|merab dvalishvili  Henry Cejudo    loss  | result eventDate 2024-02-17
  2026-07-11:henry cejudo|merab dvalishvili  Merab Dvalishvili win | result eventDate 2024-02-17
mutant tally {'win': 1, 'loss': 1, 'push': 0, 'void': 0, 'pending': 38, 'unknown': 0}
```

The shared mutant was hoisted to one module-level `_legacy_pair_join`
([`grade_moneylines_test.py:25-35`](../pipeline/ufc/grade_moneylines_test.py)) so both proofs
run the identical pre-repair code path. No production file was modified.

---

## 4. Capture-cadence read

Full artifact: [`data/internal/ufc/integrity/capture-cadence-readiness.json`](../data/internal/ufc/integrity/capture-cadence-readiness.json)
(`public: false`).

**Verdict: `INSUFFICIENT_DATA`.** Two odds captures, 30.69 days apart, both dispatched by hand,
is a sample of one interval. It supports no cadence, no capture rate, and no accrual forecast.

What the existing data *does* establish:

- **Captures.** `odds-2026-06-09T22-17-31+00-00.json` (20 bouts across 5 event dates, 99.7–423.7h
  ahead of commence) and `odds-2026-07-10T14-49-59+00-00.json` (20 bouts, 23.2–35.4h ahead).
  40 distinct `boutId`s, all captured strictly pregame, both from `draftkings` + `betonlineag`.
  Last capture was 19.4 days ago; no card after 2026-07-12 has any capture at all. The two
  captures are not comparable price points — one is near-opener, one is near-close.
- **Automation.** Six UFC workflows, **zero** `cron` entries; `on:` is `workflow_dispatch` for
  all six (`grep -n cron .github/workflows/ufc-*.yml` returns nothing). Capture cadence equals
  founder attention, and a missed pregame window is not recoverable afterwards.
- **Results refresh.** `results-latest.json` has been written **once**, on 2026-06-09;
  `latestEventDate` 2026-05-16 is 75 days old. `GRADING_FRESH_DAYS = 120`
  (`build_readiness.py:123`) means its freshness condition trips on **2026-09-13** without a
  re-run.
- **Accrual to date: 0 rows.** All 40 captured bouts postdate the results corpus, so the
  overlap is empty and no bout can produce a row regardless of join quality. Exclusions:
  `no_result 38`, `date_mismatched_pair 2`.
- **The binding constraint today is the results refresh, not odds spend.** That refresh is free
  (GPL-3.0 CSV corpus) and already automated as a dispatchable workflow.

Arithmetic, not a forecast: ~20 h2h bouts per card ≈ 40 fighter-side rows, so
`BACKTEST_MIN_ROWS = 150` (`build_readiness.py:172`) is roughly four cards captured pregame and
subsequently resulted. Reaching 150 rows unlocks a market-baseline Brier computation. It implies
nothing about whether the model would compare favourably to that baseline, and no promotion
above `SCAFFOLD_ONLY` follows from row count alone.

### Stale derived artifacts (recorded, not corrected)

| Artifact | Records | Recomputes to | Why |
|---|---|---|---|
| `app/public/data/ufc/readiness-latest.json` | `gradingReady: true` | `false` | written 2026-07-10, before the Lane F regrade |
| `app/public/data/ufc/ops-status-latest.json` | `gradingStatus: "ready"` | not ready | same pre-repair build |

Both regenerate from `ufc-results-refresh` / `ufc-pre-card`. Regenerating them here would also
flip `oddsReady` false on the 48h odds-staleness rule (`ODDS_FRESH_HOURS`,
`build_readiness.py:25`) — environmental, and outside this lane's file ownership. Neither is
read by any public surface: UFC's registry state is `SCAFFOLD_ONLY`
(`app/src/lib/sport-capability-registry.ts:74-85`), pinned by
`sport-capability-registry.test.mjs:124`.

Also stale, cosmetically: the comment at `app/src/lib/identity/sport-adapter.test.mjs:106`
still describes the graded artifact as "10 graded, of which the 1 win / 1 loss are rematch
collisions". The test passes — it uses hardcoded inputs and never reads the artifact — but the
comment now describes a state that no longer exists. Flagged for the owning lane; not edited
here.

---

## 5. Founder decision memo

> **Question.** Is it worth buying an official results source and odds history to unblock UFC?

### 5.1 What each investment actually costs

| Investment | What it requires | Cost |
|---|---|---|
| **Free results refresh** | dispatch `ufc-results-refresh` (or add a weekly `cron`) | **$0.** Corpus is Greco1899/scrape_ufc_stats, GPL-3.0. This is the only step blocking the first non-zero backtest row today. |
| **Official results source** | The ESPN MMA scoreboard is already reachable and free (it produced `results-settled-latest.json`). The cost is not money: it needs an adapter that emits the same date-qualified `boutId` lineage `build_results.py` writes, plus a reconciliation against the CSV corpus where the two disagree. | **$0 in vendor fees; ~1 engineering session** for adapter + lineage tests. A commercial official feed would be a vendor decision — not made here, and no vendor is recommended. |
| **Forward odds capture** | 1 The Odds API credit per event per capture (`odds-latest.json`: `creditCost 20` for 20 events, `creditsRemaining 18449`), plus a `cron` on `ufc-pre-card` so capture stops depending on memory. | **~20 credits per card**, well inside the existing balance. The real cost is scheduling discipline, not credits. |
| **Historical odds backfill** | A paid historical-odds tier this repo has never called. **Price is unverified — do not budget from this document; check current vendor pricing.** Also requires a licence permitting derived redistribution, and an ingest that stamps `capturedAt` per bout. | **Unknown, and unverified.** Treat as the largest and least-certain line item. |

### 5.2 What that unblocks

- A results refresh plus continued forward capture produces the **first leakage-checked backtest
  rows UFC has ever had** (today: 0).
- At 150 rows, a **de-vigged market-implied Brier baseline** becomes computable. That is a
  measurement, and it is the only honest thing a backtest at this size buys.
- Historical odds backfill would reach that measurement faster — potentially immediately, since
  the results corpus already spans 2023-06-10 to 2026-05-16 (126 events, 1,519 final bouts).

### 5.3 What stays blocked regardless — the decisive point

Buying odds history does **not** make the UFC model assessable, because the deeper blocker is
not odds:

1. **Feature point-in-timeness.** `status/ufc-graduation-decision.json` records
   `preBoutProvenance: false` — "features use CURRENT career stats that include the predicted
   fight". Historical *odds* do not fix historical *features*. A leakage-checked backtest of a
   model whose inputs contain the outcome measures nothing about the model. Fixing this requires
   rebuilding feature construction as dated snapshots — engineering, not purchasable.
2. **No independent signal to assess.** The same decision records the moneyline as
   "de-vigged market + a hand-weighted nudge (±4pp cap, 50% shrink to market)", which "≈0 in
   every committed row". Backtesting a market price against the market is a tautology; there is
   nothing of our own in the number yet.
3. **Prop markets.** Method / distance / round stay unavailable: the connected feed is h2h only
   (`ops-status-latest.json` → `propMarketStatus`). No spend on results or odds history changes
   that; it needs a different provider.
4. **Public promotion.** Under the research-terminal policy, nothing about UFC becomes publicly
   claimable from row count. Rows enable measurement; measurement may well come back negative,
   as it did for MLB (three consecutive `w=0` blends) and for the World Cup backtest. UFC must
   be funded as if that is the likely outcome, because for every other sport in this repo it has
   been.

Ordering follows: **historical odds are the wrong first purchase.** They are necessary-but-not-
sufficient, and they would be spent on top of a feature pipeline that cannot yet support the
conclusion they are meant to enable.

### 5.4 Recommendation

**Stay `SCAFFOLD_ONLY`. Fund nothing yet.** This is the default and it should not be revisited
on enthusiasm — only on a funded data gate being met, in this order:

| Gate | Condition | Cost | Decision it unlocks |
|---|---|---|---|
| **G0** | `ufc-results-refresh` re-run; `latestEventDate` moves past 2026-07-12 | $0 | Do the already-captured 40 bouts convert to rows? Answers, for free, whether the pipeline works end to end. |
| **G1** | `cron` on `ufc-pre-card`; three or more captures at a fixed lead time | ~20 credits/card | Cadence becomes a distribution instead of one interval; this artifact can stop saying `INSUFFICIENT_DATA`. |
| **G2** | Dated feature snapshots — no career stat computed after the bout it predicts | ~1 engineering sprint | Whether a UFC backtest could mean anything at all. **Nothing above `SCAFFOLD_ONLY` is discussable before G2.** |
| **G3** | 150+ leakage-checked rows with a de-vig market baseline | time | The first honest market-comparison read. |
| **G4** | Historical odds purchase | unverified | Consider **only** after G2 passes and G3 shows the forward pipeline is sound. |

If G0 comes back empty, or G2 is not funded, the correct action is to leave UFC exactly as it
is: a fail-closed readiness gate, a rematch-safe grader, a 1,519-bout corpus, and no claims.
That is a defensible resting state, and it costs nothing to maintain.

---

## 6. Non-goals confirmed for this program

- No fighter model, no feature work, no public probabilities, no props.
- No change to grader logic, readiness gates, or any public surface.
- No vendor selected, no purchase recommended, no analytics enabled.
- `SCAFFOLD_ONLY` is unchanged and remains pinned by test.
- The Freedom 250 6-1 record and the withdrawn coincidence-decided grades both stay visible in
  the record; nothing was quietly removed.
