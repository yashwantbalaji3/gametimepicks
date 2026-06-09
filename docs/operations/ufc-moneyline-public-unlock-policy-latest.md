# UFC moneyline public-unlock policy

- **Internal only:** < 50 clean graded rows.
- **Review candidate:** 50–149 clean graded rows.
- **Public moneyline eligible:** **≥ 150** clean graded rows AND calibration
  acceptable (market-implied Brier computed; model not worse than market; max model
  adjustment ≤ 4pp; zero leakage failures; launchDecision == pass).
- **Parlay eligible:** a SEPARATE positive parlay simulation (`parlaySimReady`),
  no same-fight contradictory legs, lane caps (Bank/Low/Med 2, High 3).
- **Public copy:** no guarantees/locks; "educational"; clear last-updated.
- **Rollback:** if post-launch calibration degrades (Brier worse than market over a
  rolling window), flip the gate false → picks re-lock automatically.
- **Monitoring:** ops-status tracks cleanGradedRows vs 150 + latest grading run.
Gates are enforced in `build_readiness.py`; nothing publishes when a gate is false.
