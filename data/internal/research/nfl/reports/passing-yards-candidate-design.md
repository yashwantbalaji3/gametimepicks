# NFL passing yards — a genuinely different candidate (design note, 2026-09-15)

**Status:** DESIGN ONLY. Nothing registered, nothing scored. P300's passing-yards candidate (`teamFormVolume`, shrinkK 0)
is `SECOND_LOOK_REJECTED` on ECE 0.055 and stays rejected; the live family publishes as a founder-approved ESTIMATE.

## Why P300 failed, as far as the receipts say
- The share rule fixed the LEVEL (P299's forecasts were low), but passing-yards calibration at the rolling-4 line stayed
  poor (ECE 0.055 second look; 0.16–0.18 in P299). Receiving yards and rushing yards cleared 0.05 on the same rule, so the
  defect is specific to passing: one player carries almost the whole team volume, so the family's dispersion is a team
  quantity (attempts × yards per attempt), not a share-of-volume quantity.
- P302 Week 1: typical passing miss 91 yards, ranges ran 74 low. The ESTIMATE middle 152 → 198 (actual 221).

## Candidate direction (not a knob on P300)
`passYds = attempts × yardsPerAttempt`, decomposed and forecast separately, then combined by simulation:
1. **Team attempts** — team-form volume (decayed team pass attempts, no game-script term, no post-game information),
   with a neutral-context adjustment only from pre-game-known inputs (home/away, rest days if already in the corpus).
2. **QB participation share** — attempts share of the named starter from participation truth (PLAYED / PLAYED_NO_ROW /
   UNKNOWN), gated on the CURRENT roster and the pregame starting state; a departed player never stays a candidate.
3. **Yards per attempt** — per-QB efficiency shrunk toward the league rate (prior weight in attempts, dev-fit), with
   dispersion from a heavy-tailed family fit on dev (attempts × Y/A residuals are right-skewed; test Gamma vs log-normal).
4. **Combine** — sample attempts (NB) × Y/A (chosen family) → p10/p50/p90; score MAE on p50, level on the mean,
   coverage of the 80% range, ECE at the rolling-4 line (the same bars every family uses).

## Data
- nflverse `stats_player_week` 2013–2025 (attempts, passing yards), `snap_counts` 2013–2025, rosters — the same tables
  `player-games-v2.json.gz` was built from (sha a93c56c4…). Team attempts are a sum over the team's rows.
- Held-out: 2014–2021 is SEEN for passing yards (P299 and P300 both scored it) — any look there is a SECOND LOOK and must
  say so; the blind population is the 2026 forward test (weeks 2+), which the share-level forward protocol already grades.

## Registration checklist (before any --score)
- `--validate` dev-only (2022–2025) with every candidate constant printed; disclose P299/P300 figures verbatim.
- Frozen: attempt volume half-life, share rule (no pull toward zero), Y/A prior weight, dispersion family, NB size,
  bars (MAE < rolling-4 and share×volume; cov80 in [0.72, 0.88]; ECE ≤ 0.05; level [0.92, 1.08]; n ≥ 300), seed.
- Verdict labels: `SECOND_LOOK_*` on 2014–2021; the forward receipt decides publication; no adoption without the
  founder's step — the ESTIMATE label stays until a family is eligible.

## What would make this worth registering
A dev run where the decomposed candidate beats the ESTIMATE's dev MAE (65.3) AND clears ECE ≤ 0.05 on dev with level in
band. If it does not, the ESTIMATE stays and the failure is reported as such.
