# GameTime Picks — Company Knowledge Base

**Maintained by:** Claude (VP of Product & Operations)
**Version:** v0.2 — 2026-07-06
**Anchored to:** July 4–6 2026 artifacts (`END_TO_END_REPO_REVIEW_AND_ROADMAP.md`, `JULY_10_LAUNCH_CHECKLIST.md`, `CLAUDE_TEAM_OPERATING_SYSTEM.md`, `CEO_DAILY_WORKFLOW.md`, `METHODOLOGY_V2_LADDER.md`, `MODEL_REVIEW_2026-07-05`, both July-6 briefings)
**Status:** Living document. Single source of truth for strategy & product state.

> **Reading key:** `✅ CONFIRMED` = grounded in a July 4–6 artifact. `🕰️ HISTORICAL` = true earlier, now superseded — kept for context. `⚠️ NEEDS INPUT` = I need a decision or fact from Yash. `🔭 INFERENCE` = my judgment, not a repo fact.
> **Freshness rule (per founder):** newest Claude Code deployment reports and current repo artifacts outrank older handoffs and the README. When two sources conflict, newest wins.

---

## PART A — CONFIRMED CURRENT STATE (July 4–6, 2026)

### A0. One-paragraph summary
GameTime Picks is a soft-launch-ready, sportsbook-style **paper-prediction product** with provably honest money accounting. In ~9 weeks and ~1,000 commits it went from a model-board demo to a real product whose core asset is **settlement discipline**: a single canonical bankroll moves *only* through an official-results-gated, dry-run-verified, idempotent, forensically-audited pipeline, enforced on every deploy by 1,572 tests and a set of hard gates. It is honest, paper-only, and model-driven, run as a one-person company where Claude is the team (Code executes, Chat strategizes, Cowork/VP coordinates). **Soft-launch target: July 10, 2026.**

### A1. The goal & founder decisions (confirmed July 6)
**Goal:** GameTime Picks becomes a **real public-facing sports analytics business**, not a portfolio project. Short term: a polished, paper-only prediction product that builds trust. Long term: a scalable sports analytics company. Near-term milestone: a clean **July 10 soft launch**.

**Founder decisions of record (2026-07-06 — full ADRs in `decisions/DECISION_LOG.md`):**
1. **North star:** trust-first now → scalable analytics business later.
2. **Primary user:** sports fans who want simple, trustworthy, model-backed picks *without* needing the details. Secondary: evaluators — recruiters, investors, collaborators.
3. **3-month success:** polished live product, daily *automated* slates, visible model performance, strong flagships, growing audience. Metrics: product freshness · user trust · daily active usage · settled pick performance.
4. **July 10:** proceed as a **soft launch** — usable and polished, no big marketing push yet, keep improving.
5. **Monetization:** **not now.** Build trust, traffic, track record first; later via premium analytics / subscriptions / tools. **No sportsbook affiliate money.**
6. **LADDER_V2:** stays **preview-only** until settlement support is fully implemented and tested. Never fake it as live.
7. **Automation:** maximize it, **but money movement and major card approvals stay operator-gated** until the system proves itself over more days.
8. **Post-World-Cup flagship:** **MLB** becomes the next primary sport; **Bank Builder + Top 10** remain the cross-sport flagships.
9. **Operating model:** Chat = strategy · Code = implementation · Cowork/VP = product org + parallel planning. Keep improving it.
10. **Positioning:** honest paper-only sports analytics. **No real-money betting language, no guarantees, no fake certainty.** Casino/sportsbook-*inspired* look is fine; copy must stay responsible.

### A2.0 Latest verified snapshot — July 8 (rolling)
**Money:** md5 `affe6b21071f2b3be96bb2774eb347c3` · **record 19-14** · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 · **open exposure $0**. **Bank Builder:** no-play, awaiting Step 3. **Moonshot:** no-play. Slate July-8 (MLB 15 games live). `warnings: []`.
**Product direction shift:** the app is now **simulation-first** — `/simulate` route live, sim-first primary nav, MLB July-8 simulation artifacts live (`mlb/game-simulations/2026-07-08.json`, 1,000 runs), model-vs-market + projection-vs-line visuals. Claude Code is upgrading it into a fuller FreeSim-inspired dashboard (UX/product, **not** betting activation). See `plans/0008` Game Lab track. **No active money exposure without founder approval.**

### A2. Production state (verified facts, July 4–5)
| Item | Value |
|---|---|
| Canonical record | **17–12** (Jul 4) → **17–14** after July-5 official settlement |
| Bankroll | **$19,265.40** (started $100 on Jun 9) |
| Crown (peak, banked) | **$20,465.40** = two completed $100→$10K ladders |
| ROI / profit / drawdown | 191.65× · $19,165.40 profit · $1,200 drawdown (12 lost $100 seeds) |
| `portfolio.json` md5 | `e8b1416b…` (canonical, forensic "MATHEMATICALLY PERFECT") |
| Routes | 62 built routes / **13 clean user-facing routes** |
| Gates (last run) | money-integrity ✓ · forensic ✓ · idempotence ✓ · health ✓ · tsc ✓ · 1,572/1,572 tests ✓ · smoke 9/9 |
| Odds API credits | ~19,400 remaining (~60–100/day burn → ~6 months headroom; no low-credit alarm yet) |
| Soft-launch readiness | **9.5/10** (remaining 0.5 is operational, not product) |

### A3. Product portfolio (confirmed)
| Product | Status | Notes |
|---|---|---|
| **Bank Builder** | ✅ Launch-ready — **the flagship** | Two banked $100→$10K ladders are the proof. Dual-lane (A survival / B value). Approval-locked, date-gated, player-props banned, reliability-weighted. |
| **Mr. Dub** | ✅ Launch-ready — **the proof surface** | Derived-only flagship ledger; reconciles exactly to canonical money. Timeline/KPIs/charts/attribution. |
| **Knockout board** (World Cup) | ✅ Launch-ready — **best UX in app** | Filterable/sortable pick board, real-clock statuses, same-game parlay previews with correlation warnings. |
| **Top 10 Picks board** | ✅ Live | Universal board (WC team markets + qualified props + MLB leans), ranked by reliability × probability + edge — never payout. Tabs: Top 10 / Safe / Value / Team / Props. BB pool = this board's team-market family (products can't disagree). |
| **Moonshot** | ✅ Live, honest, **not compelling (0–5)** | $25/day high-variance lottery; +700 floor. Keep, don't feature above BB. |
| **World Cup Specials** | ✅ Live, honest, **weak record (0–17)** | +700..+3000 longshots by design; page must keep leading with that honesty. |
| **MLB boards** | ✅ Live, **under-productized** | ~400–1,100 real-odds props/day, honest labels. Gaps: no MLB suggested parlays, no auto MLB prop settlement into /results. |
| **Suggested Parlays / optimizer** | 🟡 Functional, thin | Optimizer *results* stale since Jun-18 (banner-disclosed); no automated grading revival yet. |
| **Results** | ✅ Honest | Settled-only math; pending/unsupported never losses; 11MB page (down from 21MB) — still heavy on mobile. |
| **Methodology** | ✅ Live | Honest badges incl. "legacy pipeline run · N days ago." |
| **/ops dashboard** | ✅ Live (internal) | Read-only admin view from `admin/status.json`: money-gate badge, health, product readiness, warnings, **Next action**. |
| **Homer Nukes** | 🗑️ Retired cleanly | Historical ledger kept. |

### A4. The money engine (the crown jewel)
- **Source of truth:** `portfolio.json` + `banked-ladders.json` (append-only crown truth). Everything else on the money side is *derived* by `build-mr-dub-ledger.mjs` and validated by a forensic day-chain audit.
- **Never hand-edit:** `portfolio.json`, `banked-ladders.json`, `bank-builder-approved.json` (post-approval), settlement history. The only historical money drift *ever* came from a manual rewrite — now memorialized and regression-tested.
- **Writer:** canonical money changes **only** via `settle_soccer_day.sh` (dry-run default → hand-grade → `--apply` → ledger rebuild → money gates). Official results only (API-Football / MLB Stats API). 90'-regulation policy for knockouts (ET goals never flip 90' markets).

### A5. Architecture (confirmed)
- **Frontend:** Next.js 14 App Router, **static export** (build-time fs reads), TypeScript strict, Tailwind, dark vault/gold theme. Time-dependent state (freshness badges, slate chips, knockout statuses) re-derived client-side from the real browser clock — this closed the "frozen build clock" class of bugs.
- **Pipeline:** Python (`pipeline/world_cup/*`, `pipeline/mlb/*`) pulls real odds (The Odds API) + official finals/stats (API-Football, MLB Stats API) → writes artifacts under `app/public/data/`.
- **Deploy = the "clock tick":** Vercel build, verified by `smoke-test-production.mjs` (9 checks). `gametimepicks.yashwantbalaji.com` (primary) + `gametime-picks.vercel.app`.
- **Known tolerated debt:** ledger rebuild re-stamps `generatedAt` → md5 changes without value change (cosmetic); ~4 duplicate `usd()`/date formatters; two board-parlay builders; `--vault-*` vs `--gtp-*` token split.

### A6. The Claude Operating System (confirmed, current)
- **Single machine state:** `app/public/data/admin/status.json` (via `build-admin-status.mjs`) — read first by every role to answer "what is the state and the next action?" Surfaced to the human at `/ops`.
- **Definition of done = the gates** (run from `app/`): money-integrity, forensic audit, health, idempotence, `tsc`, tests, build, production smoke. **Never deploy red.**
- **Prime directives:** (1) canonical money only via official settlement; (2) no fabrication; (3) fail closed; (4) pending ≠ loss; (5) no forced cards.
- **7 roles / "hats"** (each = ownership + expected output + gate): Ops Manager, Quant/Model Analyst, Product Manager, QA Engineer, UI/UX Designer, Data Engineer, Launch Manager. Missions in `agents/*/mission.md`; copy-paste prompts in `CLAUDE_PROMPT_LIBRARY.md`.
- **Three surfaces:** Claude **Code** = engineering execution; Claude **Chat** = strategic brain (roadmap, risk, monetization, prompt-generation); Claude **Cowork/VP (me)** = management layer, coordinates departments and produces plans, never edits the repo.
- **The 3 judgment calls only Yash makes:** (1) which card to approve / no-play; (2) whether a model-weight change is justified; (3) when to deploy to the public.

### A7. Daily ops loop (confirmed)
Automated: settlement engine (official-gated, idempotent), full display refresh (`refresh_daily_products.sh`, money-md5-guarded), health gate, nightly-settle bot, smoke test. **Operator-required by design:** BB card approval, settlement `--apply`, deploy push. **Operator-required that *should* be automated:** the nightly loop itself and the daily Vercel rebuild — blocked only on unset GitHub secrets (`VERCEL_DEPLOY_HOOK_URL`, `ODDS_API_KEY`, `API_FOOTBALL_KEY`). Evening loop is ~15 min (settle → refresh → approve card → gates → push → smoke 9/9).

### A8. Model methodology (confirmed, settled-data-only)
Intentionally simple + explainable; changes require settled evidence, never overfit one night.
- **Reliability by market (canonical settled legs):** Double Chance **8–1** (its one loss a −500 favourite losing outright — an uncatchable tail) · DNB strong · Moneyline 8–2 (both losses knockout draw-traps) · Totals 10–6 (weakest team market; recent misses = 90'-draw traps + one over) · BTTS 1–3 (worst-calibrated: ~55% modeled vs ~25% settled) · **player props banned in BB** (~8% settled WC).
- **Card shape:** 2-leg (12–7) beats 3-leg (2–2) directionally → fewer, stronger legs.
- **Rules added from failures (all tested):** player-prop ban, approved-card lock + no-drift tests, 90'-regulation settlement, ultra-juice floors, market-reliability weighting (BTTS +0.25 always; totals +0.15 when draw ≥26%).
- **Sample caution:** every model claim rests on ~29 settled BB decisions / ~39 legs. **Do not tune any market with <10 settled observations in its cell.** Open empirical question: are 59–63% modeled totals miscalibrated *in knockouts specifically*, or just unlucky (n=3)? Needs ~3+ more weeks.
- **Latest lesson (Jul-5):** an upset-driven loss + a totals miss justified **no weight change** — only tighter *selection discipline* (Lane B made a NO-PLAY rather than sell a fair-priced card as "value"). "Skip the weak card" is the most repeatable settled lesson.

### A9. Methodology v2 ladder (shipped as POLICY + DISPLAY only — NOT live for money)
Profit-preserving Bank Builder that **cashes out a growing % of winnings from Step 3** (v1 rolls 100% — the July-3 $700.78 Step-3 loss proved the cost). A dollar-schedule v2.1 template exists (locks seed back at Step 2, escalating locks to ~$10,380 total). **Settlement still runs v1 all-in for both BB and Moonshot.** v2 money activation is deliberately gated behind a checklist because partial cash-out breaks three money invariants (settle split into realized+rolled, forensic day-chain must learn the new event type, `banked-ladders.json` needs a `partialExtractions[]` series). Activate behind a `LADDER_V2` flag → synthetic 7-step dry run → extend forensic+idempotence gates → migrate pinned tests → first live v2 card. **This is the single biggest pending model/engineering decision.**

### A10. Risks (confirmed register, top items)
| Risk | Severity | Status |
|---|---|---|
| Overfitting to ~30-sample model | **Med-High** | Freeze tuning until n≥10 per market cell; "don't change blindly" rule in force |
| Operator dependence for nightly loop | Med | Automate via GH secrets (owner one-time action) |
| Stale slate shown live | Med | Client-clock badges everywhere; true fix = daily rebuild hook (pending secret) |
| API credit exhaustion | Med | ~6 months headroom but **no low-credit alarm** — recommended add |
| Money corruption | Critical (near-zero now) | Official-only writer, md5, forensic, idempotence, health |
| Approved-card drift | High (mitigated) | Only a manual rewrite can drift — never edit approved.json post-approval |

### A11. Launch (July 10) — confirmed status
**Hard launch blockers: NONE.** The product is deployable today. High-impact, low-risk "should" items before launch: (1) owner sets the three GitHub secrets → hands-free daily rebuild/settle; (2) run the nightly loop daily (freshness IS the product); (3) approve a fresh BB card so the flagship shows a live climb at launch; (4) add an Odds-API credit-floor guard to the refresh script. **Deliberately deferred (documented, not blockers):** LADDER_V2 settlement activation, team/player drilldowns, MLB suggested parlays, optimizer grading revival, design-token unification, /results pagination.

---

## PART B — HISTORICAL CONTEXT (superseded; kept for lineage)

- 🕰️ **README.md** describes an "NBA-only demo-data v1 portfolio project." This is **stale** and contradicts the live product. It remains the public front door — reconciling it is a roadmap candidate (see decisions).
- 🕰️ **v0.1 of this KB (and the late-May/early-June handoffs it drew from)** framed the product around NBA/MLB props, a "Simplified Guided Product" 4-PR UX plan, and May-22 methodology hit rates (~52.3%). Superseded: the product's center of gravity is now the **World Cup paper-prediction ladder + honest money ledger**, not NBA prop leans. Use those handoffs only for "how we got here."
- 🕰️ **Cricket/IPL** — built then removed. Stays removed.
- 🕰️ **Homer Nukes** — retired; historical ledger retained.
- 🕰️ **Optimizer results** — stale since Jun-18 (disclosed on-page).
- 🕰️ **World Cup itself is time-boxed** — when the tournament ends, MLB/NBA must become the product. Post-WC transition is an explicit 30-day roadmap item.

---

## PART C — ROADMAP (from July 4 review)
- **30 days:** hands-free daily ops (cron + deploy hook + failure alerting); MLB prop settlement → /results; MLB suggested parlays; revive optimizer grading; accumulate model sample (no tuning); **post-World-Cup transition plan**.
- **60 days:** auto monthly calibration report (modeled vs settled by market×competition); interactive paper parlay builder; NFL/NHL season prep reusing the WC pipeline pattern; second odds source for line-shopping honesty.
- **90 days:** accounts + saved slips; bankroll Monte-Carlo simulator over real settled distributions; automated backtesting harness over the settlement archive; admin dashboard v2; alerting (settlement/credit/gate failures).

---

## PART D — KEY FILES MAP (current)
- **Strategy/state:** `docs/END_TO_END_REPO_REVIEW_AND_ROADMAP.md` (Jul 4, the master review), `docs/JULY_10_LAUNCH_CHECKLIST.md`, both `docs/GameTimePicks_Claude_*_Briefing.docx` (Jul 6).
- **AI OS:** `docs/CLAUDE_TEAM_OPERATING_SYSTEM.md`, `CEO_DAILY_WORKFLOW.md`, `DAILY_CLAUDE_RUNBOOK.md`, `CLAUDE_PROMPT_LIBRARY.md`, `CUSTOM_CHANGE_WORKFLOW.md`, `CLAUDE_TOOL_USAGE_GUIDE.md`, `ADMIN_DASHBOARD_SPEC.md`, `agents/*/mission.md`.
- **Model:** `docs/METHODOLOGY_V2_LADDER.md`, `docs/MODEL_REVIEW_<date>.md`, `docs/MODEL_LEARNING_LOOP.md`.
- **Ops:** `docs/DAILY_OPS.md`, `OPERATIONS_RUNBOOK.md`, `RECOVERY_RUNBOOK.md`, `docs/NIGHTLY_SETTLE_FIX_2026-07-06.md`.
- **Money truth:** `app/public/data/mr-dub/portfolio.json`, `banked-ladders.json`, `admin/status.json`.
- **Scripts:** `settle_soccer_day.sh`, `refresh_daily_products.sh`, `roll_to_next_day.sh`, `smoke-test-production.mjs`, gate scripts under `app/scripts/`.

---

## Changelog
- **v0.2.6 (2026-07-08):** Recorded July-8 state (verified): md5 `affe6b21`, record 19-14, open exposure $0, BB/Moonshot no-play. App is now **simulation-first** (`/simulate` live, sim-first nav, MLB sim artifacts live, 1,000-run MLB). Staged the simulator-dashboard oversight scaffold. Hard rule reaffirmed: no exposure/BB/Moonshot without explicit founder approval; MLB artifact supports 1,000 runs only (never claim 10,000); no soccer sim modules faked.
- **v0.2.5 (2026-07-07):** Added the **Game Lab / Matchup Lab** track to `plans/0008` — click a game → branded simulation animation → honest model report → mapped to Bank Builder/Moonshot/WC Specials/Top 10/no-play. VP data check: WC game artifacts already carry point probabilities (win/draw/away, total, BTTS, DC/DNB) so a real report is buildable now; distributions/scorelines/corners/player grids need model work (monte-carlo is shadow-only, not persisted). First send = read-only Phase 1A audit. Animation must be UX-only, never fake play-by-play.
- **v0.2.4 (2026-07-07):** Competitive teardown (GameScript/Dan Gamble, ParlayPros, SimTheGame) + GTP v2 feature plan, daily content engine, and `plans/0008` (competitor-inspired depth, docs/data-first). Key finding: SimTheGame is a *market-derived* sim with no tracked record — our forensically-settled paper ledger is the moat; close the depth/distribution gap without ceding trust. Recommendation: hold 0008 until post-launch; ship the Daily Social Pack (Phase 5) first.
- **v0.2.3 (2026-07-06):** Designed the full **AI Company Operating Model v1** (`ops/AI_COMPANY_OPERATING_MODEL.md`) — two line departments (Sports Operations, Social/Growth) + shared-service function pool + Code execution layer, with org chart, ownership, daily/weekly duties, an ET schedule table, reporting lines, and the four founder gates (card · weight · deploy · brand). Implementation = `plans/0005` (docs-only); Plan 0004 folded in as Phase 1. Verified July-6 settlement (18-14, md5 `b7c35f72`, Lane A won, July-7 proposal correctly awaiting approval).
- **v0.2.2 (2026-07-06):** Designed the Sports Operations hierarchy (`ops/SPORTS_OPS_MODEL.md`) — a Sports Operations Lead over per-sport analysts (soccer/baseball active; basketball/hockey/football standby), layered on the existing function roles. Implementation plan `plans/0004` (docs-only, post-settlement). Verified the July-6 settlement was correctly deferred (USA-Belgium not final) with cleanups shipped and money untouched.
- **v0.2.1 (2026-07-06):** Recorded 10 founder decisions in A1 and formal `decisions/DECISION_LOG.md`. Locked goal (trust-first → scalable business), primary user (sports fans), no-monetization-yet, LADDER_V2 preview-only, MLB as post-WC flagship, responsible casino-inspired positioning. Drafted P0 docs (Vision, Positioning, Go/No-Go, Metrics template).
- **v0.2 (2026-07-06):** Full rebuild anchored to July 4–6 artifacts. Added confirmed money/product/AI-OS state, Methodology v2 status, July-10 launch picture, risk register. Split confirmed-current from historical (README/NBA framing now marked superseded). Captured founder goal: polished public product → scalable business.
- **v0.1 (2026-07-06):** Initial KB from repo sweep + Cowork briefing; flagged README-vs-reality gap.
