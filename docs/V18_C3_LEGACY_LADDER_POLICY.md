# v1.8 — C3: the June completed-ladder policy, encoded (founder decision, 2026-09-22)

**Status:** the decision is now enforced by code and pinned by tests, not described in prose. Two rendered
violations were found in the live product and fixed. No model selection changed, no result truth changed, no
history deleted.

## 1. The decision

Both real June 5–0 completed Bank Builder ladders are **preserved as historical records**. They may render
**only** inside an explicitly labelled *Completed ladders / Legacy history* context, with **exact dates** and
**methodology/era context**.

They must **never**: become the current Bank Builder headline · be added to the current protected record · be
mixed into receipt-era performance · contribute to current-performance summaries · be presented as evidence
for the current Bank Builder methodology.

They **may**: remain typed in the canonical Results projection · remain individually inspectable · be
`displayEligible` **only** for an explicitly historical/legacy presentation.

## 2. How it is encoded

`displayEligible` alone could not express this: a cell that is eligible in a legacy panel is not eligible on
a front door. So the frame became part of the model.

| Piece | What it does |
|---|---|
| `PRESENTATION` | the closed vocabulary: `CURRENT` \| `LEGACY_HISTORY` |
| `LEGACY_PRESENTATION_ERAS` | `LEDGER_ONLY`, `LEGACY_PRODUCT_LEDGER`, `HISTORICAL_ONLY`, `POLICY_V1` |
| `presentationOf(era)` | the **one** place the rule lives; total over every era |
| `cell.presentation` | stamped on every cell at construction, from its era |
| `recordLabelOrNull(cell, { context })` | **defaults to `CURRENT`** → a legacy cell answers `null` |
| `sumSameEra(cells, { context })` | **throws** when legacy cells are summed into a `CURRENT` frame; the result carries its own frame |
| `legacyCells(p, { product })` | the only selector that returns legacy cells, oldest first |
| `mayShowIn(cell, context)` | the one predicate a surface should ask |
| constructor rule | a `LEGACY_HISTORY` cell **cannot be built without exact dates** (`ERA_GAP` exempt — a gap's window is its content) |

Two design choices worth stating:

- **The default is `CURRENT`, deliberately.** A caller that has not thought about the frame gets the strict
  answer. Fail-open here would mean the policy holds only where someone remembered it.
- **`PROTECTED_BASE` is *not* a legacy-presentation era.** It is a declared component of the live composite
  record and is shown beside it as its base; treating it as legacy would hide half of the current record.

## 3. Two rendered violations, found and fixed

### 3.1 🔴 The front door rendered a June ladder as the CURRENT record

`app/src/app/page.tsx` read:

```ts
let recordLabel: string | null = crown?.recordLabel ?? null;   // ← the June 5–0
try { /* … overwrite from portfolio.json … */ } catch { /* "fail closed" */ }
```

The seed was the June completed ladder. Any failure to read the current record — unreachable file, missing or
malformed `record` — left `recordLabel` as **`5–0`**, and the homepage rendered **`Record 5–0`** as the
current Bank Builder record. The comment claimed it failed closed; it fell back to a legacy figure instead.
This is the "a fallback value is a claim" class, and it violated the decision's first prohibition outright.

Now it starts at `null`: the card shows the real current record or **no figure**. The completed-ladder import
is gone from the front door, because nothing else there used it.

### 3.2 🔴 The legacy record was a celebratory headline with no dates and no era

`app/src/components/achievement-banner.tsx` (mounted on `/mr-dub`) headlined
**"2× $100 → $10K challenge completed"** with a 👑 in a crown-gold gradient, carried **zero** dates and no
era, and placed the completions immediately beside the **current** Bank Builder record and **current**
cumulative paper profit. Three prohibitions at once: a headline, no dated/era context, and a juxtaposition
that invited reading June completions as current evidence.

To its credit it already said *"a small sample, and not evidence the approach repeats"* — good hedging that
the framing then undercut.

It is now a dated legacy panel: labelled `Completed ladders · legacy history` (and the same as its
`aria-label`), headlined *"2× $100 → $10K paper ladders completed in June 2026"*, with the exact span
(**Jun 9 – Jun 24, 2026**) and per-ladder completion dates, the era named in words (*"run under the June
multi-sport operator process"*), and an explicit *"A different era from the Bank Builder running today —
historical record, not evidence for the current methodology, and not part of the current record."* The
current record and current profit no longer appear inside it; they belong to the current surfaces.

Dates come from the owner's own `steps[].date` / `completedDate`. A ladder without them is not rendered
rather than shown undated.

## 4. Tests and probes

`src/lib/results/c3-legacy-presentation.test.mjs` — **11 tests**, one per clause, plus the two rendered facts
scanned against real source. The projection suite is **48/48** and the parity suite carries the policy too.

The rendered assertions strip comments before scanning. Their first draft failed against the very files they
guard, because those files' doc comments *describe* the old behaviour — a guard that reads prose as code
fires on its own footnotes.

**Eleven mutation probes, all caught:**

| Probe | Result |
|---|---|
| `LEDGER_ONLY` stops being a legacy-presentation era | caught (9 fail) |
| the reader stops refusing a legacy cell in a current frame | caught (3) |
| the reader defaults to `LEGACY_HISTORY` instead of `CURRENT` (fail-open) | caught (3) |
| legacy cells may be summed into a current summary | caught (2) |
| the legacy sum stops carrying its frame | caught (2) |
| a legacy cell no longer needs exact dates | caught (1) |
| `legacyCells` starts returning current cells too | caught (1) |
| the front door seeds its record from the June ladder again | caught (1) |
| the legacy panel drops its explicit label | caught (1) |
| the legacy panel drops the era context | caught (1) |
| the current record is put back inside the legacy panel | caught (1) |

## 5. What this does NOT do

- does not delete, restate or recompute a single June figure — both ladders keep their real 5–0, their exact
  dates, their owner and their methodology sentence;
- does not change the current protected record (36–35), its composition, or any model selection;
- does not redesign `/results`, and does not repoint any consumer onto the projection (still C2);
- does not touch Bank Builder / Moonshot selectors or the research shadows.

## 6. The C2 precondition this replaces

The previous receipt told C2 to avoid surfacing a `LEDGER_ONLY` product cell until C3 was decided. That
hand-carried caution is now unnecessary: the model refuses it. C2 should read the projection through
`recordLabelOrNull` / `mayShowIn` **without** passing a context (the strict default), and pass
`LEGACY_HISTORY` only from a panel that is itself labelled as completed-ladders / legacy history.
