# June 19 — paid Odds API MLB + Mixed generation + Bank Builder placement

_Branch `june19-paid-mlb-mixed-bankbuilder-run` off main `bf1df1fd` (PR #533 merged). Run at 2026-06-19 ~12:30 ET._

## Phase 1 — paid key verification (read-only, suffix-only — never the value)
| key suffix | detected plan | remaining | used | floor | allowed? | notes |
|---|---|---|---|---|---|---|
| `****2a97` | **paid** | **18613** | 1387 | 2000 | **yes** | total quota ~20000 = paid plan. Old free `****4309` is gone. MLB board dry-run: 14 events, est cost 56 credits, projected after ~18557 ≫ 2000 floor. |

Paid key confirmed → cleared to run the real paid MLB fetch.

## Baseline (before changes)
| area | current state | source | action needed | success condition |
|---|---|---|---|---|
| Odds API key/quota | paid `****2a97`, 18613 remaining | `.env` / quota probe | none (verified) | plan=paid, remaining ≫ floor |
| MLB board | schedule-only (14 games, `free_key_blocked` under old key) | `mlb/boards/2026-06-19.json` | regenerate with paid odds | board has eventsWithOdds>0 OR honest `odds_unavailable` |
| MLB cards | none (no odds) | parlay engine | generate by risk after odds board | cards fit bands; no leg <-500 |
| Mixed cards | none (no MLB legs) | parlay engine | generate after MLB legs exist | cards fit bands; ≥1 WC + ≥1 MLB leg |
| diagnostics | WC-only, MLB/Mixed empty (free_key_blocked) | `parlays/card-factory-diagnostics.json` | regenerate | reflects live MLB/Mixed + guard counts |
| Lane A Step 2 | awaiting; stake $197.88; target ~$600–750 (~+203..+279) | `methodology/launch/dual-bank-builder-active.json` | place only if valid diversified pre-event card | active Step 2 with exact legs OR documented awaiting |
| Lane B Step 1 | starting/queued; stake $100; target ~$190–220 (~+90..+120) | active artifact | place only if valid card | active Step 1 OR documented awaiting |
| Mr. Dub | bankroll $10,176.17; exposure $0; 8-2-0-0 | mr-dub artifacts | +stake on placement only | exposure matches placements |
| Bank Builder | active run surfaced across slate dates | `dual-bank-builder-active.json` | advance only if placed | public ladder correct |
| Results | no pending settlement expected (pre-event) | results artifacts | none unless official final | unchanged unless official |
| Today/Picks/Parlays/Build | WC live; MLB/Mixed empty | slate loader | inherit new cards | counts reflect live cards |
| protected history | `public/data/bank-builder/*` immutable | git | never mutate | unchanged |

## Phase 2 — MLB odds-backed board
`pipeline.mlb.generate_mlb_board --date 2026-06-19` (paid): **14 games, 14 with odds**, `oddsSource: the_odds_api`, `propsAvailable: true`, **638 leans** (286 high / 74 med / 222 low conf), markets pitcher_strikeouts + batter_hits + HRR + total_bases. **Credits 18613 → 18557 (56 spent).** `attach_recent_games` enriched 592/638 leans. No fabrication.

## Phase 3 — MLB cards by risk
Engine (build-time) MLB cards, re-bucketed by combined odds: **Low 0 · Medium 8 · High 5 · Longshot 7** (582 eligible legs). 0 out-of-band, 0 legs shorter than -500. Low empty (2+-leg parlays price above +100).

## Phase 4 — Mixed WC+MLB cards by risk
Mixed cards: **Low 0 · Medium 10 · High 4 · Longshot 6**. Every card ≥1 WC + ≥1 non-soccer leg, fits its combined-odds band, no guarded legs.

## Phase 5 — diagnostics
`card-factory-diagnostics.json` regenerated: **74 cards passed** (WC multi 11/4/5, MLB 8/5/7, Mixed 10/4/6, single-game WC by game). Odds-band guards: 39 legs too short, 1 too long, 20 cards re-homed, 0 dropped out-of-band.

## Phase 6 — Bank Builder placement decisions
**Eligibility nuance:** today's WC slate is **odds-only** (no API-Football stat layer; `API_FOOTBALL_KEY` not set) → every WC projection row is `bankBuilderEligible: false`. BUT the engine's `selectTargetFitDualBankBuilder` gates on **survival score** (WC≥65 / MLB≥80), not that projection flag — consistent with the prior June-18 run which used `dataQuality: B` WC legs. Both placed cards clear the engine's survival floors.

**PLACED (operator-confirmed):**
- **Lane A Step 2** ($197.88 → ~$617.63): **USA moneyline_90 -165** (surv 73, model 59.6%) + **Griffin Jax Strikeouts Under 4.5 -106** (surv 100, elite/q100, model 71.3%, +22.8% edge, 20 samples, probable starter). Combined **+212 (3.121×)**, joint hit 42.5%. Pre-event (19:00Z / 23:11Z). Diversified, no extreme favorite (≥-300), no banned/overlap leg.
- **Lane B Step 1 restart** ($100 → ~$203.01): **Turkey draw_no_bet -230** (surv 75, model 64.0%, draw refunds) + **Zack Gelof Hits Over 0.5 -241** (surv 80, model 82%). Combined **+103 (2.030×)** — near-boundary Medium (documented; no 2-leg combo prices into pure Low), clears the $200 rung. Pre-event (03:00Z / 01:41Z). Diversified from Lane A.

Public ladder view verified: both lanes render **active** (Lane A Step 2, Lane B Step 1); Lane B's lost Step-2 history is hidden (clean restart, prior steps moved to `priorLane`). Replacement candidates written per lane (Lane A: Morocco ML, Skubal U6.5 K; Lane B: Lowder U4.5 K, Prielipp K).

**Mr. Dub:** open exposure $0 → **$297.88 (2.93%)**; bankroll unchanged **$10,176.17**; record 8-2-0-0 with **2 pending**; bankrollHealth "Low exposure · 2 lanes live"; exposure breakdown populated (by sport/market/team/lane/status). Ledger + daily-summary appended.

**Results:** no change — all four legs pre-event, no official finals; nothing settled.

## Guards
No fabrication; no full keys printed/committed (suffix-only); protected `public/data/bank-builder/*` untouched; no placement after start time; stale UFC results-only; canonical risk labels; no banned copy.
