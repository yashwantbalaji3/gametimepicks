# Site UI/UX Triage — 2026-06-10

_Read-only triage of the live production product (https://gametime-picks.vercel.app).
Screenshots referenced by the user: Bank Builder hero/slip/ladder + Results congestion._

## Snapshot (all routes 200)
/, /mlb, /nba, /nba/board, /nba/parlays, /bank-builder, /results, /ufc, /world-cup → 200.
No broken routes. The issue is polish/clarity, not availability.

## Top 10 UX issues
1. **Results page is congested** — projection accuracy, parlay performance, and per-slip
   detail are mixed in one dense area with developer labels ("generated pool lifetime").
2. **MLB has no June 10 slate yet** — `mlb/boards/2026-06-10.json` absent; /mlb shows the
   stale June 9 slate as if current (the daily cron is delayed). Top freshness issue.
3. **Bank Builder** — largely fixed in PR #360 (hero KPIs, June 9 slip card, collapsed
   audit). Remaining: confirm the ladder doesn't dominate + today's-slip empty state is compact.
4. **Suggested Parlays empty states** — single-game NBA slate yields 0 public multi-leg
   slips (same-game cap); needs a friendly explanation, not a blank/broken look.
5. **Lifetime 3-7** must never surface in any hero/KPI (only collapsed audit) — verified on
   Bank Builder; re-check Results doesn't surface lifetime failure counts prominently.
6. **Dense internal labels** across pages ("legPool", "generated pool", "anomaly leg",
   "trends_pending") read as a dev dashboard, not a product.
7. **Date/slate status strip** can show a past slate as active when today's board is missing.
8. **No consistent empty-state component** — pending/gated sections look inconsistent.
9. **Hierarchy**: pages don't answer "what's live today / what to look at / what's pending /
   why" within 5 seconds.
10. **Two Vercel projects** (dash live, no-dash 404s on pages) — cleanup item; ensure all
    links use the dash domain.

## Quick wins (low risk)
- Results: top "Model Performance" summary cards (hit rate, settled, pending, last settled
  date) + collapse per-slip rows behind "View details"; split projection accuracy vs parlay
  performance; MLB vs NBA separated.
- Friendly gate-based empty states for Suggested Parlays (single-game same-game-cap note).
- Ensure the status strip reflects the true active slate (don't show a past date as live).

## Deeper redesign (more risk — stage carefully)
- Shared design-system components (StatusBadge / MetricCard / SlipCard / EmptyState /
  SectionHeader / AuditDetails) and a consolidated homepage dashboard.

## Blocker found this session
GitHub **write auth (workflow dispatch + likely PR create/merge) is returning 401** while
reads succeed — token appears to have lost write/dispatch permission mid-session. This
blocks the June 10 MLB paid run and any merge/deploy until re-authenticated
(`gh auth login`). The scheduled `morning-projections` cron (13:30 UTC, delayed ~16:1x)
should still generate MLB June 10, but with `nba_api` (IP-blocked) it risks regressing the
good ESPN NBA board — recommend setting repo var `NBA_DATA_PROVIDER=espn_scoreboard`.
