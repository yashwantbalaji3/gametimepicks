# Incident: November 2, 2026 social publishing failure

Status: post-incident review, read-only investigation (written 2026-11-03).
Scope: NBA (15-game slate) and NFL (CHI @ SEA, Monday Night Football) X posts for 2026-11-02.
Times are UTC with EST (UTC-5) in parentheses. "Ledger" means the Command Center console ledger at
`command-center/out/console/ledger/ledger/2026/11/{02,03}/` in the `gametimepicks-ceo-agent-center` worktree. "Packages"
means `~/gtp-private/graphics/packages/`, `packages-held-1102/` and `clean-1102*/`.

Evidence labels: **CONFIRMED** means a cited file, ledger event, commit, workflow run or power-log line shows it.
**INFERRED** means the evidence is consistent with it but nothing records it directly.

## Summary

41 distinct posts were imported into the Command Center for 2026-11-02, as 108 versions. One was approved and one was
sent: the NBA Tonight full-slate snapshot (approved 00:19:18Z, published 00:20:25Z,
https://x.com/i/status/2117411539737010184). None of the 15 NBA game posts, the 15 NBA game-winner fallbacks, the Top 5
boards or the four NFL posts was approved. The scheduler never ran a job for 11-02, because a job needs an approval
first. The CHI @ SEA packages reached their final versions at 01:01Z, 14 minutes before the 01:15Z kickoff.

## Counts

| Measure | Count | Source |
|---|---|---|
| Distinct posts (dedupe IDs) with a package file for 11-02 | 44 | packages, held, clean-1102* |
| Distinct package versions on disk (dedupe ID × contentSha256) | 134 | same |
| Export directories (`clean-1102*`) | 20 | `~/gtp-private/graphics` |
| Import runs | 21 (16 on 11-02, 5 on 11-03 UTC) | ledger `import-run` |
| Distinct posts imported | 41 | ledger: 40 `imported` + NFL game winner (first imported before 11-02) |
| Versions imported (`imported` + `new-version`) | 108 (40 + 68) | ledger; equals 108 `decision-request` events |
| Refused at import | 17 (9 provenance, 8 file missing) | ledger `import-run` |
| Founder decisions (approvals) | 1 | ledger `decision` 00:19:18Z |
| Caption edits | 2 | ledger `caption-edit` 00:18:01Z, 00:18:41Z |
| Publish jobs / attempts / sent | 1 / 1 / 1 | ledger `publish-job`, `publish-attempt`, `publish-receipt` |
| Imported posts that expired unsent | 40 | package `expiresAt` vs ledger |

## Timeline

| UTC | EST | Event | Evidence |
|---|---|---|---|
| 11-02 01:20 | 11-01 20:20 | Kickoff of the 11-01 NFL game. The scheduled post had not gone out. | ledger 11-02 `publish-result` (MISSED) |
| 04:46:20 | 23:46 (11-01) | Mac wakes from hibernate. The publisher marks the 11-01 NFL post MISSED in the same second, 3 h 26 min late. | pmset; ledger `publish-alert` 04:46:20.824Z |
| 09:39, 13:47, 16:53 | 04:39, 08:47, 11:53 | `daily-products` fails three times at "The refreshed matchup window must not be expired". | runs 41422443608, 41485942897 |
| 15:48 to 00:36 | 10:48 to 19:36 | 18 Command Center commits land on `claude/cc-importer` (gate, holds, cell states, polling, queue). | `git log claude/cc-importer` |
| 17:25 to 17:29 | 12:25 to 12:29 | Sportsbook quotes are printed into the priced NBA packages. Each send window is quote time + 6 h. | `sendWindow.quoteTimeUtc` |
| 17:36 to 17:41 | 12:36 to 12:41 | First imports: 15 NBA game posts, NBA Tonight (ml) and the Top 5 carousel, all READY, data commit 02e311fa. | ledger import-run 17:36, 17:38, 17:40, 17:41 |
| 17:49 | 12:49 | First green `daily-products` (manual dispatch). | gh run list |
| 17:55, 18:00, 18:15 | 12:55, 13:00, 13:15 | Game posts re-imported 3 times as new versions (data 9e07a669, 9e07a669, 0632b4dd). | ledger import-run |
| 18:14 | 13:14 | Game posts 911, 912, 914, 915 and 919 are re-exported with `anomalyCheck: EXCEPTION` (flagged cells withheld). | held package files |
| 19:06 | 14:06 | NFL game post imported. | ledger |
| 19:16 | 14:16 | Commit b98955537b replaces 700 ms local polling with 3 s / 15 s back-off. | commit |
| 19:35 to 19:50 | 14:35 to 14:50 | Mac in clamshell sleep on battery. | pmset |
| 20:11 to 20:16 | 15:11 to 15:16 | Re-export (data 8a9f25fd). 12 of 15 game posts flagged EXCEPTION/REVIEW. The import refuses 6 files (ENOENT: moved to `packages-held-1102` during the run). | held files; ledger 20:16:17 |
| 20:19 | 15:19 | NFL game post, version 2. | ledger |
| 21:26 to 21:53 | 16:26 to 16:53 | Mac asleep on battery (49%). | pmset |
| 22:00 | 17:00 | First recommended send time (OKC @ CLE game post). Nothing approved. | `suggestedPublishAt` |
| 22:13 | 17:13 | First game-winner fallback export (`clean-1102final`). | directory mtimes |
| 22:17:50 | 17:17:50 | 9 imports refused: provenance pinned to affe58dead92, a feature-branch commit (not on main) that lacks `experimental-public/2026-11-02.json`. | ledger import-a9c3b64b5384 |
| 22:19:42 | 17:19:42 | Same 9 imported against 439fdb59. | ledger |
| 22:33 to 23:52 | 17:33 to 18:52 | Remaining fallbacks and NBA Tonight imported in 3 more runs. 4 fallbacks arrive at 23:52. | ledger |
| 23:08 to 23:48 | 18:08 to 18:48 | Mac asleep on battery (87%). | pmset |
| 23:25:49 to 23:29:07 | 18:25 to 18:29 | All 17 priced NBA packages expire (quote age). | `expiresAt` |
| 00:00 | 19:00 | First tip (OKC @ CLE). Its fallback and NBA Tonight (post-e3ee9ed9fa4d) expire. | `expiresAt` |
| 00:14:40 | 19:14:40 | NBA Tonight full-slate snapshot imported (founder freshness exception, valid until 00:30). | ledger; package `freshness.rule` |
| 00:18 to 00:19:18 | 19:18 to 19:19 | Two caption edits, then the day's only approval. | ledger |
| 00:20:21 to 00:20:25 | 19:20 | Manual live-test job, then attempt, then PUBLISHED with a receipt (cost $0.03). | ledger |
| 00:30 | 19:30 | 5 fallbacks (908 to 912) and the Top 5 boards expire. | `expiresAt` |
| 00:38 to 00:49 | 19:38 to 19:49 | Mac asleep. | pmset |
| 00:52 / 00:54 | 19:52 / 19:54 | 2 NFL files refused (ENOENT, moved to held at 00:50:50), then props and TD boards imported. | ledger |
| 01:01:42 | 20:01:42 | Final CHI @ SEA versions (winner, props, TD). Never approved. | ledger |
| 01:15 | 20:15 | Kickoff. All NFL posts expire. | `expiresAt` |
| 01:20 to 05:23 | 20:20 to 00:23 | Mac asleep. Fallbacks for 913 to 921 expire 01:00 to 03:00. | pmset; `expiresAt` |

### Per-post outcome

| Post group | Created / imported (UTC) | Versions | Intended send | Expired | Outcome |
|---|---|---|---|---|---|
| NBA game posts ×15 (priced, with lines) | 17:36 to 17:41 / last 18:15 or 20:16 | 4 to 5 each | 22:00 to 01:00 (2 h before tip) | 23:25 to 23:29 | Unsent; 12 flagged for anomaly review |
| NBA Tonight (ml, priced) | 17:36 | 1 | 22:00 | 23:29:07 | Unsent |
| NBA Top 5 carousel | 17:38; v2 23:03 | 2 | 22:00 | v1 23:25:49; v2 00:30 | Unsent |
| NBA daily Top 5 ×3 | refused 22:17; imported 22:19 | 1 | 22:30 | 00:30 | Unsent |
| NBA game-winner fallbacks ×15 | 22:19 to 23:52 | 1 to 2 | 22:00 to 01:00 | at tip: 00:00 (1), 00:30 (5), 01:00 (3), 01:30 (2), 02:00 (1), 03:00 (3) | Unsent |
| NBA Tonight (post-e3ee9ed9fa4d) | 22:33 | 1 | before 00:00 | 00:00 | Unsent |
| NBA Tonight full-slate snapshot | 00:13 / 00:14 | 1 | ASAP (exception) | 00:30 | **Sent 00:20:25** |
| NFL game post | 19:06; v2 20:19 | 2 | 23:15 | 01:15 | Unsent |
| NFL game winner | refused 22:17; 22:19 to 01:01 | 4 | 23:15 | 01:15 | Unsent |
| NFL props / TD boards | 00:54; v2 01:01 | 2 each | before 01:15 | 01:15 | Unsent |

## Answers

**Status distinctions.** Five separate statuses were in play, and none of them means "will be sent":

- `READY` in a package's `commandCenter` block is Launch Readiness's own view.
- `blockers` are computed by the Command Center (`blockersOf` in `contracts/imported-packages.mjs`): anomaly REVIEW, line rights, verification, started event, closed window.
- Approval is a founder `decision` bound to an exact digest.
- A job exists only after approval plus scheduling.
- A receipt exists only after X returns a post id.

Every one of the 108 decision requests recorded READY with 0 blockers at import. That READY was a snapshot. Window closure and anomaly flags were added later, so status changed without a new ledger event.

**Why approval controls were not usable (INFERRED, partly CONFIRMED).** CONFIRMED: before commit b98955537b (19:16Z) the local console polled `/api/state` every 700 ms. The code's own comment after the fix reads "a state read rebuilds tens of MB: polling faster than it can finish pins the console". Session transcripts report 25 to 40 s state reads, about 31 MB, and near-100% CPU; that is a cross-check, not a measurement in this review. Each changed state re-renders the queue and decisions panels (`render()` in `app.js`). Over the same hours, imports added 108 decision requests for 41 posts, so the review list kept changing under the founder. INFERRED: controls were redrawn or stale while the founder was trying to use them. Unknown: whether the running console had loaded the 19:16Z fix.

**Delayed agent messages (INFERRED).** The agent sessions and the console ran on the same laptop. It was asleep 19:35 to 19:50, 21:26 to 21:53, 23:08 to 23:48 and 00:38 to 00:49 (CONFIRMED, pmset), and the console was CPU-bound. Nothing records message latency directly.

**Mac sleep (CONFIRMED).** Clamshell sleep on battery five times between 19:35Z and 01:20Z. The 23:08 to 23:48 sleep covered the whole 23:25 to 23:29 expiry of the priced packages. The briefing said 21:50Z and ~23:3xZ; the power log shows 21:26 to 21:53 and 23:08 to 23:48.

**Quote expiry (CONFIRMED).** Priced packages carry `sendWindow.governedBy: QUOTE_AGE`, `maxAgeHours: 6`, and quotes printed 17:25 to 17:29Z. Re-exports at 18:11 and 20:11 kept the same quote times, so the deadline never moved: 23:25 to 23:29Z, 31 to 214 minutes before tip.

**Late fallbacks (CONFIRMED).** No fallback package existed before 22:13Z, after the first recommended send time (22:00Z). Fallbacks were introduced on the day, after anomaly review withheld most priced game posts. Nine were refused for provenance, and four (909, 910, 917, 921) arrived at 23:52Z, 38 minutes before the first of them expired.

**Does monitoring guarantee execution? No (CONFIRMED).** The scheduler is a 30 s `setInterval` inside the local console process (`server.mjs`), and it does not run while the Mac sleeps. Precedent: on 11-01 the NFL post was marked MISSED at 04:46:20Z, the same second the Mac woke from hibernate, 3 h 26 min after kickoff. Alerts are written by the same process, so the outage it should report also silences the alert.

**Why so many graphics iterations (CONFIRMED).** There were 20 export directories and 134 distinct package versions. The causes were:

- Data churn: 6 green `daily-products` runs from 17:49Z and 28 `nba-forecast-window` runs (13:47Z to 02:54Z) produced new data commits. Data commit changes caused 68 `new-version` imports.
- Anomaly withholding re-exports (18:14, 20:11).
- A format change from game posts to game-winner fallbacks (22:13).
- Repeated refusal and re-export cycles.
- Founder caption and design passes (`clean-1102w-phone`, `car`, `ton`).

**Uncertain-outcome reconciliation without duplicates (CONFIRMED in code, not exercised on 11-02).** `publish-flow.mjs` takes the ledger claim `xlive|<postId>|<attempt>` before the request. Any PUBLISHED or UNKNOWN result blocks another send (`OUTCOME_UNKNOWN`, "never re-sent automatically"). `reconcile()` accepts a founder-supplied X link, an API lookup with `notBefore`, or "not posted"; only a confirmed not-posted outcome allows a retry. The one send returned a post id in 1.8 s, and the claims `xlive|…|0`, `publish|post-134ea5fa2499` and `xpost|2117411539737010184` are present.

## Root causes

| # | Root cause | Class | Evidence |
|---|---|---|---|
| 1 | Approvals were never possible inside the windows. Priced send windows were fixed at quote + 6 h (23:25 to 23:29Z), and every re-export reset review without refreshing quotes. | CONFIRMED | `sendWindow`/`freshness` in held packages; 68 new-version imports; 0 decisions before 00:19Z |
| 2 | The founder console could not keep up: 700 ms polling against a state read of tens of MB, with full re-renders. | CONFIRMED (code); latency figures from transcript | `app.js` at b98955537b~1 vs claude/cc-importer; commit message |
| 3 | Execution and monitoring depend on one laptop that slept on battery. | CONFIRMED | pmset; 11-01 MISSED at wake; `server.mjs` setInterval |
| 4 | Upstream data was not stable until 17:49Z, and churned afterwards. `daily-products` was red 3 times before then, and each new data commit forced new versions. | CONFIRMED | runs 41422443608, 41456023268, 41485942897; dataCommit per version |
| 5 | The packaging pipeline was fragile: exports pinned to a non-main commit (9 refused), files moved during import (8 refused), and fallbacks first built after their own send time. | CONFIRMED | import-a9c3b64b5384, import-e9db74907973, import-aa8e6dcbd330; `clean-1102final` mtime |
| 6 | Most priced game posts were flagged for anomaly review on the day (12 of 15). | CONFIRMED | `anomalyCheck`/`reviewAnomalyCheck` in held files |
| 7 | The sent post's windows disagree. `commandCenter.firstStartUtc` was 00:30Z, but `sendWindow.latestValidSendUtc` was 00:00Z and the card shows OKC @ CLE as STARTED. It was sent 00:20Z under a founder exception; the gate followed `expiresAt`/`firstStartUtc` and did not flag the conflict. | CONFIRMED | package file `nba-2026-11-02-nba-tonight-full-slate-snapshot.json` |

## Contributing factors

- **Coordination overhead.** Three roles (Command Center, Launch Readiness, Program Director) and the founder exchanged packages through a shared folder. The folder had no lock, so files moved mid-import.
- **Late directive changes.** The founder exceptions (flagged cells withheld; full-slate snapshot), the fallback format and the caption changes were all decided on the day.
- **Code changes during the window.** 18 Command Center commits landed between 15:48Z and 00:36Z, including two queue rewrites at 23:01Z and 00:36Z, while the console was in use.
- **No early cut-off.** Nothing defined a send-by time or a "post the fallback now" decision before the first deadline.

## Unresolved uncertainties

- Which Command Center commit the running console was on at each hour, and whether browser tabs reloaded after 19:16Z.
- The founder's actual console load times. The figures come from transcript cross-checks, not server logs.
- Status reclassifications are not ledgered. The intra-afternoon changes to READY, REVIEW and blocked can be reconstructed only from package files.
- Whether any agent message was queued while the Mac slept.
- Why exports were pinned to affe58dead92 (a checkout on `claude/p2-social-pack`).

## Corrective actions

| # | Action | Owner | Acceptance test |
|---|---|---|---|
| 1 | Move the scheduler and alerting off the laptop (hosted worker), and send missed-window alerts from an independent host. | Command Center | With the laptop powered off, a test job publishes in dry-run within 60 s of `dueAt`. A job with no approval 60 min before start raises an alert within 2 min. |
| 2 | Make `/api/state` incremental: under 1 MB and under 1 s, with no re-render while a control has focus. | Command Center | A replay of the 11-02 ledger gives p95 `/api/state` < 1 s and payload < 1 MB. A scripted approve click succeeds while imports run every 60 s. |
| 3 | Ledger every status change (blockers added or cleared, window closed). | Command Center | Replaying 11-02 yields one event per transition; the console shows the reason and the time it closed. |
| 4 | Refresh quotes, or switch to the unpriced fallback, automatically. Produce fallbacks at first export, never later. | Launch Readiness | For a test slate, every priced package has a fallback with the same dedupe base at T0. No package has `latestValidSendUtc` earlier than tip minus 60 min without a refreshed quote. |
| 5 | Export only from a main commit, and publish to the inbox atomically (write to temp, then rename; no moves out of `packages/` during a run). | Launch Readiness | An export from a non-main commit fails before writing. 100 concurrent import and export cycles produce 0 ENOENT refusals. |
| 6 | Data freeze: `daily-products` green and the slate frozen by T−5 h. After the freeze, a new version only for a changed number. | Launch Readiness | The 11-02 replay produces ≤ 2 versions per post; `new-version` without a claim change is refused. |
| 7 | Daily publishing runbook: send-by times, a fallback decision at T−3 h, no Command Center deploys from T−4 h to last tip, and the laptop on AC with sleep disabled while it remains the publisher. | Program Director | The checklist is signed per slate; the deploy log shows 0 Command Center commits in the freeze window; pmset shows no sleep during it. |
| 8 | One review block: approve or decline the slate by T−3 h; on-day exceptions are recorded with an owner and an expiry. | Founder | The ledger shows decisions on ≥ 90% of imported posts before their recommended time on the next 5 slates. |
| 9 | The gate refuses when `sendWindow.latestValidSendUtc` and `expiresAt` conflict unless an exception id is cited. | Command Center | A unit test with the 11-02 snapshot package refuses without an exception id and passes with one. |
