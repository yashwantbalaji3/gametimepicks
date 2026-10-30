# Launch Readiness importer: the one contract

**Who does what (founder, 2026-10-30):**
- **Launch Readiness:** forecasts, sportsbook comparisons, rendering. It writes packages.
- **Command Center:** founder review, approvals, scheduling, publishing, engagement.
- Neither creates an official prediction on its own. The importer never recomputes or edits a number.

## Input

`~/gtp-private/graphics/packages/*.json`, schema `gtp-social-package@1`. Override the folder with `GTP_CC_IMPORT_ROOT`.

Run it from Review → **Import packages**, or `POST /api/import/packages` on the loopback console. It's safe to run any number of times.

## What the importer checks

**Refused (nothing is written):**
- wrong schema, bad JSON, malformed or mismatched `dedupeId`;
- no `contentSha256`, no images, no caption options;
- an image outside the import folder, not a PNG, wrong real size, or a failed checksum;
- a `snapshotRefs` file that doesn't hash to its sha at the package's data commit.

**Identity:**

| Situation | Result |
|---|---|
| Same `dedupeId`, same `contentSha256` | no-op (`duplicate`) |
| New content, earlier version is a draft | `new-version`; the old draft is superseded |
| New content, earlier version approved, scheduled, published or rejected | `held`; the earlier post is kept |
| Clean export of an approved review copy | `new-version`; the review copy's approval is invalidated by an appended record, and the clean image needs its own approval |

**Overlap:** a Command Center post for the same game, recap or Top 5 that is approved, scheduled or published blocks the import. An undecided draft is only noted.

## Types

| contentType | Kind | Publisher | Today |
|---|---|---|---|
| `RESULTS_RECAP` (NBA, NFL) | `lr-results-recap` | yes | review |
| `NBA_TONIGHT` | `lr-nba-tonight` | yes | review |
| `NFL_SUNDAY_WINNERS` | `lr-nfl-roundup` | yes | review |
| `NFL_MNF_WINNER` | `lr-nfl-mnf` | yes | review |
| `NBA_GAME_WINNER` | `lr-nba-game-winner` | yes | review, estimate label stays |
| `NFL_GAME_WINNER` | `lr-nfl-game-winner` | yes | review |
| `NFL_WEEKLY_TOP5` | `lr-nfl-top5` | yes | review; pass and rush yards blocked |
| `NBA_DAILY_TOP5` | `lr-nba-top5` | yes | blocked: not authorized for social, and it shows real lines |
| `NBA_BOXSCORE` | `lr-nba-boxscore` | no | private review only |
| `NFL_GAME_PLAYERS` | `lr-nfl-game-players` | no | unsupported until a sample package exists |
| `NBA_LIVE_UPDATE`, `NFL_LIVE_UPDATE` | `lr-live-update` | no | unsupported until a sample package exists |
| anything else | `lr-unsupported` | no | view only |

Each kind has its own design version (`gtp-lr-…@1`). Nothing can be approved until the founder approves that design.

## Blockers (can't be approved around)

- `LINE_RIGHTS_NOT_VERIFIED`: real sportsbook lines. No line or price text enters the ledger, and these images never go to the hosted store.
- `NBA_BOARDS_NOT_AUTHORIZED_FOR_SOCIAL`
- `BELOW_PUBLICATION_BAR`: NFL pass and rush yards.
- `UNSUPPORTED_TYPE`, `VERIFICATION_NOT_PASSED`, `TEST_DATA`, `WINDOW_CLOSED`, `OVERLAPS_EXISTING_POST`

## Review copies and clean exports

Today's images carry a FOUNDER REVIEW ONLY banner, so a package with `approval.socialAuthorized` false is a review copy. It can be approved, but never scheduled or sent.

1. The founder approves the review copy (after approving its design).
2. The Command Center writes `approvals/approved-for-clean-export.json` under the import folder.
3. Launch Readiness produces the clean export under the same `dedupeId`, with `socialAuthorized: true`. That file does not authorize real lines, NBA boards or uncleared estimates.
4. The clean export imports as a new version. The founder approves that image, then schedules it.

## Before every send

The publisher's one gate runs as for any post, plus this re-check, which fails closed:
- the source package still has the same `contentSha256`;
- date-pinned data files still hash the same;
- each game still has the same side and start in the official file (NBA also the same estimate);
- the window is open and the event hasn't started;
- no overlapping post has been approved or published.

## Content calendar

`contracts/content-plan.mjs` proposes times only:
- the recap goes two hours before the first game of that sport's slate;
- then roundup, Top 5, featured winners, player graphics, live updates;
- 20 minutes apart, at most 6 per sport per slate, at least 15 minutes before each post's start;
- slates use America/New_York.

Approving the calendar schedules nothing. Each post still needs its own approval and Schedule click, and any time can be typed instead.
