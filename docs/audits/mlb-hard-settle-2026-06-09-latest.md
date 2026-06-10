# MLB Hard Settle — 2026-06-09

_Generated 2026-06-10 (02:18 ET). Normal settlement path (`nightly-settle.yml` →
`scripts/automation_settle.sh`, `settle_date=2026-06-09`). No fake data._

## Result: ✅ All June 9 MLB games settled
| Metric | Value |
|---|---|
| Settled date | 2026-06-09 |
| Scheduled games | 15 |
| Final games | 15 |
| **Final games settled** | **15** |
| **Pending games** | **0** |
| Partial | false |
| Pick legs graded (decisive) | 588 (W 338 · L 250 · Push 0) |
| Parlay slips graded | 18 |
| Settlement source | MLB Stats API (settle_mlb_results) |

## Artifacts updated (commit `ddf9ecc`)
- `app/public/data/mlb/results/comparison_report_2026-06-09.json`
- `app/public/data/mlb/results/available_dates.json` (now ends 2026-06-09)
- `app/public/data/mlb/results/lifetime_summary.json`, `settled_leans.jsonl`
- `app/public/data/parlays/graded/2026-06-09.json` (18 slips)
- `app/public/data/parlays/optimizer-graded/2026-06-09.json`
- `app/public/data/audit/daily/2026-06-09.json` (daily postmortem)
- `app/public/data/learning/selection-policy-2026-06-09.json` + `selection-policy-latest.json`

## Safety checks
- **No pending games** remain for June 9 (15/15 settled).
- **No future-date leakage:** max settled date = 2026-06-09; 2026-06-10 is NOT settled.
- **Results page is settled-only:** reads `mlb/results/*` (graded outcomes), not live boards.
- **No duplicate settlement:** the run created June-9 artifacts fresh (none existed prior).
- **MLB production gates unchanged:** settlement is read-only w.r.t. the model/optimizer;
  the self-learning policy updated from settled outcomes only (its normal behavior).

## Warnings
- None. Run conclusion: success.

## Production / deployment
The settle commit carries `[skip ci]` (bot convention), so production will refresh on the
next non-skip deploy. Deployed once at the end of this session's work; verified on
https://gametime-picks.vercel.app.
