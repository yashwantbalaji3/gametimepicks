# `soccer/epl/odds/`

**Snapshot per capture.** One file per capture instant, named for that instant. Files are never
regenerated in place.

That rule is the entire reason movement is expressible here. The MLB market domain has no opening
line and no movement concept precisely because its artifact is rebuilt over itself — the earlier
observation is gone, so any "movement" figure would be invented. Keeping snapshots is what makes the
difference between two captures a measurement instead of a claim.

With one snapshot, the preview surface reports `SINGLE_CAPTURE` and shows no movement.

## Row shape

- `eventId`, `kickoffIso` — kickoff is repeated on the row so eligibility is checkable without
  joining the fixture artifact.
- `capturedAt` — per row. **Must precede `kickoffIso`**; a row that does not is rejected.
- `market` — `MATCH_RESULT_1X2` only. Totals and both-teams-to-score are not shipped until a real
  provider payload proves consistent line points, all sides present, and per-row capture timestamps.
- `book` — the bookmaker key the prices came from.
- `prices` — American odds for `HOME`, `DRAW`, `AWAY`. All three required; a two-way payload is not a
  soccer result market and fails closed rather than publishing home/away figures inflated by the
  missing draw.

De-vig is applied at read time (`app/src/lib/soccer/epl-markets.ts`), never stored, so the raw price
and the derived probability can never disagree.

## Committed contents

Two `FIXTURE_SAMPLE` snapshots of the same synthetic slate, at `09:00Z` and `18:00Z`, so the
multi-snapshot path has a committed case. Both are `"public": false` and are swept out of the
deployed export. Prices are illustrative, not observed.
