# Sport-Specific Factor Upgrade Plan

_2026-06-10. Converts the user's full factor list into a practical, leakage-safe,
honest implementation plan. Does NOT rebuild the model — feature additions + quality
flags + weighting only. A feature is "active" ONLY if code computes it AND the model
consumes it (see `app/public/data/model/features/*-feature-manifest-latest.json`)._

## 1. Core leakage rules (enforced)
- Only pre-game/pre-match information. No final outcomes, post-game stats, target-game
  box score/minutes/lineup (unless lineup confirmed before prediction time).
- No rolling average that includes the target game — every window EXCLUDES the current
  game (`feature_quality.rolling_excludes_current` / `filter_pregame_rows`).
- Every time-sensitive input carries a source timestamp + freshness status.
- Important missing data → explicit unknown/missing/stale flag, never silent neutral fill.

## 2. General modeling principles
Opportunity before performance · volume vs efficiency separated · recent form vs role
separated · sample-size flags + downweighting for all history/H2H/matchup features
(`sample_size_bucket`, `small_sample_weight`) · market features optional-but-powerful ·
freshness checks for injuries/lineups/weather/odds/minutes · rolling windows
(STD, 30d, 15g, 10g, 5g, 3g) all excluding the current game.

## 3. MLB feature groups
opportunity (lineup spot, expected PA, expected innings, pitch-count proj) · role
(handedness, platoon, bullpen availability) · matchup (BvP, pitch-mix, splits) ·
efficiency (Statcast: xwOBA/barrel/hard-hit/EV/LA/ISO) · environment (park, weather,
wind, umpire) · market (line/implied/de-vig/movement) · risk (variance, sample, bullpen
fatigue). **Active today:** recent form (last3 K / last10 batter), season baseline,
variance σ, market edge, confidence + small-sample gate. **Everything else is
provider-needed.**

## 4. NBA feature groups
opportunity (projected minutes, usage, pace, FGA/3PA/FTA per-min) · role (minutes
history, starter, rotation stability) · recent form (last5/last10) · matchup (def
rating, position allowance, primary defender) · market (spread/total/implied/edge) ·
risk (rest, B2B, blowout, variance) · freshness (injury/lineup/odds). **Active today:**
last5/last10/window baseline, home/away split, variance σ, market edge, confidence +
min-games gate; minutes history is *partial*. **Projected minutes / usage / pace /
injuries / defensive matchup are provider-needed** — the single most important NBA
inputs are not yet sourced.

## 5. World Cup feature groups
match context (stage, must-win, draw-enough, ET/penalty possibility) · team strength
(FIFA/Elo/xG) · attacking/defensive per-90 · tactical · player role (starting XI,
minutes, set-piece/penalty taker) · player/keeper stats · referee · matchup
(player-vs-player). **Active today:** schedule + teams (structural display only). **All
model factors are provider-needed; World Cup stays fail-closed.** Separate
regulation-time markets from advancement markets when built.

## 6. Prop priority ordering (target weighting once inputs exist)
- **MLB** — batter hits: lineup spot → exp PA → platoon → contact/K → opp starter contact → park/weather → recent xwOBA. Total bases/HR: PA → platoon → ISO/barrel/hard-hit/FB/pull → pitcher HR risk → park/wind/temp. Pitcher K: K% → SwStr/CSW → opp K vs hand → chase → pitch-count/exp-innings → umpire. Pitcher outs: exp innings → pitch count → leash → rest → bullpen fatigue → opp patience.
- **NBA** — points: minutes → usage → FGA/FTA/3PA per-min → team implied → pace → vacated usage → matchup → blowout. Rebounds: minutes → reb chances → reb% → opp misses → bigs-out → pace. Assists: minutes → TOP → potential assists → ast% → teammate efficiency → pace. 3PM: 3PA → C&S/pull-up → opp 3PA-allowed → pace. PRA: minutes → usage → FGA → reb chances → potential assists → pace → blowout.
- **World Cup** — goals: minutes → starter → penalty taker → team implied goals → xG/90 → shots/90 → opp xGA/GK. Shots/SOT/assists/cards/corners/saves: per the user's ordered lists, all gated on minutes + starting status + role + market.

## 7–10. Status snapshot (see manifests for the full table)
- **Active (computed + consumed):** MLB recent form + season + σ + market edge + gates;
  NBA last5/last10 + window + home/away + σ + market edge + gates.
- **Partial:** NBA minutes history (context, not a direct multiplier).
- **Pending (data in repo, not wired):** NBA game-markets (spread/total/implied),
  NBA rest/B2B (derivable from schedule).
- **Provider-needed:** MLB Statcast/park/weather/umpire/lineup/pitch-mix/BvP/bullpen;
  NBA projected minutes/usage/pace/injuries/defensive matchup/3PM; all World Cup model
  factors.
- **Intentionally deferred:** World Cup advancement-vs-90-min logic (until match markets exist).

## 11. Small-sample features to downweight
batter-vs-pitcher PA, batter split PA, venue/park history, NBA matchup-by-position,
World Cup country H2H + national-team samples (blend club form). Use
`small_sample_weight(n, full_weight_at=30)`; surface `sample_size_bucket`.

## 12. Flags to add
confirmed-lineup flag + timestamp (MLB); odds freshness (all); weather/injury freshness
(time-sensitive); BvP/H2H/venue sample-size flags; missing/unknown flags instead of
neutral fill (`missing_flag`, `required_source_status`, `unknown_reason`).

## 13. Pre-game availability validation
Each time-sensitive feature must assert its source timestamp predates prediction time;
lineup-derived features only when `lineupConfirmed && lineupTimestamp < predictionTime`.

## 14. Rolling-window excludes-current validation
All windows built via `filter_pregame_rows(rows, target_date)`; CI leakage audit
(`audit-feature-leakage-safety`) already asserts no recentGames dated on/after slate.

## 15. Suggested PR sequencing
1. Hard settle MLB June 9 ✅ (done). 2. Factor upgrade plan + manifests + feature-quality
utility (this PR). 3. MLB factor audit + safe quality flags. 4. NBA opportunity metadata
(wire game-markets/rest from existing data). 5. World Cup methodology + readiness gates.
6. Provider-gated additions (lineup/Statcast/injury/minutes/soccer) once approved.
