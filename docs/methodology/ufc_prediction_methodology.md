# UFC Prediction Methodology (canonical)

_Registry: `app/src/lib/methodology/ufc.ts`. Existing notes: `ufc-prediction-methodology-latest.md`._

## Targets
- **Fight:** moneyline, method of victory, goes/doesn't-go distance, over/under rounds, round
  betting, wins inside distance / by decision / KO-TKO / submission.
- **Fighter props:** sig strikes landed/attempted, takedowns landed/attempted, submission attempts,
  knockdowns, control time, round-of-finish.

## Feature priority (opportunity-first, path-dependent)
```
1 availability + weigh-in → 2 short-notice/cancellation context → 3 style_matchup
→ 4 phase_specific_skill_edge → 5 fight_duration_projection → 6 durability/finish_risk
→ 7 cardio/pace → 8 wrestling/grappling_control → 9 striking_volume/defense
→ 10 camp/age/layoff/injury → 11 referee/judging → 12 market
```
UFC is **path-dependent**: project *how the fight is likely to occur* (where the time is spent —
distance, clinch, mat), not just who is "better" overall.

## Feature groups (see registry for status)
Event/fight context (rounds, main-event, title, short-notice, debut); fighter physical/career
profile (reach/age/stance/finish-rate splits); availability/prep (weigh-in, missed weight, layoff,
camp change); striking offense/defense; wrestling offense/defense; submission grappling; cardio by
round; durability/finishing; style-matchup interactions; referee/judging.

## Prop-priority logic (highlights)
- **Goes distance:** combined finish rates → finished-loss rates → durability → submission/knockdown
  risk → pace → wrestling control likelihood → cardio collapse → weight-cut chin concerns → market.
- **Sig strikes:** fight_duration_projection → strikes/min → opponent striking defense → opponent
  takedown threat (time at distance) → pace → cardio → opponent durability → KO risk → market.
- **Takedowns:** TD attempts → opponent TD defense → style matchup → clinch time → chain wrestling →
  opponent get-up → cardio → duration → scorecard incentives → market.

## Coverage (honest, v1)
`implemented`: five-round flag, market implied prob, leakage validation. `partial`: short-notice,
career striking/TD accuracy (excl. target), layoff. `planned`: fight-duration/expected-minutes,
style-matchup score, durability/finish risk, cardio red-flag. `not_available`: official weigh-in
feed, referee-tendency data. UFC 250 history (moneyline 6–1, cards 0–4) is preserved as settled.
