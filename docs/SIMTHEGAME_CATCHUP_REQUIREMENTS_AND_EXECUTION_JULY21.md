# SimTheGame Catch-Up Requirements + Execution — July 21, 2026

**Founder instruction:** "We are still far behind SimTheGame. Come up with a list of requirements first to catch up with them and then execute all possible enhancements to get our predictions up for all the mentioned props."

**Money lock (verified):** record 19‑14 · bankroll $19,065.40 · crown $20,465.40 · exposure $0 · portfolio.json md5 `affe6b21071f2b3be96bb2774eb347c3`. This mission is prediction-surfacing + UX + docs only — it does **not** touch money, and it does **not** fabricate any prediction.

**Baseline HEAD:** `bda34bc8` (post World Cup closeout). Active sport = **MLB**. World Cup is complete and stays closed off (archive/methodology only) — soccer parity is a **roadmap reference**, not a reactivation.

---

## 0. Ground truth — what our July‑21 MLB pipeline actually produces

Measured directly from the shipped artifacts (not assumed):

| Layer | Artifact | Contents (2026‑07‑21) |
|---|---|---|
| Raw provider props | `public/data/mlb/player-props/2026-07-21.json` | **1,094 lines · 8 markets** (FanDuel): `pitcher_strikeouts, pitcher_outs, pitcher_earned_runs, batter_hits, batter_home_runs, batter_rbis, batter_runs_scored, batter_total_bases` |
| Modeled board | `public/data/mlb/boards/2026-07-21.json` | **82 leans · 4 markets** with `projection`+`sigma`+`modelProbOver`+`edgePct`: `pitcher_strikeouts, batter_hits, batter_total_bases, batter_hits_runs_rbis` |
| 10k simulation | `public/data/mlb/game-simulations/2026-07-21.json` | 5 games · `runCount:10000` · **74 distributions** (10k bins each) · **21 `generatedPicks`** · per‑game `marketSnapshot` + `unavailableModules` (5 soccer modules, honest N/A) |
| Team markets | `public/data/mlb/team-markets/2026-07-21.json` | moneyline (+ run line / total) with `impliedProb` **and `noVigProb`** (DraftKings) — market context, not a model |

**The engine is honest and market-agnostic.** `src/lib/game-simulations/mlb-generator.ts` samples `N(projection, sigma)` (clamped ≥0) for **any** lean that carries a finite `projection` **and** `sigma`, and **never samples a lean without them**. So the 4‑market ceiling is set upstream, at the **projection model** — the model only computes `projection`+`sigma` for 4 markets today. The other 5 provider markets are ingested (raw props) but have no model projection, so they correctly never reach the board or the sim.

**Two honest gaps, therefore:**
1. **Surfacing gap (biggest, 100% honest to close now):** we model **82 leans + 74 distributions** but the report surfaces only **21 picks**. Everything else the model already computed is hidden.
2. **Coverage gap:** 5 provider markets (`pitcher_outs, pitcher_earned_runs, batter_home_runs, batter_rbis, batter_runs_scored`) have real lines but no model → can only be shown as **market context**, never as a simulated prediction, until a per‑stat projection model is built + backtested.

---

## 1. SimTheGame catch-up requirements matrix

**Classification key:** **A** = build now from existing supported MLB artifacts · **B** = build now as market context only (no model claim) · **C** = internal-only until validation/provider support · **D** = future (needs new provider data or new validated model).

SimTheGame's screenshots are **soccer-heavy**; our live product is **MLB-first**. The matrix separates the two: an MLB row is what we ship; the soccer row is a documented future plan (World Cup stays archived).

### 1A. MLB (our live product)

| # | Requirement (SimTheGame) | GameTime current status | Supported now? | Data source | Modeling | Public-safe now? | Class | Priority | Execution |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Clean multi-sport dashboard | `/simulate` lobby + `/games` hub exist; MLB-first | Yes | existing | none | Yes | A | P2 | Polish only |
| 2 | Today sidebar w/ game selector | Global nav only; no in-report game hop | Partial | schedule/board | none | Yes | **A** | **P1** | Add in-page MLB game selector (ready/awaiting/product chips) |
| 3 | Box-score signal legend | Runner has takeaways; no legend key | Partial | sim | none | Yes | **A** | **P1** | Add legend: model lead / aligned / watchlist / product / unavailable (avoid "supported/opposed") |
| 4 | Average box-score tables | Board carries `projection` per lean | Yes (4 mkts) | board | existing | Yes | **A** | **P1** | Show projection per player row |
| 5 | Player stat grids | Narrow picks only (21) | Partial | board (82 leans) | existing | Yes | **A** | **P1** | Grouped player board: all 4 modeled markets, all leans, per-team |
| 6 | Biggest model leans | `generatedPicks` shown | Yes | sim | existing | Yes | A | P2 | Keep; widen source to full lean set |
| 7 | Market agreement score | `marketAgreement()` exists (overall) | Yes | sim | existing | Yes | A | P2 | Keep |
| 8 | Market agreement **by stat** | Only overall today | No | sim leans | existing | Yes | **A** | **P1** | By-market panel: K / hits / TB / H+R+RBI — score, avg gap, n |
| 9 | Half results | Soccer market | N/A for MLB → maps to **inning markets** | provider (absent) | new | No | **D** | — | Document; needs inning-market feed |
| 10 | First goal scorer | Soccer market | N/A for MLB | — | — | No | **D** | — | Soccer-only; documented |
| 11 | Team goal totals | Soccer market | MLB analogue = **team totals** | provider (partial) | none | context | **B** | P3 | Team-total market context if provider carries it |
| 12 | Total corners | Soccer market | N/A for MLB | — | — | No | **D** | — | Soccer-only |
| 13 | Match markets (1X2) | Soccer market | MLB = **moneyline** | team-markets (have it) | none (market-implied) | context | **B** | **P2** | Market snapshot card: de-vigged moneyline (`noVigProb`) — context, not a sim |
| 14 | Asian handicap | Soccer market | MLB = **run line** | team-markets | none | context | **B** | P2 | Run-line context in market snapshot |
| 15 | Result / total / BTTS / double-chance | Soccer | MLB = ML / game total / (no BTTS) | team-markets | none | context | **B** | P2 | Moneyline + game-total context; BTTS is soccer-only |
| 16 | Distribution charts | 74 distributions generated; few shown | Partial | sim | existing | Yes | **A** | **P1** | Render a distribution per modeled market row (line marker + O/U prob + mean) |
| 17 | Simulation vs sportsbook gap | `edgePct` per pick | Yes | sim | existing | Yes | A | P2 | Show `model gap` (not "edge") per row |
| 18 | Main takeaways | `deriveTakeaways()` exists | Yes | sim | existing | Yes | **A** | **P1** | Concise takeaways block: top lead / most aligned / product legs / what's not simulated |
| 19 | Pricing / pro gating | No paywall (paper/free) | N/A | — | — | Yes | — | — | Out of scope — GTP is free paper/review |
| 20 | Clean visual hierarchy | Dense, red-border heavy | Partial | — | none | Yes | **A** | P2 | Reduce red overload, sticky mini-nav, "what this covers" first |

### 1B. Soccer (roadmap only — World Cup stays archived)

Every soccer requirement is **archived/future**: the 2026 World Cup is complete and closed off (see `world-cup-closeout`). Soccer parity applies only to a **future active competition** with a live fixture + odds + settlement feed. Full requirements in `docs/SOCCER_SIMTHEGAME_PARITY_REQUIREMENTS.md`. Class **C/D** across the board. No soccer market is reactivated by this mission.

---

## 2. What "catch up" means, bluntly

- **We can match SimTheGame's board breadth for MLB player props right now** by surfacing the model output we already generate (82 leans + 74 distributions vs 21 picks). That is the single biggest catch-up lever and it is 100% honest.
- **We can add market-context parity** (moneyline / run line / game total, de-vigged) using the team-markets feed — clearly labelled *market context, not a simulation, not a product edge*.
- **We remain behind on full-game outputs** (scoreline, win probability, run distribution). Our internal full-game engine mirrors the market and is **not public-ready**; we will not publish it as a model. Requirements to close this honestly are in `docs/MLB_FULL_GAME_AND_TEAM_MARKET_ROADMAP.md`.
- **We remain behind on the 5 unmodeled player markets** (outs, ER, HR, RBI, runs). They are *provider-available* but *unmodeled*; surfacing them as predictions would be fabrication. They ship as **market context** now and as **model predictions only after a per-stat projection + backtest + calibration** (roadmap).

---

## 3. Execution log (what shipped this pass)

**Root-cause fixed (the biggest lever):** the V2 report consumed only the 10k `generatedPicks` (capped `MAX_PICKS_PER_GAME=8` → 21 total), while the full un-capped 82-lean board (`detail.gameLabMlb`) was already loaded but never passed to it. Threading the full lean set in required **no regeneration** and no artifact change.

Shipped, all honest, all verified in a real browser (built static export):

| # | Change | File(s) | Verified |
|---|---|---|---|
| A | Report now receives the FULL board-lean set (`gameLab={detail.gameLabMlb}`) | `game-detail-page.tsx`, `mlb-simulation-report-v2.tsx` | 48 rows rendered (was ~8) |
| B | **Player board grouped by team**, every simulated line, product-tagged | `mlb-simulation-report-v2.tsx` §4 | ATH:21 / AZ:24, biggest gap first |
| C | **Signal legend** — model lead / aligned / watchlist / product / unavailable (no "supported/opposed") | `mlb-simulation-report-v2.tsx` `SignalLegend` | all 5 chips render |
| D | **Market agreement by stat** — avg gap + n per modeled market, from the full lean set | `mlb-simulation-report-v2.tsx` §6 | TB 6pt·n10 · H+R+RBI 4pt·n16 · Hits 3pt·n16 · K 1pt·n1 |
| E | **Honest coverage note** — names HR/RBI/Runs/Outs/ER as market-context-only, *not simulated, not product-eligible* | `mlb-simulation-report-v2.tsx` §2 | "market context only" rendered |
| F | **Main takeaways** (data-driven) — top model lead + most-aligned stat + product-leg count | `mlb-simulation-report-v2.tsx` §1 | renders from real leans |
| G | **In-page MLB game selector** — hop between the day's games, current highlighted, sim-ready flagged, **no World Cup** | `game-detail.ts` `siblingGames`, `game-detail-page.tsx` | 10 siblings, 0 WC |
| — | Guard test | `mlb-report-coverage-expansion.test.mjs` (8 tests) | green |

**Deliberately NOT done (honesty boundary):** the 5 provider-available-but-unmodeled markets (HR/RBI/Runs/Outs/ER) were **not** surfaced as predictions — they have no model `projection`+`sigma`. A per-stat projection + backtest is required first (roadmap). No full-game score / win probability / run distribution was published. `MAX_PICKS_PER_GAME` was **not** raised (would change the artifact + widen product surfaces); the full board comes from the un-capped lean view instead.

Companion docs:
- `docs/MLB_PROP_COVERAGE_AUDIT_JULY21.md` — per-market coverage truth table
- `docs/MLB_FULL_GAME_AND_TEAM_MARKET_ROADMAP.md` — honest path to full-game outputs
- `docs/SOCCER_SIMTHEGAME_PARITY_REQUIREMENTS.md` — future soccer parity (WC stays archived)
- `docs/JULY21_PRODUCT_CARD_CANDIDATE_REVIEW.md` — Bank Builder / Moonshot leg review (no mutation)

## 4. SimTheGame gaps: closed vs remaining

**Closed this pass (MLB):** broad player board (all lines, grouped by team) · signal legend · biggest model leans · market agreement score · **market agreement by stat** · distribution charts (existing) · sim-vs-book gap per line · main takeaways · in-page game selector · clean(er) hierarchy.

**Remaining (documented, not faked):**
- **Full-game outputs** (scoreline, win probability, run distribution) — behind; market-context only; internal engine not public-ready (`MLB_FULL_GAME_AND_TEAM_MARKET_ROADMAP.md`).
- **5 unmodeled player markets** (HR/RBI/Runs/Outs/ER) — provider-available, market-context only, need per-stat models.
- **Inning / half markets, team totals** — not ingested (provider-addable as context).
- **All soccer markets** — archived/future only (`SOCCER_SIMTHEGAME_PARITY_REQUIREMENTS.md`).
- **Pro/pricing gating** — out of scope (GTP is free paper/review).
