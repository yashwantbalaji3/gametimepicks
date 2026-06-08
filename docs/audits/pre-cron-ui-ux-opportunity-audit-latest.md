# Pre-Cron UI/UX Opportunity Audit (latest)

> Quick low-risk pass while waiting for the June-8 cron. The UI is already
> polished (#300-304). Highest-value, lowest-risk, on-mission opportunity:
> the empty-state / "not padded" copy was STALE — it named only "sport, variety,
> volume" filters, but #306/#307 now gate by market quality + reliability, so a
> section can be empty for quality reasons. Making that copy honest matters now
> that the gates can legitimately empty sections.

## Top opportunities (low-risk, visible)
1. **Empty-state + "not padded" copy → reflect the quality gates** (CHOSEN). The
   reason a section is empty / cards are capped now includes market reliability +
   recent form + odds, not just sport/variety/volume. Honest + on-mission.
2. Per-leg "why this leg" chips — deferred (needs care; bigger).
3. Results risk/sport mini-bar extension — deferred (already has accuracy bars).
4. Methodology readability cards — deferred (just refreshed the edge copy).

## Chosen this pass
Opportunity 1 only — three copy locations + the `getEmptySectionReason` helper,
so every place we explain fewer/empty cards names the real gate set honestly.
