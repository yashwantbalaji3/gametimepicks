# Joint v3: TD mean-preservation development test

Declared 2026-09-09 before candidate implementation or evaluation. Preserve v2's frozen Week 1 cohort and all public forecasts. This is a private development experiment, not a new holdout or a promotion receipt.

Hypothesis: the bridge fitted to observed offensive TD counts estimates a conditional mean given team points. Using that value as a Poisson rate and then conditioning on the score ceiling lowers the mean again. Invert the finite Poisson family's rate to preserve the fitted mean, clipped only to its feasible interval [0, floor(points/6)]. Keep touch eligibility and all accounting identities unchanged. Endpoint means produce endpoint counts. Use stable log weights, a bounded numerical solve and a tested tolerance. Preserve the v2 seed namespace to avoid attributing arbitrary seed variation to a new model identity.

One candidate only, no fitted coefficients or 2025 tuning: nfl-joint-sim-v3 with the existing depth-v1 conditioner and accepted target deflation. Evaluate the same 9,583 marginal points and passing-TD population at 1,000 draws. Report all family errors, coverage, calibration, missing counts and simple baselines. Reused 2025 results are development evidence; unchanged public bars and forward requirements still apply. A failed result remains recorded. Do not replace the registered v2 forward population with v3.

Correctness gates: exact finite support, mean within 1e-9 of feasible target, endpoint handling, no overflow at high targets, deterministic draw, all v2 count and mass identities on v3. V2 source bytes must remain unchanged.

## Founder product policy confirmed this session

The user explicitly approved independent lane accounting: each Bank Builder and Moonshot lane rolls its own proceeds after a win and resets to its existing seed after a loss. This authorizes prospective implementation, not alteration of historical stakes, balances, settlement records or an invented common seed. Push/void treatment and migration of conflicting current counters must preserve existing documented policy or be surfaced explicitly; do not silently choose or aggregate lanes.
