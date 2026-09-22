# v1.7 — NBA readiness receipt (parallel track N0–N3)

**As of:** 2026-09-22 · **Capability registry:** `nba` = `HISTORICAL_ONLY`, `canEnterPredictionProducts`
false — **unchanged and guarded** (`capability-product-gating.test.mjs`, `ask-contract.test.mjs`,
`contract.test.mjs` sport gate). Nothing in this track reaches a public route or a product.

## Calendar (verified 2026-09-22 against NBA.com key dates)

| Milestone | Date | Days from this receipt |
|---|---|---|
| Camps open (overseas teams Sep 22) | 2026-09-29 | 7 |
| Preseason begins (MIA @ TOR, Quebec City) | 2026-10-03 | 11 |
| Preseason ends | 2026-10-16 | 24 |
| Opening-day rosters set | 2026-10-19 | 27 |
| Regular season begins | 2026-10-20 | 28 |

## N0 — current-state audit (done)

| Class | What | Disposition |
|---|---|---|
| reusable, live | ESPN schedule capture (`sport-schedules.yml`, 100 rows Oct 3–25), ESPN results capture, ESPN injuries feed (`data/internal/research/injuries/nba/latest.json`), second-generation settlement contract (`lib/sports/nba/{settlement-contract,current-results,shadow-contract}.mjs`, armed, unrun), identity contract (`lib/nba/identity-contract.ts`), Ask refusal at two boundaries | keep |
| historical-only | 54 daily boards (21 with leans, May 5–Jun 13), `results/settled_leans.jsonl` (4,592 rows), `/results/nba` archive page, legacy `pipeline/settle_results.py`, June Finals card product | keep as archive |
| stale / running for nothing | `auto-refresh.yml` every 2 h on an NBA-season cron against stats.nba.com (timing out from CI since 2026-06-13); `morning-projections.yml` writing empty `ScheduleUnavailable` boards daily; root `board.json`/`schedule.json`/`players.json`/`odds_props.json` singletons | backlog N-1: de-schedule the NBA halves until a working provider exists |
| unsafe / unverified | `nba_api` provider (dead from CI), `rebounds-prototype-contract.ts` (never validated) | do not reactivate |
| delete candidates | `pipeline/cache/nba_api_*` (49 files), `pipeline/.venv` (checked-in venv), `__pycache__`, `public/data/hit_rates.json` (`isDemo: true`), `nba-finals-stake-row.tsx` (no importer), `.vercel/output/static/data/game-outlook/nba` (no source) | backlog N-2 |
| live footgun | `sports-coverage.ts` still says `level: "full"` for NBA to feed the legacy `MODELED_SPORT_KEYS` gate; the registry overrides it today | backlog N-3: remove the legacy level before the registry state ever moves |

## N1 — canonical data foundation (done for games, teams, box scores; players partial)

| Domain | Owner | State |
|---|---|---|
| Games | `data/internal/research/nba/corpus-v1.json` — 4,179 finals, 2023-24 → 2025-26, phase, OT, neutral site, quarantine list | canonical |
| Box scores | `data/internal/research/nba/boxscores/<eventId>.json` — **4,179 / 4,179 games, 113,080 player rows**, MIN/PTS/REB/AST/3PM/3PA/FGM/FGA/FTM/FTA/STL/BLK/TOV/OREB/DREB/PF/+/-, DNP explicit, null never zero, ESPN label order asserted (0 violations) — `build-nba-boxscore-corpus.mjs`, parser unit-tested | canonical (free ESPN summary endpoint) |
| Teams | 30 canonical tricodes + aliases in `identity-contract.ts`; box scores keyed by ESPN `providerTeamId`, corpus by display name; schedule rows carry both | canonical for the 30 franchises; exhibition clubs get no history by design |
| Players | ESPN athlete ids from box scores; **no roster owner** — the only roster signal is "appeared in a box score for this team" | **gap N-4 (blocking for regular-season quality):** offseason trades, signings and rookies are invisible (2026-10-03 artifact: Giannis Antetokounmpo appears on MIA in the injuries feed but has no MIA box-score row; rookies Bittle, Conwell unknown). A free roster source (ESPN team roster endpoint, keyless) is the obvious candidate; a paid one is a founder gate |
| Context | rest days / back-to-back derivable from the schedule; injuries feed live (OUT only excludes; Day-To-Day simulated at full minutes) | partial |

## N2 — preseason is a different population (built)

Separate populations end to end: the Elo has a `preseasonRatings` stream that regular games never touch and
vice versa; the minutes model takes `population: "preseason" | "regular"`; the grader keeps preseason and
regular buckets apart; the artifact label is `NBA PRESEASON — EXPERIMENTAL` (season type 1) or
`NBA REGULAR SEASON — SHADOW` (2), refused for anything else. `productEligible: false`, `dataClass:
PRIVATE_RESEARCH`, never read by public code (`neverReadBy` note in the artifact; `public-beta-safety`
forbids the read).

## N3 — model / simulation architecture (v0, built, internal)

```
corpus finals ──► team-rating.mjs (Elo, K=20, HA=+70, 25% season regression; two streams)
box scores  ──► minutes-model.mjs (trailing-10 → season → insufficient; DNP/null excluded; OUT from injuries)
             └► per-minute pts/reb/ast/3pm rates (+ sd), null under 3 games
schedule    ──► game-sim.mjs (mulberry32 seeded by event id, 10,000 runs, 240-minute pool rescale recorded)
             └► experimental-forecast.mjs → forecasts/<date>.json (Elo p AND sim p, side by side, gap recorded)
finals      ──► grade-nba-experimental-forecasts.mjs → ledger.json (Brier/LL for Elo and sim; score/total/margin
                error; per-player MINUTES MAE and PRODUCTION-GIVEN-MINUTES MAE, reported separately)
```

Reproducibility: model version, input as-of, run count, seed and seed policy, availability and minutes
assumptions are all in the artifact; the 2026-10-03 build is byte-identical on re-run.

First artifact (2026-10-03, MIA @ TOR, preseason): 40 players with expected minutes, 13 with insufficient
history, 5 all-DNP in window, Elo (preseason stream) pHome 0.690 vs sim 0.589 — the gap is the diagnostic,
nothing is blended. **Known and recorded:** sim margin sd ≈ 24 (real ≈ 13) because per-player rate noise is
drawn independently from 4–6-game windows — dispersion is uncalibrated by construction at v0.

## N4 — market-by-market eligibility (not started; the plan)

Every family earns support separately. Data completeness is now sufficient for winner, margin, total,
points, rebounds, assists, 3PM; PRA only as a mathematical combination of jointly simulated components.
For each: model form (v0 above), calibration metric (Brier/log loss for probabilities, MAE + interval
coverage for distributions), sample bars **preregistered before the first regular-season game**,
preseason behaviour reported but never used as regular-season evidence, public status and product
eligibility as separate decisions.

## N5 — lifecycle and where it stands

```
HISTORICAL_ONLY ──► DATA_READY ──► PRESEASON_EXPERIMENTAL ──► REGULAR_SEASON_SHADOW ──► validation receipt ──► PUBLIC FORECAST ──► PRODUCT ELIGIBLE (per market)
   (registry)         ✅ games/teams/box scores        ✅ pipeline built, first artifact         Oct 20 →              needs preregistration
                      ⚠ rosters (N-4)                   ⏳ automation (N-5)                                          before Oct 20
```

The registry moves only with a receipt; no term here changes the registry.

## N6 — regular-season evaluation plan (preregistration owed before 2026-10-20)

Track from game one: game-level Brier/log loss vs the preseason-frozen Elo and vs the market when a price
exists; score MAE and interval coverage; per-player minutes MAE; production MAE conditional on minutes;
rest/back-to-back and role-change slices; simulation interval coverage. Bars and the assessment window are
to be written before Oct 20 and not tuned on it.

## N7 / N8 — public product readiness and Bank Builder / Moonshot entry

Not before a validation receipt. The ProductEligibleLeg contract already carries an `nba` slot that the
registry refuses at both boundaries; the day a market earns eligibility, legs flow through the same
selector with no quota.

## Open items, in order

1. **N-5 automation (before Oct 3):** wire `build-nba-experimental-forecasts.mjs` (daily, ET date) and
   `grade-nba-experimental-forecasts.mjs --fetch` (nightly) into `sport-schedules.yml`, commit
   `data/internal/research/nba/experimental/`.
2. **N-4 rosters (before Oct 20):** a free roster owner; without it regular-season forecasts are for last
   year's teams.
3. **N6 preregistration (before Oct 20).**
4. **N-1 / N-2 / N-3 cleanups** (de-schedule dead NBA crons, delete caches/venv/demo file, remove the
   legacy `level: "full"`).
5. Calibrate sim dispersion (v1) only after preseason diagnostics, and only on the preseason population.
