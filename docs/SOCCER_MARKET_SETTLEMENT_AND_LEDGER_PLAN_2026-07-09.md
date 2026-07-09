# Soccer Market Settlement & Model-Performance Ledger Plan (2026-07-09)

Phase 8. How each supported/candidate WC market would settle, and when a model-performance
ledger may be added. **No grading is added until settlement is wired + validated** — the raw
soccer-market ledger stays SEPARATE from the official 19-14 paper-card record. Money untouched.

## Settlement matrix

| Market | Settlement source | Official result field | Current support | Needed work |
|---|---|---|---|---|
| 3-way match result | API-Football fixture | regulation final score | ✅ (WC specials) | — |
| BTTS | API-Football | both teams scored in 90′ | ✅ | — |
| match total (goals) | API-Football | 90′ total goals | ✅ | — |
| double chance | derived from 3-way | 90′ result | 🟡 | trivial from 3-way settlement |
| draw no bet | derived from 3-way | 90′ result (push on draw) | 🟡 | add push handling |
| **Asian handicap** (new) | API-Football | 90′ margin vs the handicap line (half-lines = win/loss; whole lines can push) | ❌ | add margin-vs-line settlement + push rule |
| **team totals** (new) | API-Football | each team's 90′ goals vs line | ❌ | add per-team goal settlement |
| anytime scorer | API-Football events | did the player score in 90′ | ❌ (deferred) | player-name join to the scorer feed |
| player shots / SOT / assists | API-Football player stats | 90′ player stat vs line | ❌ (thin odds) | stats join + thin-coverage guard |
| corners / cards / exact score / xG | — | — | ❌ | **new provider** (not offered) |

## Regulation-time rule (explicit)

All WC markets settle on the **90-minute regulation result**. Extra time and penalties do **not**
count. A Draw is a real third outcome. Knockout advancement is a separate concept and is never
merged into a 90′ market result. (Already enforced in the WC Game Center copy + the existing WC
specials settlement `settlementSupport: regulation_90`.)

## Model-performance ledger plan (separate from the 19-14 record)

Mirror the money-independent MLB projection ledger (`/mlb/results`): once Asian-handicap and
team-total settlement are wired (API-Football 90′ score) and validated on several finished
fixtures, grade each de-vigged market lean vs the official 90′ result into a **soccer market
ledger** — a model-quality read, explicitly **not** the paper-card record and never summed into it.

**Do not grade yet.** The first batch (Asian handicap + team totals) is shipped as a
**market-implied dashboard only**. Grading is added only after the settlement path above is
implemented + validated — truth over speed.
