# `soccer/epl/` — EPL artifact root

Competition-scoped root for English Premier League market-intelligence artifacts.

## Why this root exists

Every soccer artifact before this one lives under `public/data/world-cup/`, which is a **closed
destination** (guard: `app/src/lib/world-cup-closeout.test.mjs`) and which holds two incompatible
graded schemas in a single directory. Writing EPL output there would resurrect a closed surface and
inherit a directory nothing can parse uniformly.

The root is competition-scoped by design. A second competition gets `soccer/<competition>/`, never a
shared flat pool — because a fixture identified only by its participants collides the moment two
clubs meet twice.

## What may be written here

| Subdirectory | Contents | State today |
|---|---|---|
| `fixtures/` | One artifact per fixture-list capture: clubs, kickoff (UTC), lifecycle state, provider aliases | sample only |
| `odds/` | **Snapshot per capture**, never regenerated in place. One file per capture instant | sample only |
| `results/` | Official final scores | **empty — no approved results source** |
| `settlement/` | Graded output | **empty — settlement is switched off** |

## Rules the schema enforces (not conventions — validation)

1. **Per-row `capturedAt` and `kickoffIso`.** A file-level `generatedAt` describes the build, not the
   row, and cannot prove a row was pregame.
2. **`capturedAt` must precede `kickoffIso`.** A row that violates it is *rejected*, from the first
   artifact onward. Equality is not pregame.
3. **No modelled fields.** `MODEL_FIELD_KEYS` in `app/src/lib/soccer/epl-artifacts.ts` is refused at
   validation. These artifacts are market intelligence; there is no EPL model.
4. **Provider ids are aliases.** `eventId` is ours, derived from competition + participants + kickoff
   to the minute. No artifact is keyed on a provider's fixture id, and nothing joins by club name.
5. **Nothing here is written under `world-cup/`,** and no World Cup surface reads anything here.

## Data classes

- `LIVE_CAPTURE` — a real ingest.
- `FIXTURE_SAMPLE` — a committed sample that pins the schema before the first real capture. Samples
  are `"public": false`, are swept out of the deployed export by `app/scripts/prune-internal-routes.mjs`,
  never count toward coverage, and never settle.

Everything committed today is `FIXTURE_SAMPLE`.

## Provenance

- Schema + validators: `app/src/lib/soccer/epl-artifacts.ts`
- Identity: `app/src/lib/soccer/epl-identity.ts`, `app/src/lib/soccer/epl-clubs.ts`
- Design: `docs/EPL_MARKET_INTELLIGENCE_PROTOTYPE.md`
- Implementation notes: `docs/EPL_PREVIEW_IMPLEMENTATION.md`
- Open founder decision: `docs/EPL_RESULTS_SOURCE_DECISION.md`
