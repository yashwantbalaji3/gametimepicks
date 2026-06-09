# UFC current-state audit (June 9)

1. **Public today:** nothing — there is **no `/ufc` route** and UFC is not in the
   nav. UFC exists only as internal infrastructure.
2. **Real data:** none ingested; the free ESPN MMA schedule is *available* but not
   yet wired to an artifact.
3. **Missing:** odds, fighter stats, results grading, backtest, page, artifacts.
4. **Odds ingestion:** none.
5. **Fighter-stats ingestion:** none.
6. **Results grading:** none.
7. **Model projections:** none.
8. **Suggested Parlays:** none.
9. **Methodology copy:** only the schedule-only constants in `ufc-types.ts`.
10. **Public copy honest:** yes (nothing published).
11. **Leak risk of fake picks:** low — `ufcPublicLevel` gates + no route. Now
    additionally backed by the readiness artifact (this PR).
12. **Incomplete components/routes:** the entire public UFC surface (no page).
13. **Tests:** `ufc-types.test.mjs` (gate ladder) + new `build_readiness_test.py`
    (7 fail-closed cases) + `audit-ufc-readiness.mjs`.
14. **Fails closed today:** projections + parlays (no providers) — enforced by
    `ufcPublicLevel` and now the readiness artifact.
15. **Biggest gaps to finished sport:** (a) a polished `/ufc` page + nav entry with
    data-readiness states; (b) odds provider; (c) fighter-stat provider;
    (d) results grading; (e) historical backtest.

This PR adds the fail-closed **readiness foundation** (artifact + pipeline + audit
+ planning docs). It publishes no picks.
