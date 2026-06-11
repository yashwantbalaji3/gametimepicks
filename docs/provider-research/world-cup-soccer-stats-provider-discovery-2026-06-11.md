# World Cup Soccer Stats Provider Discovery — 2026-06-11

## Decision: FAIL CLOSED — no provider key configured
Repo secrets are `ODDS_API_KEY` (The Odds API — already powering the live Market Outlook) and
`BALLDONTLIE_API_KEY` (NBA only). **There is no soccer stats provider key.** Per the mission's
hard rule, World Cup projections + parlays stay **fail-closed**. The provider interface,
readiness gating, discovery workflow, and tests are built and ready to activate the moment a
real key is added — no fabricated xG/lineups/minutes/projections are produced.

Repo soccer data inventory: schedule (104), teams (48 — name/code/group/confederation only,
**no rank/rating/strength**), groups (12), squads (**unpublished**, no players). So there is no
team-strength baseline and no player data locally either — a real provider is required.

## Provider matrix
| Provider | WC fixtures | Lineups | Minutes | xG/xGA | Shots/SOT | Corners | Nat-team | History | Pricing | Auth | ToS risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **API-Football (API-Sports)** | ✅ | ✅ | ✅ | ❌ no xG | ✅ | ✅ | ✅ | ✅ | free 100/day + paid | API key | low | **USE (primary)** |
| **Sportmonks Football** | ✅ | ✅ | ✅ | ✅ (higher plan) | ✅ | ✅ | ✅ | ✅ | paid | API token | low | USE (if xG needed) |
| **StatsBomb** | open-data historical only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | open data | paid for live | key | low | FUTURE (xG depth) |
| **Opta / Stats Perform** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | enterprise | OAuth | low | FUTURE (enterprise) |
| **Wyscout / Hudl** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | enterprise | OAuth | low | FUTURE |
| **Football-Data.org** | WC not in free tier | ❌ | ❌ | ❌ | ❌ | ❌ | teams only | limited | free (limited comps) | API key | low | REJECT (no WC/stats) |
| **FootyStats** | ✅ | partial | partial | proxy | ✅ | ✅ | ✅ | ✅ | paid API | API key | medium | FUTURE |
| **ESPN soccer (undocumented JSON)** | ✅ schedule/box | near-KO | post-match | ❌ | post-match | partial | ✅ | post-match | free | none | medium | FUTURE (schedule/settlement only) |

(Per-provider: docs URLs — API-Football api-football.com; Sportmonks sportmonks.com; StatsBomb
statsbomb.com; Stats Perform statsperform.com; Hudl/Wyscout hudl.com; Football-Data
football-data.org; FootyStats footystats.org; ESPN site.api.espn.com.)

## Recommendation
1. **Primary: API-Football (API-Sports)** — best fixtures + lineups + minutes + shots/SOT/
   corners + national-team coverage at a reasonable price; **no xG** → set `xgReady=false`,
   confidence stays Low/limited for xG-dependent markets (per the guide).
2. **Sportmonks** if xG is required (higher plan).
3. **ESPN soccer JSON** is viable for **schedule + post-match settlement** later (same
   documented-enough JSON family as our NBA `espn_scoreboard`), but is **not** a pre-tournament
   projection source (no recent-form/xG baseline before matches are played).

## What a key unlocks (gated, honest)
- **Team-level only** (team stats, no lineups) → 90-minute moneyline + match-total
  **projections** (independent of the market), Low/Medium confidence; **no** player props.
- **+ lineups/minutes/player stats** → player props (shots/SOT first; goalscorer Med/High)
  behind the minutes/role gates; then suggested parlays + a possible Bank Builder Step-3 card.
Until a key exists, the page stays **Market-Outlook-only** and everything stats-dependent is
**fail-closed**.

## Activation steps (when a key is provisioned)
1. Add the provider secret (e.g. `API_FOOTBALL_KEY`).
2. Write `pipeline/world_cup/providers/api_football.py` implementing `SoccerStatsProvider`
   (set `supports_team_stats/lineups/player_stats/xg` truthfully).
3. Register it in `readiness.PROVIDERS` + inject the secret in `world-cup-stats-discovery.yml`.
4. Bounded discovery → readiness flips per real capabilities → build the team-level projection
   engine (`build_features` → Poisson 3-way) → parlays → Bank Builder Step-3 (only if a Low card
   qualifies near +174 for $728.76 → ~$2,000).

---

## Empirical finding (2026-06-11, key added + adapter run)
The API-Football adapter was implemented and ran a bounded discovery with the real
`API_FOOTBALL_KEY`. Result:
- **League id 1 IS the World Cup** (API confirms seasons 2010/2014/2018/2022/**2026**) — our
  query (`league=1&season=2026`) is correct.
- **The account is on the Free plan**, which returned the error verbatim:
  > "Free plans do not have access to this season, try from 2022 to 2024."
- So **fixtures + team/player stats for season 2026 are plan-gated** → 0 rows → readiness stays
  fail-closed (`projectionsAllowed=false`, `parlayAllowed=false`), now with the accurate reason
  `providerPlanBlock` recorded.

**Action to unlock:** upgrade the API-Football account to a **paid tier that includes the 2026
season** (their Pro/Mega plans do). No code change is needed — the adapter, gates, workflow,
and UI are ready; re-running `world-cup-stats-discovery.yml -f provider=api_football` after the
upgrade will flip the gates as the real data arrives (team-level projections first, once a few
matches are finished + a usable sample exists; player props once lineups post near kickoff).
