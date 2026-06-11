# World Cup — June 11 Morning Status (08:45 ET re-check)

## API-Football plan: STILL BLOCKED (re-verified this morning)
Re-ran `world-cup-stats-discovery.yml -f provider=api_football`. API-Football still returns
verbatim: **"Free plans do not have access to this season, try from 2022 to 2024."**
(`providerPlanBlock` set, fixtures = 0, `projectionsAllowed=false`, `parlayAllowed=false`.)
League id 1 = World Cup and our query is correct — the only gate is the account plan.

→ **No model projections, player projections, suggested parlays, or World Cup Bank Builder
card are produced.** No data was fabricated.

## What IS live this morning (real data)
- **Market Outlook refreshed** for today + upcoming (The Odds API, `soccer_fifa_world_cup`,
  72 matches, de-vigged Home/Draw/Away + totals) — generated 2026-06-11 12:52 UTC.
- `/world-cup`: today's fixtures + "Upcoming · Market Outlook" (next 8), team flags,
  kickoff/group/venue, "market-implied, not a model pick" + 90-minute-regulation labels.
- Data-status panel truthful: Odds **Live**; team stats/lineups "API-Football connected ·
  2026 needs a paid plan"; xG "API-Football has no xG"; projections/parlays **Gated**.
- Bank Builder unchanged ($728.76, Step 3, target $2,000). NBA/MLB/UFC/Results intact.

## Today's market outlook (June 11)
- **Mexico vs South Africa** — H 67% / Draw 21% / South Africa 11%.
- **South Korea vs Czechia** — H 34% / Draw 30% / Away 34% (a near pick'em).

## The one action to unlock projections + parlays
Upgrade the **API-Football** account to a paid tier that includes the **2026** season
(Pro/Mega). No code change needed — adapter, evidence-driven gates, discovery workflow, and UI
are built and waiting. After upgrading, re-run the discovery workflow and the gates flip as
real team-stat samples + lineups arrive (team-level projections first, then player props, then
suggested parlays, then a possible Bank Builder Step-3 card — each behind its real-data gate).
