# GameTime Picks — Public Launch Gameplan (July 21, 2026)

A founder-facing plan to launch publicly with a realistic sports calendar and honest model/data limitations. The
site is public-safe as of July 21 (MLB-first, WC archived, products honest No Play, money untouched).

## 1. Current product truth (say this plainly, publicly)
- **MLB is the primary active sport** (regular season; NFL/NBA/NHL are offseason/future).
- **World Cup is complete → archive.** Completed match reports remain viewable; it is not "today".
- **The strongest public surface is the MLB player-prop simulation** (10,000-run, real artifact) + a
  **market-anchored full-game snapshot** (de-vigged moneyline / run line / total).
- **No market-beating full-game model.** The internal MLB full-game sim **mirrors the market** (81-game backtest);
  soccer's rating engine **loses to the market**. Both stay internal, never public, never called an edge. Pitcher-
  strength and bullpen-fatigue features were tested and **failed** — MLB full-game feature chasing is paused.
- **Bank Builder / Moonshot are paper products** that go live only with current, settlement-supported, eligible
  legs; otherwise they honestly show **No Play**. Official record 19-14, $0 exposure.

## 2. Launch phases
- **Phase 1 — Public-safe beta (now).** MLB player-prop simulation + honest market snapshots; products honest
  No Play or (when eligible) a paper card; WC archive. This is where we are.
- **Phase 2 — Daily reliability.** Make the daily MLB refresh + settlement dependable: run the refresh each
  morning for the real date, verify the slate, re-run team-markets + sims once books post full lines, settle the
  prior day from official box scores. Fix the Top-10 team-tab source (it currently only reads the WC board).
- **Phase 3 — Product activation cadence.** When the engine surfaces eligible MLB legs (real edge, settlement,
  correlation-clean), approve a paper Bank Builder / Moonshot card via the md5-guarded promoter. Keep $0 official
  exposure unless you explicitly approve real staking.
- **Phase 4 — Active-sport expansion.** Add a sport ONLY when it has real games + odds + deterministic settlement
  (NFL preseason → NFL; NBA return; etc.). Never surface an inactive league as "today".
- **Phase 5 — Model R&D, separated from the public product.** Keep the internal full-game / feature experiments
  under `data/internal/`, never web-served, never in products, until one demonstrably beats the market.
- **Phase 6 — Social / content.** Publish honest daily recaps (what the sim liked, what settled, current record),
  no fake edges or guarantees.

## 3. Daily operating checklist
1. `date` — confirm the real ET date.
2. `bash scripts/refresh_daily_products.sh --date <today>` — roll the slate (money md5-guarded).
3. Re-run MLB team-markets + `generate-mlb-game-simulations.mjs` once books post full lines (more games covered).
4. Verify: slate date correct, MLB current, WC not "today", `/simulate` features current MLB, money md5 `affe6b21`.
5. Product eligibility: does today have eligible edge legs? If yes → approve a paper card (md5-guarded promoter);
   if no → confirm No Play (don't force).
6. Settle the prior day from official box scores (paper/internal; the 19-14 official record only via approved cards).
7. Gates: tsc · suite · build · forensic · health · leak/fake-claim scans · route smoke. Publish only if green.
8. Post an honest social summary.

## 4. What NOT to do
Do not force picks · do not claim EV / market-beating / validated edge · do not surface internal model numbers
publicly · do not use completed World Cup legs or settlement-pending player props · do not present an inactive
league as today · do not chase a market-beating full-game model without out-of-sample evidence.

## 5. Next engineering milestones (ranked)
1. **MLB daily refresh + player-prop reliability** (full-slate coverage once odds post; the guard bug is fixed).
2. **Product card approval / promoter workflow** (make it one-command + md5-guarded for the operator).
3. **Results / settlement automation** (official box-score settlement; paper vs official cleanly separated).
4. **Public UX polish** (MLB hub, methodology clarity, No-Play copy).
5. **Top-10 team-tab source fix** (feed MLB team markets, not just the WC board).
6. **Active-sport expansion criteria** (a checklist gate before any new sport goes live).
7. **Social / content export.**
8. **Longer-term independent-model R&D** (internal-only, gated on beating the market).

## 6. Success definition
Current + honest + usable + safe. MLB clearly primary; WC archived; products honestly active or No Play; money
untouched (`affe6b21`, 19-14, $0); gates green. Public-ready — not forced.
