# Aug 3 Morning Verification (Program 100-103, 09:30 ET follow-up)

The overnight program closed at ~01:15 ET asserting that the contract-commit fix would take
effect on the next nightly settle. **That assertion was wrong, and this is what actually
happened.**

## What the overnight runs did

`nightly-settle` **failed both scheduled runs** (04:45 ET and 06:54 ET):

```
MlbSettleError: board file not found: …/app/public/data/mlb/boards/2026-08-02.json
```

The writer settles "yesterday" — 2026-08-02 — a date that was **correctly never generated** and
is recorded `GENERATION_BLOCKED / NOT_MEASURABLE`. It was therefore crashing on the expected,
honest state of a date that will never have a board.

**This is the same failure class as the outage itself:** an honest condition treated as fatal,
with a blast radius far beyond its meaning. And it mattered doubly — because the settle chain
aborted at that step, the step that commits the public research contract never ran, so the
Layer-1 fix from the overnight program could not actually take effect.

## Fix (`fe20fd68`)

A date with no published board is a **skip with a loud NOT_MEASURABLE line and exit 0**, not a
crash. Dates that *do* have boards settle exactly as before, and `settle()` itself is unchanged
— it still raises for programmatic callers (asserted in the test).

Board freshness remains enforced by the guard whose job it is: the daily freshness SLO fails
when the **current** slate has no board past 14:00 ET. Missing-board detection did not move; it
moved to the right place.

Regression: `test_missing_board_is_a_skip_not_a_crash` — CLI exit 0 on a boardless date, and
`settle()` still raises.

## Both fixes PROVEN LIVE (run 30818000856, 09:28 ET — first nightly success since Aug 1)

A dispatched `nightly-settle` on the fixed code produced, in one run:

1. **Layer-2 (this morning's fix):**
   `[mlb-settle] SKIP 2026-08-02: NOT_MEASURABLE — no published board at …` — the boardless date
   skipped honestly and the run continued instead of aborting.
2. **Layer-1 (last night's fix), proven for the first time ever:** the automated commit
   `bbd2bdd9` includes
   ```
   app/public/data/research/system-status.json      | 2 +-
   app/public/data/research/terminal-summary.json   | 2 +-
   ```
   Before this fix, `git log` on that file showed **only hand-made commits** (`387cdd6f`,
   `9ab77844`, `a21e9aa5`). The contract is now genuinely self-updating.
3. **Agreement restored and holding:** committed contract `asOfSettledDate = 2026-07-31` ==
   ledger newest settled `2026-07-31`.
4. Health gate: `HEALTHY — 18 passed, 2 warning(s)`; commit pushed.

The chain that produced the 62-hour outage is now closed at every link, with each link's repair
demonstrated in production rather than asserted.

## Public state at 09:30 ET — verified in a real browser

`/today/` renders **"Today · Aug 3 · Pregame slate"** with live Aug 3 rows (WSH @ PHI player
props showing calibrated / no-vig / raw estimates), paper record **19–14 · $19,065.40**,
**"Settled · Jul 31"**, and the honest *"RECALIBRATE — does not out-score the sportsbook here"*
language intact.

### A false alarm worth recording

Automated `curl` checks began returning **HTTP 403** with `x-vercel-mitigated: challenge` — a
Vercel **bot challenge** tripped by this session's repeated scripted requests, **not** an
outage. Real browsers solve the JS challenge transparently, which the browser check above
confirms.

Operational consequence: the observer's deployment probe uses `curl`, so it can report
`deployment UNVERIFIED · unreachable` for the same reason. That is honest degradation (it says
UNVERIFIED rather than inventing a state) but it means **a red deployment line in the observer
must be confirmed in a browser before being treated as an incident.** Noted for the runbook.
