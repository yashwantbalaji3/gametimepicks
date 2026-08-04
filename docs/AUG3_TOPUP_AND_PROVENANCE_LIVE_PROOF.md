# Aug 3 — Top-Up Decision & Provenance Fix, Both Proven Live

Closing evidence for the August 3 intraday cycle. Two things were tested by production rather
than by me, which is the only kind of proof that counts here.

## 1. The provenance fix is PROVEN LIVE ✅

The board was regenerated at **20:48:26Z** from cache (`credits.after: "cache"`, **0 spent**) —
the exact condition that produced the defect. Result:

| | Before the fix (12:03 regeneration) | After the fix (20:48 regeneration) |
|---|---|---|
| `generatedAt` | moved to 16:03Z | moved to 20:48Z |
| **`capturedAt` (all 211 rows)** | **restamped 04:34Z → 16:03Z** ❌ | **stayed 04:34Z** ✅ |
| credits | 0 (cache) | 0 (cache) |

`capturedAt` now describes when the prices were *actually observed*, not when the file was
rewritten. The research corpus's central provenance claim is true again, verified on a real
production run rather than a fixture.

## 2. The 15:30 top-up owned its decision — and the answer was "no markets"

Run at **20:44:08Z** (16:44 ET, slightly delayed by GitHub scheduling), success. I did not race it.

```
[classify] 2026-08-03 · mode=EVENT_LEVEL_APPEND_ONLY · events=8
[classify] summary {"ALREADY_COMPLETE":7,"MARKETS_AVAILABLE_ADD_OFFICIAL_PATCH":1}
[classify] minimal paid-request set: 824647
[classify] events frozen (first pitch passed): 0
RUN 1 scheduled pregame game(s) still lack market coverage (earliest starts in 201 min);
    expected spend 62 within budget
```

It dispatched the whole-slate fallback (legitimate — every game was still pregame, 201 minutes to
first pitch). The regeneration completed and **coverage did not change**: still 211 rows, 7
covered, LAD @ CHC uncovered, **0 credits spent** because the provider had nothing new to sell.

**This is a successful operational decision, not a miss** (§1.3). The books never posted markets
for LAD @ CHC all day. The system asked at the right time, spent nothing, and preserved honest
partial coverage.

### A precision note on a state name

`MARKETS_AVAILABLE_ADD_OFFICIAL_PATCH` is aspirational: it means *"this event is eligible for a
paid query"*, not *"markets are confirmed to exist"*. Only the fetch can establish the latter.
Today the fetch found nothing, so the truthful end state is `NO_ELIGIBLE_MARKETS`. The name
should be read as an eligibility classification; renaming it to something like
`ELIGIBLE_FOR_QUERY` is a worthwhile clarity fix, not a behavioral one.

## 3. Final Aug 3 official population

**211 rows across 7 events, frozen.** LAD @ CHC has started and is now permanently uncovered —
zero rows, which is a no-market decision and must never enter a settled denominator as a loss.

- Base identity digest: **green** (guard passing) — the population never changed all day despite
  three legitimate pregame regenerations.
- Native stamping: **211/211**, all research-eligible.
- Every row's `capturedAt` (04:34Z) precedes every first pitch (22:40Z+) by 18+ hours.

## 4. What tonight's settlement must produce

Unchanged from `AUG3_SETTLEMENT_ACCEPTANCE.md`: settle exactly 211 rows across 7 events, decisive
= W + L with voids excluded, and — the second independent proof — `research/*.json` present in
the automated nightly commit. LAD @ CHC contributes nothing and must appear nowhere in the
denominator.
