# v1.8 — Track B4: every ESPN scoreboard caller onto ONE month-window owner (receipt)

**Date:** 2026-09-22 · **Branch:** `v18-platform-reliability` · **Status:** code + tests on the branch; nothing
is production until the founder merges and the next scheduled runs write. No data artifact is committed here.

## 1. What the reality check said, and what was true

`docs/V18_NEXT_PROGRAM_REALITY_CHECK.md` listed B4 as "UFC capture onto the shared month plan (10 lines; the
helper exists)" — a preventative move, because `capture-ufc-events.mjs` still used the ESPN RANGE form
(`?dates=YYYYMMDD-YYYYMMDD`) that had killed the NFL/NBA schedule captures. Re-measured before editing:

| Probe (2026-09-22 18:00Z, keyless GET) | range form | month form `dates=YYYYMM` | day form |
|---|---|---|---|
| basketball/nba | **400** | 200 | 200 |
| football/nfl | **400** | 200 | 200 |
| soccer/eng.1 · soccer/fra.1 | **400** | 200 | 200 |
| mma/ufc | 200 | 200 | 200 |

The range form was still spelled in **ten** scripts, not one. Eight of them were live callers, and only the two
schedule captures had been repaired on 09-22 (`capture-nfl-schedule.mjs`, `capture-nba-schedule.mjs`):

| Script | Workflow · step | Failure mode before this change | Since |
|---|---|---|---|
| `scripts/nfl/capture-nfl-results.mjs` | `sport-schedules.yml` "Capture NFL current results" | **green-but-broken**: catches every fetch error as `SOURCE_STALE`, exits 0, writes nothing. Step state CAPTURED, no refusal, no red run. `nfl/results/latest.json` frozen at `generatedAt 2026-09-15T14:18:42Z` (16 rows, Week 2). **Week 3 finals (Sep 17–21) never captured.** | run 35106601592 (2026-09-16) → every run since prints `SOURCE_STALE: nfl scoreboard unavailable (no events array)` (7 consecutive) |
| `scripts/nba/capture-nba-results.mjs` | same, "Capture NBA current results" | same class; no visible effect yet (NBA off-season, state `OFF_SEASON` stands) — would have gone silent on 2026-10-03, the first preseason night | same window |
| `scripts/ufc/capture-ufc-results.mjs` | same + `ufc-fight-week.yml` + `ufc-post-card.yml` | same class; MMA still answers the range form, so it works today by provider grace | — |
| `scripts/ufc/capture-ufc-events.mjs` | `sport-schedules.yml`, `ufc-fight-week.yml` | works today by provider grace (the named B4 item) | — |
| `scripts/soccer/build-league-forecasts.mjs` | `soccer-leagues.yml` "Build the forecasts" | exit 3 on HTTP 400 | never reached — the grade step above it fails first |
| `scripts/soccer/grade-league-forecasts.mjs` | `soccer-leagues.yml` "Grade finished matches" | `REFUSED: ESPN scoreboard HTTP 400 — nothing graded`, exit 3 → **job red on 8/8 recent runs**, Ligue 1 forecasts not published | run 2026-09-18T13:36Z onward |
| `scripts/soccer/dixon-coles-shadow.mjs` | `soccer-dc-shadow.yml` | refuses → **job red on every run** (La Liga / Serie A / Bundesliga research shadow not forecasting or grading) | 2026-09-20T13:41Z onward (3/3) |
| `scripts/ufc/fetch-ufc-history.mjs` | manual, resumable (raw months already on disk) | latent | — |

Correction to the audit trail: the provider change is first visible on **2026-09-16** (NFL results) and
**2026-09-18** (soccer), not 2026-09-20 as the schedule-capture repair note says; the schedule captures simply
noticed later because their windows straddle months differently.

## 2. The change

One I/O owner in `app/src/lib/sports/espn-scoreboard-window.mjs` (previously pure plan + filter only):

- `fetchScoreboardWindowEvents(sportPath, d0, d1, { fetch })` — asks the MONTH form for every month the window
  touches (`limit=1000`, P196), merges to exactly `[d0, d1]`, throws `ScoreboardFetchError` with `.status` on any
  non-2xx and `.malformed` on a payload without `events[]`; a failed later month aborts the whole window (a
  half-window must never look like a full one). `fetch` is injectable, so the call path is unit-tested offline.
- `isProviderRefusal(err)` — true for 4xx only. A 4xx is the provider rejecting the request form; it does not
  heal by waiting. Network / 5xx / malformed are outages.
- `utcDayStart` / `utcDayEnd` — the old `dates=YYYYMMDD-YYYYMMDD` was day-granular; every migrated window uses
  whole UTC days at both ends so the event set is the one the old request would have returned (the schedule
  captures, repaired earlier, keep their instant-bounded windows unchanged).

Callers (all ten) now import the owner; no script plans its own month URLs or fetches the scoreboard itself.

**Semantics preserved, one deliberate change.** The three RESULTS captures keep `SOURCE_STALE` → exit 0 →
last-known-good for outages, but a **provider refusal (4xx) now exits 1** with `REFUSED: … a 4xx is a contract
change, not an outage`. Inside `sport-schedules.yml` that is the already-existing path: the step records the
refusal, the commit is skipped, and the final step turns the run red — the visibility that was missing for a
week. `ufc-fight-week.yml` / `ufc-post-card.yml` wrap the UFC results capture in `|| echo`, so there a refusal
prints a warning and grading proceeds from the committed capture (unchanged behaviour, noted for P264's
`|| echo` class — the sport-schedules run is the one that goes red).

`--dry-run` added to the four captures that lacked it (UFC events, NFL/NBA/UFC results): fetch, count, write
nothing, exit 0.

## 3. Tests (all offline; `cd app && npx tsx --test src/lib/sports/espn-scoreboard-callers.test.mjs`)

| Test | Pins | Mutation / positive control |
|---|---|---|
| range-form scan over every ESPN-calling file in `app/scripts/**` + `app/api/**` | no non-comment line builds a `dates=` value whose LITERAL text carries a hyphen | the four exact strings that were on disk before the repair are asserted to MATCH; month/day forms, and a one-day value that spells a hyphen *inside* its expression, asserted NOT to |
| EPL results capture keeps its own loop but not its own month plan | `epl-results-capture.mjs` imports `monthsCovering` from the owner and never re-derives months | re-deriving the plan locally fails the test |
| the two month plans agree | `scoreboardMonths(start, now)` ≡ `monthsCovering(...)` across four windows incl. a year roll; the EPL signature's `[]` for an inverted/invalid window is pinned separately | — |
| migrated-caller list (10 files) | each imports the owner and `fetchScoreboardWindowEvents`; none calls `scoreboardMonthUrls` or `await fetch(…scoreboard…)` itself | reverting any one file to its own fetch loop fails the test by name |
| "only the owner spells a windowed `dates=`" | every other `dates=` in the tree is a single-day form (`${day}`, `${date}`, literal, or the `{YYYYMMDD}` documentation placeholder) | — |
| fetcher: month plan + window merge | two months requested in order, `accept: application/json`, before/after-window events dropped, echoed event collapsed | — |
| fetcher: 4xx → `ScoreboardFetchError{status:400}`, `isProviderRefusal` true | callers can go red | 5xx / not-JSON / no-`events` → `.malformed` or 5xx, `isProviderRefusal` false; a `TypeError("fetch failed")` is never a refusal |
| fetcher: second month 404 aborts | half-window refused | — |
| `utcDayStart`/`utcDayEnd` | day-granular bounds, year end | invalid date throws |

Run tonight: `espn-scoreboard-callers` 12/12 · `espn-scoreboard-window` 4/4 · `ufc-record-consolidation` (the
`limit=1000` guard over the four UFC scripts) · `audits/capture-independence` · `ops/workflow-shell-syntax` →
**34 pass / 0 fail**. `npm run -s lint:scripts` clean.

### 3a. The first version of this guard was blind to a const-built URL (found by mutation probe, 2026-09-22)

The scan originally required the literal `scoreboard?dates=` **on one line**. `capture-epl-results.mjs` keeps the
host in a const and appends the query — `` `${SCOREBOARD}?dates=${month}&limit=1000` `` — so the word
`scoreboard` and the `?dates=` never share a line, and the file was invisible to the scan. Probe: injecting
`dates=${month}-${month}` there left the suite at **10 pass / 0 fail**. That is the vacuous-guard class this
repair exists to prevent — the guard would have passed while the dead form was back on disk.

The scan is now anchored on `?dates=` (not on the word `scoreboard`) across every file that mentions
`site.api.espn.com`, and it reads the value with a brace-aware walk rather than a regex, because
`api/_live-core.mjs` spells `?dates=${plan.date.replace(/-/g, "")}` — a SPACE and a hyphen inside the expression,
which a `[^&`"'\s]*` capture truncates into a false positive. `${...}` groups are consumed into `raw` only; the
hyphen test runs on the literal remainder.

Four probes against the strengthened guard, each applied and reverted:

| Probe | Result |
|---|---|
| const-built range form in `capture-epl-results.mjs` (`dates=${month}-${month}`) | **caught** (2 fail) |
| literal range form in a single-day UFC caller (`dates=20260922-20261121`) | **caught** (2 fail) |
| `epl-results-capture.mjs` re-derives the month plan locally instead of via the owner | **caught** (1 fail) |
| a migrated caller adds a const-built direct `await fetch(scoreboard?dates=A-B)` | **caught** (2 fail) |

One deliberate exception is now named rather than accidental: `capture-epl-results.mjs` is the ONE windowed
caller outside the shared fetcher. It keeps its own loop because its failure semantics differ (`EXIT_SOURCE_STALE`
= 4, nothing written, plus per-month provenance in the artifact's `source` block), but its month PLAN comes from
the shared owner — pinned by the two tests above, so the rule has one owner even though the transport has two
call sites.

## 4. Live dry runs (provider, 2026-09-22 ≈18:07Z; nothing written)

| Capture | Result |
|---|---|
| UFC events `--days 60` | 13 events / 73 named bouts from 3 month requests — identical counts to the committed `ufc/schedule/latest.json` (13 / 73) |
| NFL results `--days 9` | state RESULTS, **30 rows / 30 completed** (window 09-13 → 09-22) vs the frozen artifact's 16 — Week 3 lands on the first scheduled run after merge |
| NBA results | OFF_SEASON, 0 rows (honest: first preseason game 2026-10-03) |
| UFC results | RESULTS, 22 rows / 17 completed |
| NFL schedule `--days 9` · NBA schedule `--days 70` | 16 events (2 month requests) · 370 events (4 month requests, 5 neutral) — same as the 09-22 repair receipt |
| soccer build epl · ligue-1 (`--days 8`) | 0 fixtures / 0 refused each — honest: ESPN lists no eng.1 or fra.1 fixture between 09-21 and 10-09 (day probe 20260926 → 0 events; month 202610 begins 10-10) |
| soccer grade epl | exit 0 (see §5 for the label it printed) |
| Dixon-Coles `--grade` and forecast | exit 0 for laliga / serie-a / bundesliga ("corpus lag" lines are the existing openfootball-lag report, not a fetch problem) |

The artifacts those runs rewrote in the worktree were restored (`git checkout`) — a feature branch does not
publish bot-owned data.

## 5. Found along the way, not changed here

- **Two writers for `app/public/data/soccer/epl/forecasts/latest.json`.** `epl-matchweek.yml` owns it via
  `scripts/epl/build-epl-forecasts.mjs`; `scripts/soccer/build-league-forecasts.mjs --league epl` also passes its
  stage gate (EPL is `LIVE`) and writes the same path with a different schema (`counts`, no `sources`).
  `soccer-leagues.yml` excludes `epl` deliberately, so nothing scheduled collides — but the script will overwrite
  the owner's artifact if anyone runs it by hand. Candidate for a refusal (`--league epl` → REFUSED, owned
  elsewhere). Track B/C ownership rule; not touched in a transport change.
- `grade-league-forecasts.mjs --league epl` prints "58 due but not final yet" because the EPL forecast rows (from
  the other writer) carry `eventId` in `soccer:epl:<slug>:<time>` form and no ESPN `providerEventId`, so no
  final ever matches; the label is wrong for that population. Harmless while unscheduled; same root cause.
- The publication watchdog did not notice a results artifact seven days stale: `nfl/results/latest.json` is not
  a registered publication. Worth a freshness entry (B5 / ops), out of this change's scope.

## 6. After the founder merges — verify

1. `sport-schedules.yml` next scheduled run: "Capture NFL current results" prints `state RESULTS, rows ≥ 30`,
   commits `app/public/data/nfl/results/latest.json`; NFL Week 3 receipts / week reconciliation then run on
   their own crons.
2. `soccer-leagues.yml` and `soccer-dc-shadow.yml` go green (0 fixtures until 10-10 is the expected honest state).
3. `sport-schedules.yml` "NFL schedule" / "NBA schedule" no longer refuse (the 09-22 14:00Z red run predates the
   #628 merge that carried the schedule repair).
4. Production `/data/build-info.json` is a descendant of the merge; `/nfl` and `/results/nfl` show Week 3.
