# v2 Watchlist — INTERNAL ONLY (auto-generated)

> `app/scripts/audit-v2-watchlist.mjs --write-report` · READ-ONLY · deterministic.
> **INTERNAL ONLY — no public effect.** Does NOT change projections, optimizer,
> Suggested Parlays, public data, or UI. The Low gate is `shadow_watchlist`
> (fails the hardened launch gates), so nothing here is applied live.

## Active slate: 2026-06-06 (settled? no — pregame)

### Watchlist condition
- **Segment:** `mlb_low_gate_5of5_and_-150` — MLB legs whose chosen side went
  **5/5 over the last 5 games (true L5 from the board series)** AND whose
  chosen-side odds are **≤ −150** (heavy favorite).
- **Why watchlist (not launch):** beats the naive 95% CI but fails the
  Bonferroni-corrected CI, the adjusted p-value, and single-date overdependence.
  Required next evidence: more settled slates until the corrected CI lower bound
  clears de-vig without single-date reliance.

### June-4 watchlist legs: **20** (already in published Suggested Parlays: **2**)

| player | team | opp | market | line | side | odds | de-vig | L5 | in published? |
|--------|------|-----|--------|-----:|------|-----:|------:|---:|:-------------:|
| Gabriel Moreno | AZ | WSH | batter_hits | 1.5 | Under | -277 | 69% | 5/5 | no |
| Cole Young | SEA | DET | batter_hits | 0.5 | Over | -263 | 68% | 5/5 | no |
| Pete Crow-Armstrong | CHC | SF | batter_hits | 0.5 | Over | -248 | 67% | 5/5 | no |
| Chase Meidroth | CWS | PHI | batter_hits | 0.5 | Over | -243 | 66% | 5/5 | no |
| Jung Hoo Lee | SF | CHC | batter_hits | 0.5 | Over | -238 | 66% | 5/5 | no |
| Kevin McGonigle | DET | SEA | batter_hits | 0.5 | Over | -222 | 65% | 5/5 | no |
| Nick Gonzales | PIT | ATL | batter_hits | 0.5 | Over | -221 | 65% | 5/5 | no |
| Pete Alonso | BAL | TOR | batter_hits | 0.5 | Over | -212 | 64% | 5/5 | no |
| Andy Pages | LAD | LAA | batter_hits | 1.5 | Under | -211 | 64% | 5/5 | no |
| Ketel Marte | AZ | WSH | batter_hits | 1.5 | Under | -204 | 63% | 5/5 | no |
| Victor Caratini | MIN | KC | batter_hits | 0.5 | Over | -178 | 60% | 5/5 | no |
| Michael Massey | KC | MIN | batter_hits | 0.5 | Over | -174 | 59% | 5/5 | no |
| Sandy León | ATL | PIT | batter_hits | 0.5 | Under | -167 | 58% | 5/5 | no |
| Caleb Durbin | BOS | NYY | batter_hits | 0.5 | Over | -164 | 58% | 5/5 | no |
| Zack Gelof | ATH | HOU | batter_hits | 0.5 | Over | -156 | 57% | 5/5 | yes |
| Bryce Eldridge | SF | CHC | batter_hits_runs_rbis | 0.5 | Over | -182 | 60% | 5/5 | no |
| Coby Mayo | BAL | TOR | batter_hits_runs_rbis | 0.5 | Over | -165 | 58% | 5/5 | yes |
| Michael Conforto | CHC | SF | batter_hits_runs_rbis | 1.5 | Under | -150 | 56% | 5/5 | no |
| Dylan Crews | WSH | AZ | batter_total_bases | 1.5 | Under | -186 | 61% | 5/5 | no |
| Pavin Smith | AZ | WSH | batter_total_bases | 1.5 | Under | -185 | 61% | 5/5 | no |

### Counts
- by market: batter_hits=15, batter_hits_runs_rbis=3, batter_total_bases=2
- distinct games: 10
- published Suggested-Parlay legs total: 20

**Internal only. No public effect. v2 stays not-live.**
