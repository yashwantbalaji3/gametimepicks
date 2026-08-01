# Forward-Only Research Corpus v1 (Program 096-099 Lane F — CAPTURE LIVE)

Leakage-safe forward data collection for the FUTURE preregistered protocol. **No production
model consumes any of these fields** (scientific stopping rule intact; market remains the
benchmark). Everything lives under `data/internal/research/` — outside `app/public`, so it can
never enter the static export by construction.

## Corpus contract (every row)

`eventId(or gamePk) · featureFamily · featureVersion · capturedAt · scheduledStart ·
source/providerRef · sourceAsOf · pregameEligible · availabilityState` — forward-only start
**2026-08-01**; no backfill from postgame knowledge; missingness is recorded as
`availabilityState`, never imputed.

## Feature families

| Family | Source | State | Notes |
|---|---|---|---|
| `pitcher_workload_rest` | MLB StatsAPI (free, official) | **LIVE — first artifact captured tonight**: `data/internal/research/pitcher-workload/2026-08-01.json` — 15 games, 30 starter slots, 29 `OK` + 1 honest `NO_PRIOR_APPEARANCES`, 100% pregameEligible | rest days, last-3 appearances (pitches/IP/BF + source gamePks), season appearance count — derived ONLY from games dated strictly before target |
| `market_movement` | The Odds API via the append-only patch stream | READY — `movement_snapshot` patch kind ships with Lane B; capture windows = first-eligible / subsequent-movement / final-pregame; post-start excluded by the patch validator itself | credits tracked per snapshot via existing sentinel; never restamped (validator-proven) |
| `confirmed_lineup` | MLB StatsAPI via existing pregame-archive (`pregame-features/lineup/`) | **AVAILABLE** — already capturing with provable pregame timestamps (86.5% lineup coverage in the July archive window) | no rights issue (official free source); post-first-pitch inference prohibited and already gated by `capturedAt < eventStart` guards |

## Capture cadence

- Pitcher workload: `capture-pitcher-workload.mjs --date <tomorrow> --write` — recommended as a
  step in `mlb-pregame-capture`'s first daily run (free, ~30 API calls); until wired, run
  manually with the observer checkpoint.
- Market movement: begins with the first append-only patch day.
- Preregistration readiness: the future protocol's feature list should now name these three
  families and the 2026-08-01 forward start. **No candidate model is frozen or trained** — that
  remains gated on the standing policy prerequisites plus separate founder approval.
