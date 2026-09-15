# MLB finals history — 2023–2025 regular seasons (INTERNAL RESEARCH DATA)

Founder-approved in Phase 6 (§6.1): regular-season **final scores + venue identity** for 2023, 2024 and 2025, acquired
from the free MLB StatsAPI schedule endpoint the site already uses for finals and lineups. No API key, no credits, one
host. Acquisition and validation **only** — nothing here is fitted, registered, adopted, or read by any live code path.

Written by `scripts/research/mlb/backfill-mlb-finals-history.mjs`.

## Why this is NOT in `data/internal/mlb/linescores/`

The prerequisite note (`data/internal/research/mlb/reports/totals-differentiation-prerequisites.md` §2) proposed the
existing `linescores/` directory. Reading the consumers first showed that directory is a **live production input**, not
an archive. Two committed scripts read all of it and fold every final they find into team run rates that reach the
**public** full-game simulations:

| consumer | filter | effect if history landed there |
|---|---|---|
| `app/scripts/build-mlb-model-inputs.mjs` → `teamRunRatesBefore(date)` | only `fileDate < date` | `"2023-05-04" < "2026-09-16"`, so three historical seasons pass the guard |
| `app/scripts/ingest-mlb-independent-inputs.mjs` → `teamRunRates()` | none at all | every historical game included unconditionally |

Both feed `data/internal/mlb/model-inputs/` → `full-game-sim` artifacts → public simulations. Phase 6 §6.1 allows data
acquisition and explicitly forbids changing public probabilities, so the archive is stored separately and no live
consumer reads it. A future research session points at this directory by name.

`scripts/research/mlb/venue-run-environment.mjs` also globs `linescores/` and stamps its receipt "season 2026 only" —
that provenance line stays true because the history is not in that directory.

## Layout

```
data/internal/mlb/linescores-history/
  manifest.json          acquisition provenance: endpoint, script id, first/last acquired, per-run per-season counts
  2023/<date>.json       one file per regular-season date
  2024/<date>.json
  2025/<date>.json
```

Validation receipt: `data/internal/research/mlb/reports/finals-history-validation.json`.

## Per-date file

```jsonc
{
  "schemaVersion": 1,
  "artifact": "mlb-finals-history",
  "dataClass": "PRIVATE_RESEARCH",
  "date": "2024-07-04",
  "season": "2024",
  "source": "statsapi",
  "sourceEndpoint": "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-07-04",
  "script": "backfill-mlb-finals-history@1",
  "scheduledCount": 15,        // every game the date returned, any gameType
  "regularSeasonCount": 15,    // gameType "R"
  "finalCount": 15,            // rows actually stored
  "excludedNonRegular": 0,     // spring/all-star/exhibition/postseason on this date
  "excludedOtherOfficialDate": 0, // rows the payload returned whose officialDate is a different day
  "excludedNonFinal": 0,       // postponed, suspended, cancelled, in-progress
  "malformedRows": 0,          // rows with no gamePk — counted, never guessed
  "games": [{
    "gamePk": 746427, "officialDate": "2024-07-04", "season": "2024",
    "gameType": "R", "doubleHeader": "N", "gameNumber": 1,
    "home": { "id": 120, "name": "Washington Nationals" },
    "away": { "id": 134, "name": "Pittsburgh Pirates" },
    "homeRuns": 1, "awayRuns": 7,
    "venue": { "id": 3309, "name": "Nationals Park" },
    "isFinal": true, "status": "Final", "abstractState": "Final"
  }]
}
```

## Contract

- **Final only.** Same finality rule as the settlement parser: `abstractGameState === "Final"`, coded state not
  `C`/`D`/`U` (cancelled/postponed/suspended), and both scores present. A postponed game reaches "Final" with no
  score — it never enters the table.
- **Regular season only.** `gameType === "R"`. Anything else on the same date is counted in `excludedNonRegular`,
  never silently dropped.
- **Nothing imputed.** A missing venue or missing score is recorded as missing. No league means, no zeros.
- **Fail closed per date.** A structurally malformed payload writes nothing for that date and records the failure.
- **Identity.** `gamePk` is canonical; teams carry StatsAPI ids *and* names (the schedule payload has no abbreviation
  without a hydrate param, so none is invented); doubleheaders are distinct `gamePk`s on the same date.
- **One row per game.** A game is stored under its OWN `officialDate`. A game suspended on one day and completed the
  next appears in the later day's payload still carrying its original date, so filing everything a payload returns
  counts it twice — measured at exactly 14 rows across 2023–2025, which inflated each season's finals by its own
  duplicate count. Those rows are counted in `excludedOtherOfficialDate` and stored only under their own date.
  Doubleheaders are unaffected: one official date, two distinct `gamePk`s.
- **Byte-stable.** Per-date files carry no wall-clock timestamp, so re-fetching a completed date reproduces an
  identical file — the same determinism property `app/scripts/fetch-mlb-linescores.mjs` has. Acquisition timestamps
  live in `manifest.json`, which is where provenance belongs when the data itself is immutable history.
- **Resumable + idempotent.** A date whose file already parses at this schema version is skipped; `--refetch` forces.
- **Private.** `data/internal/**` is outside `app/`, so nothing here reaches the static export. It must stay that way.

## What this does NOT authorize

Phase 6 §6.1: no park model, no totals challenger, no change to public MLB totals (still **PAUSED**), no unpausing,
no sportsbook lines as inputs, no second look. P331 is **not run** in Phase 6. The next step is a preregistered,
walk-forward park-environment study in a future Fable session, which must declare its protocol before scoring.

## Attribution

Data courtesy of the MLB Stats API. Per MLB's terms, use is non-commercial/informational and the source is attributed
here and on the public site's data-sources listing.
