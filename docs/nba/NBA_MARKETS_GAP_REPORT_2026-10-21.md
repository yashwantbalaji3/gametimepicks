# NBA markets gap report — 2026-10-21

**Question:** what prevents (a) public NBA Top Prop Boards with sportsbook lines, and (b) NBA legs in Bank Builder, Moonshot, Parlay Lab and Smart Betslip?

**Short answer:** no NBA price is authorized. Every downstream gate also fails closed on NBA, by design. The private boards (branch `claude/nba-top-boards-v2`) are ready on the model side. They have seven ranked markets (Points, Rebounds, Assists, 3PM, and the joint PRA / P+R / P+A), plus an explicit "not modelled" R+A. Every row carries a row-evaluation contract that calls the shared `evaluateMarket` only when it is given a verified two-way price. Each price column says "No authorized NBA price" (`NO_AUTHORIZED_PRICE`). That is true today and will stay true until the items below close.

Nothing in this report changes a flag, calls a paid API, or authorizes anything. The decisions below belong to their owners.

Line numbers refer to `main` @ `0894582617` plus #1149 (`7808a4b75c`).

---

## A. Price authorization (the root blocker)

### A1. Founder decision `decision-nba-markets-authorization` is open, and the token it offers covers h2h only
- **Where:** `app/src/lib/launch/founder-decisions.mjs:33-44`.
- **What it offers:**
  - The question asks for "an NBA-scoped Odds API receipt (sport key, markets, credit ceiling, validity window)".
  - `answerTokens: ["AUTHORIZE:h2h:<ceiling-credits>", "DEFER"]`.
  - DEFER keeps markets PARTIAL.
- **Gap:** no answer token can authorize player props. Answering `AUTHORIZE:h2h:<n>` would admit game moneylines only. That is not enough for a prop board or a prop leg.
- **Validator hazard:** `app/scripts/ops/founder-decision-dryrun.mjs:55-57` checks only the prefix before the first colon (`t.split(":")[0]`). A token such as `AUTHORIZE:player_points:500` would print "VALID SHAPE" even though the card does not offer it.
- **Owner:** founder (decision). Engineering (card + validator).
- **Decision needed:** whether to authorize NBA at all. If yes, which markets: h2h only, or a named list of `player_*` keys. Also the credit ceiling and the validity window.
- **Engineering left:**
  - Add a props-capable answer token, e.g. `AUTHORIZE:props:<market-list>:<ceiling>`.
  - Make the dry-run validate the full token against the card's offered shapes, not only the prefix.

### A2. No NBA receipt, ledger or parser branch exists
- **Where:** `app/src/lib/sports/odds/p171-authorization.mjs`.
  - `AUTHORIZED_SPORTS` (`:34-38`) and `LEDGER_RELPATH` (`:21-25`) cover nfl, ufc and epl only.
  - Any other sport is refused: `no authorization is defined for "${sport}"`.
- **Receipts:** `docs/receipts/` has no `basketball_nba` receipt.
- **Props mechanism:** `authorizedPropMarkets()` (`:147-170`) admits a prop only from an explicit "Markets added" / "Prop markets authorized" row, and fails closed otherwise. The NFL precedent is `docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`: `:31` says "props … OUT OF SCOPE", and the amendment row at `:79` names five prop keys.
- **Owner:** founder (the receipt). Engineering (parser + ledger).
- **Decision needed:** the receipt text: sport key `basketball_nba`, markets row, ceiling, window.
- **Engineering left:**
  - Add an `nba` entry to `AUTHORIZED_SPORTS` and `LEDGER_RELPATH`, with its own per-sport ledger (another sport's receipt must never serve).
  - Add tests that `authorizedPropMarkets()` reads the NBA markets row.
  - Apply the NFL lesson (`ODDS_AUTHORIZATION_NFL_2026.md:92-100`): expiry must not ignore the Markets row.

### A3. Capture scope excludes props
- **Where:** `app/src/lib/sports/odds/market-scope.mjs:21-23` sets `nba: ["h2h", "spreads", "totals"]`. Its comment says these are "the only market keys each sport's capture may request".
- **Owner:** engineering, after A1/A2.
- **Engineering left:** add the authorized `player_*` keys, gated on the receipt, never by default.

### A4. Odds API markets and credit estimate
- **Where:** `pipeline/config.py:173-197`.
  - Default `ODDS_MARKETS` is 7 keys: player_points, player_rebounds, player_assists, player_threes, player_points_rebounds_assists, player_blocks, player_steals.
  - `ODDS_REGIONS = ["us"]`. Bookmakers default to draftkings and fanduel.
  - `ODDS_MAX_EVENTS_PER_RUN` defaults to 6.
- **Cost:** per-event `/odds` costs 1 credit per market per region.
  - 6 events × 7 markets × 1 region ≈ **42 credits per run**.
  - The comment at `:193-194` still says "6 events × 3 markets … = 18 credits per run" (stale).
  - A full regular-season slate of up to 15 games at the current cap of 6 events still costs 42 per run. Uncapped it would be 15 × 7 = 105 per run.
- **Market mismatch:** the boards need pts, reb, ast, 3PM, PRA, **P+R, P+A**. The default list has blocks/steals instead of P+R/P+A.
  - Seven board markets at 6 events is still 42 per run.
  - The 2026-06-10 probe (`pipeline/probe_nba_markets.py`, `.github/workflows/nba-market-probe.yml`, manual and paid) found player_points / rebounds / assists / threes / points_rebounds_assists / blocks / steals available on one event.
  - It does **not** confirm P+R (`player_points_rebounds`) or P+A (`player_points_assists`) availability.
- **Workflows:**
  - `daily-refresh.yml:66` forces `ODDS_DRY_RUN: "1"`.
  - `auto-refresh.yml:103-115` de-schedules the NBA legacy half unless `vars.NBA_LEGACY_REFRESH == 'true'`.
- **Owner:** ops (env vars, repo variables, plan) and founder (ceiling).
- **Decision needed:** the market list (board families vs blocks/steals), the per-run event cap, runs per day, and the monthly ceiling.
- **Engineering left:**
  - Fix the stale comment.
  - Align `ODDS_MARKETS` with the board families.
  - Before any paid call, confirm P+R / P+A availability with a single founder-approved probe.

### A5. The board stays NO_MARKET until a price object exists
- **Where:**
  - `app/src/lib/sports/nba/top-board-evaluation.mjs` `boardRowEvaluation(row, snapshot, price|null)`.
  - `app/src/lib/sports/nba/top-board-rows.mjs` builds the view.
  - `NBA_PROVIDER_KEY_BY_STAT` maps the board statistics to the provider keys above.
  - `authorizedNbaStats()` reads `NBA_MARKET_CONFIG.playerFamilyByProviderKey`. It is empty today, so every real price is refused with `MARKET_NOT_AUTHORIZED`.
- **Engineering left after authorization:**
  - A capture → verified price object adapter (`kind: "nba-player-prop-price@1"`, provenance with the receipt reference, same event / athlete / statistic, both American prices, `capturedAt`).
  - Pass `evaluations` into `boardTableModel` on the page.
  - Freeze the price beside the board edition (write-once), so settlement has a frozen pregame line.

---

## B. Market configuration and product eligibility

### B1. `NBA_MARKET_CONFIG` has no player prop family and no model
- **Where:** `app/src/lib/markets/sport-config.ts:139-166`.
  - `playerFamilies: new Set()` and `playerFamilyByProviderKey: {}`.
  - `model: { kind: "NONE", … "Nothing model-derived is surfaced — no probability, no lean, no pick." }`.
  - Props are "absent rather than empty-for-now" (`:142`). `PlayerMarketFamily` (`app/src/lib/markets/types.ts:35-53`) has no NBA vocabulary.
- **Owner:** engineering (vocabulary). Founder (whether a model may be surfaced).
- **Decision needed:** whether NBA leaves `model: NONE` (it requires §7 bars, see D1).
- **Engineering left:**
  - Add NBA player families to `PlayerMarketFamily` and `PLAYER_FAMILY_BY_PROVIDER_KEY`.
  - Populate the NBA config only after A1–A3.

### B2. Product-eligible legs hard-code an empty NBA list
- **Where:** `app/scripts/products/build-product-eligible-legs.mjs:84`: `nba: { candidates: [], … ownerNote: "HISTORICAL_ONLY — no current NBA forecast owner; nothing is normalized by design" }`.
- **Contract:** `app/src/lib/products/eligible-leg/contract.mjs`.
  - It lists `nba` in `CONTRACT_SPORTS` (`:42`).
  - It refuses it via `canEnterPredictionProducts` (`:139`, `SPORT_NOT_ELIGIBLE`).
  - `MARKET_PRICED_LEG_POLICY` is "ADMITTED_PENDING_FOUNDER_DECISION" (gate F1, `:35-38`).
- **Owner:** engineering (candidate producer). Founder (F1).
- **Engineering left:**
  - An NBA candidate producer reading the official snapshot (#1149, v0.1 players) plus frozen prices.
  - Every lean must come from `evaluateMarket`, never from the board's projection.

### B3. Parlay Lab: `SOURCES` and `SETTLEABLE_SPORTS` lack NBA
- **Where:**
  - `app/scripts/parlays/lab-eligibility.mjs:55-208`: `SOURCES` covers mlb, nfl, ufc and epl, with no nba. `LADDER_DIR` (`:226`) has no nba either.
  - `app/src/lib/parlays/multi-sport.mjs:156`: `SETTLEABLE_SPORTS = ["mlb", "ufc", "epl", "nfl"]`, with "a sport enters this list when the settler can grade its legs" (`:153-154`).
- **Hazard:** `app/scripts/parlays/settle-lab-cards.mjs:339-343` routes ufc, epl and nfl explicitly. **Any other sport falls through to MLB box-score grading by `gamePk`**, so an NBA leg would be misrouted, not refused. Fix this before NBA is added anywhere upstream.
- **Owner:** engineering.
- **Engineering left:**
  - Add an explicit refusal for unknown sports in `settle-lab-cards.mjs` (worth doing now).
  - Then add an NBA `SOURCES` entry, ladder dir and `gradeNbaLeg` branch, and add `nba` to `SETTLEABLE_SPORTS` only after C1.

### B4. Capability registry: NBA is HISTORICAL_ONLY
- **Where:** `app/src/lib/sport-capability-registry.ts`.
  - NBA entry at `:70-80`.
  - `canEnterPredictionProducts` requires FULL_MODEL (`:210-212`). It covers published picks, suggested parlays and Bank Builder / Moonshot (`:207-208`).
  - `canShowLiveProjections` needs FULL_MODEL or EXPERIMENTAL_PUBLIC (`:219-222`).
  - "Never add a per-sport exception here" (`:203-204`).
- **Downstream gates:**
  - Bank Builder / Moonshot activation: `app/src/lib/daily-portfolio/accounting.ts:229`.
  - Engine-v2: `app/src/lib/products/engine-v2/eligibility.mjs:87-88` (`SPORT_GATED` unless a family grant).
  - Family grants: `app/src/lib/products/engine-v2/family-gate.mjs:25`. `FAMILY_PRODUCT_GRANTS = []`; the only helper is `deriveNflFamilyGates`.
  - Evaluator: `app/src/lib/consistency/market-evaluator.mjs` adds `SPORT_NOT_PRODUCT_ELIGIBLE` from the snapshot capability.
- **Owner:** engineering sets state from evidence. A per-family product grant is a founder grant landed by a reviewed PR.
- **Decision needed:** whether a per-family grant (e.g. NBA points only) is ever acceptable before FULL_MODEL.
- **Engineering left:** none until D1. Then an NBA `derive…FamilyGates` helper mirroring NFL's.

### B5. Smart Betslip
- **Status:** there is no dedicated Smart Betslip source module. It is named only as excluded in `app/src/lib/sports/nba/experimental-public-lane.mjs:7` and in the consistency scan. Its gate is the same registry + snapshot capability (B4).
- **Owner:** engineering.
- **Engineering left:** none beyond B4 and the evaluator rule. Any selection must be an `evaluateMarket` result on the official snapshot.

### B6. Other hard-coded sport lists without NBA
- **Lists:** none of these is a decision, but each must change deliberately:
  - `app/src/lib/sports/graded-picks-loader.ts:41` (`PICK_SPORTS`)
  - `app/src/app/results/page.tsx:125`
  - `app/src/lib/launch/ledger-panel.mjs:13`
  - `app/scripts/ask/build-ask-projections.mjs:402`, `app/src/lib/ask/contract.mjs:477` and `app/src/lib/ask/tools/coverage.mjs:32` (Ask)
  - `app/src/lib/launch/closure-packets.mjs:67` (`nba: []`, "claims nothing by decision")
- **Owner:** engineering.

---

## C. Settlement

### C1. No NBA prop settlement path
- **What exists:**
  - `app/src/lib/sports/nba/settlement-contract.mjs:27` grades `moneyline`, `point_spread` and `total_points` only. Anything else is `VOID_PENDING_REVIEW`. It "only GRADES. It writes no ledger" (`:17-18`).
  - `app/src/lib/sports/nba/top-board-grading.mjs` `settleAgainstLine` has the WIN/LOSS/PUSH vocabulary. It is unreachable because no row has a line.
  - Combo actuals are now graded as the sum of box-score components (`actualStat`); a missing component is null, never a partial sum.
- **NFL precedent:**
  - `app/src/lib/sports/nfl/prop-settlement-ledger.mjs`: durable append-only ledger, frozen pregame line, corrections.
  - `app/src/lib/sports/nfl/prop-settlement-support.mjs`: PROVEN requires a CI-admitted graded row.
- **Owner:** engineering.
- **Engineering left:**
  - NBA prop market keys in the settlement contract.
  - Frozen pregame line capture (needs A).
  - An NBA prop settlement ledger + support derivation.
  - `gradeNbaLeg` in `settle-lab-cards.mjs` (B3).
  - A forward-only proof run before `SETTLEABLE_SPORTS` changes.

---

## D. Preregistration and legal

### D1. Preregistration bars
- **Where:** `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`.
- **§6 minimum samples (`:72-81`):**
  - 1,500 matched player-games with expectedMinutes ≥ 20 for points, rebounds and assists; 800 for 3PM.
  - Below the minimum, a market is HOLD.
- **§7 bars (`:83-103`), product column:**
  - "prop price receipt; hit rate at the market line ≥ break-even over **≥ 500 priced rows**" for points (`:96`). Rebounds, assists and 3PM use "same".
  - PRA / P+A / P+R additionally need each component PUBLIC and joint coverage ∈ [0.76, 0.84] on ≥ 1,000 rows (`:99-100`).
  - The public-forecast column needs, for points: n ≥ 1,500, minutes MAE ≤ 6.0, ≥ 5 % better than the season-mean-rate baseline, coverage ∈ [0.76, 0.84], and ECE ≤ 0.05.
  - "No adoption on a pooled all-market score" (`:102`).
- **§8 (`:107-110`):** historical passes alone never reach PUBLIC; forward shadow is required.
- **§13 (`:150-195`, founder decision 2026-10-20):**
  - Withholds "Odds, lines, edges, picks, Top-10 rankings" publicly because "No authorized NBA price exists" (`:172`).
  - Withholds "Bank Builder, Moonshot and Parlay Lab legs; Smart Betslip selections" because the registry is HISTORICAL_ONLY (`:173`).
  - Rollback triggers include "any probability, odds, edge or pick reaching the page" (`:190`).
- **Owner:** founder (preregistration; any amendment). Engineering pins it in tests.
- **Decision needed:** none now. The bars are fixed. Note: the ≥ 500 priced-rows bar cannot start accruing until A is closed **and** prices are frozen beside board rows (A5). Every day without authorization is a day of zero priced rows.
- **Engineering left:** a priced-row accrual counter in the daily report, per family, once prices exist.

### D2. Terms of Use forbid linking to or partnering with a sportsbook
- **Where:** `app/src/lib/legal/texts.mjs:61`: "The Site does not accept wagers, hold funds, operate user accounts, or link to or partner with any sportsbook." Also `:71`, not affiliated with any sportsbook.
- **Effect:** showing a book's name and captured price as third-party data is not forbidden (`:68` treats odds as data captured at a moment). Deep links, affiliate links and partner placement are forbidden.
- **Owner:** founder + counsel.
- **Decision needed:** none for a board that shows prices without links. Any change to linking is a Terms change.
- **Engineering left:** keep every NBA price cell link-free. The board table renders text only.

### D3. Operator allowlist (PR #1130, draft, open)
- **What it does:** a fail-closed allowlist of 8 US-licensed operators. It withholds offshore offers on MLB and NFL surfaces. It explicitly leaves state jurisdiction / age rules to counsel (SB-01) and leaves offshore books in the no-vig consensus to decisions M-3/M-4.
- **Merge condition:** "merges only on explicit approval of an exact head".
- **Effect on NBA:** any public NBA price cell must name only allowlisted operators. The board's `sportsbook` column and the price adapter would read the same allowlist.
- **Owner:** founder (merge). Counsel (SB-01).
- **Decision needed:** approve #1130 (and M-3/M-4) before any NBA book name is public.
- **Engineering left:** after #1130, check the allowlist in the NBA price adapter (reject a non-allowlisted book with its own reason code).

---

## E. Evaluator and snapshot (no change needed)

The official NBA snapshot (#1149, `7808a4b75c`) carries pts, reb, ast, threePm, pra, ptsReb and ptsAst with support "integer", so the evaluator's continuity rule applies. It also carries minutes (continuous) and lists rebAst in `notModelled`.

`evaluateMarket` handles the combo families as they are. With a verified price, NBA evaluations come back unqualified with FAMILY_NOT_PUBLISHED, PUBLICATION_PRIVATE and SPORT_NOT_PRODUCT_ELIGIBLE. The tests pin this against the committed 2026-10-20 v0.1 artifact.

The board adapter refuses three cases: a v1 (supporting) board row (`NOT_OFFICIAL_FAMILY`), a board row whose payload or median differs from the official snapshot (`BOARD_SNAPSHOT_DIVERGED`), and any price marked TEST FIXTURE.

---

## Order of operations (if the founder chooses to proceed)

1. Fix the lab-settler fall-through to MLB for unknown sports (B3). This is safe now.
2. Founder: decide A1 (a props-capable token), A4 (markets, ceiling) and D3 (#1130).
3. Engineering: NBA receipt parser + ledger (A2), capture scope (A3), one approved availability probe for P+R / P+A (A4).
4. Engineering: price object adapter + write-once frozen price beside each board edition (A5). Prices then start accruing toward §7's ≥ 500 priced rows (D1), still private.
5. Engineering: NBA prop settlement (C1). Then `SETTLEABLE_SPORTS` / lab `SOURCES` (B3) and the product leg producer (B2). All of these remain behind B4.
6. Founder: only after §6/§7 bars are met, a registry state change or a per-family grant (B4). Public boards with lines still also require §13 to be lifted.
