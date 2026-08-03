# Program 112-115 Execution Log — Stage 1 (2026-08-03, 11:00–11:45 ET)

Recovery: local `22349f80` → origin `7749a1ae` (bot commit: auto-refresh props-only 10:59 ET),
fast-forwarded. `bbd2bdd9` confirmed an ancestor. Production served `32598eb2` (verified via
GitHub deployment metadata + real browser, per the bot-challenge contract — not curl alone).

## Resolved paths (recorded before editing)

| Responsibility | Path |
|---|---|
| Base board | `app/public/data/mlb/boards/2026-08-03.json` |
| Player sims | `app/public/data/mlb/game-simulations/` |
| Full-game sims | `app/public/data/mlb/full-game-simulations/` |
| Predictions | `app/public/data/mlb/predictions/` |
| Markets loader | `app/src/lib/markets/load.ts` (`latestMarketDate` requires BOTH team-markets and props) |
| Game detail UI | `app/src/components/game/game-detail-page.tsx` |
| Sim runner UI | `app/src/components/game/game-simulation-runner.tsx` |
| Coverage classifier | `app/scripts/mlb-topup-{decision,classify}.mjs` |
| Board patches | `app/src/lib/mlb/board-patches.mjs` |
| Observer | `app/scripts/public-beta-observe.mjs` |

## Stage 1 findings

**09:30 run:** never fired (GitHub cron miss, confirmed by run list). Watchdog correctly silent —
its contract is recovering a *missing* board. Base cutover therefore stands at the 00:34 board,
sha256 `d2e81ca3…bebf41`, unchanged all session.

**Count reconciliation — one apparent gap, explained:** `player-props` carries 183 rows across
**3** games while the board covers **7**. These are different artifacts: the props file is the
credit-bounded provider capture (`ODDS_MAX_EVENTS_PER_RUN`), not the board's own odds fetch. It
is not a missing prediction, and `latestMarketDate` requires both artifacts so /markets cannot
silently lose its player section. **No unexplained gap.**

**Full-game sims cover 8/8** including the market-less game (`status: unavailable`, 0 picks) —
correct, since full-game sims need team-market upstream, not player props. Player sims cover
7/7 covered games.

## Defect found and fixed (Stage 1 Lane D)

**The "Simulation Ready" badge was hardcoded** in the game-detail hero — every game claimed it.
On LAD @ CHC the page rendered *"▶ SIMULATION READY"* directly above *"GENERATED PICKS 0"* and
*"No precomputed model simulation artifact exists for this fixture yet."* Presence of a fixture
is not readiness of a simulation (same class as "file exists ≠ settled").

Fixed: the badge derives from the artifact's own `status` and pick count, with an explicit
**"Awaiting Simulation"** branch. **Build-verified in the exported HTML**: the uncovered game
renders `Awaiting Simulation`, covered games still render `Simulation Ready`. 4 assertions pin it.

## Coverage state at close

LAD @ CHC still has no posted markets (classifier: 7 `ALREADY_COMPLETE`, 1
`MARKETS_AVAILABLE_ADD_OFFICIAL_PATCH`, 0 frozen). No provider spam: the 15:30 scheduled top-up
owns the next decision. Credits untouched this program — board ledger still `19,475 → 19,455`.

## Boundaries honored

No fabrication, no Aug 1/2 backfill, no model/calibration/threshold change, no reactivation of
archived or protected products (Bank Builder / Moonshot untouched), protected money byte-exact,
`vp/` untouched, base board byte-identical since cutover.
