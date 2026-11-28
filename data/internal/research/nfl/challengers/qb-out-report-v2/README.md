# qb-out-report-v2 — QB-aware winner challenger (PRIVATE_RESEARCH, not promoted)

The official NFL winner model (`nfl-regular-season-public-v1`) consumes no QB identity. This challenger shifts the
incumbent's Elo difference when a team's **primary QB** (most pass attempts over its previous 4 games) is listed **Out or
Doubtful on a pregame-stamped injury-report row** (nflverse `date_modified` < kickoff). No depth chart is read, which is
what made the 2026-09-25 implementable study (`reports/pregame-availability-margin-refusal.json`) refuse.

- `PREREGISTRATION.md` (sha256 in `.sha256`, registered 2026-11-15 05:27Z before any outcome was computed).
- `scripts/` as run on 2026-11-15 (absolute paths point at the local git-ignored nflverse raw directory).
- `results/evaluation.json` — scored 2023 (fit 2022) and 2024 (fit 2022–23), incumbent through the production
  `replayWinMarginHeads`. 2025 has no `date_modified` column: descriptive only.
- `results/slate-2026-11-15.json` — research-only application to Week 10.

| set (2023–24) | n | incumbent LL | arm A LL | Δ arm A [95% CI] | Δ arm B [95% CI] |
|---|---|---|---|---|---|
| overall | 570 | 0.6338 | 0.6278 | −0.0060 [−0.0109, −0.0015] | −0.0071 [−0.0135, −0.0011] |
| primary QB Out/Doubtful | 36 | 0.6896 | 0.5939 | −0.0957 [−0.159, −0.026] | −0.1128 [−0.202, −0.020] |
| 2025 subgroup (unstamped) | 23 | | | +0.011 [−0.135, +0.170] | −0.038 [−0.216, +0.143] |

Both arms pass their preregistered bars on 2023–24. **Limits:** 36 subgroup games across 2 season clusters; most of the
gain is 2024; the unstamped 2025 check is inconclusive; fitted shifts move (80, 90, then 145 when fit on 2022–24);
overall ECE worsens slightly (0.0349 → 0.0392); IR/traded QBs are invisible to the feature. Status: eligible for founder
review and a forward test, **not** for promotion.
