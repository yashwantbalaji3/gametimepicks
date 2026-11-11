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
| Tests and fixtures | `stale-flags.test.mjs`; `__fixtures__/stale-flags-2026-11-11/`: the frozen 2026-11-11 lane plus the seven committed NBA captures of that day (08:23–19:47Z), trimmed to status facts |

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
