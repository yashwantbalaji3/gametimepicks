# June-6 Model-Improvement Next Actions (latest)

> Status snapshot after the June-5 free settlement (PR #286) and the V2
> distinct-dates gate hardening. **V2 stays internal.** No projection /
> optimizer / parlay / public wiring was touched. No paid API was spent.

## Headline: a mechanical V2 launch candidate appeared, and was correctly stopped

When June 5 was settled (9 settled dates, 2026-05-27 → 2026-06-05), the
internal learning-feedback audit surfaced **one** segment that mechanically
cleared every previously-hardened launch gate:

| segment | N | rate | de-vig | padj | dates | LOO |
|---|---:|---:|---:|---:|---:|---|
| `nba_market_PTS` | 424 | 57.8% | 49.7% | 0.010 | 4/4 positive | worst-case 56.1% |

Per-date: 2026-05-28 56% · 05-30 56% · 06-03 56% · 06-05 62%.

### Why this was NOT a real edge
Those 424 "legs" came from a **single 4-date NBA Finals series**. Within one
NBA slate, PTS Overs are heavily correlated (shared pace, officiating, total,
the same two teams). So the effective number of *independent* observations is
~4 correlated slates, **not** 424 independent trials. The Bonferroni /
Poisson-binomial / Wilson machinery all assume leg-level independence, so a
thin, single-matchup sample can clear them on leg count alone.

The canonical candidate search (`audit-v2-candidate-search.mjs`) never tripped
because it deliberately does **not** segment NBA by market — it only tests
`nba_all_priced_overall`. The two audits diverged purely because the
learning-feedback audit slices NBA per-market; the gate itself had no defense.

### What was done (conservative hardening, fully internal)
`src/lib/v2-candidate-gates.ts`: added `minDistinctDates` (default **8** — more
than a single best-of-7 series) to `GateConfig`/`DEFAULT_GATES` and a
`too_few_dates` launch gate. A bucket below the threshold falls back to
`shadow_watchlist` (promising but unconfirmed). The change **only ever makes
launch harder**.

Result on the exact triggering data (unchanged N/rate/padj):

```
nba_market_PTS: N=424 58% devig 49.7% padj=0.010 dates 4/4  fail:too_few_dates
→ verdict shadow_watchlist (was launch_candidate)
LAUNCH CANDIDATES (corrected gates): 0
```

Tests added (15/15 in the gate suite; 712/712 app suite): the NBA-Finals shape
(4 strong slates) → `shadow_watchlist` via `too_few_dates`; the *identical*
edge spread over 8 slates → `launch_candidate`; the existing 8-date launch
fixture still launches.

## Verdict
- **V2 remains internal.** 0 launch candidates across 9 settled dates after the
  hardening. `ENABLE_V2_SHADOW_CANDIDATE=false`; nothing is wired to public.
- The PTS/REB NBA segments are **shadow_watchlist** only — re-evaluate once the
  public era contains ≥8 *independent* NBA slates spanning more than one
  matchup (i.e. a new season / different teams), not just a longer Finals.

## Open blockers / next actions (no spend, no public change)
1. **NBA recent-form freshness** — the active-board leakage audit still WARNs on
   stale NBA leans (latest recent-game older than the 21-day window). The
   provider fix (Playoffs + Regular Season merge, #282) is in; staleness now is
   an off-season data-availability gap, not a code bug. Re-verify after the next
   NBA generation refreshes form.
2. **Per-market NBA segmentation in the learning audit** — keep it as an
   internal diagnostic only; it is intentionally more aggressive than the
   canonical search. The `too_few_dates` gate now prevents it from emitting a
   launch verdict on a thin sample.
3. **June-6 generation validation** — deferred until the `morning-projections`
   cron runs (~13:30 UTC). Do **not** dispatch a paid run: the cron is not yet
   stalled for June 6 and games have not started. Validate quality/leakage/
   risk-levels after it lands.
4. **Effective-N (optional, future)** — `minDistinctDates` is a coarse proxy for
   independence. A future refinement could cluster by date and use a
   date-level (rather than leg-level) test statistic. Not required while the
   public era is young and everything stays internal.

*Read-only audit + conservative gate hardening. No paid API, no projection/
grading-math change, no public V2 exposure.*
