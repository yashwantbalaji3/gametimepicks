# v1.8 — Track C1: the canonical Results projection (contract + receipt)

**Date:** 2026-09-22 · **Branch:** `v18-results-trust` · **Status:** code, tests and a seed artifact on the
branch. **Deliberately unwired on both sides:** no page reads it, no workflow builds it. §9 is the wiring
plan, and a guard test refuses the mixture rather than trusting anyone to remember it.

C1 is a **truth-consolidation** task, not a redesign. It changes no rendered output.

## 1. What it is

One read model over the settlement owners, assembled by one builder, read through one reader.

| Piece | File | Role |
|---|---|---|
| Assembly | `app/src/lib/results/projection-core.mjs` | pure, no IO — owners in, cells out |
| Builder | `app/scripts/results/build-results-projection.mjs` | reads the owners from disk, writes the artifact |
| Reader | `app/src/lib/results/projection.ts` | the ONE reader a page is meant to use |
| Artifact | `app/public/data/results/projection/{latest,<date>}.json` | `gtp.results-projection.v1`, `PUBLIC_DERIVED` |

The projection stores **no number an owner does not already carry**: every count is copied, every `n` is the
sum of the counts the owner carries, every window is the owner's own dates. It grades nothing, prices
nothing and forecasts nothing.

## 2. What a cell is

One graded population, from ONE owner, in ONE typed era, with its own window and its own count semantics.
Every cell carries `cellId`, `recordType`, `family`, `sport`/`product`/`market`/`segment`, `era`, `n`,
`counts {won, lost, pending, push, void}`, `decisive`, `owner {path, generatedAt, stampField}`, `window`,
`status` and `displayEligible {eligible, reason}`.

A cell whose owner is absent **is not emitted**. A consumer that finds no cell prints nothing — never `0–0`.

### The rules the code enforces at construction

- pending is a count, **never a loss**; push and void are counts, never decisive;
- missing is `null`, **never `0`**; a recorded zero is a zero;
- a product record is not a forecast record; cycle completion is not a leg hit rate; a calibration state
  is a **word**, not a number;
- eras are typed and **never summed across** — `sumSameEra()` throws on the attempt;
- never a forecast, never a probability, only graded outcomes and owner states;
- one reader; the fallback is "no figure", which is why `recordLabelOrNull` returns `null` rather than a
  zero for an absent cell, a cell without won/lost, or a cell its owner's own rule marks not display-eligible;
- write-once, dated (see §5).

## 3. The seed artifact, measured

`builtAt 2026-09-22T18:00:00Z` · **53 cells** over **14 owners** · all 15 sources present.

| Record type | Cells | | Family | Cells |
|---|---|---|---|---|
| `CALIBRATION_STATE` | 21 | | model-family | 21 |
| `LAB_CARD_RECORD` | 11 | | product | 13 |
| `PRODUCT_RECORD` | 11 | | lab | 11 |
| `FORECAST_RECORD` | 6 | | forecast | 6 |
| `CYCLE_COMPLETION` | 2 | | cycle | 2 |
| `ERA_GAP` | 2 | | | |

Statuses: 40 `LIVE` · 7 `FROZEN` · 2 `DISCLOSED_GAP` · 2 `PENDING` · 1 `SUPERSEDED` ·
1 `WINDOW_CONTRADICTS_LABEL`.

Twelve typed eras appear, `LIVE_LEDGER` (26) and `POLICY_V2` (5) most of them. Three exist because an owner
needs them and forcing it into one of the preregistered nine would have made a claim: `COMPOSITE` (a blend
the owner itself publishes — allowed only with its `composition` beside it, never an input to a sum),
`LIVE_LEDGER` (a settler-regenerated owner with no policy split inside its window — calling it
`RECEIPT_ERA` would claim it is part of the Rule S receipt population) and `UNSEGMENTED_WINDOW` (an owner
whose window spans a typed boundary and does not segment its record — showable only with its window printed).

## 4. Contradictions the projection makes visible instead of averaging

These are the point of C1. None is fixed here; each is now a typed, queryable state.

| Cell | What it says |
|---|---|
| `lab:-:parlay-lab:POLICY_V1:prior-policy` → `WINDOW_CONTRADICTS_LABEL` | the owner labels 1,799 cards (351–1448) "Before the 2026-08-17 selection change", but its window runs to **2026-09-22** — a month past that change. **Not display-eligible**: the label and the window cannot both be true. |
| `product:-:bank-builder:LEDGER_ONLY:historical-record-2026-06-25` → `SUPERSEDED` | a 13–3 snapshot over 2026-06-09 → 06-25 that the July-7 protected base (19–14, 06-09 → 07-07) restates. Kept for replay, **not display-eligible**, and never added to the base. |
| `product:-:bank-builder:UNRECEIPTED_GAP` and `…moonshot:UNRECEIPTED_GAP` → `DISCLOSED_GAP` | 2026-07-08 → 08-14 and 07-07 → 08-14 with **all counts null**. Rendered as a gap in a timeline, never as a number. |
| the two `CYCLE_COMPLETION` cells | `n` 21 and 32 ladders with **null** won/lost, because a completed cycle is not a W–L. |

### The June completed-ladder record: its own typed cells, in no headline and in no sum

**Correction to an earlier draft of this section, which said the record was "absent, not merged" and that
the only June-era product cells were the `PROTECTED_BASE` 19–14 and the `SUPERSEDED` 13–3 snapshot. That
was wrong** — it came from searching for the string `5-0` and for cycle cells, and missed the two cells
that actually carry it. The post-merge checkpoint enumerated every June-era product and cycle cell instead
of grepping for a figure. What is true:

| Cell | Counts | Window | Status | In a headline? | In a sum? |
|---|---|---|---|---|---|
| `product:-:bank-builder:LEDGER_ONLY:ladder-1` | **5–0** | 06-09 → 06-13 | FROZEN | **no** | **no** |
| `product:-:bank-builder:LEDGER_ONLY:ladder-2` | **5–0** | 06-18 → 06-24 | FROZEN | **no** | **no** |

Each is one completed ladder, owned by `mr-dub/banked-ladders.json`, labelled by ladder, in the
`LEDGER_ONLY` era. Their own `displayEligible.reason` states the rule: *"a completed June ladder from the
banked ledger — its own cell, labelled by ladder; never merged with the protected record or the receipt
cycles."*

Three things hold, each checked rather than asserted:

1. **Neither is a headline**, under `byFamily`, `byProduct` or `bySport`.
2. **Neither is in any sum.** The `COMPOSITE` protected record (36–35) declares its composition as
   `PROTECTED_BASE` (19–14) + `RECEIPT_ERA` (17–21) — **no `LEDGER_ONLY` component** — and `sumSameEra`
   throws on any attempt to cross eras (mutation-probed, §8b).
3. **Neither is a cycle cell.** The two `CYCLE_COMPLETION` cells cover `RECEIPT_ERA` only (08-15 → 09-20)
   and carry null won/lost.

So the honest statement is *typed and isolated*, not *absent*. That is the right behaviour for a truth
consolidation: a read model that silently dropped a real completed ladder would be its own distortion, and
C1's job is to give every owner's population a typed cell with its own window and era.

**What this means for C3, stated precisely so the gate is not understated.** Both cells are
`displayEligible: true`. Nothing renders today — no consumer reads the projection (§6) — so nothing is
published and no founder gate has been crossed. But the moment C2 repoints a reader, these two cells become
*eligible to render*, and where a completed-ladder record belongs publicly is exactly the founder-gated
question. **C2 must therefore not repoint any Results reader that would surface a `LEDGER_ONLY` product
cell until C3 is decided**, or must repoint it with those cells explicitly filtered. That is a C2
precondition, recorded here because this is where the evidence lives.

## 5. Write-once, dated

The dated file is written once. A re-run whose `cells` or `headline` differ from the dated file on disk is
**REFUSED (exit 1) and writes nothing**, so a projection is replayable and no bot can silently restate
history. A re-run that is identical leaves the dated file alone and refreshes `latest.json`, which is a
pointer, not history. `builtAt` and the owners' stamps are not history and do not count as a difference.
`--now` is required for `--write` so the artifact is replayable; a dry run defaults it to the clock.

## 6. Readers: deliberately none yet

No page, component, script or route imports `lib/results/projection`. The four inline `fs` copies of the
portfolio reader (V19 C10) and the read-model key lookup (C2) still stand, so **this branch changes no
rendered output and adds no page weight**. C2 repoints them.

## 7. Tests

`projection-core` · `projection-builder` · `projection-parity` · `projection-reader` → **44 pass / 0 fail**,
plus `projection-wiring` **3/3** (§8) — **48 pass / 0 fail** together (47 before the C9 record-type test of §8b). `npm run -s lint:scripts` clean and
`npx tsc --noEmit` clean (see §8a — it was not, at first). The parity test builds the projection in memory from the same reads
the script performs and compares it with what each mounted consumer's loader returns, and asserts every
cell's cited owner is on disk. Refusal tests cover population mixing directly: `sumSameEra` throws across
eras, an absent owner yields no cell, and `recordLabelOrNull` returns `null` rather than a zero.

## 8. The C1 → C2 precondition, enforced mechanically

`app/src/lib/results/projection-wiring.test.mjs` pins a **biconditional**:

> a consumer imports `lib/results/projection` **⟺** a workflow runs `build-results-projection.mjs`

Either state is legal; only the mixture is refused, in both directions. The dangerous direction is a reader
wired with no producer: the page would serve whatever snapshot happened to be committed, and a static record
ages into a false claim. This repository has already paid for that shape twice — a contract generated but
never added to a commit allowlist (a 62-hour freshness outage) and a static artifact whose eligibility claim
aged into a lie. The harmless direction (a producer with no reader) fails too, with a message saying the test
has outlived its purpose and should be deleted with C2.

The test also pins that the projection lives under `results/`, because that is the only reason wiring the
builder needs no new allowlist line, and that `nightly-settle.yml` still stages `app/public/data/results/`
wholesale.

Four mutation probes, each applied and reverted:

| Probe | Result |
|---|---|
| a consumer reads the projection while no workflow builds it | **caught** |
| a workflow builds it while no consumer reads it | **caught** |
| BOTH wired | **stays green** — the legal state |
| `nightly-settle` stops staging `app/public/data/results/` | **caught** |

Its two detectors carry positive controls: the reader scan is asserted to match `@/lib/…`, relative,
`require()` and dynamic-`import()` spellings, and asserted **not** to fire on `projection-core` (which the
builder and the tests import legitimately) or on lookalike paths.

## 8a. Found while finishing C1

- **`npx tsc --noEmit` failed on the reader.** `projection-core.mjs` is untyped, so TypeScript inferred
  `cellForEra`'s `product` / `sport` / `segment` selectors as `null | undefined` from their `= null`
  defaults, and the typed reader could not pass a string to any of them (`TS2345`). All 44 tests passed
  while this was broken — a JS test suite cannot see a type error, and the CI `quality` job would have gone
  red. Fixed at the source of the inference (a JSDoc `@param` on the core function) rather than by casting
  at the call site, so the next typed caller inherits the right shape.
- **The builder cited a receipt that did not exist.** Its header pointed at
  `docs/V18_RESULTS_PROJECTION_CONTRACT.md §9` for the wiring plan and the reason it was left out of
  nightly-settle; the file had never been written. This document is that receipt, and §9 is that plan.
- **The "not scheduled" boundary was prose only.** It is now the biconditional in §8, with probes.

## 8b. Refreshed against main (2026-09-22, after #630 / #631 / #633 merged)

`origin/main` `2c4199307` was **merged** into the branch (never rebased). No conflict: main changed no file
under `src/lib/results/`, `scripts/results/` or `public/data/results/projection/`, and **none of the 14
owners the 53 cells cite** — so every C1 file is byte-identical to the pre-merge commit, and the committed
artifact is still a true read model of its owners. Proven rather than assumed: rebuilding at the same pinned
instant reproduces **all 53 cells and the headline identically**, with no non-history key differing.

### A rule the probes found unpinned

Re-running the mutation probes over the truth rules turned up one that **survived**: deleting the record-type
test inside `recordLabelOrNull` — the line that refuses to label a cycle, calibration or gap cell as a W–L —
left the suite at **47 pass / 0 fail**.

The code was right; the suite had a hole. The cells the builder emits are protected twice over (the real
cycle cell carries all-null counts *and* `displayEligible: false`), and the constructor outright refuses
counts on a `CALIBRATION_STATE` or `ERA_GAP` cell. But **`CYCLE_COMPLETION` is the one record type whose
counts the constructor does not forbid**, so a completed-ladder tally is one careless `counts` block away
from rendering as a win–loss record — a cell that passes every construction check while violating "cycle
completion is not a leg hit rate". Nothing stood in the way but that one line.

A test now pins it, with both controls: the forged cell really does carry `won: 3, lost: 2`, it really is
`displayEligible: true`, and its counts really do format into `3–2` on their own — so the `null` from
`recordLabelOrNull` is the record-type rule refusing it and nothing else. A `PRODUCT_RECORD` with the
identical counts still labels `3–2`, so the refusal is by type rather than a blanket suppression. The
narrower mutations (letting through only `CYCLE_COMPLETION`, or only `ERA_GAP`) are caught too.

**16 of 16 probes now catch** — 12 truth rules, 4 on the C9 "never print 0–0" rule. The full list:
`sumSameEra` across eras / across families / on a COMPOSITE or UNSEGMENTED input / on a non-summable record
type · a cell emitted without an owner path · counts on an `ERA_GAP` or `CALIBRATION_STATE` cell · a
COMPOSITE without its composition, or not equal to its composition's sum · an untyped era on a cell or in
`cellForEra` · a non-integer count coerced instead of refused · labelling a non-display-eligible cell ·
labelling a cycle/calibration/gap cell · `formatRecordLabel` returning a label with won/lost absent · a
headline pointing at a legacy era.

## 9. Wiring plan (C2 — not done here)

1. Add one step to `.github/workflows/nightly-settle.yml`, **after every owner rebuild** (the last is
   "Refresh prediction history + learning artifacts") and **before** "Commit and push if results changed":
   `npx tsx scripts/results/build-results-projection.mjs --now "$NOW" --write`, with `$NOW` the same instant
   the settlement steps already use — a projection built at a different instant from its owners is not a
   read model of them.
2. No allowlist line is needed: `git add app/public/data/results/` is already the first entry, and §8 pins
   both halves of that fact.
3. Handle the §5 refusal explicitly. A **second** run on the same UTC date whose cells differ exits 1 by
   design. nightly-settle runs once per day, so the normal path never hits it — but a manual re-run after an
   owner changes will, and that must surface as a named condition, not as a generic red settler. Decide there
   between a dated re-run being an operator action (delete the dated file deliberately) and a `--restate`
   flag that records the restatement; do not reach for `continue-on-error`, which would make the step green.
4. Repoint readers **in the same change** as step 1, never before it, and delete
   `projection-wiring.test.mjs` once both halves are on.
5. **Do not surface a `LEDGER_ONLY` product cell** in any repointed reader until C3 is decided — the two
   June 5–0 completed-ladder cells are `displayEligible: true`, and their public home is the founder gate
   (§4). Either hold that reader or filter the era explicitly.

## 10. Status

No public surface changed, no page weight added, no owner rewritten, no era blended, no founder gate crossed.
Live Bank Builder / Moonshot selectors untouched; shadows not adopted; the June completed-ladder decision
left open for C3.
