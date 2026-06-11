# World Cup Overnight Build — Morning Status & Blocker (run 2026-06-12 ~04:00 ET)

## One-line status
Market Outlook is **live and expanded** (today + next 8 upcoming matches, real Odds API
3-way H/D/A + totals). **Model projections + player props + suggested parlays + any World Cup
Bank Builder card remain fail-closed** — blocked by the API-Football plan, not by our code.

## The exact remaining blocker (verified this run)
Re-ran `world-cup-stats-discovery.yml -f provider=api_football -f dry_run=false`. API-Football
confirmed **league id 1 = World Cup** (seasons include 2026) and our query is correct, but the
account is on the **Free plan**, which returns verbatim:
> "Free plans do not have access to this season, try from 2022 to 2024."

So fixtures + team/player stats for season 2026 are **plan-gated** → `projectionsAllowed=false`,
`parlayAllowed=false`, `providerPlanBlock` recorded. **No fabricated data was produced.**

### Single action to unlock
Upgrade the **API-Football** account to a paid tier that includes the **2026** season
(Pro/Mega). No code change needed — adapter, evidence-driven gates, workflow, and UI are ready;
re-running the discovery workflow after the upgrade flips the gates as real data arrives.

## What shipped overnight (real data, honest)
- `/world-cup`: new **"Upcoming · Market Outlook"** section — next 8 matches with real de-vigged
  H/D/A + totals, team flags, kickoff/group/venue, "market-implied, not a model pick" +
  regulation-time labels.
- Data-status panel is truthful: Odds **Live**; Team stats/lineups "API-Football connected ·
  2026 needs a paid plan"; xG "API-Football has no xG"; projections/parlays **Gated**.
- Bank Builder unchanged ($728.76, Step 3). NBA/MLB/UFC untouched.

## When the plan is upgraded (ready-to-run path)
1. Re-run `world-cup-stats-discovery.yml -f provider=api_football`.
2. Team-level projections turn on once a usable team-stat sample exists (ramps over the first
   matchdays as matches finish) — `build_team_projections` (next PR).
3. Player props turn on once lineups post near kickoff + player stats exist.
4. Suggested parlays + a Bank Builder Step-3 candidate only after projections pass the gates.
