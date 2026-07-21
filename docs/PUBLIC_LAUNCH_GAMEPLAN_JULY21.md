# GameTime Picks — Public Launch Gameplan (July 21, 2026)

A founder-facing plan to launch publicly with a realistic sports calendar and honest model/data limitations. The
site is public-safe as of July 21 (MLB-first with the 12-section V2.5 game report, WC archived, both Bank Builder
lanes + Moonshot as active paper review cards, money untouched). Companion docs:
`JULY21_PUBLIC_LAUNCH_FINAL_READINESS.md` (the go/no-go verdict), `MLB_DAILY_OPERATING_PLAYBOOK.md` (exact daily
commands), `SIMTHEGAME_PARITY_GAP_AND_GTP_ADVANTAGE_PLAN.md` (parity audit).

## 1. Current product truth (say this plainly, publicly)
- **MLB is the primary active sport** (regular season; NFL/NBA/NHL are offseason/future).
- **World Cup is complete → archive.** Completed match reports remain viewable; the WC page freshness anchors to
  the newest real WC slate (**2026-07-15**), so it never falsely reads "Live today".
- **The strongest public surface is the MLB player-prop simulation** (10,000-run, real artifact), presented through
  the **12-section V2.5 game report** (`app/src/components/game/mlb-simulation-report-v2.tsx`) plus a
  **market-anchored full-game snapshot** (de-vigged moneyline / run line / total). There is **no public projected
  score, win probability, total-runs distribution, or margin distribution**.
- **Tonight's MLB coverage (of 15 scheduled games):** team markets **4/15** (LAD@PHI, TB@TOR, BAL@BOS, SD@ATL),
  player props **10/15** (295 props), 10k sims **4/15** (same 4), game reports **15/15** (11 read "awaiting posted
  markets"), **12** positive model-vs-market picks across the 4 simulated games. Books post the rest through the day.
- **No market-beating full-game model.** The internal MLB full-game sim **mirrors the market** (81-game backtest);
  soccer's rating engine **loses to the market**. Both stay internal under `data/internal/`, never public, never
  called a model advantage. The `pitcher-strength-v1` and `bullpen-fatigue-v1` features were tested and **failed**
  backtest and are **not adopted** — MLB full-game feature chasing is paused.
- **Bank Builder / Moonshot are paper products** in review mode with **$0 exposure**. Tonight Bank Builder is
  restarted from Step 1 with **both lanes as active review cards** (Lane A survival, combined +306; Lane B value
  band, activated, combined +296) and **Moonshot Step 1 active** (combined +278). Every leg is an MLB player prop
  that settles deterministically from the official MLB Stats API box score. When a slate has no eligible legs they
  honestly show **No Play**. Official record **19-14**, bankroll **$19,065.40**, crown **$20,465.40**, exposure
  **$0**, money md5 `affe6b21071f2b3be96bb2774eb347c3`.

## 2. Launch phases
- **Phase 1 — Public-safe beta (now).** MLB player-prop simulation through the 12-section V2.5 report + honest
  market snapshots; both Bank Builder lanes and Moonshot live as **active paper review cards** ($0 exposure); WC
  archive. This is where we are.
- **Phase 2 — Daily reliability.** Make the daily MLB refresh + settlement dependable: run the refresh each
  morning for the real date, verify the slate, re-run team-markets + sims once books post full lines, settle the
  prior day from official box scores. Fix the Top-10 team-tab source (it currently only reads the WC board).
- **Phase 3 — Product activation cadence.** When the engine surfaces eligible MLB legs (positive model-vs-market
  gap, deterministic settlement, correlation-clean, independent games), approve a paper Bank Builder / Moonshot
  card via the md5-guarded promoter. Keep $0 official exposure unless you explicitly approve real staking.
- **Phase 4 — Active-sport expansion.** Add a sport ONLY when it has real games + odds + deterministic settlement
  (NFL preseason → NFL; NBA return; etc.). Never surface an inactive league as "today".
- **Phase 5 — Model R&D, separated from the public product.** Keep the internal full-game / feature experiments
  under `data/internal/`, never web-served, never in products, until one demonstrably beats the market.
- **Phase 6 — Social / content.** Publish honest daily recaps (what the sim liked, what settled, current record),
  no fake edges or guarantees.

## 3. Daily operating checklist
Full commands + working directories live in **`MLB_DAILY_OPERATING_PLAYBOOK.md`**. In brief:
1. `date` — confirm the real ET date.
2. `bash scripts/refresh_daily_products.sh --date <today>` — roll the slate (credit- and money-md5-guarded).
3. From `app/`: `npx tsx scripts/generate-mlb-game-simulations.mjs --write --date <today> --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` — 10k sims once books post lines (more games covered).
4. Verify: slate date correct, MLB current, WC not "today", `/simulate` features current MLB, money md5 `affe6b21`.
5. Product eligibility: legs that clear a **positive model-vs-market gap + deterministic settlement**. If yes →
   approve a paper card via the md5-guarded promoter (`promote-bank-builder-proposal.mjs`); if no → confirm No Play.
6. Settle the prior day from the official MLB Stats API box score (paper/internal; the 19-14 official record only
   via approved cards).
7. Gates: tsc · suite · build · forensic (**MATHEMATICALLY PERFECT**) · health (**HEALTHY**) · route smoke.
   Publish only if green and money md5 is `affe6b21`.
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
Current + honest + usable + safe. MLB clearly primary via the 12-section V2.5 report; WC archived (freshness
anchored to 2026-07-15); both Bank Builder lanes + Moonshot as active **paper review cards** ($0) or an honest
No Play; money untouched (`affe6b21`, 19-14, $0); gates green. Public-ready — not forced.
