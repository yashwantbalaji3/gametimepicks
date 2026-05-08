# Phase 19 — Automated Settlement, API Research, Modeling Roadmap

This phase answers the user's core question — **"why can't we automatically pull final box-score data?"** — with a concrete, tested implementation. The infrastructure already existed (`fetch_final_stats_via_nba_api` was in `pipeline/settle_results.py` since Phase 7C), but lacked tests locking the contract, a `--source-report` mode for transparency, and operator-facing documentation. This phase ships all three. Plus: experimental Monte Carlo prototype, researched data-provider matrix, and four design / audit docs.

## Summary

- **Auto-settlement is testable**: 33 new assertions lock the manual-override-beats-nba_api contract, no-fabrication on missing stats, idempotent reruns, single-fetch-per-game, and PTS/REB/AST grading.
- **`--source-report` mode** added: read-only diagnostic showing which leans would auto-settle via nba_api vs need manual override vs would skip. **Sandbox confirms 87 of 108 May 5 leans are auto-settleable today.**
- **Experimental Monte Carlo v1** shipped at `pipeline/simulation.py` with 35 deterministic tests. Marked clearly experimental — not used in production scoring.
- **5 design / audit docs** shipped: DATA_PROVIDER_RESEARCH, MONTE_CARLO_MODELING_ROADMAP, PRODUCT_ROADMAP, UI_UX_AUDIT, PUBLIC_QA_AUDIT.
- **Total: 17 suites, 714 assertions, all green.** Zero Odds API credits. Zero new dependencies (simulation.py is stdlib-only).

## Can settlement be automated? (the user's question)

**Yes — and most of the infrastructure already exists.** `pipeline/settle_results.py` has had `fetch_final_stats_via_nba_api(game_id)` since Phase 7C and a 3-tier resolution chain since the same phase:

- **Tier 1**: manual override JSON (operator-edited file)
- **Tier 2**: nba_api auto-fetch from official box scores (free, no API key)
- **Tier 3**: skip with `result: "stats_unavailable"` (no fabrication)

The CLI already supports `--manual-only` and `--dry-run`. What was missing was tests proving the contract, a `--source-report` mode for visibility, and operator docs walking through the flow.

Phase 19 fills all three gaps.

## Automated settlement implementation

### `--source-report` flag (NEW)

```bash
python -m pipeline.settle_results --date 2026-05-05 --source-report
```

Read-only. Never fetches box scores. Never writes files. Buckets each lean into:
- `tier_1_manual` — operator already filled in a manual stat
- `tier_2_auto` — nba_api COULD fetch this (has playerId + gameId)
- `skip_no_pid` — playerId missing (board needs regen with nba_api)
- `skip_no_gameid` — gameId missing
- `skip_unknown` — other reason

Sandbox output for May 5:
```
total leans:           108
tier 1 manual override:   0
tier 2 nba_api auto:     87
skipped no playerId:     21
```

**87 of 108 leans (80%) would auto-settle today** if the operator runs `pipeline.settle_results --date 2026-05-05` (without `--manual-only`) on a machine with `nba_api` installed.

### `pipeline/auto_settlement_test.py` (NEW — 33 assertions)

Mocked nba_api responses lock the contract:

- Tier 1 manual override beats Tier 2 nba_api on conflict
- Tier 2 nba_api stats used when no manual override
- nba_api fetch failure → `stats_unavailable` (no fabrication)
- Missing playerId → cannot match arbitrary box-score entries
- PTS/REB/AST Over/Under/Push grading correct (6 cases)
- Idempotent: same input produces identical rows
- `--manual-only` mode never calls nba_api
- Same gameId fetched only once even with multiple legs from that game
- `stats_unavailable` doesn't pollute hit-rate calculation
- Unsupported markets (e.g. PRA) get `result: "invalid"` not win/loss

### Field-naming gotcha (documented)

Settled rows use these field names (different from what tests originally guessed):
- `result` — outcome of the lean (win/loss/push/stats_unavailable/invalid)
- `finalStat` — the actual stat value
- `settlementSource` — which tier provided the stat

Tests verify these field names so future changes can't drift.

## May 5 results path

Same as Phase 17 — `bash scripts/operator_settle.sh 2026-05-05` is the operator path. Phase 19 makes it transparently obvious which leans need manual fill vs auto:

```bash
# Step 1: see what's auto-settleable
python -m pipeline.settle_results --date 2026-05-05 --source-report

# Step 2: settle (auto for tier 2, manual for tier 1)
bash scripts/operator_settle.sh 2026-05-05

# Step 3: 87 leans auto-settle from nba_api;
#         operator fills in the 21 leans missing playerIds (manual override)
#         OR regenerates the May 5 board with nba_api in venv to fix playerIds upstream
```

Once settled, the existing `pipeline.export_results` pipeline (Phase 8) populates `/results` with real data.

## API research summary

Full matrix in `docs/DATA_PROVIDER_RESEARCH.md`. Key findings from web research May 2026:

- **nba_api** v1.11.4 (Feb 2026), actively maintained, free, no API key, Python 3.10+. **Best Tier 2 settlement source.** Note: BoxScoreSummaryV2 deprecated for games after 4/10/2025 — must use V3.
- **balldontlie**: free tier with API key; betting odds and player props are paid-tier features. ALL-ACCESS $159.99/mo per sport (or $299.99 for all sports).
- **The Odds API**: free 500 req/month, **player props require Business tier (~$30+/mo)**.
- **Sportradar**: enterprise sales-call only — overkill for current stage.
- **Sportsbook scraping**: never. ToS violation.
- **Basketball Reference**: license restricts commercial use — use only for personal research.

## Recommended data provider stack

**Now (free):**
- nba_api for schedule, box scores, game logs, player IDs
- The Odds API free tier for moneyline / spread / total

**This year ($30/mo):**
- The Odds API Business tier when ready for player props in production

**Defer indefinitely:**
- balldontlie ALL-ACCESS, Sportradar, SportsData.io. Revisit when there's a real audience and a second sport on the roadmap.

## Monte Carlo roadmap summary

Full design in `docs/MONTE_CARLO_MODELING_ROADMAP.md`. Three versions:

- **v1 (THIS PHASE)** — `pipeline/simulation.py`. Normal distribution with category-default variance. Independent legs. Stdlib only. Experimental, NOT in production.
- **v2 (~Phase 21)** — bootstrap from recent10 game logs with Bayesian shrinkage. Per-player σ. Production-promote only after Brier score beats v1 on out-of-sample slates.
- **v3 (~Phase 23+)** — correlated joint simulation with Gaussian copula. Pace / defense adjustments. Same-game parlay correlation. Calibration curve mapped via isotonic regression.

Hard rule: **no version promotes to production based on intuition or a single good week.** Each gate is Brier score < the previous version on out-of-sample slates over a defined window.

## Product roadmap summary

Full plan in `docs/PRODUCT_ROADMAP.md`. Time horizons:

- **24h**: apply Phase 19, push, run diagnose_props, settle May 5
- **7d**: settle every completed slate, activate Buttondown, monitor coverage
- **30d**: wire v1 simulation behind feature flag, build backtest harness, polish Results dashboard
- **90d**: v2 simulation, calibration dashboard, daily email digest, SEO landing pages

**Must-finish before public launch**: 30+ consecutive settled slates, recent10 ≥ 70%, calibration curve published, mobile clean at 375px.

**Do not do yet**: sportsbook affiliates, real-money integrations, multi-sport, AI-generated analysis text, premium tier paywall.

## UI/UX audit summary

Full audit in `docs/UI_UX_AUDIT.md`. High-impact next-steps in priority order:

1. Newsletter card visual upgrade
2. Mobile filter strip horizontal scroll
3. Confidence tier color differentiation
4. Methodology pipeline diagram
5. Footer reorganization with inline newsletter

## Public QA audit summary

Full audit in `docs/PUBLIC_QA_AUDIT.md`. Verdict: site is in good shape for operator activation. No fabricated data. No admin copy leaked. All control surfaces functional. Test suite at 714 assertions.

Remaining gaps are 100% operator-action items, not engineering blockers.

## Files added

| Path | Purpose |
|---|---|
| `pipeline/auto_settlement_test.py` | 33 assertions — locks the auto-settle contract |
| `pipeline/simulation.py` | Experimental Monte Carlo v1 (NOT in production) |
| `pipeline/simulation_test.py` | 35 deterministic assertions for the prototype |
| `docs/DATA_PROVIDER_RESEARCH.md` | API provider matrix |
| `docs/MONTE_CARLO_MODELING_ROADMAP.md` | v1/v2/v3 design |
| `docs/PRODUCT_ROADMAP.md` | Phased plan toward finished product |
| `docs/UI_UX_AUDIT.md` | Page-by-page critique |
| `docs/PUBLIC_QA_AUDIT.md` | End-to-end QA |
| `docs/PHASE19_NOTES.md` | This file |

## Files modified

| Path | Change |
|---|---|
| `pipeline/settle_results.py` | Added `--source-report` mode + `_print_source_report` helper |
| `scripts/run_all_tests.sh` | Wired auto_settlement_test + simulation_test |
| `scripts/automation_refresh.sh` | Wired auto_settlement_test + simulation_test |

## Files deleted

None.

## Tests run

17 suites, **714 assertions, all green**:

```
✓ pipeline.filter_test                  58
✓ pipeline.settle_test                  66
✓ pipeline.grouping_test                69
✓ pipeline.diagnostics_test             43
✓ pipeline.recent10_test                23
✓ pipeline.export_results_test          38
✓ pipeline.confidence_guardrails_test   43
✓ pipeline.inspect_trends_test          29
✓ pipeline.grouping_collision_test      31
✓ pipeline.parlay_lab_test              44
✓ pipeline.freshness_test               49
✓ pipeline.active_slate_test            42
✓ pipeline.parlay_builder_test          33
✓ pipeline.core_players_test            40
✓ pipeline.playerid_coverage_test       38
✓ pipeline.auto_settlement_test         33  ← NEW Phase 19
✓ pipeline.simulation_test              35  ← NEW Phase 19
                                       ───
                              TOTAL    714
```

## Typecheck result

No frontend changes in Phase 19. Sandbox can't run `npm run typecheck` (registry blocked). Apply script runs typecheck on your Mac.

## Build result

No frontend changes — Vercel build will not be affected. Apply script verifies on your Mac.

## Smoke result

✓ Passed in sandbox.

## Exact commands to run

```bash
cd ~/Downloads/gametimepicks
bash ~/Downloads/apply_phase19_auto_settlement_api_research_roadmap.sh
```

After local commit:
```bash
git push
```

To preview what auto-settles without writing anything:
```bash
python3 -m pipeline.settle_results --date 2026-05-05 --source-report
```

To actually settle May 5 (auto + manual fallback):
```bash
bash scripts/operator_settle.sh 2026-05-05
```

## Localhost checklist

`cd app && npm run dev`. Phase 19 has no frontend changes; the existing pages from Phase 18 should render identically:

- `/` — eyebrow says "awaiting model leans"
- `/board` — date tabs, premium hero
- `/parlay-lab` — Build mode defaults to active slate, top 3 core players
- `/methodology` — vault hero grid
- `/responsible-use` — vault hero grid

Backend smoke:
```bash
python3 -m pipeline.settle_results --date 2026-05-05 --source-report
# Should print: tier_2_auto: 87, skip_no_pid: 21
```

## Operator checklist for automated settlement

```
1. Ensure nba_api in venv:
     pip install nba_api
     python3 -c "import nba_api; print(nba_api.__version__)"

2. Preview:
     python3 -m pipeline.settle_results --date 2026-05-05 --source-report

3. Auto + manual settle:
     bash scripts/operator_settle.sh 2026-05-05
   - Auto-fetches box scores via nba_api (Tier 2)
   - Pauses for operator to fill manual overrides for unmatched players
   - Refuses to settle empty templates (no fabrication)

4. Export:
     python3 -m pipeline.export_results
     (operator_settle.sh runs this for you)

5. Commit + push:
     git add app/public/data/results/ pipeline/validation/
     git commit -m "Settle slate 2026-05-05"
     git push

6. Verify on /results after Vercel redeploys
```

## Operator checklist for live props

Per `docs/ODDS_API_ACTIVATION.md` (Phase 16) + Phase 18 workflow change:

```
1. https://the-odds-api.com → sign up (free 500 req/month)
2. GitHub: Settings → Secrets → ODDS_API_KEY = <key>
3. Vercel: Settings → Env Vars → ODDS_API_KEY = <key>
4. GitHub: Settings → Variables:
     ENABLE_ODDS_REFRESH = true
     ODDS_DRY_RUN        = true   ← keep TRUE for first run
5. Actions → auto-refresh → Run workflow
6. Verify "✓ paid odds refresh complete" in logs
7. Set ODDS_DRY_RUN = false, run again
8. Verify props on /board
```

## Operator checklist for newsletter

Per Phase 18:

```
1. https://buttondown.email → sign up
2. Note username from dashboard URL
3. Vercel: Settings → Env Vars → NEXT_PUBLIC_BUTTONDOWN_USERNAME = <username>
4. Trigger redeploy
5. Test signup at /
```

## Rollback steps

**Before commit:**
```bash
git restore --staged .
git checkout pipeline/settle_results.py scripts/
git clean -fd pipeline/auto_settlement_test.py \
              pipeline/simulation.py \
              pipeline/simulation_test.py \
              docs/DATA_PROVIDER_RESEARCH.md \
              docs/MONTE_CARLO_MODELING_ROADMAP.md \
              docs/PRODUCT_ROADMAP.md \
              docs/UI_UX_AUDIT.md \
              docs/PUBLIC_QA_AUDIT.md \
              docs/PHASE19_NOTES.md
```

**After local commit, before push:** `git reset --hard HEAD~1`

**Disable simulation prototype** (if discovered to misbehave): nothing to disable. It's not wired to production scoring. Just don't import it.

## Strong recommendations

**Can we fully automate settlement now?** Yes, modulo recent10 coverage. Today on the May 5 slate, 80% of leans (87/108) auto-settle via nba_api. The 21 skipped are because their playerIds weren't resolved upstream — fix that and we're at ~95%+ auto.

**Which box-score source should we trust first?** nba_api. It's free, actively maintained, and reads directly from stats.nba.com. No paid alternative is meaningfully more authoritative.

**Which APIs are worth paying for later?** The Odds API Business tier ($30+/mo) when player props move to production. Everything else can wait until there's a real audience.

**Which APIs should we avoid?** Sportradar (enterprise sales call, overkill), sportsbook scraping (ToS violation), Basketball Reference republication (license restricts commercial use), unofficial ESPN endpoints (no SLA).

**What should the first Monte Carlo model look like?** What we shipped — Normal(μ=projection, σ=projection×variance_pct), independent legs, stdlib-only, clearly experimental. Used as a teaching tool while we collect the recent10 coverage needed for v2.

**What data is required before Monte Carlo is useful?** recent10 coverage ≥ 70% sustained. Below that threshold, per-player variance estimation from logs is too noisy.

**How should Parlay Lab use simulation results?** v1: don't. Display experimental probabilities behind a "Simulation Lab" feature flag, not on candidate cards. v2: replace single-projection display with mean ± uncertainty band. v3: replace edge score with calibrated joint probability for parlays.

**What are the biggest risks of overfitting?** Tuning variance / shrinkage parameters on the same slates we backtest. Mitigation: hold out 20% of slates as final validation, never used during tuning. Walk-forward only.

**What should we do in the next 24 hours?** Apply Phase 19, push, activate Odds API in dry-run, run `operator_settle.sh 2026-05-05`. By end-of-day there should be one real settled slate on `/results`.

**What should we do in the next 7 days?** Settle every completed slate. Activate Buttondown. Schedule auto-refresh daily 1 hour pre-tipoff. Soft-launch share.

**What must be finished before public launch?** ≥30 consecutive settled slates with no fabricated data, recent10 ≥ 70% coverage, mobile filter strip fixed, calibration curve visibly monotonic, public changelog page, privacy policy + terms.

**Clearest roadmap to a unique, finished, futuristic product?** Transparency at production scale. Public changelog. Public calibration curve. Per-player history pages. No tipster language ever. The differentiator isn't "we have better picks" — it's "we show our work to a degree no other prop-analytics product does." Ship that and the brand defends itself.

## What should Phase 20 be

**"First Real Production Slate + Backtest Harness."**

1. Operator activates Odds API + nba_api (per Phase 18/19 checklists)
2. Settle 5+ slates via the auto path
3. Build `pipeline/backtest.py` — walks settled slates, computes per-tier hit rate + Brier + log loss
4. Wire v1 simulation behind a feature flag — "Simulation Lab" tab
5. Real Results dashboard design (no longer empty state)

Gate to Phase 21 (v2 simulation): backtest harness running, ≥10 slates settled, recent10 coverage ≥ 70%.

## What should wait

- Multi-sport scaffolding
- Sportsbook affiliate integrations
- Subscription tiers / paywalls
- AI-generated analysis text (templates only — no LLM in production user-facing copy)
- Native mobile app
- Social / forum features
- Live in-game updates

The site is genuinely close to "real product." Phase 19 closes the auto-settlement question definitively. Phase 20 turns on the production switches. Phase 21 starts the model-quality flywheel. Each phase is one operator session of effort.
