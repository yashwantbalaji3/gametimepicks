# Runbook — Bank Builder Launch Workflow

_Never launch without an explicit task AND a passing V2 gate._

## Command (evaluate, then optionally launch)
```
python -m pipeline.daily.bank_builder_v2_eligibility --date <YYYY-MM-DD>            # evaluate only
python -m pipeline.daily.bank_builder_v2_eligibility --date <YYYY-MM-DD> --launch   # write Run #N if it passes
```
The V1 selector (`build_dual_bank_builder.py`) is superseded and refuses unless `--force-v1-launch`.

## Gate requirements (all must hold)
- **V2 pass required** — survival gate returns `decision: "launch"`.
- **≥ 4 non-fragile eligible legs** (survival ≥ 80) across **≥ 3 distinct games** (so two lanes can
  be game-disjoint / differentiated).
- **Two lanes, 2 legs each, no shared leg**; prefer no shared game; prefer ≥1 World Cup leg per lane.
- **No started/suspended/stale games**; all legs upcoming + odds-backed.
- **No fragile props** — single-player high-variance props and unconfirmed-lineup (DNP) props are
  rejected by the gate.
- **Correlation controls** — flag/avoid lanes that both depend on the same outcome.

## If the gate blocks
Do **not** launch. Surface "V2 evaluating — no qualifying launch yet", the strongest candidates with
survival scores, and the exact blockers (e.g. "only N distinct games", "over-correlated"). Record an
explicit note (e.g. Argentina ML evaluated → rejected, with the reason).

## If it launches
Write Run #N (status pending/active, 2 lanes, $100 each), archive the prior dual run, and surface per
lane: survival score per leg, lane survival, hit rate, odds, projected return, why selected, start
times. Homepage + meter move to active. Run #1/#2 history preserved.
