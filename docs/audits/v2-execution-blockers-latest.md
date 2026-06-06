# V2 Execution Blockers (2026-06-06)

> Why the full V2 roadmap isn't live yet, and the exact go-forward. Internal only;
> V2 remains `v2_not_ready` (0 corrected launch candidates). No public V2/edge copy.

## 1. Statistical blockers
8 settled dates (2026-05-27→06-04); MLB 3743 + NBA 794 decided legs; de-vig-able N=4537.
**0 corrected launch candidates.** The 3 best segments are `shadow_watchlist` only:
| segment | N | rate | de-vig | adj p | dates+ | fails |
|---------|--:|-----:|-------:|------:|-------:|-------|
| nba_market_PTS | 294 | 56% | 49.7% | 0.327 | 3/3 | corrected_ci, adjusted_p, single_date_overdependence |
| nba_market_REB | 268 | 59% | 50.1% | 0.058 | 3/3 | corrected_ci, adjusted_p, single_date_overdependence |
| mlb_l5_5of5 | 253 | 63% | 56.6% | 0.495 | 6/8 | corrected_ci, adjusted_p, single_date_overdependence |
Root causes: small date counts (NBA 3 dates → can't establish stability), adjusted p nowhere near 0.05 after Bonferroni, and single-date leave-one-out kills the naive edge. The market is efficient at these sample sizes.

## 2. Data blockers
**MLB** (active board lean fields: recentSeries, odds/implied, modelProb, venue, contextTag, samples, sigma, playerRole):
- handedness/platoon — **missing source**; pitch mix — **missing**; park/weather/umpire — **missing** (only `venue` name); bullpen fatigue — **missing**; confirmed lineup / lineup spot timing — **missing**; starter confirmation — **partial** (playerRole only); dated `recentGames` provenance — **missing** (MLB carries `recentSeries` values, no dates).
**NBA** (fields: recent10, recentGames(dated), modelProbability, homeAway, newsSignals/newsAction, sourceReliability, tipoff, status):
- playoff game logs — **fixed (#282)**, now flowing on refresh (June 5 latest recentGames = 2026-06-03 for refreshed players; 38 leans still stale); projected minutes — **missing**; usage/vacated usage — **missing**; pace/spread/total — **missing**; matchup/defense-by-role — **missing**; injury/rotation freshness — **partial** (newsSignals only).
**Alternate lines:** prior MLB spike = one-sided Over-only ladders → **not de-viggable**, gradable-only. NBA alt-line tooling is MLB-only (needs code).
**Soccer/World Cup:** **schedule-only** (no projection/odds/grading pipeline). Needs data provider + markets + grading contract.

## 3. Product blockers
- Low Risk credibility — **fixed** (#282 gate + #283 reclass; audit PASS).
- Suggested depth — MLB healthy; NBA limited by 1-game slates + stale form; Mixed depends on NBA trust.
- Results clarity — **fixed** (#279 two-record).
- Bank Builder — blocked by NBA form trust on thin slates.
- Cron reliability — intermittent (nightly-settle/morning-projections run late; auto-refresh occasionally cancelled).
- Duplicate Vercel — two deploy checks per push (manual cleanup).

## 4. Execution blockers (by feasibility)
- **Now (no new data):** leakage-safety audit (added); stale/missing form flags; risk-factor consolidation; honest empty states.
- **Next slate (free):** playoff-inclusive NBA form (provider fix already merged) — validate on June 6 generation.
- **Needs data provider:** MLB handedness/pitch-mix/park/weather/umpire/bullpen/lineup; NBA minutes/usage/pace/defense-by-role; two-way alternate lines; all of World Cup modeling.
- **Needs paid API:** any new odds/alt-line fetch (cost-guarded, shadow-only).
- **Needs human approval:** wiring any V2 segment live (only if a corrected candidate ever appears — STOP).
- **Unsafe/unvalidated:** publishing any current watchlist segment as an edge.

## 5. Go-forward
- **Now:** leakage-safety audit + form-trust flags + risk consolidation + docs. ✅ (this session)
- **Next slate:** validate NBA playoff form + Low/depth on the June 6 fresh generation.
- **Needs data provider:** the MLB/NBA advanced features + World Cup + two-way alt lines.
- **Do not do:** publish V2/edge, fabricate missing features, or wire watchlist segments live.

*Internal. No public V2/edge claim. No data/model/grading change.*
