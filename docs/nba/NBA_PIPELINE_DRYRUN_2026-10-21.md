# NBA daily forecast pipeline: dry run for the 2026-10-21 slate

**Run by:** the coordinator session, 2026-10-21 about 01:20–01:40Z, from `origin/main` `a715bd4f5a` in a scratch worktree.
**Nothing was committed:** the output went to a scratch file. Inputs are the committed schedule, roster and injury snapshots; the pipeline, decision and publish code are the real ones (lane publish from this PR).

## 1. Window decisions (`decide-nba-forecast-window.mjs`)

| `--now` | Decision |
|---|---|
| 2026-10-21T01:20Z (real time) | HOLD: no game tips within 8 h without a forecast |
| 2026-10-21T15:00Z (simulated) | BUILD: owed 401909834, 401909835 (the 23:00Z tips) |

## 2. Freeze windows (`build-nba-experimental-forecasts.mjs --family v0.1 --horizon-hours 8 --write --out <scratch>`)

| Window | Plan | Added |
|---|---|---|
| 15:00Z | ADDED 2 · OUTSIDE_HORIZON 9 | ATL@ORL, MIL@WSH |
| 15:40Z | ALREADY_FROZEN 2 · ADDED 3 · OUTSIDE 6 | MIN@MIA, CHA@BKN, CHI@TOR |
| 16:10Z | ALREADY_FROZEN 5 · ADDED 2 · OUTSIDE 4 | UTAH@MEM, IND@NO |
| 18:10Z | ALREADY_FROZEN 7 · ADDED 3 · OUTSIDE 1 | DAL@HOU, GS@LAL, PHX@POR |
| 18:40Z | ALREADY_FROZEN 10 · ADDED 1 | SAC@LAC |
| 18:40Z (repeat) | ALREADY_FROZEN 11 | none: **NOTHING_OWED** (idempotent, exit 0) |
| 23:20Z (after 5 tips) | ALREADY_FROZEN 11 | none: post-tip runs write nothing |

**Result:**
- 11 / 11 games frozen with `preTip: true`.
- Players simulated per game: 20–30.
- Roster gate refused 0 games.
- Excluded from the pool, with reasons recorded: Out, insufficient history, not on the roster.

**Freshness, flagged honestly:**
- The injury snapshot was CURRENT at 15:00–16:10Z and **STALE** (age over 24 h) at 18:10Z and later, because this dry run replays tonight's committed snapshot at future times.
- The receipts record the state and age. In production the workflow captures injuries at each window's own instant (`nba-forecast-window.yml`).

## 3. Lane publish decision (this PR's `decidePublish`)

| Instant | Frozen | Decision |
|---|---|---|
| 15:45Z | 5 / 11 | **HOLD**: 6 games not frozen yet (a second Production build is avoided) |
| 18:45Z | 11 / 11 | **PUBLISH**: 11 published, 244 player rows, 0 excluded |
| 18:45Z, one receipt payload tampered | 11 / 11 | PUBLISH with that game **excluded** (receipt integrity fails; it never reaches the page) |

## 4. Negative cases covered by tests (not re-run here)

| Case | Where |
|---|---|
| Postponed or cancelled rows ignored | `experimental-lane-publish.test.mjs` |
| A differing published day file is refused | `experimental-lane-publish.test.mjs` |
| `latest.json` never rolls back | `experimental-lane-publish.test.mjs` |
| A game that tipped without a receipt | `planRun` (`STARTED_BEFORE_FIRST_FORECAST`) |
| Roster older than 48 h | `roster-gated-pool.mjs` (`ROSTER_STALE`) |
| An injury snapshot captured after `--now` | the builder refuses it |
| A broken or post-tip receipt is never official | `receiptIntegrity` |
