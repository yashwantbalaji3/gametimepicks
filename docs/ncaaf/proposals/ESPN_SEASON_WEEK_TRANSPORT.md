# Proposal: season-week scoreboard URL builder in the shared ESPN transport owner

**Status: NOT APPLIED.** It touches a shared file (`app/src/lib/sports/espn-scoreboard-window.mjs`), so it
needs the transport owner's and founder's review. Patch: `espn-season-week-transport.patch` (applies cleanly
to `dp/ncaaf-v1`; verified with `git apply --check`).

## Why it is needed (a CI failure this branch introduces)

`app/src/lib/sports/espn-scoreboard-callers.test.mjs` test 4 allows only the shared owner (plus single-day
callers) to spell a scoreboard URL with `?dates=`. The NCAAF scripts (`capture-season-to-date`,
`grade-shadow`, `probe-espn-coverage`, `run-shadow-forecasts`) query one **season + week + group** at a
time: `?dates=<YYYY>&seasontype=2&week=<n>&groups=<80|81>`. That is not a date window and not the dead range
form, but the guard (rightly strict) rejects it. **Until the patch lands, `npm run suite` fails that one test
on this branch.** Probe: ESPN ignores `season=` (answers the current season), so the season year must ride on
`dates=`.

## What the patch does

1. Adds `scoreboardSeasonWeekUrl(sportPath, { season, seasonType, week, group, limit })` to the owner: pure,
   validates its inputs (4-digit season, season type 1–3, positive week, numeric group), and builds exactly
   the URL the NCAAF scripts use today (byte-identical, so caches and receipts stay valid).
2. Switches the four NCAAF scripts to call it, so no NCAAF file spells `?dates=`.
3. **Does not change the guard.** With the patch applied, test 4 passes. (On Windows it still lists the EPL
   caller because of a path-separator mismatch, a pre-existing Windows-only artefact that does not occur on
   CI.)

Verified locally with the patch applied: guard green (apart from the Windows-only EPL artefact), eslint clean,
coverage summary rebuilt from cache with identical counts.
