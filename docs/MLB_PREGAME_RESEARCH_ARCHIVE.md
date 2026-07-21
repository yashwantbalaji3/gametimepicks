# MLB Pregame Research Archive — forward-only data pipeline (2026-07-21)

## Recommendation

```
BEGIN_FORWARD_COLLECTION
```

The pipeline is built, immutable, provenance-stamped, leakage-safe, and proven on a live slate (15/15 games captured before first pitch). It captures what StatsAPI reliably provides pregame now; markets + bullpen are honest, documented gaps. Nothing public/product/money/settlement changed. Start collecting daily; a future challenger mission may begin only after the collection gate is met **and** founder approval.

## What this is (and is not)

A **shadow research pipeline** that records, immutably, *what was known, when, and from where* before first pitch — so a future leakage-safe challenger experiment has the pregame data the historical archive never captured. It performs **no modeling**, changes **no** public UI / products / eligibility / money / settlement, and **never backfills** a missing pregame value from postgame data. Every record: `public:false`, `approvedForProduction:false`, `productEligible:false`.

## The one rule

`researchEligible = present AND capturedAt < eventStartTime AND availableAt < eventStartTime AND a proven source timestamp.` Anything captured at/after first pitch, or whose source timing is unproven, is **ineligible** — never inferred (`src/lib/mlb/pregame-archive/eligibility.ts`).

## Source coverage (by family)

| family | implemented | source | timestamp | initial coverage (2026-07-21) | limitation |
|---|---|---|---|---|---|
| pitcher_status | ✅ | StatsAPI schedule/feed probablePitcher | capturedAt | **15/15** | projected pitch count is INTERNAL_ESTIMATE only |
| environment | ✅ | StatsAPI feed weather + roofType | capturedAt | **15/15** | forecast issue-time not exposed; observed postgame weather forbidden |
| umpire | ✅ | StatsAPI feed boxscore.officials | capturedAt | **4/15** (more post closer to game) | final box-score umpire never substitutes |
| confirmed_lineup | ✅ | StatsAPI feed boxscore.battingOrder | capturedAt | **1/15** (lineups post ~1-3h out) | final box-score lineup never backfills → multi-snapshot cadence needed |
| markets | ⛔ | the-odds-api (paid) | provider + capturedAt | 0 | **capability defined, credit-gated — not fetched** (founder: approve paid source) |
| bullpen | ⛔ | derived from completed prior games | capturedAt | 0 | builder pending (strict completed-before rule) |
| plate_appearance_opportunity | ⛔ | markets + lineup | inherited | 0 | pending markets |

## First collection run

- **Scheduled 15 · processed 15 · snapshots 15 · captured-before-first-pitch 15 · post-start rejected 0.**
- Eligible-family coverage: pitcher_status 15, environment 15, umpire 4, confirmed_lineup 1.
- Freeze: 15 `FINAL_PREGAME_FREEZE` events. Audit: 1 date collected.

## Research readiness

| gate | current | threshold | met |
|---|---|---|---|
| distinct dates | 1 | 30 | ❌ |
| settled-eligible obs | 0 (set by a later settlement-join mission) | 500 | ❌ |
| feature coverage | (grows with cadence) | 80% | pending |
| timestamp-proven | 100% of eligible | 90% | ✅ |

**Earliest honest research date:** cannot be promised — it depends on future slate volume and how many dates clear the gate. At ~15 games/day and multi-snapshot lineup capture, ~30 dates is roughly a month of daily collection; the settled-eligible count is only known after a separate settlement-join mission.

## Architecture

- `app/scripts/capture-mlb-pregame-research.mjs` — forward capture (StatsAPI), immutable snapshots + provenance + hashes.
- `app/scripts/freeze-mlb-pregame-research.mjs` — `FINAL_PREGAME_FREEZE` per event (latest eligible pregame snapshot per family).
- `app/scripts/audit-mlb-pregame-archive.mjs` — coverage / quality / gate-progress → `status/latest.json`.
- `src/lib/mlb/pregame-archive/eligibility.ts` — timestamp/freshness/eligibility + collection gate (pure, tested).
- `data/internal/mlb/pregame-archive/` — schema.json, source-registry.json, snapshots/, freezes/, manifests/, status/ (all `public:false`, never served).
- `.github/workflows/mlb-pregame-capture.yml` — **ENABLED** scheduled capture (~8 daily UTC runs + `workflow_dispatch`), non-blocking, never runs on `pull_request`, never blocks board/settlement/build/money. Persists via artifacts (safe default) + opt-in path-scoped commit (`PREGAME_ARCHIVE_COMMIT=true`). Cadence + limits + gate in `docs/MLB_PREGAME_COLLECTION_OPERATING_PLAN.md`.
- Guards: `app/src/lib/mlb-pregame-archive-guards.test.mjs`.

## Cadence

Recommended captures per event: T‑24h, T‑6h, T‑3h, T‑90m, T‑60m, T‑30m, T‑10m, plus event-driven (pitcher change, lineup confirmed/changed, scratch, weather change, market move) — each a NEW immutable snapshot. The `FINAL_PREGAME_FREEZE` is created ~T‑10m without crossing first pitch. Scheduling is dormant until run on the repo's scheduler (or manually daily).

## Public impact / integrity

```
public UI changed: no
official picks changed: no
product eligibility changed: no
money changed: no          (portfolio.json md5 affe6b21071f2b3be96bb2774eb347c3 unchanged)
settlements changed: no
modeling performed: no
```

## Founder decisions

- **Approve a paid odds source** (the-odds-api) + its storage terms → unlocks the markets + plate-appearance-opportunity families (the highest-value pregame signal the market may underweight is itself the market, so this is mainly for reproducible de-vig + team/game totals).
- **Confirm the collection cadence** (how many daily snapshots to run) vs provider limits.
- **Authorize the later modeling mission** only after the collection gate is met.
