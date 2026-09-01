# Program 227 — completion and convergence train

Session 2026-09-01, 12:38 → 14:20 ET (16:38 → 18:20 UTC). Entry `7af2219a0`; close `ce75c5f3d`
(after fast-forwarding bot commits). Production **`ce75c5f3d`** — equal to our tip. Money
`md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both pre-existing stashes and `vp/` untouched;
**no paid calls**. Covering gate `33534441159` on `a3b93928b`: phase 1 → build → phase 2, all success.

---

## Release E1 — nothing was owed

Recomputed at wall clock. All three "owed" rows were misclassifications, not missing work.

**Two UFC bouts** came back priced with no model read and were called `OFFERED_PRICED`. The card
artifact already says why on each: *"Neither fighter has enough UFC history in our corpus to build a
read from."* That is a decision, not a gap. **Third time** this file had thrown away a producer's own
refusal — after the UFC lane discarding its ladder's `NO_PRICES` and the EPL fixture reason being
dropped. A summary that re-derives a verdict its producer already reached will eventually disagree
with it.

**The EPL fixture** had a forecast and no price, and was called owed — on a Tuesday, when
`epl-matchweek` does not run until Thursday and captures it a full day before Friday's kickoff.
Nothing was wrong; the pipeline was not due yet.

So **owed vs awaited is now decided by the deadline**, not by the state. Every pending row carries
the next acquisition that could advance it, derived from each sport's real cron, and never one
scheduled after the event starts. A row with **no derivable deadline is owed, never fine** — "we
cannot say when this will be picked up" is worse than "it is late", not better.

### The NFL authorization has lapsed by its own terms

`nfl-odds-capture.yml` is `workflow_dispatch` with **no cron** — which is why its capture went 70
hours stale with nothing noticing: there was no slot to miss. **I did not add one.** The P171
receipt's Expiry is *"Program 171 close OR the 3,000-credit ceiling"*, and Program 171 closed long
ago. Scheduling automatic captures would spend under a lapsed authorization. **FOUNDER_GATED.**

The new `nfl-markets` owner therefore makes staleness visible without demanding a run: absent receipt
on a dispatch-only workflow is `NOT_DUE`, a stale artifact is `STALE` (71.3h against a 48h bound), and
a **fresh capture returning zero offered events is `HEALTHY`** — the distinction the charter asked
for, previously indistinguishable.

## Release H — do the pages agree with the control plane

The matrix is the denominator and is built from acquisition artifacts, not from the pages it audits.
Detectors: `REGION_NOT_FOUND`, `DATE_DRIFT`, `QUIET_SPORT_PRESENTED_LIVE`,
`INTERNAL_VOCABULARY_LEAK`. `mainRegion` returns **null** rather than falling back to the document —
that fallback is what lets a check read navigation chrome and the serialized payload instead of the
page, twice already.

Ten real surfaces reconcile clean, every region found. This file reads the built export, so it runs
in CI phase 2; it would have been meaningless before P225 re-sequenced the gate.

---

## Defects found by the program's own tools — all mine this session

The vacuous-guard failures of previous programs were **too quiet**. All three here were the opposite:
**too noisy**. A detector that cries wolf gets switched off, which is the same outcome as not having
one.

1. `DATE_DRIFT` flagged every ISO date, so `/results` — whose content *is* past dates — produced a
   finding a day, none real.
2. It compared UTC prefixes against ET-rendered dates, so `/nfl` showing `2026-09-09` for a
   `2026-09-10T00:20Z` kickoff read as drift.
3. `QUIET_SPORT_PRESENTED_LIVE` required only co-occurrence, so `/build` rendering "MLB 18 tonight's
   slate" beside an NBA filter chip was reported as NBA presented live.
4. The roll-up ordered `NO_EVENTS` above `COMPLETE`, so NBA being off-season made a fully-accounted
   32-event window read `NO_EVENTS` across the platform.

`DATE_DRIFT` is now **scoped rather than heuristic**: only surfaces whose subject is the current
slate are held to it, and the caller declares which. No flat-text rule reliably separates "the
settled row for 08-30" from "08-30 presented as tonight", and a detector that cannot be made precise
should not ship as a hard gate.

---

## Window at close

| sport | state | detail |
|---|---|---|
| MLB | COMPLETE | 15 `NOT_YET_CAPTURED`, next 21:10Z |
| NFL | COMPLETE | 2 `NOT_YET_CAPTURED`, next 09-02 15:00Z |
| UFC | COMPLETE | 7 `PUBLISHED` · 7 `REFUSED` |
| EPL | COMPLETE | 1 `FORECAST_READY`, next 09-03 21:00Z (pre-kickoff) |
| NBA | NO_EVENTS | off-season |

**COMPLETE · 32 events · 0 owed · 0 findings · conservation exact.**

## Remainder

`F` product lifecycles · `G` Top Picks and risk tiers · `I` public IA/content · `J` visual and
interaction QA · `K1` command-centre completion · `L` model governance · `M` convergence — all
ENGINEERING_OPEN.

**FOUNDER_GATED:** NFL market acquisition (P171 receipt expired — needs a fresh authorization with a
cadence); Moonshot (`MOONSHOT_REPAIR_PAUSE_OR_RETIRE`).
