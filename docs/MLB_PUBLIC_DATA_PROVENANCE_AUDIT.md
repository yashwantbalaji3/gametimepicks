# MLB Public Data-Provenance Audit

_What provenance each public MLB projection's underlying artifact actually contains, vs what is currently shown.
Artifact-backed — every field below was confirmed by opening `app/public/data/mlb/game-simulations/<date>.json` +
`team-markets/<date>.json`. No inferred fields._

## Field inventory

| Public field | Artifact source | Available | Currently shown | Accuracy importance | Recommended treatment |
|---|---|---|---|---|---|
| generatedAt (sim) | `game.freshness.generatedAt` / top `generatedAt` | ✓ | partial (day-granular only) | medium | show ET time-of-day |
| simulation run count | top `runCount` (10000) | ✓ | ✓ (report) | low | keep |
| line | `pick.line` | ✓ | ✓ | high | keep |
| line source (bookmaker) | `game.marketSnapshot.bookmaker` | ✓ | ✗ | low | optional caption |
| market probability | `pick.marketProbability` | ✓ | ✓ | high | keep |
| **market capturedAt** | `game.marketSnapshot.capturedAt` / `freshness.sourceCapturedAt` | ✓ | **✗ (shown to no one)** | **high** | **surface — the #1 fix** |
| **event start (first pitch)** | `team-markets[gameId].commenceTime` (join by gameId) | ✓ | ✗ | high | surface + join |
| **minutes: capture → first pitch** | derived (`commenceTime − capturedAt`) | ✓ (derivable) | ✗ | high | "captured 1h 44m before first pitch" |
| lineup status (batters) | — (MLB boards carry only `probablePitcher`; no batter lineup field) | ✗ | ✗ | high | LINEUP_PENDING status; do not fabricate |
| probable/confirmed pitcher | board `probablePitcher*` | partial | partial | medium | reflect probable, never "confirmed" |
| feature completeness | `game.unavailableModules` + per-pick `marketProbability` presence | partial | partial | medium | drive completeness status |
| simulation uncertainty / distribution | `game.distributions[key]` (`bins[]` + `sampleCount`) | ✓ | partial (report only, not board) | medium | expose percentiles/band on more surfaces |
| public data-status | `game.status` ("ready") + `FreshnessBadge` (client ET) | partial | partial | medium | formal completeness-status model |

## Key findings

1. **The market/line capture time exists in every sim artifact but is shown to no one.** This is the single
   highest-leverage transparency fix: with `marketSnapshot.capturedAt` and the game's `commenceTime` (from
   team-markets), we can tell every user *how stale the compared price was* — "market captured Nh Nm before first
   pitch" — with no new modeling.
2. **First pitch is not in the sim artifact** but IS in `team-markets[gameId].commenceTime`; the transparency layer
   must join by `gameId`. When team-markets is absent for a game, the first-pitch/minutes fields are honestly null.
3. **Full 10,000-run distributions already exist** (`game.distributions[key].bins`) — uncertainty is real, not
   fabricated. It is currently only rendered on the sim report; it can be surfaced (percentiles/range) more widely.
   The per-PICK object has no sigma/percentiles — the distribution lives on `game.distributions`.
4. **Batter lineup confirmation does not exist** in the MLB artifacts (only `probablePitcher`). So a batter prop can
   only ever be LINEUP_PENDING or (for pitchers) reflect the probable starter — never "confirmed". Do not fabricate.

## Non-negotiables for the transparency layer

- Never label a post-first-pitch capture as pregame.
- Distinguish a MISSING timestamp (null → "Capture time unavailable") from a real value.
- Never expose internal file paths or research-eligibility fields.
- Simulation uncertainty (distribution spread) ≠ model-validation confidence (the research gate is BLOCKED) — the UI
  must not conflate them.
