# v2 Watchlist — INTERNAL ONLY (auto-generated)

> `app/scripts/audit-v2-watchlist.mjs --write-report` · READ-ONLY · deterministic.
> **INTERNAL ONLY — no public effect.** Does NOT change projections, optimizer,
> Suggested Parlays, public data, or UI. The Low gate is `shadow_watchlist`
> (fails the hardened launch gates), so nothing here is applied live.

## Active slate: 2026-06-04 (settled? no — pregame)

### Watchlist condition
- **Segment:** `mlb_low_gate_5of5_and_-150` — MLB legs whose chosen side went
  **5/5 over the last 5 games (true L5 from the board series)** AND whose
  chosen-side odds are **≤ −150** (heavy favorite).
- **Why watchlist (not launch):** beats the naive 95% CI but fails the
  Bonferroni-corrected CI, the adjusted p-value, and single-date overdependence.
  Required next evidence: more settled slates until the corrected CI lower bound
  clears de-vig without single-date reliance.

### June-4 watchlist legs: **19** (already in published Suggested Parlays: **1**)

| player | team | opp | market | line | side | odds | de-vig | L5 | in published? |
|--------|------|-----|--------|-----:|------|-----:|------:|---:|:-------------:|
| Will Smith | LAD | AZ | batter_hits | 1.5 | Under | -266 | 68% | 5/5 | no |
| Shea Langeliers | ATH | CHC | batter_hits | 1.5 | Under | -265 | 68% | 5/5 | no |
| Ernie Clement | TOR | ATL | batter_hits | 0.5 | Over | -249 | 67% | 5/5 | no |
| Ozzie Albies | ATL | TOR | batter_hits | 0.5 | Over | -247 | 67% | 5/5 | no |
| Michael Busch | CHC | ATH | batter_hits | 0.5 | Over | -246 | 67% | 5/5 | no |
| Ben Rice | NYY | CLE | batter_hits | 0.5 | Over | -242 | 66% | 5/5 | no |
| Tyler Soderstrom | ATH | CHC | batter_hits | 0.5 | Over | -218 | 64% | 5/5 | no |
| Nick Gonzales | PIT | HOU | batter_hits | 0.5 | Over | -217 | 64% | 5/5 | no |
| Jung Hoo Lee | SF | MIL | batter_hits | 0.5 | Over | -212 | 64% | 5/5 | yes |
| Caleb Durbin | BOS | BAL | batter_hits | 0.5 | Over | -208 | 63% | 5/5 | no |
| Nick Kurtz | ATH | CHC | batter_hits | 0.5 | Over | -206 | 63% | 5/5 | no |
| Josh Bell | MIN | KC | batter_hits | 0.5 | Over | -203 | 63% | 5/5 | no |
| Paul Goldschmidt | NYY | CLE | batter_hits | 0.5 | Over | -202 | 63% | 5/5 | no |
| Sandy León | ATL | TOR | batter_hits | 0.5 | Under | -165 | 58% | 5/5 | no |
| Kyle Isbel | KC | MIN | batter_hits_runs_rbis | 1.5 | Under | -169 | 59% | 5/5 | no |
| Bryce Eldridge | SF | MIL | batter_hits_runs_rbis | 0.5 | Over | -168 | 59% | 5/5 | no |
| Jarren Duran | BOS | BAL | batter_hits_runs_rbis | 1.5 | Over | -160 | 58% | 5/5 | no |
| Jose Fernandez | AZ | LAD | batter_hits_runs_rbis | 1.5 | Under | -151 | 56% | 5/5 | no |
| Jeff McNeil | ATH | CHC | batter_total_bases | 1.5 | Under | -197 | 62% | 5/5 | no |

### Counts
- by market: batter_hits=14, batter_hits_runs_rbis=4, batter_total_bases=1
- distinct games: 8
- published Suggested-Parlay legs total: 16

**Internal only. No public effect. v2 stays not-live.**
