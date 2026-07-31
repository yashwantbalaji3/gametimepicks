# API Credit & Refresh Optimization (2026-07-31, Program 088-091)

Extends `API_USAGE_AND_CREDIT_AUDIT.md` (084-087) — that document remains the credit ledger of
record. This one adds the 088-091 controls and the staged-refresh analysis.

## Provider truth (re-confirmed)

The Odds API is the only active paid provider (balance 10,300 of a ~20K monthly quota at last
generation; July consumption ≈ 9,700 incl. a one-off archive experiment; steady-state
≈ 60–130 credits/day). Free: MLB StatsAPI, ESPN, nba_api. Idle keys: API-Football,
balldontlie — **plan tiers UNKNOWN until founder evidence; idle ≠ $0 assumed** (checklist).
Disabled sports provably cannot spend on a schedule (dispatch-only + dry-run gates + the
`ODDS_DRY_RUN=true` repo default; guards in the suite).

## New in 088-091 — budget + anomaly alerting (§6.6)

- `app/scripts/check-odds-credit-budget.mjs`: reads the credit block the newest board already
  carries; warns when a single generation spends > `ODDS_CREDIT_SPEND_WARN` (default 500;
  normal is 12–62) or balance < `ODDS_CREDIT_BALANCE_WARN` (default 4,000 = 2× the 2,000 hard
  floor). A missing credits block reports **UNKNOWN, never zero**. Always exits 0.
- Wired as step 6b of `mlb-daily-production` (observability only); delivers through
  `scripts/ops_alert.sh` with the new **warning** kind — labeled "WARNING … run succeeded —
  attention needed", guard-tested to never read as a failure or a test, same redaction contract.
- Thresholds are repo variables — tunable without code (`ODDS_CREDIT_SPEND_WARN`,
  `ODDS_CREDIT_BALANCE_WARN`).

## Duplicate-call prevention (§6.4) — measured state

Request identity is already effectively hashed by the provider cache layer (provider + sport +
event set + market set within `ODDS_CACHE_TTL_MINUTES=120`): July boards show real
`after: "cache", spent: 0` generations. Cross-workflow duplication was closed in 084-087 (the
failed-upstream double-ingest). **A stale cached response can never be restamped as a new
capture** — pregame provenance requires `capturedAt < eventStart` from the live capture path,
and settlement is credit-free; the cache serves board rendering, not capture lineage.

## Staged refresh timing (§6.3) — analysis, recommendation gated

Measured coverage gap: the 11:52 ET generation catches ~10/15 games' markets; the 5 evening
games' props post through the afternoon (this is also exactly why the two live-slate invariant
tests and the lifecycle gate go red every morning). Options considered:

| Option | Credits | Effect |
|---|---|---|
| A. Keep single 11:52 ET generation (today) | baseline | partial morning coverage, honest availability states, red morning invariants |
| B. Add an afternoon top-up ingest (~17:00 ET) for lean-less games only | +20–60/day | full-slate coverage by evening; clears the invariant reds naturally; ~2× headroom still intact |
| C. Move generation later | 0 | trades morning product freshness away — rejected (coverage/service-level reduction) |

**Recommendation: B**, scoped to games with no leans yet (no re-fetch of covered games, so no
duplicate-call risk and the credit guard still applies). It is a *cadence/coverage change* →
**founder approval required** per §11.2; not implemented this session. Stop-conditions the
implementation must carry: skip games past first pitch; skip when coverage is already complete.

## Scenario projections (unchanged math, new controls)

MLB-only: ~2–4K credits/mo (~10–20% of quota). MLB+NBA: ~2× seasonal overlap ≈ 4–8K.
MLB+NBA+EPL odds: comfortably < 15K — all inside the current ~20K tier; the budget alert now
watches the approach to the floor instead of anyone eyeballing it.
