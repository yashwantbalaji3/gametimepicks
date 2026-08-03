# Program 117-122 Founder Report — The Blocker Is Gone, and Two Silent Defects With It

**2026-08-03, ~13:00 ET.** Three things shipped, and two of them were problems nobody knew about.

## 1. Cached odds were being re-stamped as fresh captures

While verifying the 12:04 ET board regeneration I noticed it spent **zero credits** — served
entirely from cache — and yet `capturedAt` on all 211 rows had moved from `04:34Z` to `16:03Z`.
Same rows, same model numbers, brand-new capture timestamp.

The provider client served cache hits with headers that threw away *when the data was actually
observed*, so the generator couldn't tell a cache hit from a live read and stamped "now" every
time. `capturedAt` is the one provenance field that can never be reconstructed afterwards — it's
what the research corpus treats as the fact of when prices were seen — and it had quietly stopped
meaning that.

This is the exact condition the append-only patch validator refuses. It was happening in the
canonical generator. Cache hits now carry the true observation instant and the generator stamps
from it. **No leakage resulted** (16:03Z still precedes the 22:40Z first pitch), but the record
was wrong.

## 2. The MLB Python test suites had never run

`run_all_tests.sh` only ever reached `pipeline/*_test.py`. Everything under `pipeline/mlb/` —
settlement grading, board identity, settlement lineage, model, export — sat on disk and was
**never executed by any runner or workflow**. That includes the July-30 void-denominator
regression I wrote days ago, which had only ever run when I invoked it by hand.

All seven suites are now wired and green. This is the "green but never ran" class again, and it's
worth noticing that the tests existing was never the same as the tests running.

## 3. Event-scoped generation — the blocker from Program 108-111

I previously declined to build the official-addition writer because the generator had no way to
produce rows for a single event, and faking one would have meant copying prediction logic into a
parallel path. That's now solved properly: `--event` narrows the provider event list and the
narrowed list flows through the *identical* cost estimate, credit guards, fetch loop, stamping
and row generation. Equivalence is structural, not asserted.

Two safety properties matter more than the feature: a scoped run **requires** `--rows-out` and
writes its rows to a standalone artifact, so it physically cannot overwrite a frozen base board;
and unknown event ids are refused rather than silently yielding an empty board.

Proven by `UNION(scoped) == full` using whole-row equality — so a projection, policy, timing or
provenance difference fails the test, not just an identity mismatch — plus the null-`playerId`
regression from last program, which scoping preserves.

## A correction to my own earlier claim

My 10:20 "base cutover" document said the Aug 3 board was frozen. **It wasn't.** The scheduled
pipeline regenerated it at 12:04, which it was entitled to do — the whole-slate rule permits
regeneration while every game is still pregame. A cutover declared in a document doesn't bind a
scheduled writer; only code does. The manifest now says so, with both hashes.

What did hold is the guard: it pins the *prediction population*, not the file bytes, so it
correctly passed a legitimate re-serialization while still being able to catch a row swap. The
211 identities never changed.

## State

Coverage is unchanged — 7 games covered, LAD @ CHC still has no posted markets. **I did not
compete with the 15:30 top-up**, which owns the next decision. **Zero credits spent this
program.** Protected money byte-exact (19–14 · $19,065.40), `vp/` untouched, base identity digest
green.

## What's next, honestly

The append-only *writer* is now unblocked but not built — the scoped generator is its missing
half. The remaining pieces are the patch-write cycle and the fetch→validate→materialize wiring,
which should be first exercised supervised, before first pitch, rather than shipped unattended
into a 15:30 cron on day one. That sequencing is what kept the last two incidents from repeating.
