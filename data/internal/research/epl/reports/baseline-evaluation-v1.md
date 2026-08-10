# EPL baseline evaluation v1 — PRIVATE RESEARCH (generated 2026-08-09T21:40:00Z)

Corpus: 1520 matches, warm-up 2022-23, evaluated 1140 predictions across 2023-24, 2024-25, 2025-26.
Leakage rule: fit strictly on earlier-dated matches; intra-day slates share one pregame state.

| model | n | log loss | Brier | accuracy |
|---|---|---|---|---|
| empirical | 1140 | 1.075 | 0.6509 | 0.4316 |
| elo | 1140 | 0.9991 | 0.5962 | 0.5254 |
| poisson | 1140 | 1.0017 | 0.5968 | 0.5158 |
| uniform | 1140 | 1.0986 | 0.6667 | 0.4316 |

Per-season log loss:

| model | 2023-24 | 2024-25 | 2025-26 |
|---|---|---|---|
| empirical | 1.0566 | 1.0843 | 1.0839 |
| elo | 0.9744 | 0.9968 | 1.026 |
| poisson | 0.9601 | 0.9999 | 1.045 |
| uniform | 1.0986 | 1.0986 | 1.0986 |

No market/no-vig comparison ships in v1: no authorized EPL odds capture exists for these seasons
(api-football free tier serves 2022-2024 fixtures but its odds endpoints were not exercised, and
the Odds API key is CI-only). The comparison lands when a real odds capture exists — never from
remembered or reconstructed prices.
