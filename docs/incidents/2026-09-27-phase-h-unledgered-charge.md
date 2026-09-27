# Phase H · a paid charge that the ledger never recorded

**Status: OPEN — discrepancy documented, NOT repaired. No ledger was hand-edited.**

## The fact

The first live Phase H probe — scheduled run `36336729861`, 2026-09-27T17:23:03Z — printed:

```
BUDGET: Phase H 0/90 spent · cumulative 481/1160
provider 200 (OK) · charged 3 credit(s) · remaining 10290
ReferenceError: Cannot access 'matchEvent' before initialization
```

The provider answered, charged **3 credits**, and the process then threw while grading the
response. `continue-on-error: true` reported the step as **success**.

## What the record says versus what happened

| | Phase H spend |
|---|---|
| `p171-ledger.json` | **0** |
| provider (`x-requests-remaining` 10293 → 10290) | **3** |

The season ceiling is not where this bites. The **Phase H sub-budget is the binding one**: it is 90,
and `odds-credit-position.mjs` reports `Phase H spent 0 → 90 left in the pilot`. The true figure is
87. Every guard downstream is reading a budget that is overstated by three credits.

## Why the record was lost

`probe-nfl-live-odds.mjs` called `recordRequest()` immediately after the response — so the entry
existed **in memory** — but the ledger was only written to disk at the END of the run, after the
verdict was graded. Grading is what threw, so the process died between the charge and the write.

This is repaired in the probe itself (PR #736): the charge is now persisted the instant the provider
answers, because a charge is a fact while a verdict is an opinion. That fix prevents recurrence. It
does **not** recover the three credits already missing from this ledger.

## Why this was urgent, not cosmetic

Both guards that bound Phase H spend read this ledger:

- **"ONE PROBE MEANS ONE"** looks for a prior probe entry — absent, so the probe **re-arms**
- **the 90-credit budget** sums recorded spend — permanently **zero**

So each subsequent scheduled run would charge again, every fifteen minutes, with the budget never
tripping. The workflow was disabled manually (founder-approved) at 2026-09-27T17:30Z to stop it.
Exactly one scheduled run ever fired.

## There is no existing repair path

The canonical owner is `app/src/lib/sports/odds/p171-authorization.mjs`:

- `recordRequest(ledger, {...})` appends an entry **at the moment of a call**, deriving
  `creditsUsed` from the response's own `x-requests-last` header
- `app/scripts/ops/odds-credit-position.mjs` is explicitly **read-only** and states that it makes
  no provider call, "because the self-imposed ceiling is what binds and the ledger is the record of it"

Nothing in the repository reconciles a charge the provider made against a ledger that missed it.
A generated ledger was deliberately **not** hand-edited to make the guard fire: that would put an
entry with no provenance into the one record the budget is computed from, and it would also be
indistinguishable from an entry written by a real call.

## Proposed smallest canonical change (separate PR, not implemented here)

Add one function beside `recordRequest` in the same owner:

```js
recordReconciledCharge(ledger, {
  at,                 // when the charge actually happened
  purpose,            // the same purpose string the lost entry would have carried
  creditsUsed,        // read from the run's own provider line, never estimated
  evidence,           // the run id and the provider's remaining-count, both quotable
  reason,             // why it is being added out of band
})
```

It must differ from `recordRequest` in exactly two ways: it takes `creditsUsed` explicitly rather
than deriving it from a live response header, and it stamps the entry
`provenance: "RECONCILED"` so no reader can mistake it for a call this repository observed.

Budget arithmetic should keep counting it — the money is gone either way — while any audit can still
separate observed spend from reconciled spend.

**Founder decision required** before that entry is written.
