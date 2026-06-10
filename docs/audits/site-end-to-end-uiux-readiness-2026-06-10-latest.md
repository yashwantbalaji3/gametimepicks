# Site End-to-End UI/UX Readiness Audit — 2026-06-10

_First-visitor pass over the live product (https://gametime-picks.vercel.app). All 10
audited routes return 200. Data is fresh for tonight (MLB 15 games/685 leans, NBA Game 4
96/96 via espn_scoreboard, Suggested Parlays 20 slips, Bank Builder $211.85/Step 2)._

| Route | Primary question | Above the fold? | Top safe improvements |
|---|---|---|---|
| `/` | "What's live & where do I click?" | Yes — command hero + 5 path cards + featured Bank Builder + parlay preview | MLB-centric "first pitch" copy → sport-neutral (done); both sports live tonight |
| `/mlb` | "Today's MLB projections?" | Mostly | confirm date/freshness strip reads "today"; plain-English confidence |
| `/nba` | "Game 4 projections?" | Yes (96/96) | keep; ensure "recent form through Game 3" framing |
| `/nba/board`,`/nba/parlays` | board + cards | Yes | single-game → friendly same-game-cap note (parlay-lab covers it) |
| `/parlay-lab` | "Suggested cards" | Yes | friendlier empty states (done #362 + this PR); risk buckets clear |
| `/bank-builder` | "Paper ladder status" | Yes (#360) | hero clean, June 9 slip card, audit collapsed, no 3-7 — verified good |
| `/results` | "How's the model doing?" | Yes (accuracy summary) | "How to read this page" note (done); clearer labels (#362) |
| `/ufc` | "UFC V1 picks" | Yes | props pending-provider note present |
| `/world-cup` | "Tournament status" | Yes | schedule-only / fail-closed, honest |

## Cross-cutting findings
1. **Navigation is correct** — path cards + nav point to real routes (`/parlay-lab`,
   `/bank-builder`, `/results`); `/suggested-parlays` does not exist (use `/parlay-lab`).
2. **Jargon** largely removed in #362 ("generated pool" → "all generated cards (internal
   tracking)"); this PR adds a Results "how to read" explainer.
3. **Empty states** are friendly (parlay-lab multi-reason; #362).
4. **Bank Builder** lifetime 3-7 stays in collapsed audit only (verified).
5. **Honesty** preserved everywhere — educational/paper framing; no banned copy.

## Conclusion
The product is **fresh and functional for tonight**; remaining gaps are incremental
polish, not blockers. This PR ships the highest-confidence safe wins; a deeper visual
revamp (shared component system) is scoped in the revamp plan and benefits from the
user's screenshot feedback.
