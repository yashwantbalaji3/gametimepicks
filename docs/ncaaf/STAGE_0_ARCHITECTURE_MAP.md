# NCAAF V1 — Stage 0 architecture map

Branch `dp/ncaaf-v1` · base main `2ba7dc13f9f23b847353abd44936a9ea61c927bc` (2026-10-08) · directive inspected
at `56b8cf42…`. Read-only stage: no source, data, registry or workflow file changed.

## 1. Current NCAAF state on main

- **No NCAAF code, data, capability row, source row, owner, ledger sport or route exists.** Searched
  `app/`, `pipeline/`, `scripts/`, `docs/`, `data/`, `app/public/data/` for `ncaaf|college football|cfbd`.
  The only hits are `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` §12 (`NCAAF-001` data foundation, `NCAAF-002` game
  model, both `NOT_STARTED`, "DP-owned, independent lane") and two NFL raw ESPN captures mentioning college.
- `capabilityOf("ncaaf")` therefore returns `UNKNOWN_SPORT` → `DISABLED`, which is the correct fail-closed
  starting state. Nothing NCAAF can render publicly today.
- No remote branch name references NCAAF. Active remote work (2026-10-08) is NFL world model, UX nav, ops.
- Open-PR metadata **not read**: GitHub CLI is not installed and the repo is private. PRs #1016 (MLB Sim
  totals) and #716 (nightly settlement publication) are named in the directive; NCAAF stays clear of both.

## 2. The flow NCAAF must follow (as it exists for NFL / NBA)

```
source (registry row)            app/src/lib/sports/source-registry.mjs           [shared]
  → capture script               app/scripts/<sport>/capture-*.mjs                 [sport-local]
    → raw/internal artifact      data/internal/research/<sport>/…  (never exported) [sport-local]
      → corpus / model / eval    app/src/lib/sports/<sport>/*.mjs + scripts         [sport-local]
        → write-once receipts    data/internal/<sport>/forecast-receipts/<d>/<id>.json (NFL pattern)
          → owner grader         app/scripts/<sport>/grade-*.mjs → append-only grade log
            → Forecast Ledger    app/src/lib/forecast-ledger/adapters/<sport>.mjs  [shared]
              → Results / Ask / Research readers                                   [shared]
capability gate                  app/src/lib/sport-capability-registry.ts          [shared]
daily owner                      app/src/lib/sports/sport-owners.mjs + workflow     [shared, CODEOWNERS for workflow]
public exposure                  app/scripts/prune-internal-routes.mjs (deny-by-default on out/data) [CODEOWNERS]
```

Closest analog: **NBA** (newest sport, SHADOW model, write-once receipts, research corpus, baselines first,
`HISTORICAL_ONLY` capability). Language: JavaScript `.mjs` under `app/` — every sport added since the MLB
Python board uses it. **No Python is needed for NCAAF V1** unless Stage 1 finds a Python-only source.

## 3. Reusable interfaces

| Need | Reuse | Notes |
|---|---|---|
| Forecast row shape, measurement | `forecast-ledger/{contract,identity,measure,row}.mjs` | `SPORTS` allowlist lacks `NCAAF` → proposal only |
| Identity hash | `forecastIdFor()` (`fnv1a64` of sport\|event\|subjectType\|subjectId\|family\|kind) | NCAAF ids must be prefixed (`ncaaf-team-<id>`) so they can never collide with `nfl-team-<id>` |
| Event identity | `app/src/lib/identity/event-identity.ts`, `sport-adapter.ts` | read before Stage 1 mapping |
| Coherent sims | `sports/nfl/joint-game-sim*.mjs`, `game-sim.mjs` | **structure** only — NFL parameters are not NCAAF parameters |
| Baselines / eval | `scripts/nba/evaluate-nba-baselines.mjs`, `lib/model-eval/` (CODEOWNERS) | read, don't modify |
| Measurement kinds | `CONTINUOUS_PROJECTION` (scores/margin/total), `BINARY_PROBABILITY` (win) | covers V1 targets without schema change |

## 4. Shared / reserved files (founder or shared-owner decision required)

`sport-capability-registry.ts` (add `ncaaf` row) · `source-registry.mjs` (new source rows) ·
`sport-owners.mjs` + any workflow (`.github/workflows/`, CODEOWNERS) · `forecast-ledger/contract.mjs`
`SPORTS` + `build-forecast-ledger.mjs` adapter import · `sport-identity.ts` · `sports-coverage.ts` /
`sport-capabilities.ts` · navigation · `prune-internal-routes.mjs` (CODEOWNERS) · `model-eval/` (CODEOWNERS)
· `products/eligible-leg/` (CODEOWNERS) · `package.json` / lockfile.

Guard tests that will react to any of those edits: `sport-capability-registry.test.mjs` (evidence paths must
exist), `sport-capability-evidence.test.mjs`, `sport-owners.test.mjs` (owner workflow must exist and be
scheduled), `schedule-contract.test.mjs`, `forecast-ledger.test.mjs`. Because of these, a registry entry
cannot honestly be added until real evidence files exist.

## 5. Proposed NCAAF paths (none exist yet)

| Path | Purpose |
|---|---|
| `app/src/lib/sports/ncaaf/` | pure logic: ids, schedule/result normalisation, ratings, model, sim, receipts, grading + `*.test.mjs` |
| `app/scripts/ncaaf/` | bounded capture, corpus build, evaluation, local receipt/grade runners |
| `data/internal/research/ncaaf/` | derived, committed-size-limited research artifacts (not under `app/public/`) |
| raw provider bodies | gitignored local cache only (exact location chosen in Stage 1 after checking `.gitignore`) |
| `docs/ncaaf/` | this map, data capability matrix, preregistration, stage handoffs |

**Explicitly excluded:** every other sport's `lib/sports/*`, `scripts/*`, `data/**`, `app/public/data/**`;
all CODEOWNERS paths; workflows; Bank Builder / Moonshot / Mr Dub / parlays; Ask contracts; lockfiles.

## 6. Missing extension points (to propose, not apply)

1. `NCAAF` in `forecast-ledger/contract.mjs` `SPORTS` + an `adapters/ncaaf.mjs` import in the builder.
2. An `ncaaf` row in the capability registry (start at `RESEARCH_ONLY`, with evidence).
3. Source-registry rows for whichever NCAAF sources Stage 1 verifies.
4. A daily owner workflow — only if NCAAF ever leaves research.

## 7. Next bounded step — Stage 1 (data capability)

Build the §6 matrix from primary documentation plus small, bounded, free, keyless probes. Candidate sources to
**verify** (nothing assumed): ESPN site API college-football scoreboard/summary (same usage class as the
existing `espn_scoreboard` row), CollegeFootballData.com API (needs a free account key that DP must create
personally), weather (no authorized source exists today — `nfl_weather_unsourced` is BLOCKED), historical
odds (likely paid → founder decision).
