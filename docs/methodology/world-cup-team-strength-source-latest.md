# World Cup Team-Strength Source (latest)

## Source
- **Name:** FIFA/Coca-Cola Men's World Ranking (official points).
- **Reference/mirror fetched:** https://football-ranking.com/fifa-world-rankings (a daily mirror
  of the official FIFA ranking) — full top-110 with exact points.
- **Cross-check:** top-20 verified against https://en.wikipedia.org/wiki/FIFA_Men's_World_Ranking
  (dated 2026-06-11); consistent within normal daily variation.
- **Date fetched/curated:** 2026-06-10 / 2026-06-11.
- **File:** `app/public/data/world-cup/team-strength/team-strength-latest.json` (110 teams).

## Fields
`team`, `fifaRank`, `fifaPoints`, `hostOrNearHost` (USA/Canada/Mexico). `eloRating`,
`talentTier`, `squadValueProxy` are part of the interface but **null** (no real source wired —
never faked).

## How it's used (pipeline/world_cup/team_strength.py)
- `points_for(team)` — alias-aware lookup (handles Czechia↔Czech Republic, South Korea↔Korea
  Republic, Türkiye↔Turkey, etc.). Unknown team → `None` → gated/capped downstream.
- `strength_expected_goals(home, away)` — converts the points difference into an independent
  expected-goal supremacy (Elo-style, GOAL_SCALE=300 pts ≈ 1 goal), neutral venue by default.
- `opponent_adjust(gf90, ga90, opponents)` — re-weights raw recent goals by the strength of the
  opponents actually faced (scoring vs strong opponents counts more; conceding vs strong
  opponents is forgiven), and reports opponent-strength **coverage**.

## Limitations
- Top 110 only; a team outside the list has **null** strength → its match is gated for missing
  opponent strength (we do not guess).
- FIFA **points** (not Elo / squad value / xG) — a stabilizing prior, not a full talent model.
- Static snapshot; FIFA updates next on 2026-07-20.

## Update process
Re-fetch the ranking from the source above, regenerate the JSON (same builder), update
`sourceDate`, and re-run the projection build. Never hand-edit individual point values.
