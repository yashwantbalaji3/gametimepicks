# MLB Prediction Methodology (canonical)

_Registry: `app/src/lib/methodology/mlb.ts`. Existing model notes: `mlb-methodology-current.md`._

## Targets
- **Game:** moneyline, run line, full-game total, team total, F5 moneyline/total, first-inning run.
- **Pitcher props:** strikeouts, outs recorded, earned runs, hits/walks/HR allowed.
- **Batter props:** hits, total bases, home runs, RBIs, runs, walks, strikeouts, steals.

## Feature priority (opportunity-first)
```
1 confirmed_lineup → 2 expected_PAs → 3 lineup_spot → 4 starting_pitcher_confirmation
→ 5 pitch_count_projection → 6 expected_innings → 7/8 handedness → 9 platoon_advantage
→ 10 pitch_mix → 11 park_factors → 12 weather → 13 bullpen_fatigue → 14 umpire
→ 15 market → 16 batter-vs-pitcher (HEAVILY downweighted by sample size)
```
A hitter prop is only used if the hitter is **confirmed or projected** in the lineup. BvP history
always carries a sample-size flag and is downweighted.

## Feature groups (see registry for status)
Game/park/weather/umpire/schedule context; team offense (overall + vs-LHP/RHP splits, recent
opportunity vs efficiency vs result separated); starting pitcher run-prevention + K/BB + batted-ball
+ workload/leash + recent-start trends; pitch-mix per pitch type; hitter availability/opportunity +
skill + splits + recent trends; bullpen fatigue.

## Prop-priority logic (highlights)
- **Pitcher Ks:** pitch_count_projection → expected_innings → K%/SwStr/CSW → opponent lineup K-rate
  vs handedness → pitch-mix → umpire K boost → park/weather → market.
- **Batter hits:** confirmed lineup → lineup_spot → expected_PAs → platoon → contact/K rate →
  opposing starter contact-allowed → bullpen → park/weather → recent xwOBA → market.
- **Home runs:** barrel/hard-hit/FB/pull/ISO → opposing HR-allowed/barrel-allowed → pitch-mix →
  park HR factor → temp/wind → bullpen HR weakness → market.

## Settlement integration
0-AB / no-PA hitter props **void** (DNP); suspended/rescheduled games are **no-action (void)** for
the original slate (see `bank_builder_v2_methodology.md` + the settlement runbook).

## Coverage (honest, v1)
`implemented`: starter confirmation, season K/efficiency rolling (excl. target), market implied prob,
DNP/sample flags. `partial`: lineup/PA/spot, platoon, batter xwOBA. `planned`: pitch-count/innings
projection, pitch-mix, park, bullpen fatigue, BvP. `not_available`: umpire feeds.
