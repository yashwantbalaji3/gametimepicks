# PREREGISTRATION — qb-out-report-elo-shift-v2 (arm A) and qb-out-report-quality-shift-v2 (arm B)

- Registered at: 2026-11-15T05:27:30Z (UTC), before any outcome of this candidate was computed.
- Data class: PRIVATE_RESEARCH. Research only; nothing here changes a published forecast. Not for promotion tonight.
- Integrity: the sha256 of this file is recorded in `PREREGISTRATION.md.sha256`. The scorer refuses if the hash differs.

## Disclosure of what the registrant has already seen
- The ceiling study `team-availability-ceiling-evaluation.json` (observed-snaps oracle, NOT implementable):
  per-season fitted shifts 95/135/125 Elo, overall Δlog loss −0.0102 over 2023–2025, 2023 slightly worse.
- The refusal of `pregame-availability-margin` (depth charts 2022–2024 carry no capture instant) and the source search.
- A data-integrity probe of injury-report timestamps (`results/injury-timing-probe.json`), which reads no outcomes:
  2022, 2023, 2024 rows carry `date_modified`; every QB row (609) and every QB Out/Doubtful row (120) has
  `date_modified` strictly before that team's kickoff (median ~47 h before). **2025 has no `date_modified` column**.
  No `injuries_2026.csv` exists in the raw directory.
- No outcome of this candidate (any log loss, fit, or flagged-game result) has been computed.

## Why this avoids the refused arm
No depth chart is read. The only availability input is the injury-report row, and a row is admissible only if its
`date_modified` (the row's LAST modification) is strictly before kickoff, so its final content provably existed
pregame. Primary-QB identity comes from box scores of strictly earlier games.

## Inputs (pinned sha256)
- games.csv `cf8632c85fdc82c8915c7866d0bd16465a88946052bccfbf83b44bee87d5d65e` (same pin as the ceiling study)
- injuries_2022.csv `5f0d6032…c9e`, injuries_2023.csv `16b04e21…afe`, injuries_2024.csv `498bce8e…449`, injuries_2025.csv `873ca160…35` (full hashes in the scorer)
- stats_player_week_2021..2025.csv.gz (attempts by player × game), play_by_play_2021..2025.csv.gz (arm B only)
- Incumbent: production replay `replayWinMarginHeads` + `winMarginGate` in `app/src/lib/sports/nfl/win-margin-heads.mjs`
  (sha256 `6baf5966…e256`), receipt `win-margin-historical-replay-evaluation.json` (sha256 `ec17e183…9166`). Heads
  `nfl-win-elo-mov-v1` (win) and `nfl-margin-elo-hfa-v1` (margin). Imported read-only, not reimplemented.

## Feature (both arms)
- **Primary QB** of team T before game G: the player with the most pass attempts (stats_player_week, team = T) summed
  over T's previous 4 games (REG+POST, any season, strictly earlier gameday than G). Ties: more attempts in the most
  recent game, then lexical gsis id. No prior game with stats ⇒ UNKNOWN (game dropped from all sets).
- **flag(T,G)** = 1 if the injury report for (season, game_type, week, T) lists the primary QB (gsis id) with
  `report_status` ∈ {Out, Doubtful} AND `date_modified` < kickoff(G) (gameday + gametime, America/New_York).
  A row whose stamp is missing or ≥ kickoff is inadmissible ⇒ scorer REFUSES the season (no silent drop).
- net = flag(away) − flag(home) (+1 favours home).

## Arm A — qb-out-report-elo-shift-v2
- p_cand = 1/(1+10^(−(d_inc + s·net)/400)), d_inc = Elo difference implied by the incumbent's pHome.
- Margin: mean_cand = slope·(mean_inc/slope + s·net) (same s, margin head's slope); sigma unchanged.
- **Fit rule (walk-forward):** s for scored season S is the grid value in {−200,−195,…,200} minimising mean log loss
  over decisive games with net ≠ 0 in seasons 2022..S−1 (strictly before S). Games of S never enter the fit.

## Arm B — qb-out-report-quality-shift-v2
- gap(T,G) = max(0, q_primary − μ_rep). q_primary = primary QB's EPA per dropback (pbp `qb_dropback`=1, player `id`,
  `qb_epa`) over his dropbacks in seasons S−1 and S strictly before gameday(G), shrunk: (ΣEPA + 150·μ_all)/(n + 150),
  μ_all = league EPA/dropback of season S−1. μ_rep = EPA/dropback of all season S−1 dropbacks by players who were not
  their team's primary QB (by the definition above) in that game.
- shift = k·(flag(away)·gap(away) − flag(home)·gap(home)); k ∈ {0,25,…,2000} Elo per EPA/dropback, fit by the same
  walk-forward rule on games with a non-zero shift. Same margin mapping as arm A.

## Scoring
- **Primary scored seasons: 2023 and 2024** (fit 2023 on 2022; 2024 on 2022–2023). These are the only seasons where
  every admissible row can be proven pregame AND a prior stamped season exists to fit on.
- **2025: DESCRIPTIVE ONLY, NOT LEAKAGE-PROVEN** (no stamp column; fit on 2022–2024). Never counts toward a bar.
- **2026 weeks 1–10: NOT EXECUTABLE** — no 2026 injury-report history file with stamps exists.
- Population: all REG+POST games with a finished score where the incumbent replay gives pHome and marginMean and both
  primary QBs are known. Primary score: mean log loss on decisive (non-tie) games. Lower is better.
- **Subgroup:** games with flag(home)=1 or flag(away)=1 (reported also: one-sided net ≠ 0).
- Paired Δ = candidate − incumbent per game; **game-level bootstrap** (resample games with replacement, 10,000 reps,
  mulberry32 seed 20261115), percentile 95% CI. Season clusters (2) reported; no season-block claim at n=2 clusters.

## Bar (per arm, primary seasons 2023–2024 pooled)
1. Subgroup paired Δlog loss 95% CI upper bound < 0.
2. Overall (all scored games) Δlog loss point estimate ≤ 0.
Both must hold ⇒ "passes its preregistered bars (eligible for founder review / forward test)". Otherwise "fails".
No bar is relaxed after the look. One look per arm.

## Secondary checks (reported, not gating)
Brier, ECE (10 equal-width bins), margin MAE (overall and subgroup), the same table excluding REG week 18, per-season
rows, and closing no-vig moneyline log loss as a BENCHMARK ONLY (no claim relative to it).

## Application (research number only)
SEA @ LV 2026-11-15: incumbent pHome from `app/public/data/nfl/forecasts/2026-11-15.json`; candidate applies the
shift fitted on 2022–2024 stamped seasons (the latest leakage-proven fit) for arm A, regardless of the verdict, labelled
research-only.
