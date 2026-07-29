# Sprint 045 — Settlement Lineage Enforcement + UFC Integrity Audit

**Starting SHA:** `4e851140` (synced to `d1db1d6e` over three bot commits) · **Date:** 2026-07-28

Sprint 044 built a lineage validator and proved a defect *could* be caught. It was a test, not
enforcement, and it lived in TypeScript where the Python settlement pipeline could never call it. This
sprint closes that gap, then answers the same question for UFC that Sprint 044 answered for MLB.

---

## 1. Starting state (reproduced, not trusted)

| | |
|---|---|
| HEAD → synced | `4e851140` → `d1db1d6e` (3 bot commits, rebased clean, 0 conflicts) |
| Production | `d1db1d6e`, current |
| Tests | 3225 / 3221 pass / 0 fail / 4 skip |
| Typecheck · Build · Python identity | 0 · 0 · 14/14 |
| Money · Locks | `c5b425a1…` `$19,065.40` 19-14 · `cb80473f…` |
| `vp/` | 8 dirty, uncommitted; 0 files in any of my commits |

---

## 2. MLB settlement lineage is now enforcement

`pipeline/mlb/settlement_lineage.py` mirrors the TypeScript contract, and
`settle_mlb_results.py` calls it immediately before the ledger write:

```python
assert_settlement_lineage(settled_rows, date=date_iso)
SETTLED_LEANS_PATH.write_text(...)
```

Every settled row now carries canonical lineage — `eventId` (derived, doubleheader-safe),
`providerEventId` (the alias), `eventStartTime`, and `settlementSource` — stamped at all three
`settled_rows.append` sites.

Only the rows *this run* produces are gated. Historical rows predate the lineage fields and are
preserved untouched, deliberately: rewriting them would destroy the evidence that makes the Sprint 044
corruption provable.

### Why a second implementation rather than a shared one

Settlement is Python; the surfaces are TypeScript. Bridging at runtime would put a subprocess call
inside the ledger write path — more failure modes than the check removes. So the contract is mirrored,
and `cross-language-agreement.test.mjs` runs **both implementations over the same fixtures**: 9 event-id
derivations (including the doubleheader halves, accent folding, sub-minute truncation, and
order-independence) and 7 lineage verdicts. All agree, and the allowlists are asserted identical.

Two independent derivations that agree is stronger than one shared implementation nobody re-checks —
the same argument that made the Sprint 043 historical audit credible.

---

## 3. The check the fixtures missed

Running the new gate against the **real** 2026-07-22 board returned **0 violations**.

That was not a pass. The derivation correctly distinguishes the two halves by start time, so the
`eventId`s genuinely differ, and the odds-provider ids differ too — every alias check passes. But both
halves still carried **`gamePk` 823519**, which is exactly how game 1's predictions were graded against
game 2's box score.

The missing invariant is injectivity on the **grading source**: the id of the record an outcome was read
from must map to one event. Added to both implementations (`WRONG_EVENT_MAPPING`), after which:

| Board | Leans | Violations |
|---|---|---|
| 2026-05-23 | 343 | **1 — REFUSED** |
| 2026-07-22 | 678 | **2 — REFUSED** |
| 2026-07-28 | 702 | **1 — REFUSED** |
| 2026-07-27 | 557 | 0 — ok |
| 2026-06-09 | 692 | 0 — ok |

Counts match the Sprint 043 audit exactly (1 / 2 / 1), now from a **third** independent implementation.

This is the sprint's most useful lesson: **fixtures encode what you already understand.** Every fixture I
wrote passed while the real defect walked through, because I had modelled the collision as an alias
problem when it was a grading-source problem. The regression test now runs against the committed boards,
not only synthetic rows.

---

## 4. UFC integrity audit

**Money impact: NONE — proven.** Zero `ufc` occurrences in `portfolio.json`, `banked-ladders.json`,
`ledger.json`, or `daily-summary.json`. `status/ufc-graduation-decision.json` records `public: false`,
`moneyImpact: none`.

**The join is unsound, and its one decided result is right by coincidence.**

| Measure | Value |
|---|---|
| Bout rows | 1,545 |
| Unique fighter-pair keys | 1,535 |
| **Colliding keys** | **10** (20 bouts) |
| Graded rows | 10 (1 win, 1 loss, 8 pending) |
| **Decided rows sitting on a colliding key** | **2 of 2 — 100%** |
| **Colliding keys whose rematch had a *different* winner** | **6 of 10** |

Both decided rows are Pereira/Prochazka, which has bouts on 2023-11-11 and 2024-06-29.
`grade_moneylines.py` joins on `"|".join(sorted([norm(a), norm(b)]))` — no date, no event, no bout id —
so it picked one by name alone. Pereira won both, so the recorded grade happens to be correct.

That is luck, not correctness. **Six of the ten colliding keys have a different winner in the rematch**;
had any of those been graded, the result would have been a coin flip presented as a settled outcome.

**Remediation identified, not applied.** `boutId` already exists on every results row (`"2023-11-11:a"`)
and is simply unused by the join. Keying on it — or on fighters + event date — resolves all ten
collisions with no new data. Not applied here because UFC is not public, carries no money, and this
sprint's charter is audit-only.

**Readiness: `SCAFFOLD_ONLY`, unchanged.** 0 backtestable bouts, `rowCount 0`, `h2h` the only market ever
captured, no per-row capture provenance, and features that are career aggregates including the fight
being predicted.

---

## 5. Universal contract — abstraction earned, not assumed

The charter says to abstract *only when evidence supports reuse*. The evidence:

The UFC collision is a **different sport, a different pipeline, and a different join bug** — fighter-pair
names instead of team-name-per-date — and it produces the **same shape**: one grading source serving two
events. The unmodified MLB-derived validator catches it, and the fix (put the date in the identity)
resolves it to a clean pass. Both are asserted in `integrity.test.mjs`.

Two sports failing identically under one contract is the reuse evidence. Nothing was abstracted beyond
what those two cases justify: `gradedAgainstId` was added because a real defect walked past every
existing field, not because a third id seemed tidy.

---

## 6. Mutation testing

| Mutation | Proves |
|---|---|
| Remove the duplicate-mapping loop (Python) | the 2026-07-22 shape passes; restored SHA-256 identical |
| Remove the required-field check (Python) | a row with no lineage passes; restored identical |
| Disable the post-event check (TS) | data captured 2h after first pitch reads eligible |
| Remove duplicate-mapping (TS) | the 49-bad-legs input passes |
| Remove required-field (TS) | a lineage-free row passes |

TypeScript probes run in **child processes** — Sprint 044 established that `import("./mod.ts?cachebust")`
silently returns the unmutated module under tsx. Python probes use `importlib.reload` and reference the
exception through `sl.` rather than a `from`-import, because reload rebinds the class and a stale binding
would make `except` miss.

---

## 7. Validation

| | Start | End |
|---|---|---|
| Tests | 3225 / 3221 / 0 fail / 4 skip | **3232 / 3228 / 0 fail / 4 skip** |
| Typecheck · Build | 0 · 0 | **0 · 0** |
| Python — identity · lineage | 14/14 · — | **14/14 · 18/18** |
| Money · Locks | `c5b425a1…` · `cb80473f…` | **unchanged** |

---

## 8. Proven

- MLB settlement **cannot** write rows with broken lineage — the gate raises before the ledger write.
- The gate refuses exactly the three known-collided boards and passes clean ones, matching the Sprint 043
  audit from a third independent implementation.
- The Python and TypeScript contracts agree on 9 id derivations and 7 lineage verdicts, with identical
  allowlists.
- UFC touches no money — proven by absence across all four money artifacts.
- UFC's join is unsound in 100% of the cases it has actually decided, and would have produced a wrong
  grade in 6 of its 10 collision cases.
- Five mutations confirm every new guard catches what it claims, with byte-identical restoration.

## 9. Unknowns

- **The gate has never run on a live settlement.** It is proven against committed boards and synthetic
  rows; no settlement run has executed since it landed, because the current slate has no settled date
  requiring one. The first real run is the true test.
- **Whether historical rows would pass if re-derived.** They lack the lineage fields entirely and are
  excluded by design, so the gate says nothing about them. Sprint 044's audit remains the only statement
  about historical correctness.
- **Soccer settlement is still unaudited for collisions.** It has *two* implementations writing
  incompatible schemas to one directory and 192 permanently-pending legs — a strictly worse starting
  position than either MLB or UFC had.
- **Whether `derive_event_id` is stable under team renames.** Both implementations derive from the name
  string; a franchise rename would silently produce a different id for the same historical event.

## 10. Sprint 046 recommendation

**Audit soccer settlement, and collapse its two implementations into one.**

It is now the worst-instrumented settled surface in the repository: two graders that disagree on market
coverage, selection format, and extra-time policy, both writing to the same directory, with half the
graded legs stuck pending. MLB and UFC have each been traced end to end; soccer has not, and unlike UFC
it has real graded volume behind it.

Do **not** fix UFC's join yet. It is a two-line change with a known remediation, no money exposure, and
no consumer — it will keep. Soccer's ambiguity is load-bearing for a product surface that already
publishes results.
