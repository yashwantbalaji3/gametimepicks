# July-13+ Readiness Log (2026-07-12 22:22 EDT)

Blunt outcome of the "un-stale the site for July 13 and onwards" pass.

## Timestamp reality
- **Real ET clock:** 2026-07-12 ~22:22 EDT (Sat night). UTC had rolled to 07-13.
- **Committed slate:** 2026-07-11 (last full slate: WC quarterfinals + a 15-game MLB board).
- Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged throughout. 19-14 / $0.

## What I tried: refresh to July-13
`bash scripts/refresh_daily_products.sh --date 2026-07-13` (keys present, credit-guarded, money-safe). It
revealed the **mid-July sports lull**:
- **MLB = 0 games for July-13** — the **All-Star break** (no MLB games ~July 13–16). The refresh wrote an
  empty board and then **errored** (`team-markets: board has no gameIds`, exit 1).
- **World Cup = between rounds** — the quarterfinals finished July 11; the **semifinals are July 14/15**. The
  slate window auto-widened to July-13→15 to reach the 2 upcoming semifinals.

So there is **no full "current" slate on July-13** — it's a genuine lull between events.

## Decision: reverted the thin July-13 data (kept the suite green + money safe)
Advancing to the empty/thin July-13 slate **broke 15 tests** (all assume a populated MLB slate exists) and the
master-ledger builder crashed on it. Rather than ship a broken, mostly-empty slate or do risky test surgery
during a lull, I **reverted the July-13 artifacts** back to the last full July-11 slate. The public freshness
badge (real ET clock) honestly shows "N days ago" — not a fake "live today".

**Kept (a real correctness fix):** `june16-count-and-run3.test` now bounds the in-focus count by the
artifact's own `slateWindow.days` (a knockout slate can span up to 3 days), not a hardcoded 2-day window.

**Already shipped last pass:** the past-event guard that suppresses the stale "Tonight's UFC picks" once the
event day passes — so the homepage is not showing UFC 329 as live.

## Daily automation status
Automation **already exists** and is the right long-term fix — it's just dormant pending secrets:
- `daily-refresh.yml` (cron `0 13 * * *`), `morning-projections.yml`, `mlb-daily.yml`, `world-cup-odds.yml`,
  `nightly-settle.yml`, `daily-rebuild.yml` (needs `VERCEL_DEPLOY_HOOK_URL`), UFC pre/post-card workflows.
- **Blocker:** the money-touching/paid workflows need the owner to add `ODDS_API_KEY` / `API_FOOTBALL_KEY`
  (and `VERCEL_DEPLOY_HOOK_URL` for auto-deploy) as **GitHub Actions secrets**. Until then they no-op /
  fail-closed. Adding those secrets turns on the daily loop and this weekend-stale problem stops.

## Bottom line / recommendation
The honest state is: **mid-July lull** — MLB on the All-Star break, WC semifinals July 14/15. The right next
refresh is **July-14 (WC semifinals)** and **~July-17 (MLB resumes)**, not the empty July-13. The two safe
wins this window: (1) the stale UFC "tonight's picks" is already suppressed; (2) add the GH secrets so the
daily refresh + settlement run automatically. See `CURRENT_SITE_STATUS_DASHBOARD.md` +
`WEEK_OF_JULY13_ACTION_PLAN.md`.
