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

## Counting rule worth knowing

Of the 695 NFL rows, 561 carry a frozen market object. Only 355 of those hold a numeric reference: the other 206 are anytime
TD rows with a yes price and no reference. Every one of the 256 graded rows has a numeric reference.
