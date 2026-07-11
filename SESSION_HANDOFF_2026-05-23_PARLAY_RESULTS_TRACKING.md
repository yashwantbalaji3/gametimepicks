# SESSION HANDOFF · 2026-05-23 (late) · PARLAY RESULTS TRACKING

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main` once PR #94 merges.
> **Date written:** 2026-05-23 (~23:55 ET).

Fourth handoff of May 23 — partial settlement + first multi-day
parlay/curated tracking record.

---

## 1. MAY 23 RESULTS — REAL NUMBERS

### Settlement

| Sport | Wins | Losses | Decisive | Hit % | Notes |
|---|---:|---:|---:|---:|---|
| NBA | 49 | 34 | 83 | **37.5%** | NY @ CLE ECF G3 — model misfired |
| MLB | 98 | 117 | 215 | **45.6%** | 13 of 16 games final; 3 still live |

Lifetime audit after refresh: 1038-975 on 2013 = **51.6%**.

### Curated rail · day 2

4W · 2L · 0P · 0 pending → **66.7% on 6 picks**

| Pick | Actual | Status |
|---|---:|---|
| Evan Mobley Over 8.5 REB | 6.0 | loss |
| Max Strus Over 4.5 REB | 7.0 | win |
| Mikal Bridges Under 3.5 REB | 6.0 | loss |
| Blake Dunn Over 0.5 H | 2.0 | win |
| Moisés Ballesteros Under 0.5 H | 0.0 | win |
| Alex Bregman Over 0.5 H | 1.0 | win |

**Lifetime curated:** 8W-4L on 12 = **66.7%** (consistent across 2 days)
- NBA: 3-3 (50%)
- MLB: **5-1 (83.3%)**

### Parlay snapshot · day 2

3W · 31L · 0P · 0 pending → **8.8% on 34 slips**

Breakdown by sport × profile:
| | Wins | Losses |
|---|---:|---:|
| MLB conservative | 2 | 8 |
| MLB balanced | 1 | 9 |
| MLB aggressive | 0 | 10 |
| Multi aggressive | 0 | 4 |

**Lifetime parlays:** 6W-44L-1P on 50 graded = **12.0% hit rate**
- Conservative: 2-10 (16.7%)
- Balanced: 3-13 (18.8%)
- Aggressive: **1-21 (4.5%)** — clear failure mode

### Monte Carlo validation · 2-date check

| Recommendation | Day 1 (5/22) | Day 2 (5/23) | 2-Date Aggregate |
|---|---|---|---|
| Strong | 62.5% (10-6) | 50.0% (7-7) | 56.7% (17-13) |
| Watch | 65.2% (15-8) | 29.4% (5-12) | 50.0% (20-20) |
| High-variance | 55.6% (149-119) | 44.4% (110-138) | 50.2% (259-257) |
| Avoid | 50.0% (2-2) | 37.5% (3-5) | 41.7% (5-7) |

Day 2 reverted to roughly coin flip. MC stays shadow mode. Promotion
bar: ≥ 5 decisive dates with consistent separation.

## 2. HONEST LESSONS

1. **Curated > Parlays by 55pp.** Single-leg picks are crushing
   multi-leg parlays so far. The /about Watchlist now states this
   explicitly so users weight curated more heavily than parlay slips.
2. **Aggressive parlays are 1-21.** Correlation risk in 4-5 leg
   slips is brutal. We surface them but the data says these are not
   the recommendation track.
3. **MLB Hits is the strongest curated cohort** (5-1 / 83.3%). Two
   days of consistent signal is still small N, but directionally
   matches the audit (52.9% on 690 lifetime hits, picked tight).
4. **Top-player boost didn't save the parlay night.** Most slips
   include stars by design; stars went 3-24 tonight. The boost ranks
   recognizable players correctly but doesn't override the
   correlation problem.
5. **Monte Carlo Day 2 collapsed.** Watch dropped from 65% to 29%.
   This is exactly why we run validation across multiple dates
   before promoting — single-date results are noise.

## 3. PR #94 — WHAT SHIPPED

| | |
|---|---|
| Branch | `feature/may23-partial-settlement-parlay-results` |
| Title | `feat(results): settle May 23 completed games and surface suggested parlay tracking` |
| Files modified | model_audit.json, parlays/summary.json, curated/summary.json, settled_leans (NBA + MLB), about page |
| Files added | parlays/graded/2026-05-23.json, curated/graded/2026-05-23.json, MC shadow 5-23, comparison reports |
| Tests | All 10 pipeline test suites green + node:test |

`/about` Model Watchlist updated with both honest findings: Monte
Carlo two-date check + curated-vs-parlay 55pp gap.

## 4. KNOWN LIMITATIONS

1. **3 MLB games still pending** at write time. Tonight's nightly
   cron should pick them up. The graded parlays + curated files
   already account for this (those slips/picks just have
   unresolved legs — slip status remains pending if a loss isn't
   already in the chain).
2. **Aggressive parlays are 4.5%** but still surface as a default
   profile. Future PR should consider hiding aggressive behind a
   "show advanced" toggle or labeling it more aggressively.
3. **MC validation is per-date only.** A future PR should aggregate
   across all dates with shadow files and surface the cumulative
   record in `/about` instead of just the latest date.
4. **Vercel may need a nudge.** PR #89 needed one, recent PRs
   didn't. Monitor PR #94's deploy.

## 5. WHAT THE NEXT SESSION SHOULD DO FIRST

1. **Wait for tonight's nightly cron** to settle the 3 remaining
   MLB games. Re-run grade_parlays + grade_curated to capture any
   pending → decisive transitions.
2. **Consider hiding aggressive parlays** by default — they're
   1-21 (4.5%) on the live record. Either move to a "longshot"
   tab or reduce the default emit count.
3. **Surface the curated/parlay lifetime split** more prominently
   on `/results/parlays` (e.g. "Curated 66.7% · Parlays 12.0% on
   N decisive · pushes excluded").
4. **MLB game markets when budget allows** — 177 balance after
   recent fetches. The audit has 690 settled hits rows; chips
   would round out the matchup cards.
5. **MC validation across all dates** — currently a per-date CLI.
   Aggregate report would help the methodology track.

## 6. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #94 squash sha>
git push origin main
# Effects:
#   - Model audit reverts to PR #93 state
#   - Parlay/curated summary reverts (5-23 graded files stay on disk
#     but won't appear in summary until re-graded)
#   - /about Watchlist reverts to PR #91 copy
# If Vercel doesn't deploy:
#   git commit --allow-empty -m "chore: nudge production deploy hook"
#   git push origin main
```

---

*The two-day record is honest: curated is winning, parlays are
losing, MC is undecided. Users now see the gap explicitly on
/about. The hard product question — should we de-emphasize
multi-leg parlays in favor of single-leg curated picks — is on the
next session's table with real numbers to back it up.*
