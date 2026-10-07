# MLB playoff slate 2026-10-07 — preregistration (committed before the first game's first pitch)

Shadow / private research. Grants no product eligibility. MLB totals stay PAUSED for picks and boards.

## One model for the whole slate
- Engine: E3 full-game plate-appearance engine, code unchanged (`app/src/lib/mlb/full-game/engine.ts`, `plate-appearance.ts`).
- Parameters: the registered P317 forward candidate `mlb-fullgame-engine-league-rates-v1`
  (`data/internal/research/mlb/reports/engine-level-shadow-protocol.json`), unchanged.
- Model id: `mlb-fullgame-2026.08-pa-v2+mlb-fullgame-engine-league-rates-v1`.
- No parameter is chosen, tuned or changed today. A result from an earlier game never changes the model for a later one.

## Per game
- Inputs: whatever the public generator would read at the freeze moment (committed board, lineup archive snapshots captured
  before the freeze, committed team markets), each with its capture time in the receipt.
- 10,000 worlds, seed `<date>|mlb-fullgame|<gamePk>|mlb-fullgame-2026.08-pa-v2|1` (identical to the generator's own P317 shadow row).
- The public champion (default parameters) runs beside it on the same inputs and seed, for comparison only.
- Freeze: `app/scripts/research/freeze-mlb-slate-game.mjs --write`, before first pitch, committed and pushed before first pitch.
  The receipt is write-once. A missed freeze is recorded as `<gamePk>.missed.json` and never backfilled.

| Game | gamePk | First pitch (UTC) |
|---|---|---|
| CLE @ CWS | 849833 | 2026-10-07T20:00Z |
| LAD @ ATL | 849822 | 2026-10-07T22:00Z |
| TB @ NYY | 849838 | 2026-10-08T00:00Z |
| MIL @ SD | 849827 | 2026-10-08T02:00Z |

## Graded tomorrow from the frozen receipts only (no re-simulation)
Kept separate, never pooled: winner log loss/Brier; total level (actual − mean); total range coverage (p10–p90);
over/under log loss at the frozen line (pushes excluded); run-line cover. Four games is not evidence on its own;
the rows join the P317 forward record.
