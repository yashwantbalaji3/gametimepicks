# MLB Product Settlement — July-9 Validation (2026-07-09)

**Validates MLB team-market settlement (moneyline + run line + total) end-to-end on July-9's final
games — the residual from the linescore-settlement mission (total/run-line needed a date where the
committed line AND the final score co-exist). July-9 provides it.** Internal only; the official 19-14
record is never touched.

Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged before and after (validation is read-only /
in-memory).

---

## Status

July-9 is **partially final** (games still in progress at validation time), so **no volatile linescore
cache or ledger was committed** (per the guardrail). The grading below is in-memory, from the live
StatsAPI schedule + the committed team-market lines.

| metric | value |
|---|---|
| games scheduled | 13 |
| games final | 6 |
| games pending (in progress) | 7 |
| moneyline graded (final games) | 6 / 6 |
| moneyline mismatches vs official linescore | **0** |
| total graded (line committed + final score) | **6 / 6** |
| run-line graded (line committed + final score) | **6 / 6** |
| final games missing a committed line | 0 |
| money file changed? | No (`affe6b21`) |

Sample (away@home · away-home score · ML / total / run-line settlement):
- ATL@PIT · 10-5 · ML loss (home PIT lost) / total win / run-line loss
- KC@NYM · 3-7 · ML win (home NYM won) / total win / run-line loss
- NYY@TB · 12-4 · ML loss / total win / run-line win

## Findings

- **Moneyline** settlement continues to match the official linescore exactly (0 mismatches).
- **Total and run line now settle end-to-end** — for July-9's final games the committed team-market line
  (`getMlbGameCenter`) and the official final score (StatsAPI) co-occur, so the pure rules
  (`settleMlbTotal` / `settleMlbRunLine`) grade to win/loss/push. This closes the "total/run-line
  live-grading data-pending" residual: the settlement mechanics are now validated on real games, not
  just fixtures.
- **Non-final games stay pending** — the 7 in-progress games are not graded, and their volatile
  linescore is not committed.

## What remains

Once July-9 fully finalizes, an operator can run the guarded fetcher + ledger to commit a deterministic
`data/internal/mlb/linescores/2026-07-09.json` + `product-settlement/2026-07-09.json` (internal only).
None of this writes the official 19-14 record; team-market money activation stays founder-gated.
