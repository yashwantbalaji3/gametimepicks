# `soccer/epl/settlement/`

**Empty. Settlement execution is switched off.**

Grading requires an approved official results source, and none exists
(`../results/README.md`, `docs/EPL_RESULTS_SOURCE_DECISION.md`).

## Contract for whatever eventually lands here

**One schema per directory.** `public/data/world-cup/settlement/` holds two incompatible graded
shapes in the same folder — pick-level rows with `win`/`loss` from June 11–16, card-level rows with
`won`/`lost` from June 23 onward — and no tool can read it uniformly. That directory is a closed
historical record; nothing migrates it and nothing writes a generic reader over it. This directory
starts with one schema and keeps one.

**Lineage-gated.** Every graded row must reconstruct prediction → event → market → official source
(`app/src/lib/identity/settlement-lineage.ts`). A run whose lineage does not validate writes nothing.
An unfalsifiable settled result is not evidence, and a wrong-but-plausible one is worse than a
missing one: nobody investigates it.

**Fail-closed lifecycle.** Only `FINAL_FT` grades. `POSTPONED` and `ABANDONED` void every market.
Anything unrecognised pends *and is counted* — the legacy soccer path left 192 of 385 graded legs
permanently pending because ungradeable rows were skipped rather than recorded.

**No money.** Grading and money are separate steps. Nothing under this root reaches the canonical
Bank Builder bankroll, the Mr. Dub ledger, or the daily-portfolio roll-forward. The adapter grades and
returns; it writes no ledger.
