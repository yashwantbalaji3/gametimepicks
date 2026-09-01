# Program 226 — four-sport public completion train

Session 2026-09-01, 11:49 → 13:35 ET (15:49 → 17:35 UTC). Entry `9e0847e8a`, production already at
that tip. Close: **`a22649bc7`**, production `a22649bc7` — exact, not merely ancestry-covered. Money
`md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; two pre-existing stashes and `vp/` untouched; no
paid calls (UFC 17→18 credits came from the scheduled `ufc-fight-week` refresh, commit `057ba06fb`).

Covering gate `33529832203` on `a22649bc7`: phase 1 → build → phase 2, all success. E0's own run was
cancelled by K0's push under `cancel-in-progress`, so `a22649bc7` is the covering gate for both.

---

## Release E0 — the matrix was auditing itself

**The denominator was the thing being audited.** MLB's population came from the newest committed
board, written by the **paid** ingestion. A denominator derived downstream of what you are auditing
cannot detect an omission — an event the market never offered is simply absent from a market-driven
list. It also meant that before each day's paid run the matrix had only *yesterday* to describe, and
at 15:49Z it answered with yesterday's twelve started games while fifteen were scheduled for that
night.

`capture-mlb-schedule.mjs` takes the day's true event population from the **free** StatsAPI schedule
— no key, schedule only — into its own path so it can never be confused with the paid artifact. It
refuses rather than writing an empty day on a network failure: writing zero games would erase a real
slate from every consumer.

**"We never asked" is not "there is nothing there."** NFL's newest market capture is stamped
2026-08-29 with `eventCount: 1`, and that one event is CHI @ TEN — since played and settled. The only
scheduled game, NE @ SEA on 09-10, has never been probed. Reporting it `NOT_OFFERED` asserts
something about the **provider** that the evidence only supports about **us**. EPL was the same
shape: an 08-30 odds snapshot cannot have probed a 09-04 fixture whose market had not opened.

New explicitly-named state `NOT_YET_CAPTURED`, ordered below every form of real evidence so it can
never mask something we do have, and counted as *awaited* rather than *owed*.

| sport | window at close |
|---|---|
| MLB | 15 `NOT_YET_CAPTURED` — board due 21:10Z |
| NFL | 1 `NOT_YET_CAPTURED` — capture 3d stale, this event never probed |
| UFC | 7 `PUBLISHED` · 2 `OFFERED_PRICED` (owed) · 5 `REFUSED` (named alias-join failures) |
| EPL | 1 `FORECAST_READY` (owed) |
| NBA | `NO_EVENTS` |

Conservation exact on all five. Overall `WORK_OWED`, 3 owed.

## Release K0 — an operator who reads it

/launch renders the matrix: sport, state, events, owed, awaited, findings, per-state breakdown, next
event, plus identity-level exceptions. Every number and state string is **derived**; a panel that
hardcodes one goes stale the moment the matrix moves, and then two sources disagree with no way to
tell which is right. An absent matrix is reported as absent.

Boundary verified both ways — /launch pruned from the public build, no public page carries the
matrix's vocabulary, no offered-window artifact served. In production: `/launch`, `/ops`, `/preview`
all 404; nine public routes 200.

---

## Defects found by the program's own tools — four of them mine

1. **NFL measured the schedule's age to answer a market question**, so a three-day-old price capture
   looked current behind a fresh schedule stamp.
2. **EPL used a set-level `public` flag as per-fixture publication**, so a `READY_EXCEPT_ODDS` match
   with probabilities explicitly withheld reported as `PUBLISHED` — worse than the refusal it
   replaced. Identical to the UFC card-level `model` block mistake, made twice in one file.
3. **The K0 guard was vacuous** — the fourth of that class. It sliced from `indexOf("offered-window")`,
   which lands on the *loader* several sections above the panel, so the first `</section>` closed
   somebody else's markup and the panel was never scanned. A hardcoded count sat inside it and the
   test passed. Now anchored on the section's own aria id, **with an assertion that the sliced region
   actually contains the panel** — a region check that cannot prove it found its region is not a check.
4. (P225 carry-over, corrected here) the counts-only summary is **staged, not served**: the export
   prunes `out/data` deny-by-default. K0's operator panel is now its real consumer.

---

## Remainder — ENGINEERING_OPEN

**E1** four-sport production reconciliation · **H** cross-surface reconciler · **F** product
lifecycles (Moonshot founder-gated on `MOONSHOT_REPAIR_PAUSE_OR_RETIRE`) · **G** Top Picks and risk
tiers · **I/J** UX and mobile assurance · **K1** command-centre completion · **L** model governance ·
**M** final convergence.

Next, dependency-ordered:

1. **E1** — close the 3 owed rows: 2 UFC `OFFERED_PRICED` need forecasts published; 1 EPL
   `FORECAST_READY` needs a price. Both are pipeline work the matrix now names by identity.
2. **NFL market capture cadence** — the 3-day gap is an operational finding, not a code defect;
   arm it as a receipt-SLO expectation or fix the capture schedule.
3. **H** — reconcile the public surfaces against the matrix at one pinned clock.
4. **F** — product lifecycles on the same identities.
