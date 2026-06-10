# NBA Game 4 (June 10) — Methodology Audit

_2026-06-10. Audits whether the live board uses the full NBA methodology or a narrow
ESPN recent-log fallback. **Verdict: full methodology, 10 games per player. No
regeneration needed.**_

## Headline
Every one of the **96/96** projections is built from **10 recent games**, not Game 3
alone. Game 3 (2026-06-09) is the **latest, most-heavily-weighted datapoint** — never
the only one. The ESPN provider feeds the same `GameLog` schema the pre-existing model
already consumed, so the full weighting + gates run unchanged.

## Phase-1 answers
1. **Factors the methodology requires:** recent-5 avg, recent-10 avg, season/window
   baseline, home/away split, minutes/role, volatility (σ), odds/line context, edge,
   confidence + min-games gates, parlay safety.
2. **Factors present on the June 10 board:** all of the above (see below).
3. **Fields ESPN populates:** per-game `pts, reb, ast, minutes, opponent, home/away,
   date` (newest-first), for both PTS/REB/AST markets — exactly what the model reads.
4. **Fields missing:** none for the published markets. The model does **not** use an
   opponent-specific defensive rating or a full-season average (it uses a ≤12-game
   window mean as the baseline + home/away as the matchup proxy) — that is the
   pre-existing model scope, identical to before ESPN, **not** an ESPN gap. No factor is
   faked; absent inputs degrade honestly.
5. **Only Game 3, or multiple games?** **Multiple** — distribution of recentGames count
   across all 96 leans is `{10: 96}` (every lean uses 10 games).
6. **Recent games per player:** **10** (mean 10, min 10, max 10). `GAME_LOG_WINDOW=12`.
7. **recent5/recent10 computed?** Yes — `build_features.py` emits `last5_*`, `last10_*`,
   `season_*`, home/away splits, `minutes_trend`.
8. **Odds/lines used?** Yes — edge = (model P(over) − de-vigged implied) × 100.
9. **Minutes/role used?** Yes — `last5_min/last10_min/season_min` + `minutes_trend`
   computed; minutes inform the feature set and volatility.
10. **Season/playoff baseline?** Yes — `season_*` = mean over the full fetched window
    (regular season + CLE series + Finals G1–G3); playoff games included as latest.
11. **Confidence/volatility gates ran?** Yes — confidence breakdown High 58 / Medium 14
    / Low 24; High requires edge ≥ 5.0 **and** ≥ 8 games; σ from recent dispersion drives
    P(over).
12. **Parlay gates unchanged?** Yes — same-game cap = 1 (PR #110) intact; this audit
    changed **no** optimizer code.
13. **Stale May 23 artifact used?** No — logs span 2026-05-06 → 2026-06-09; board
    `generatedAt 2026-06-10T04:57`. No May-23 NBA artifact reused.
14. **Post-Game-4 leakage?** No — latest recentGames date = **2026-06-09**; zero
    post-game outcome fields. Leakage audit PASS.

## Projection formula (pipeline/score_model.py — unchanged, pre-existing)
```
projection = 0.45·last5 + 0.35·last10 + 0.20·season   (+ 0.30 home/away blend)
P(over)    = 1 − Φ((line − projection) / σ)            (σ = recent dispersion)
edge       = (P(over)_model − P(over)_implied_devig) × 100
confidence = High (edge≥5.0 & games≥8) / Medium (edge≥2.5 & games≥5) / Low
```

## Phase-2 per-player evidence (samples; dates oldest→newest, Game 3 = last)
| Player | Mkt | n | proj | dates (first … last) |
|---|---|---|---|---|
| Dylan Harper | AST | 10 | 3.16 | 2026-05-19 … 2026-06-09 |
| K. Towns | AST | 10 | 4.36 | 2026-05-06 … 2026-06-09 |
| Josh Hart | AST | 10 | 5.11 | 2026-05-06 … 2026-06-09 |
| Julian Champagnie | PTS | 10 | 13.32 | 2026-05-19 … 2026-06-09 |

Projections differ from any single game and from the raw 10-game mean (the 0.45/0.35/0.20
weighting + home/away blend), confirming a multi-game weighted model — not a Game-3 echo.

## Conclusion
The board is **methodology-complete**. Per the controlling rule ("regenerate only if the
audit finds the board incomplete"), **no regeneration, no model/provider patch, and no
copy change** are required. The public `/nba` framing already reads *"projected from each
player's last 10 games"* — accurate and not Game-3-only.
