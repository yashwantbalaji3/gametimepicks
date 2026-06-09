# MLB projection-formula backtest (2026-06-01→2026-06-08)

Leakage-safe (pre-game series vs that day's actual). Brier ↓ better; dirAcc ↑ better.

## batter_hits (n=1497)
- L10 weight 0.3: Brier 0.2489, dirAcc 0.582
- L10 weight 0.4: Brier 0.2496, dirAcc 0.582
- L10 weight 0.5: Brier 0.2504, dirAcc 0.581
- L10 weight 0.6: Brier 0.2514, dirAcc 0.58

## batter_total_bases (n=706)
- L10 weight 0.3: Brier 0.2612, dirAcc 0.482
- L10 weight 0.4: Brier 0.2626, dirAcc 0.48
- L10 weight 0.5: Brier 0.2642, dirAcc 0.482
- L10 weight 0.6: Brier 0.266, dirAcc 0.477

## batter_hits_runs_rbis (n=1497)
- L10 weight 0.3: Brier 0.2654, dirAcc 0.492
- L10 weight 0.4: Brier 0.2663, dirAcc 0.493
- L10 weight 0.5: Brier 0.2675, dirAcc 0.495
- L10 weight 0.6: Brier 0.2688, dirAcc 0.496

## pitcher_strikeouts (n=168)
- L10 weight 0.3: Brier 0.2693, dirAcc 0.512
- L10 weight 0.4: Brier 0.2696, dirAcc 0.518
- L10 weight 0.5: Brier 0.27, dirAcc 0.512
- L10 weight 0.6: Brier 0.2705, dirAcc 0.518
