# Results V2 pilot: evidence note

Two pilot days are sealed under `data/results-projection/v1/`: NFL 2026-10-11 and NBA 2026-10-28. Both are labelled
`evidence: BACKFILL_GITHUB` and `validationStatus: SURVEY_MEASURED`. They are a backfill and stay separate from any future
live capture. Surveyed on `origin/main` at `f0ca00de2bcb491b7077de72bc57f3e5218cab55`.

## What `SURVEY_MEASURED` means

The founder's forecast-of-record policy (Option B) requires a revision served by a READY Production deployment before the
real start. A commit is not publication. `build-results-day.mjs` does not check deployments, so it claims neither `SERVED`
nor `VALIDATED`. The word records only the git measurement below, which was run by hand and is not reproduced at build.

## What was measured

NFL 2026-10-11. The frozen block in `data/internal/nfl/prop-settlement/2026-10-11.json` was copied from the committed player
board. For each of the 13 games, the newest commit of `app/public/data/nfl/player-board/<eventId>.json` before kickoff holds
every frozen prediction of that game's rows (695 of 695).

| Frozen at (UTC) | Commit | Committed (UTC) | Games |
|---|---|---|---|
| 2026-10-11T12:36:05Z | `860584f11510a0d12b6c3333bbf1ce148f100646` | 2026-10-11T12:36:49Z | 1 |
| 2026-10-11T16:53:08Z | `74472849a4389b0ca886ea234957286c81998763` | 2026-10-11T16:53:55Z | 8 |
| 2026-10-11T19:54:49Z | `95f97edfd8826f1675ec9c4a14229bb21361b086` | 2026-10-11T19:55:33Z | 3 |
| 2026-10-12T00:15:15Z | `3fb1d969083cda9f268d957b8ba9e5dc3936b1c2` | 2026-10-12T00:15:58Z | 1 |

The first commit of `app/public/data/nfl/live-props/<eventId>.json` came after kickoff, so that file is not cited as the
pregame source.

NBA 2026-10-28. `app/public/data/nba/experimental-public/2026-10-28.json` has one commit,
`47107e9d9db2752fd63ceb7157ac8ec24084158a` at 2026-10-28T16:04:50Z, before the first tip at 23:00Z. Each game's frozen time
and receipt hash are copied from that file.

## Not established

Whether a READY deployment served these revisions before each start. That is the next check before either day can claim more
than `SURVEY_MEASURED`.

## Founder rulings, 2026-11-02

- `claim` is an official betting result. It needs a verified qualifying reference, a verified snapshot and a verified
  settlement rule. `SURVEY_MEASURED` verifies none of them, so every row and game on both days is `NO_CLAIM`.
- Forecast accuracy stays separate: `absoluteError` per row and `meanAbsoluteError` per market.
- `/results/day` is noindex and outside the sitemap until release review.

## Founder rulings, 2026-11-03 (supersede the 11-02 side rules)

- No record from which a restricted sportsbook line can be reconstructed. A row with the frozen median, the actual and a
  side (or side result) against the hidden reference brackets that reference, so per-row `modelSide` and `sideResult` are
  gone from the sealed files, the public JSON and the CSV. The sealed files are committed to a public repository, so they
  count. `publicSafetyViolations` refuses any row carrying either key (or another per-row side key), a row reason that names
  a per-row comparison, a `"modelSide"` or `"OVER"`/`"UNDER"` string, and a CSV side column or OVER/UNDER cell.
- Rows keep prediction, actual, `absoluteError`, `measurement`, `claim` and `reason`. Rows that were side-compared, or whose
  median sat on the reference, now say `SIDE_AGGREGATE_ONLY`, so the file does not show which rows were compared.
- Side comparisons ship only as per-family day totals (`families[].side`): compared, correct, incorrect and a 95% Wilson
  interval, with `indistinguishableFromHalf`. A cell with fewer than 10 compared rows, or with zero correct or zero incorrect
  (an all-incorrect cell would bracket every compared row), is suppressed. Push and no-side counts are not published: a push
  count says some row's reference equals its actual. No bare rate field exists (`sideCorrectRate` and `winRate` are gone).
- No gold HIT tag and no percentage without counts and its interval. When the interval includes 50% the page says the result
  cannot be told apart from 50%.
- The NBA Elo official side vs the winner is a model pick vs the final, not a provider line. It stays per game, and the day
  total (8 of 12) carries the same Wilson interval: 39% to 86%, which includes 50%.
- Backfilled days stay private. The emit step publishes only days whose evidence is in `PUBLIC_EVIDENCE`, which is empty, so
  both `BACKFILL_GITHUB` pilot days write no public file and the index is empty. An empty index is valid. `/results` does
  not link to `/results/day`, which stays noindex and shows an honest empty state.
- When a day is published, the emit step writes a small day summary (families, games, player directory) plus one rows file
  per game, fetched when a reader opens that game or player, and a CSV of every row. All are scanned before writing.

## Counting rule worth knowing

Of the 695 NFL rows, 561 carry a frozen market object. Only 355 of those hold a numeric reference: the other 206 are anytime
TD rows with a yes price and no reference. All 355 had a model side before sealing, and none ships with one. 256 of them were
compared, and appear only in the day totals: receptions 74 correct, 56 incorrect of 130 (95% interval 48% to 65%) and
receiving yards 71 correct, 55 incorrect of 126 (48% to 65%). Both intervals include 50%. No median sits on its reference on
2026-10-11.

NBA has no captured reference in this pilot, so no player row has a side. The Elo official side is compared with the final at
game level, 8 CORRECT and 4 INCORRECT, and is `NO_CLAIM` like everything else on a `SURVEY_MEASURED` day.
