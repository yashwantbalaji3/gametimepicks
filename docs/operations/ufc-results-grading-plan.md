# UFC results-grading plan

**Result fields:** boutId, winnerId, method (ko_tko | submission | decision),
round, timeSeconds, status (final | no_contest | overturned | cancelled).
**Markets graded:** moneyline (winner), method, over/under rounds, round props.
**Edge cases:** draw → moneyline push; no-contest/cancelled → void all bout
markets; overturned → regrade idempotently. **Idempotency:** re-running a settled
bout is a no-op; never double-count. **Integration:** feed graded bouts into the
public Results surface only after real grading exists; until then Results ignore
UFC. **Audit:** extend `audit-ufc-readiness.mjs` + add a settle test mirroring
`settle_mlb_results_test.py`. **Manual override:** a reviewed correction file, same
pattern as MLB. Implement only when an odds + results source is connected.
