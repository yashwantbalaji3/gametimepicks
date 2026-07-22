# MLB Research Feature Coverage — Current & Roadmap

The pregame research warehouse captures **leakage-safe** features (every value proven captured *before* first pitch) for future modeling. This is a data-accumulation effort only: **no model is built, no value is fabricated, and modeling stays BLOCKED** until 30 dates / 500 settled observations + out-of-sample validation + founder approval.

Leakage safety is enforced by `app/src/lib/mlb/pregame-archive/eligibility.ts` (`researchEligibility()`): a record is eligible only if `capturedAt < eventStartTime` **and** `availableAt < eventStartTime` **and** the source timestamp is proven, plus per-family freshness limits. Every new feature must carry `capturedAt`, `availableAt`, source, `researchEligible`, and a quality check.

---

## Current families (13) — 12/13 free StatsAPI, 1 paid

| Family | Captures | Source |
|---|---|---|
| `pitcher_status` | probable starters + status | StatsAPI free (`schedule?hydrate=probablePitcher`, `feed/live`) |
| `pitcher_workload` | recent pitch counts + rest | StatsAPI free (`feed/live` boxscore) |
| `environment` | weather (condition/temp/wind), roof, day/night | StatsAPI free (`feed/live gameData.weather`) |
| `umpire` | assigned officials by role | StatsAPI free (`boxscore.officials`) |
| `lineup` (confirmed_lineup) | confirmed batting order, scratches | StatsAPI free (`feed/live`) |
| `bullpen` | reliever usage last 1/3 days + likely-unavailable | StatsAPI free |
| `matchup` | starter + batter matchup context | StatsAPI free (`people`, `hydrate=probablePitcher`) |
| `batter_splits` | season + prev-season vs R/L | StatsAPI free (`people/{id}/stats`) |
| `batter_form` | last 7 / last 30 hitting (strictly earlier) | StatsAPI free (`stats=gameLog`) |
| `park_factors` | factual venue attributes + coords | StatsAPI free (`venues/{id}?hydrate=location,fieldInfo`) |
| `batter_vs_pitcher` | career H2H vs opposing SP | StatsAPI free (`stats=vsPlayerTotal`) |
| `plate_appearance_opportunity` | projected PA (derived, no fetch) | derived from `batter_form` + `lineup` |
| `market_probability` | de-vigged no-vig probability | **PAID** the-odds-api (`capture-mlb-pregame-markets.mjs`) |

Coverage is reported in `simulation-readiness.json` (`coverage.byFamily`) and the accumulation census in `research-progress.json`.

## Candidate high-value features (prioritized)

Assessed for feasibility from **free StatsAPI** vs needing paid/external (Statcast/FanGraphs) data:

| # | Candidate | Verdict | Notes / endpoint |
|---|---|---|---|
| 1 | **Team offensive form** | ✅ FEASIBLE-FREE | recent team runs/OPS, mirrors `batter_form` at team level — `/teams/{id}/stats?group=hitting` (or team gameLog) |
| 2 | **Opponent defensive context** | ✅ FEASIBLE-FREE | team fielding metrics — `/teams/{id}/stats?stats=season&group=fielding` |
| 3 | **Travel / rest** | ✅ FEASIBLE-FREE | days rest from `/schedule` prior-game dates; travel distance from venue coords already hydrated in `park_factors` |
| 4 | **Bullpen leverage (roles)** | ◐ PARTIAL-FREE | closer/setup role tags derivable free (`/teams/{id}/roster` + `feed/live`); true leverage index (gmLI) is external/FanGraphs — capture roles only, label the rest as a gap |
| 5 | **Weather enhancement** | ◐ PARTIAL | `environment` already has condition/temp/wind free; richer precip%/gusts/humidity forecast needs a paid weather API — document as a gap, do not fabricate |
| 6 | **Pitcher arsenal (pitch mix)** | ⛔ NEEDS-PAID | aggregated usage/velo is Statcast/Baseball Savant — out of scope until a data source is licensed |
| 7 | **Pitch-type matchup** | ⛔ NEEDS-PAID | batter-vs-pitch-type is pitch-level Statcast only |

**Recommended next captures (free, leakage-safe):** #1 team offensive form, #2 opponent defensive context, #3 travel/rest, #4 bullpen roles. Each must ship with: a capture script (`capture-mlb-pregame-<family>.mjs --write`), `researchEligible` stamping via `familyRecord(...)`, a coverage key in `simulation-feature-contract.ts`, a data-quality check in `monitor-mlb-research-quality.mjs`, and a wire into `mlb-pregame-capture.yml`. **No fabricated values** — a family with no data for a game records absence, not a guess.

Paid candidates (#5–#7) are parked until a data source is licensed; they are **not** blockers for the v2 modeling gate.

## Benchmark framework (Phase 7 — evaluation, prepared, not yet exercised)

When observations exist, a future model must be evaluated against baselines **before any claim**. The framework is already in place and reports `INSUFFICIENT` until the gate:

- **Runner:** `app/scripts/mlb-research-benchmark.mjs` → `status/benchmark.json` (reads the settled ResearchObservation set; currently 0/500 → INSUFFICIENT).
- **Baselines to beat:** (a) **market-implied probability** (de-vigged), (b) **historical average** (per-market base rate), (c) **player average**.
- **Metrics:** Brier score, log loss, calibration, and a paper ROI simulation — a candidate model must beat the **market baseline** out-of-sample on ≥1 market to advance from v1→v2 (see `SIMULATION_ENGINE_ROADMAP.md`). Support libs: `app/src/lib/mlb/simulation/benchmark.ts`, `app/src/lib/benchmark/market-confidence.ts`.
- **No claims until tested:** high feature coverage does **not** imply readiness; the benchmark, not coverage, decides. The 4 currently-modeled prop markets already **failed** this bar and were demoted to market-context.

## Current accumulation state (honest)

Per `research-progress.json` + the Phase-4 settlement audit: feature families are capturing daily, but **0 settled ResearchObservation rows exist yet** — slates in the window are not final, and settled rows are produced only from finalized games with research-eligible carried-forward market leans. The warehouse grows; the gate (2/30 dates, 0/500 obs) is honestly far from met. This is expected for an accumulation phase — the fix is *time and finalized slates*, not relaxing eligibility.
