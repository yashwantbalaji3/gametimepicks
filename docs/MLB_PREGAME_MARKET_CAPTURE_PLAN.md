# MLB Pregame Market Capture — design + implementation (2026-07-21)

Internal-only, forward-only, credit-guarded capture of MLB pregame **market** snapshots (paid the-odds-api) into the pregame research archive. No modeling, no public change, no product/money change. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged.

## Goals
Capture pregame market snapshots forward-only · prove every market existed before first pitch · store raw+normalized immutably with provenance+hashes · support future market-movement + model-vs-market research · keep the public product unchanged.

## Market families
- **Team markets (implemented):** `h2h` (moneyline), `spreads` (run line), `totals` (game total). Default `--markets h2h,spreads,totals` ≈ **3 credits/run** for the whole slate.
- **Team totals / inning markets:** capture when the provider exposes them (add to `--markets`).
- **Player props (future / credit-budgeted):** per-event endpoint, more credits — not captured by default. Over-only props are recorded as market context but not de-vigged.

## Provenance (per record)
`source: the-odds-api` · endpoint · sportKey `baseball_mlb` · marketKey · bookmaker · `sourceLastUpdate` (provider `last_update`) · `capturedAt` · `eventStartTime` · `availableAt` · `rawHash` · `normalizedHash` · `researchEligible` + `eligibilityReason`.

## Timestamp rule
`researchEligible = capturedAt < eventStartTime AND availableAt < eventStartTime AND eventStartTime known AND provenance recorded`. `availableAt = min(provider last_update, capturedAt)` — conservative when `last_update` is absent (`= capturedAt`). Started games are skipped.

## De-vig (`src/lib/mlb/pregame-archive/market-normalizer.ts`, pure + tested)
Proportional: `fair(side) = implied(side) / (implied(side) + implied(other))` — computed **only** when the two-way pair is complete at the same line (h2h both teams; totals/spreads both sides). Over-only / unpaired ⇒ `noVigProbability: null`, `deVigStatus: over_only_or_unpaired`. The missing side is never inferred.

## Credit controls
Dry-run is the **default** (0 credits — checks remaining via the free `/sports` endpoint + estimates). `--write` is credit-guarded: aborts if `remaining < ODDS_API_MIN_CREDITS_REMAINING + estimate`, honours `--max-credits`, skips started games, no loops.

## CLI
```
node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22                       # dry-run (default, 0 credits)
node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22 --markets h2h,totals   # subset
node app/scripts/capture-mlb-pregame-markets.mjs --date 2026-07-22 --write --max-credits 50  # credit-guarded write
```

## Storage (immutable)
`data/internal/mlb/pregame-archive/market-snapshots/<date>/<captureId>/{raw.json, normalized.json, manifest.json}` — new capture = new immutable directory (never overwritten). **Large payloads (raw + normalized) persist via workflow ARTIFACTS and are gitignored**; only the small `manifest.json` (durable provenance + hashes + counts) is committed in-repo.

## Executed
A single validation write ran for **2026-07-22** (team markets, `~3` credits): **1,404 records, all 1,404 research-eligible** (all games pregame), de-vig ≈ 68.9%, gamePk mapped, e.g. FanDuel Guardians −154 → implied 0.606 → **no-vig 0.582**. Credits remaining 15,415.

## Workflow (opt-in)
The capture workflow runs market capture only when repo variable `PREGAME_ARCHIVE_MARKETS=true` **and** secret `ODDS_API_KEY` is set — non-blocking, credit-guarded, StatsAPI capture unaffected if skipped.
