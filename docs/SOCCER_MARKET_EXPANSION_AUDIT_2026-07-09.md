# Soccer Market Expansion — Inventory + Provider Feasibility Audit (2026-07-09)

Phases 1+2. Providers available: **Odds API** (`soccer_fifa_world_cup`) + **API-Football**
(schedule/stats). No Sportmonks/Opta/Goalserve. Money untouched (`affe6b21…`, 19-14).

## Phase 1 — current soccer market inventory

| Market | Artifact? | UI (Game Center)? | Settlement? | Source | Notes |
|---|---:|---:|---:|---|---|
| 3-way match result | ✅ | ✅ | ✅ (WC specials) | Odds API `h2h_3_way` | de-vigged |
| double chance | ✅ | ✅ | 🟡 | Odds API | de-vigged |
| draw no bet | ✅ | ✅ | 🟡 | Odds API | de-vigged |
| BTTS | ✅ | ✅ | ✅ | Odds API `btts` | de-vigged |
| match total | ✅ | ✅ | ✅ | Odds API `totals` | de-vigged |
| Asian handicap | ❌ | ❌ | ❌ | — | **now available (this build)** |
| team totals | ❌ | ❌ | ❌ | — | **now available (this build)** |
| anytime scorer | ❌ | ❌ | ❌ | — | **now available (this build)** |
| exact score | ❌ | ❌ | ❌ | — | not an Odds API soccer market |
| corners | ❌ | ❌ | ❌ | — | not an Odds API soccer market |
| cards | ❌ | ❌ | ❌ | — | not an Odds API soccer market |
| player shots | ❌ | ❌ | ❌ | Odds API `player_shots` | posted but THIN (2 books) |
| shots on target | ❌ | ❌ | ❌ | Odds API `player_shots_on_target` | THIN (2 books) |
| assists | ❌ | ❌ | ❌ | Odds API `player_assists` | THIN (1 book) |
| goalkeeper saves | ❌ | ❌ | ❌ | — | not posted |
| first scorer | ❌ | ❌ | ❌ | — | `player_goal_scorer_first` NOT posted |
| xG | ❌ | ❌ | ❌ | — | not an odds market |

## Phase 2 — provider feasibility (verified via live availability calls, 8 credits)

Probed the France–Morocco event (`soccer_fifa_world_cup`, 11 books):

| Market | Feasibility | Source | Cost | Risk | Action |
|---|---|---|---:|---|---|
| Asian handicap | **A — ready** | Odds API `spreads` (6 bk) + `alternate_spreads` (8 bk) | ~1 cr/event | low (clean 2-way de-vig) | **BUILD** |
| Team totals | **A — ready** | Odds API `team_totals` (3 bk) | ~1 cr/event | low (2-way per team) | **BUILD** |
| Anytime scorer | **A — ready** | Odds API `player_goal_scorer_anytime` (6 bk, 44 outcomes) | ~1 cr/event | med (player names + settlement) | **BUILD** |
| Total-goals distribution | A — ready | Odds API `alternate_totals` (7 bk, 14 pts) | ~1 cr/event | med (tail-bin like MLB) | defer (same tail issue) |
| Player shots / SOT / assists | A — thin | Odds API `player_shots*` / `player_assists` (1–2 bk) | ~1 cr/event | med (thin coverage) | defer (coverage caveat) |
| First scorer | D | not posted | — | — | unavailable |
| Corners / cards / exact score / xG | **C — new provider** | not an Odds API soccer market | — | — | defer (needs a specialist stats/odds vendor) |

## Selected first batch (Phase 3)

**BUILD (all Category A, best-covered, honest):**
- **Asian handicap** — `spreads` main line → de-vig home-cover vs away-cover → a handicap panel.
- **Team totals** — `team_totals` → de-vig over/under per team → a team-goals panel.
- **Anytime scorer** — `player_goal_scorer_anytime` → de-vig each player Yes/No → top-N scorer panel.

Cost: one per-event call with all three ≈ 3 credits × 4 WC events ≈ **12 credits/slate** (18,695 balance).

**DEFERRED (documented path):**
- Total-goals distribution — available, but shares the MLB alternate-ladder **tail-bin** subtlety
  (`docs/MLB_ALTERNATE_LADDERS_AUDIT_2026-07-09.md`); build with the same guard.
- Player shots/SOT/assists — posted but thin (1–2 books); ingest later with a coverage caveat.
- First scorer — not posted.
- Corners / cards / exact score / xG — **require a new provider** (not offered by the Odds API for
  soccer); do NOT fabricate from stats/rankings.

**Settlement:** Asian handicap, team totals settle on the regulation final score (API-Football box
score). Anytime scorer settles on the fixture goal-scorer feed (API-Football events). No
model-performance grading is added until that settlement is wired + validated (Phase 8 plan).
