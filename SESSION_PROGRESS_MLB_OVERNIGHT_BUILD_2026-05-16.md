# MLB Overnight MVP Build — Progress Log

**Started:** 2026-05-16 (post PR #39 merge)
**Branch:** `feature/mlb-mvp-board-power`
**Base:** `main` @ `263f1aa`
**Status:** in progress — NOT for commit (untracked session doc)

## Pre-flight state
- PR #39 squashed to `main` at `263f1aa`. Both Vercel deploys green; live custom domain serving 200 OK.
- Working tree clean except expected untracked session docs + root logo.
- No paid API runs initiated yet.

## Plan
- Phase 1: audit existing NBA pipeline + app architecture (reuse patterns).
- Phase 2: probe MLB Stats API (free) for May 16 schedule + probable pitchers.
- Phase 3: enumerate MLB Odds API markets, estimate credits, decide whether to spend (cap 75 credits, floor 350 remaining).
- Phase 4: build MLB data pipeline (schedule → optional props → optional projections). Honest pending states when data missing.
- Phase 5: HR Power Board data (separate from main board; high-variance framing).
- Phase 6: UI routes `/mlb`, `/mlb/board`, `/mlb/power`. Homepage + nav integration. No NBA route refactors.
- Phase 9: typecheck, build, public_copy_test, forbidden-copy grep, scope diff.
- Phase 10: commit + push + open PR. Do not auto-merge.

## Notes (rolling)
- Pre-existing UX gap from PR #39 review: `/board?date=YYYY-MM-DD` URL query is silently ignored (active-slate selector wins, past dates hidden from tabs). Not a regression. Out of MLB scope tonight.
- Hard constraints: no fabricated data; no package changes; no workflow changes; no paid API without estimate + approval gate; HR markets stay separate from main projection board.

## Final state
- **PR #40 OPEN:** https://github.com/yashwantbalaji3/gametimepicks/pull/40
- **Branch:** `feature/mlb-mvp-board-power`
- **HEAD:** `b7c4a9d` — feat(mlb): add daily props board and Power Board MVP
- **mergeStateStatus:** CLEAN
- **Vercel canonical deploy:** PASS — https://gametime-picks-git-featu-3386b4-yashwantbalaji33-7164s-projects.vercel.app
- **Files changed:** 19 (`+26,078` / `-1`); the bulk is `app/public/data/mlb/boards/2026-05-16.json` (327 leans, ~22.7k lines).
- **Total paid Odds API tonight:** 81 credits (run 1 = 41 mid-failure before caching wired; run 2 = 40 with caching active).
- **Credits remaining:** 368 (above the 350 floor).
- **NOT merged.** Awaiting operator approval.
