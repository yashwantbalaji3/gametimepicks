# Soccer Engine Tuning — Reproduction (2026-07-14)

Before tuning, the existing 2022 WC backtest was reproduced exactly. Money untouched (md5 `affe6b21`).

## Command
```
npx tsx app/scripts/backtest-soccer-2022-wc.mjs
```

## Reproduced values (match the prior mission to the decimal)
| Metric | Expected | Reproduced |
|---|---|---|
| N | 64 | 64 |
| Brier | ≈0.593 | **0.5925** |
| RPS | ≈0.208 | **0.2079** |
| Log loss | ≈1.002 | **1.0024** |
| Top-pick | ≈56.3% | **56.3%** |
| FIFA-favorite top-pick | ≈56.3% | **56.3%** |
| Draw calibration | 25.0% pred vs 23.4% actual | **0.250 / 0.234** |
| Total goals | model 2.60 vs actual 2.63 | **2.60 / 2.625** |

Exact reproduction ✓. Determinism holds because the engine is pure and the inputs (Oct-2022 FIFA points +
90-min scores) are fixed.

## Tunable parameters added (defaults preserve exact reproduction)
`internal-soccer-projection-engine.ts` `ProjectMatchInput` gained two knobs, both defaulting to current behavior
so the untuned numbers above are byte-identical:
- `supremacyCap` (default 2.6) — exposed the previously-hardcoded cap.
- `drawInflation` (default 1.0) — multiplicative boost on the scoreline draw diagonal (crude Dixon-Coles),
  renormalized so the matrix still sums to 1. `1.0` = no change.

Verified after adding: `backtest-soccer-2022-wc.mjs` still prints Brier 0.5925 / logLoss 1.0024 (defaults
unchanged), and `drawInflation:1.25` raises the draw probability while keeping 1X2 summing to 1.
