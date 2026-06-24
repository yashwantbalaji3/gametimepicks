# NO_QUALIFIED_LAUNCH — Root Cause Analysis (and proven fix)

## Verdict
**Not a model/threshold problem — a missing-input problem.** The Bank Builder / Moonshot / parlay engine
reads the **MLB model board** `mlb/boards/<date>.json` (leans with `edgePct` / `modelProbOver` /
`projection` / `sigma`). That board **had not been generated since June 22** — so for June 24 the engine saw
**0 eligible legs** and honestly returned NO_QUALIFIED_LAUNCH. The model was right; the data wasn't there.

## The trace
`project-and-launch-today` → `extractPredictionsForDate` → `loadSourceForSport("MLB", date)` →
reads `mlb/boards/<date>.json`. The **new flagship ingest** (`ingest-mlb-slate.mjs`) writes
`mlb/schedule|player-props|home-run-props` (raw **market** odds, no model edges) — a *different* pipeline
from `pipeline/mlb/generate_mlb_board.py`, which writes the **model board** the engine needs. The two MLB
pipelines are disconnected; only the flagship one ran for June 23-24.

## The fix (proven end-to-end this run)
Ran the canonical generator:
```
python3 -m pipeline.mlb.generate_mlb_board --date 2026-06-24   # 16 games, 687 model leans, 60 credits
```
Re-ran the engine → **MLB eligible legs 0 → 628**; suggested parlays medium 5 / high 5 / longshot 5;
**Bank Builder LAUNCHED** (real model-edge legs, survival 100):
- Lane A: Tanner Bibee K Over 4.5 + Griffin Jax K Under 4.5
- Lane B: Miles Mikolas K Under 3.5 + Joe Ryan K Over 5.5
Money checksums identical (no bankroll/ledger mutation). The launch wrote to the safe
`methodology/launch/` namespace, never the protected Bank Builder dir.

## Why it's not shipped live yet — two real blockers (documented, not faked)
1. **Slate coupling:** committing `mlb/boards/2026-06-24.json` makes `latestSlateDate` (which mixes MLB
   boards + WC projections) return June 24, which breaks 3 WC current-slate tests (WC's latest slate is
   June 23). Needs **per-sport slate resolution** before the board can ship.
2. **Active-run lifecycle:** the dual Bank Builder has an **active run mid-ladder** (Lane A awaiting Step 4,
   $1,464.71→$3,500). Promoting a June 24 run would overwrite it — the test suite enforces that the active
   run is untouched until it settles/closes. June 24 BB should launch only **after** the current run closes.

## Recommendation
1. Decouple slate resolution per sport (MLB board no longer forces the global WC slate).
2. Add a daily `generate_mlb_board` step to the automation so the model board never goes stale again
   (this is the actual recurring fix — the flagship ingest alone is insufficient for the engine).
3. Launch June 24 BB once the active run closes; same for Moonshot/WC once their projections generate.
