# June 4 Settlement (local, 2026-06-05)

> Local settlement run (free public APIs only, **0 odds credits**, **no push**).
> Run on branch `chore/settle-june-4` off `main` (`408891e`). Not pushed — the
> nightly-settle cron (05:30/07:30 UTC) will also settle June 4 canonically on
> origin; this local run lets June 4 move into Results now, pending push approval.

## Command
`SETTLE_DATE=2026-06-04 SKIP_NBA=1 bash scripts/automation_settle.sh`
(NBA skipped — June 4 is a genuine NBA off-day; the slate is MLB-only.)

## Result — optimizer parlays
- **48 unique slips (64 total): 6W / 42L / 0 push / 0 pending** · hit rate **12.5%** · sport **mlb**.
- Legs: **86W / 66L / 0 unresolved** — every leg resolved; **no pending/DNP** legs, so nothing counts as a loss dishonestly.
- Daily postmortem: `app/public/data/audit/daily/2026-06-04.json` (6W-42L, 12.5%).

## Safety / integrity
- **Free public APIs only** (MLB Stats API). 0 odds credits. The script does **not** push; the workflow's separate step pushes (not run here).
- All 9 June-4 MLB games confirmed **FINAL** before settling (ESPN scoreboard) — not a partial settle.
- **June 5 graded: absent** (correct — June 5 not generated yet).
- Historical regrades (May 25–Jun 3 via `grade_optimizer --all`) are **non-substantive** (final grades unchanged; the cron does the same nightly). June 3 remains 18W/93L/2 pending.
- **No code/model/optimizer/projection changes** — settlement artifacts only.

## Files (settlement artifacts, committed locally on `chore/settle-june-4`)
- `app/public/data/parlays/optimizer-graded/2026-06-04.json` (+ regrades), `optimizer-summary.json`
- `app/public/data/parlays/graded/`, `summary.json`
- `app/public/data/mlb/results/`, `app/public/data/results/` (if changed)
- `app/public/data/audit/model_audit.json`, `audit/daily/2026-06-04.json`, `audit/policy.json`
- `pipeline/validation/` (settled_leans + comparison reports)

## Next
- Latest settled is now **June 4** on this branch. Once pushed (or once the cron
  settles June 4 on origin), `/results` shows June 4 and the active slate advances
  to June 5 after morning-projections generates it.
- **Not pushed** — awaiting approval, or let the nightly-settle cron land it
  canonically. Do not race the cron with a push without coordinating.
