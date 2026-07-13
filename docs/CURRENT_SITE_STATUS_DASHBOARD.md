# GameTime Picks — Current Site Status Dashboard

- **Timestamp:** 2026-07-13 (Monday, ET). **Week of July 13 has started.**
- **Repo HEAD:** `8b6a2e09` (+ this pass). **Money md5:** `affe6b21071f2b3be96bb2774eb347c3` — record **19-14**,
  bankroll **$19,065.40**, crown **$20,465.40**, official exposure **$0**. Forensic PERFECT · Health HEALTHY.
- **Deployed:** Vercel auto-builds on push to `main`.

Legend: 🟢 current/healthy · 🟡 working, needs attention · 🔴 stale/misleading · ⚪ off-season/no-play.

| Area | Status | What's going on (as of 07-13) |
|---|---|---|
| **Money / Mr Dub** | 🟢 | 19-14, $19,065.40, crown $20,465.40, exposure $0. md5 `affe6b21…`. Nightly settle bot healthy. |
| **Homepage** | 🟡→🟢 | Was showing a stale "Tonight's UFC picks" (UFC 329 was July 11). **Fixed this pass:** past-event guard suppresses the UFC spotlight + picks board once the event day passes. Falls back to the normal hero. |
| **Today** | 🟡 | Renders the **July-11 slate** (2 days old). Client freshness badge honestly shows "N days ago". No **July-13** refresh yet (needs founder keys). |
| **MLB** (`/mlb`) | 🟡 | Board/sims are **July-11** (15 games, 10k-run sims). 2 days stale until a refresh. No fabrication; freshness badge honest. |
| **World Cup** (`/games`) | 🟡 | **July-11 quarterfinals** (England@Norway, Switzerland@Argentina) — those games are now **played/pending settlement**, not upcoming. Semifinals not yet ingested. |
| **UFC** (`/ufc`) | 🟡 | UFC 329 is **over (July 11), not yet settled** (no results ingested). Table still shows pre-fight winner/method reads → should move to **post-event / results-pending** framing. 10/14 named winners, 4 provider-missing. |
| **Picks / Parlay Lab** | 🟢 | Model-qualified pool (WC+MLB) from the July-11 slate; UFC excluded. Paper-only. |
| **Build / Picks Lab** | 🟡 | Advanced builder present; a true custom top-picks builder is still deferred (roadmap). |
| **Bank Builder** | 🟢 | **No-play** for the current slate (candidate proposal, unpromoted — awaiting a founder-approved card). $0 official exposure. |
| **Moonshot** | 🟢 | One **$25 paper** lane (display exposure); official exposure $0. |
| **Results** | 🟢 | Official 19-14; paper track record + trust center; no pending marked as loss. |
| **IPL / NBA / NHL** | ⚪ | Off-season / placeholder routes (board/parlays/results scaffolds). Not primary. |

## Mid-July sports lull (verified 07-12 night)
A July-13 refresh was attempted and revealed there is **no full current slate**: **MLB is in the All-Star
break (0 games ~July 13–16)** and the **World Cup is between rounds (QFs done July 11; semifinals July 14/15)**.
The thin/empty July-13 slate broke 15 slate-coupled tests, so it was reverted — the last full slate (July-11)
stays with an honest "N days ago" freshness badge rather than a fake "live today". See
`JULY13_PLUS_READINESS_LOG.md`.

## Urgent (next 24h)
1. 🟢 **Stale UFC homepage spotlight** — fixed (past-event guard); deploys on push.
2. 🟡 **Next real refresh = July-14 (WC semifinals)** then **~July-17 (MLB resumes)** — not the empty July-13.
3. 🟡 **Add GH Actions secrets** (`ODDS_API_KEY`/`API_FOOTBALL_KEY`/`VERCEL_DEPLOY_HOOK_URL`) to turn on the
   existing daily-refresh + settlement + deploy workflows (kills the weekend-stale problem permanently).
4. 🟡 **UFC 329 post-event** — ingest results (internal, experimental grading), flip `/ufc` to results-review.
5. 🟡 **World Cup July-11 QFs** — settle 90' team markets from official scores; ingest the semifinals July-14.

## Week of July 13 priorities
See `WEEK_OF_JULY13_ACTION_PLAN.md`. Headline: **automate the daily refresh** so the slate is never 2 days
stale, wire **UFC post-event → next-card**, complete **World Cup knockouts**, and harden **MLB model tracking**.
