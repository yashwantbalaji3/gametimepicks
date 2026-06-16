# GameTimePicks — Full Project State / Handoff

_Documentation snapshot. Production SHA `0920a2d` (PR #494 merged). 917 tests passing, build
clean. Paper-only educational analytics — not a sportsbook. No product data/code changed to
produce this doc._

---

## 1. Executive Summary
GameTimePicks is a **paper-only sports analytics website**. It turns real sportsbook odds and
real stat/fixture data into understandable **projections**, **curated suggested parlays**,
**Bank Builder paper ladders**, and **official-result settlement recaps**. It currently covers
**MLB**, **World Cup soccer**, **UFC** (settlement + history), and **NBA** (a completed Bank
Builder run + history). It is **not a sportsbook**, **does not accept wagers**, and exists for
**educational / analytics tracking** only. Live at `https://gametime-picks.vercel.app` and
`https://gametimepicks.yashwantbalaji.com`.

## 2. Product Goals
- Turn raw odds + stat data into clear, honest projections.
- Suggest curated parlay cards (by sport, mixed sport, and risk tier).
- Let users explore projections by sport / game / player / market.
- Build high-quality **Bank Builder** ladders ($100 → larger paper bankroll).
- **Settle everything from official sources** (league APIs / official box scores).
- Show transparency + methodology; avoid fake or stale data.
- Stay user-friendly and visually compelling (V1 crimson-black "lava casino" theme).

## 3. Core Product Principles (integrity rules)
- No fabricated odds, stats, player props, or portraits.
- No settling without official results.
- Model-only data is clearly labelled; **stale/started games are gated out**.
- **Bank Builder is stricter than normal suggested cards.**
- Paper-only framing everywhere.
- **Banned copy:** lock, safe, safest, guaranteed, guarantee, sure thing, free money,
  risk-free, can't miss.
- **Allowed wording:** lower variance, model-ranked, odds-backed, paper-only, suggested,
  data quality, confidence, edge.

## 4. Current Production State
- **Domains:** `gametime-picks.vercel.app`, `gametimepicks.yashwantbalaji.com` (custom domain live).
- **main SHA:** `0920a2d` · **latest PR:** #494 (merged). Earlier stack #490→#493 merged via #493
  (`a96f550`); #488 (V1 theme) + #489 (June 15 methodology + paid run) before that.
- **Tests:** 917 passing · **tsc:** clean · **build:** clean (≈186 static pages, `output: export`).
- **Live features:** V1 crimson-black theme; World Cup-first homepage/Today; Parlay Lab
  (renamed from Picks); Build; Bank Builder (completed Run #1 + live Dual Run #2); Results;
  Methodology; Learn; per-sport pages (World Cup / MLB / NBA / UFC); World Cup player props
  live for Iran/NZ; Dual Bank Builder lanes live + pending.

## 5. Data Providers & Environment Variables
**The Odds API** (`ODDS_API_KEY`) — all prices: MLB game/player props; World Cup 3-way h2h,
double chance (real book odds), totals, BTTS, draw-no-bet, and player-prop odds (anytime
goalscorer, shots on target). The MLB pipeline gates paid `/odds` via its own `--dry-run` flag
+ credit caps (NOT the `ODDS_DRY_RUN` env, which only affects the NBA daily board).

**API-Football / API-SPORTS** (`API_FOOTBALL_KEY`, base `https://v3.football.api-sports.io`,
header `x-apisports-key`) — soccer fixtures, groups/standings, recent form (`/fixtures?team&last=5`),
lineups when posted, player/team metadata, **player photos**, squad matching. Also
`WC_API_FOOTBALL_LEAGUE=1` (World Cup), `WC_API_FOOTBALL_SEASON=2026`. Plan: Pro, active.

**Secrets:** `.env` is gitignored and never committed; production/preview env vars live in Vercel.
Keys are never printed in logs or committed to any tracked file.

## 6. Feature Inventory (routes under `app/src/app/`)
- **`/today` (+ `/`)** — World Cup focus first (fixtures, 3-way w/ Draw, double chance, totals,
  recent-form pills); then live **Dual Bank Builder** lanes; MLB suggested parlays; completed
  Run #1 recap; yesterday's settled results; UFC settled recap (not active).
- **`/world-cup`** — match markets (3-way, double chance, totals, BTTS, DNB), team projections +
  recent form + group, and **player props with real photos** (goalscorer + shots), market-implied/
  limited-data labelled. Game-detail pages per fixture (`/games/world-cup/<slug>`).
- **`/mlb`** — odds-backed player-prop projections (hits, total bases, strikeouts), suggested
  cards, and the Bank-Builder-eligible leg pool.
- **`/ufc`** — UFC Freedom 250 **settled**: moneyline 6–1, cards 0–4 (all card losses from
  Topuria; Hokit +320 hit). History/recap, not active unless a new slate exists.
- **`/nba`** — no active slate; the NBA Finals Bank Builder steps are settled history.
- **`/picks` = "Parlay Lab"** — curated suggested cards (sport / mixed), risk tiers, Bank
  Builder surfaced where relevant. (Route stays `/picks`; `/parlay-lab` redirects to it.)
- **`/build`** — browse/select eligible legs → combined odds/probability/return (a flagged
  future-improvement area for deeper filters + the rich player drawer).
- **`/bank-builder`** — completed Run #1 + live Dual Run #2 (see §7–9).
- **`/results`** — official settlement archive; pending vs settled states.
- **`/methodology`** + **`/learn`** — projection framework, no-vig, implied probability, edge,
  composite confidence, data quality, parlay eligibility, per-sport methodology.

## 7. Bank Builder System
A **paper ladder**: start at **$100** and compound it up a 5-step ladder toward a **$10,000
crown**. Each step is **one suggested paper parlay**; the bankroll only advances after the
step settles **WON from official results**; a loss resets/closes the run. Bank Builder leg
eligibility is **stricter than normal Parlay Lab cards** (lower-variance markets, higher data
quality, no high-variance props). Artifacts live in `app/public/data/bank-builder/`.

## 8. Completed Bank Builder Run #1 — DO NOT CHANGE
- Starting bankroll: **$100** · Final bankroll: **$10,376.17** · Record: **5–0** · Status: **completed**.
- **Step 5:** Devin Vassell Rebounds Over 4.5 + Stephon Castle Rebounds Over 4.5 · **+186** ·
  return **$10,376.17**.
- Official result: **ESPN gameId `401859967` — NYK 94, SAS 90**; Vassell **7 rebounds**,
  Castle **5 rebounds** (both Over 4.5). Source: `public-summary-latest.json` / `ledger-*`.

## 9. Active Dual Bank Builder Run #2 (Step 1 · pending) — DO NOT SETTLE YET
Artifact: `app/public/data/bank-builder/dual-lanes-latest.json` (`runStatus: active`, `status: pending`).
- **Lane A** (lower-variance, cross-sport): **Iran or Draw** (double chance) + **Troy Johnston
  Over 0.5 hits** · **$100 → ~$188.24** · pending.
- **Lane B** (higher-return): **Mike Trout Under 1.5 hits** + **Samad Taylor Over 0.5 hits** ·
  **$100 → ~$215.11** · pending.
- Lane cards now include **player portraits / team logos / flags** and **clickable drawers**
  (model read, recent-5 games, "why", official-source note) + a per-lane step ladder.
- **Caution:** early feedback suggests the lanes may not perform well. **Do not call a win/loss
  until official sources are checked.** Either way, this run should inform **Bank Builder V2**
  stricter eligibility (see §10/§12).

## 10. Known Concerns / Lessons
- Bank Builder must be **stricter** than normal parlays (needs its own eligibility score).
- MLB hitter props can be **volatile even at low lines**; "high model probability" alone is not
  enough for ladder survival.
- Consider avoiding batter-hit props for the ladder unless exceptionally strong; weight market
  type, volatility, and recent-form consistency.
- Soccer **double chance** is useful but needs careful pairing (short price → needs a solid partner).
- Player props are **live but market-implied / limited-data** early in the tournament (per-player
  WC-season stats are thin); labelled accordingly and **not parlay/Bank-Builder eligible**.

## 11. Pending Settlement Checklist (Run #2 Step 1)
See also `docs/audits/dual-bank-builder-step1-settlement-checklist-latest.md`.
- **Lane A** — Iran or Draw: WIN if Iran win **or** draw; LOSS if New Zealand win.
  Troy Johnston Over 0.5 hits: WIN if hits ≥ 1.
- **Lane B** — Mike Trout Under 1.5 hits: WIN if hits ≤ 1. Samad Taylor Over 0.5 hits: WIN if hits ≥ 1.
- **Official sources only:** API-Football final fixture (Iran/NZ, regulation 90); MLB Stats API
  official box scores (hitter props). **Never settle from screenshots, assumptions, or live
  unofficial feeds.** A lane wins only if **both** legs win.

## 12. Recommended Next Steps
**Immediate (after games are final):**
1. Officially settle Dual Run #2 Step 1 from the sources in §11.
2. Update Bank Builder, Results, Today, Parlay Lab to reflect settled state.
3. If both legs in a lane win → advance that lane to Step 2; if a lane loses → close it.
4. Write a success/failure audit under `docs/audits/`.

**Next product build:**
1. **Bank Builder V2 eligibility model** — survival score, volatility penalty, player-prop risk
   penalty, market-type weighting, recent-form consistency, odds-range constraints.
2. Apply the rich player drawer (portrait + recent-5 + why) to Parlay Lab and Build.
3. Expand World Cup player props beyond Iran/NZ to all upcoming fixtures.
4. Improve Build + Parlay Lab filters and card organization.
5. Add more official-settlement automation.
6. Optional heavier ladder animation if desired.

## 13. File / Data Architecture (actual paths)
- **App routes:** `app/src/app/<route>/page.tsx` (today, world-cup, games, picks, build,
  bank-builder, results, methodology, learn, mlb, nba, ufc, …).
- **Shared libs:** `app/src/lib/` — `projection-framework.ts` (no-vig, edge, composite
  confidence, data-quality, concentration, parlay eligibility), `data-dual-bank-builder.ts`,
  `world-cup/projections.ts`, `data-mlb.ts`, `data-parlays.ts`, `normalize.ts`, `freshness.ts`,
  `active-slate.ts`, `nav-active-route.ts`.
- **Key components:** `components/bank-builder/dual-bank-builder-teaser.tsx` (live lanes + drawers),
  `components/player-avatar.tsx`, `components/team-logo.tsx`, `components/flag-badge.tsx`,
  `components/world-cup/wc-projection-card.tsx`, `components/game/game-detail-page.tsx`.
- **Pipelines:**
  - MLB: `pipeline/mlb/generate_mlb_board.py` (+ `attach_recent_games`, `snapshot_parlays`,
    `snapshot_optimizer`).
  - World Cup: `pipeline/world_cup/build_odds_only_projections.py` (markets), `enrich_with_api_football.py`
    (recent form + group), `build_player_props.py` (odds-backed props + API-Football photos),
    `settle.py`; provider in `pipeline/world_cup/providers/api_football.py`.
  - Daily: `pipeline/daily/build_mixed_sport_cards.py`, `build_dual_bank_builder.py` (lane
    selection), `enrich_dual_legs.py` (enrich launched legs in place, no re-selection),
    `settle_suggested_cards.py`.
  - Config: `pipeline/config.py` (loads `.env` via dotenv).
- **Data artifacts:** `app/public/data/` — `bank-builder/` (`public-summary-latest.json`,
  `dual-lanes-latest.json`, `ledger-*`), `mlb/boards/<date>.json`, `parlays/snapshots/<date>.json`,
  `world-cup/{projections,parlays,player-projections}/latest.json`, `ufc/results-settled-latest.json`,
  `daily/cards/latest.json`.
- **Docs:** `docs/audits/*` (per-task audits incl. the settlement checklist), `docs/handoffs/` (this file).
- **Tests:** `app/src/**/*.test.mjs` (run `npx tsx --test $(find src -name '*.test.mjs')`).

## 14. Current Test / Build Health
- **917 tests passing** (`npx tsx --test src/**/*.test.mjs`); **tsc** clean; **build** clean
  (`npm run build`, ≈186 static pages, `output: export`).
- Routes verified 200 on both production domains; integrity confirmed (Run #1 $10,376.17/5–0/
  completed; UFC 250 final/6–1; Dual lanes pending; WC player props live with real photos).
- `next dev` cannot serve the dynamic game-detail route under `output: export` (a dev-only
  quirk) — the static build/deploy generates all pages.

## 15. Final Handoff Summary
- **Live now:** V1 theme; World Cup-first Today/homepage with player props (Iran/NZ, real photos);
  Parlay Lab; Build; Results; Methodology; completed Bank Builder Run #1; **live Dual Bank Builder
  Run #2 (Step 1 pending)** with rich clickable lane cards.
- **Pending:** Dual Run #2 Step 1 settlement (Iran/NZ + 2 MLB hitter props) — awaiting official
  final results.
- **Must NOT be touched:** completed Run #1 ($100 → $10,376.17 / 5–0); UFC 250 settlement
  (6–1 / cards 0–4); historical results; `.env`/secrets; the launched Run #2 lane legs (settle,
  don't re-select).
- **Next session should first:** check whether Iran/NZ + the MLB games are official/final; if so,
  settle Run #2 Step 1 from official sources (§11), update the UI, and write the settlement audit;
  then start Bank Builder V2 eligibility scoring.
