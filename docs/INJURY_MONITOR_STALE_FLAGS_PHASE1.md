# Injury monitor and stale flags — Phase 1 design note (NBA and NFL)

Status: local branch `claude/injury-stale-flags`. No PR during the CI freeze. Nothing public; no forecast or grading
change. Founder-approved phased injury direction, 2026-11-11. The competitor audit at
`~/gtp-evidence/competitor-injury-audit-2026-11-11.md` is preliminary evidence and is not cited as fact here.

## What it does
After each injuries capture, the monitor checks every **frozen** forecast's availability assumptions against the
capture. It appends **staleness events** to an append-only public facts file. Frozen forecasts are never edited.

| Part | File |
|---|---|
| Rule and contract (pure, shared NBA and NFL) | `app/src/lib/availability/stale-flags.mjs` |
| Writer (one run per capture) | `app/scripts/availability/build-stale-flags.mjs --sport nba\|nfl --date YYYY-MM-DD` |
| Public facts file | `app/public/data/<sport>/stale-flags/<date>.json`, schema `gtp.stale-flags@1` |
| Tests and fixtures | `stale-flags.test.mjs` (12 tests: replay, recovery, health, alert path); `__fixtures__/stale-flags-2026-11-11/`: the frozen 2026-11-11 lane plus the seven committed NBA captures of that day (08:23–19:47Z), trimmed to status facts |

## Rule: two flag levels
- **Player flag.** Any player with a published projection in the frozen forecast whose status became Out, Doubtful,
  Injured Reserve, Suspension or Inactive. The change must be stated after the freeze and before the start, and the
  forecast must have assumed him available. Any post featuring that player is refused.
- **Game flag ("material").** The game's winner, score and game-level posts are refused too.
  - **NBA:** the frozen lane's own `expectedMinutes` ≥ 20 (founder directive: a starter with ≥ 20 projected minutes,
    which is ≥ 8% of the team's 240 minutes), or the player is Top-5 in a stat family of his game.
  - **NFL:** the board's identified starting QB (`integrity.qbStarter`), or a top skill player: the top 2 rushers and
    top 3 receivers by board median.
- **Not "newly":** a player already listed unavailable at the freeze raises nothing.

## Event fields
`key`, `sport`, `eventId`, `playerId`, `name`, `side`, `statusBefore`, `statusAfter`, `statedAt`, `detectedAt` (the
capture's `sourceAsOf`), `flags {player, game}`, `materialReasons`, `topN`, `forecastId`, `forecastSha256` (the exact
frozen game or board judged), `source`, `version`.

## Append-only versioning
Existing events are never edited or removed. A capture that adds events appends one version
`{version, capturedAt, added[]}`. A quiet capture writes nothing, so a caller can stage the path unconditionally and a
quiet window adds no diff or build. There is no wall-clock field: replaying the same inputs gives byte-identical
output.

## Recovery: a flag never hides a game or player permanently (founder ~20:05Z)
A flag is **cleared by an appended `type: "clear"` event**, never an edit, when either of these happens:
- **NEWER_VERSION.** A newer **approved** forecast version for the game exists: its sha differs from the one the flag
  judged, and it was approved after the flag was detected (`docs/FORECAST_VERSIONING_DESIGN.md`).
- **STATUS_REVERTED.** The capture shows the player available again, stated after the flag and before the start.

`activeFlags()` = flags not later cleared. Consumers (`postAllowed`) read only active flags. A player ruled out again
raises a **new** flag, because the key carries the new `statedAt`. A revert stated after the start clears nothing.

## Failure alerts — the existing ops path, no new channel
`monitorHealth()` returns failures, and the writer sends them through **`scripts/ops_alert.sh`** with
`PHASE=injury-monitor`. That script always exits 0, redacts, and delivers to `OPS_WEBHOOK_URL` when configured
(`docs/OPS_ALERTING_CONTRACT.md`).
- `CAPTURE_STALE`: inside the protection window (4 hours before the first start), the capture is more than 30 minutes
  old. The monitor has stalled while a post could still go out.
- `CAPTURE_MISSING` and `CAPTURE_MALFORMED`: the writer also exits 3, so the job fails visibly.
- `FLAGS_MALFORMED`: the stale-flags file is not `gtp.stale-flags@1` for this sport and date. The writer also exits 3.

## Social suppression contract (for bb-social, via PD)
- **Package builders:** `postAllowed(file, { sport, eventId, playerIds, gameLevel })` returns
  `{ allowed, reasons[] }`. A game-level post is refused for a game-flagged game. Any post is refused when a featured
  player carries a player flag. An absent file means no flags; a malformed or foreign file refuses (fail closed).
- **Send-time recheck (last gate):** `evaluatePostAtSend({ candidates, capture, post, nowIso, maxAgeMin = 30 })`. It
  works straight from the frozen forecast's candidates (`nbaCandidates` / `nflCandidates`) and the **latest** capture,
  so it does not depend on the committed file being written. It **refuses when the capture is more than 30 minutes old
  at send**: a stalled monitor never clears a post.

## Acceptance criteria and results
| Criterion | Result |
|---|---|
| BOS @ TOR, Paul George (27.8 projected min) Out 17:55Z | **player + game flag**, detected by the 18:18:21Z capture |
| BKN @ NO, Mathurin (16.9 min, not Top-N) Out 16:29Z | **player flag only**, detected 16:32:27Z. The game stays postable; posts featuring Mathurin are refused |
| The replay also found | 401909971: Myles Turner Out 19:03Z (Top-5, game flag) and Quentin Grimes Out 19:06Z (player flag), both detected 19:47:23Z |
| Recall | **100%** of material events and **100%** of Top-N in the replay (target ≥ 95%, Top-N 100%) |
| Zero posts of flagged games and players | Every flagged player and game-level post refused at package build and at send; a stale capture refuses |
| Frozen checksums unchanged | The lane's file sha256 and in-memory object are unchanged; each event names the sha of the exact frozen game it judged |
| **Detection latency** (statedAt → detectedAt) | **Not met on today's cadence.** Median **23.4 min**, p95 **44.4 min** (n=4; George 23.4, Mathurin 3.5). NBA captures today: 08:23, 16:32, 17:03, 17:44, 18:18, 18:53, 19:47Z — gaps of 30–90 min (GitHub drops frequent crons). **The pipeline adds nothing**: detection equals the next capture. A **5-minute poller** meets median ≤ 10 / p95 ≤ 20 (tested). |

## Latency feasibility, re-checked against the provider cadence
- **Where `statedAt` comes from.** It is ESPN's own posting time for the injury item, from the free public JSON feed
  (`app/scripts/sports/capture-injuries.mjs`). Our latency is therefore measured **from ESPN's post**. ESPN's own lag
  behind a team announcement or the league's official report is **not measured here**; measuring it needs the official
  report's publication times, a separate source.
- **What ESPN offers.** The feed is updated as items are posted, with no fixed provider cadence. One GET per sport
  returns the whole list. Nothing in the feed limits polling at 5 minutes: 12 requests per hour per sport, free, no key,
  0 credits.
- **So the targets are feasible only with our own polling.** A 5-minute poller gives a worst case of 5 minutes plus
  processing from ESPN's post: median about 2.5 and p95 about 5 by construction. That is **inside median 10 / p95 20**
  (tested on tonight's events). Today's 30–90-minute capture gaps miss them (median 23.4, p95 44.4).
- **Draft poller (proposal only, NOT installed).** `~/gtp-evidence/proposals/injury-poller/`:
  - `com.gametimepicks.injury-poller.plist`: launchd, StartInterval 300, plutil-clean;
  - `run-injury-poll.mjs`: node invoked directly, because of the launchd TCC limit on bash/git under `~/Downloads`.

  The runner acts only from 4 hours before the first start to the last start. Each tick it runs the capture (both
  sports) and then the monitor per active sport. It does **no git commit, push or build**: the console's send-time
  recheck reads the local capture directly. Publishing the flags file is Phase 2.

## What latency needs (stated honestly)
Median ≤ 10 min and p95 ≤ 20 min require an injuries capture **at least every 5–10 minutes** in the pre-tip/kickoff
window. Today's captures ride the NBA forecast window workflow; GitHub cron drops make them 30–90 minutes apart.
Options, for the release plan after #1323 and #1326:
- **(a) A local launchd poller** of the free ESPN injuries endpoint every 5 minutes from 4 hours before the first
  tip/kickoff. It costs no credits and reuses the injuries capture script. Its writes would go to the internal capture
  plus the stale-flags file, with commits batched so quiet polls cause no builds.
- **(b) An event-driven CI capture.** Not reliable at 5 minutes on GitHub.

The latency target is a property of capture cadence, not of this module.

## Out of scope for Phase 1
- Changing any frozen forecast or grading rule.
- Public UI for the flags. The game-page note pattern already exists in #1323; wiring stale flags into pages is Phase 2.
- The console code itself, which bb-social owns.
