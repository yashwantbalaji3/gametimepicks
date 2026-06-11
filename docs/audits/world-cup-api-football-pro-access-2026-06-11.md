# World Cup — API-Football Pro Access CONFIRMED (2026-06-11)

## Pro access works ✅
Discovery run `27349201533`: **`providerPlanBlock` is gone** (was the Free-tier 2026 block).
- League id 1 = World Cup; `season=2026` now returns data on the Pro plan (7,500 req/day).
- **Fixtures returned:** Mexico vs South Africa (id-mapped, team ids 16 & 1531, status NS).
  (The Korea–Czechia game kicks off 02:00 UTC = the next UTC date, fetched separately.)
- Calls this run: 4 (bounded). Quota ample (7,500/day).

## Key reality on opening day
`/teams/statistics?league=1&season=2026` returns **0 played** for every team — the tournament
starts today, so there is no WC-2026 sample yet. **Team strength must come from each nation's
RECENT fixtures** (qualifiers/friendlies/Nations League) via `/fixtures?team=<id>&last=N`, not
the empty WC season. This is real recent international form — not fabricated.

## Plan (bounded)
- Fixtures for the target ET date + next UTC date (≤2 calls) → today's games + team ids/logos.
- Recent form per team (≤4 calls, `last=8`) → goals for/against per match.
- Team-level Poisson model anchored to the de-vigged market prior (capped, Low confidence,
  sample-warned). No xG (API-Football has none). Player props gated (no soccer player-prop
  odds from The Odds API).
