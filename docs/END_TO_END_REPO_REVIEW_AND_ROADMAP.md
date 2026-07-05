# GameTime Picks — End-to-End Repository Review & Roadmap
*Written 2026-07-04 (late evening ET), at commit `26284b49`. Every number in this document is read from the canonical artifacts or git history — nothing sampled, estimated, or invented. Facts are labeled facts; inferences and recommendations are labeled as such.*

---

## 1. Executive summary

GameTime Picks has evolved in ~9 weeks (Apr 30 → Jul 4, **1,000 commits**) from a model board demo into a soft-launch-ready, sportsbook-style paper-prediction product with **provably honest money accounting**. The core asset is not any single page — it is the **settlement discipline**: canonical money ($100 → $19,265.40, 17–12) changes only through an official-results-gated, dry-run-verified, idempotent, forensically-audited pipeline, and 1,572 tests plus five independent gates enforce that on every deploy.

**Production-ready today (proven):** money/settlement engine, Bank Builder lifecycle + approval lock, Mr. Dub flagship ledger, knockout pick board, honest freshness/status system, daily ops orchestration, 13 clean routes.
**Fragile (known, mitigated):** anything time-dependent baked at build (largely fixed via client hydration; the daily-rebuild hook is still owner-gated), the tiny sample behind every model claim (29 settled BB decisions), and side products (Moonshot 0–5, WC Specials 0–17) that are honest but not yet compelling.
**Biggest genuine risk:** overfitting methodology to ~30 samples, and operator dependence for the nightly loop.

Soft-launch readiness: **9.5/10** — the remaining half-point is operational (deploy-hook secret + running the nightly loop), not product.

---

## 2. Current production state (facts, verified at review time)

| Item | Value |
|---|---|
| Canonical record | **17–12** (62.96%→58.6% after July-3) |
| Bankroll | **$19,265.40** (started $100, Jun 9) |
| Crown (peak, banked) | **$20,465.40** = two completed $100→$10K ladders ($10,376.17 + $10,089.23) |
| Drawdown | $1,200 (12 lost $100 seeds) · ROI 191.65× · profit $19,165.40 |
| portfolio.json md5 | `e8b1416b71616bcac1701d28f7d58bc2` |
| Active slate | 2026-07-05 (Brazil/Norway, Mexico/England) · board through Jul-7 · MLB 15 games |
| Latest settlement | 2026-07-04 (money-neutral — no paper was placed) |
| Gates | money-integrity ✓ · forensic MATHEMATICALLY PERFECT · idempotence ✓ · health ✓ · tsc ✓ · 1,572/1,572 tests · smoke 9/9 |
| Product status | BB: both lanes stopped, fresh Jul-5 proposal rendered, awaiting approval · Moonshot: Lane A active $25 · WC Specials: fresh Jul-5 · MLB: Jul-5 board+props · Homer: retired |

---

## 3. Timeline of progress (from git history; ranges approximate)

| Milestone | When / anchor | What changed & why it mattered | Stable? | Remaining debt |
|---|---|---|---|---|
| v1 model board + pipeline | Apr 30 – mid-May | NBA/MLB projections, first UI | Superseded | NBA board now off-season-gated |
| Settlement system | mid-June → `ecde5d56`, PR #607 | Official-only grading (API-Football/MLB Stats), 90'-regulation policy for knockouts (FT/AET/PEN; ET goals never flip 90' markets), `settle_soccer_day.sh` (dry-run default, official-gated, idempotent) | **Yes — the crown jewel** | Player-prop settlement pends on AET/PEN feeds |
| Money ledger correctness | PRs #619-621, `0718e4ee`, `1a10654a` | Cumulative-crown model; banked-ladders.json as append-only truth; prior-lane chain recursion fixed a 14-5 vs 15-7 drift; idempotence gate added | **Yes** | Ledger rebuild re-stamps generatedAt → md5 changes without value changes (cosmetic) |
| Bank Builder evolution | PRs #602-606, `bb2cfcd2`→`409af9ae`, `26284b49` | Two completed $100→$10K ladders (the product's proof); approved-card lock (date-gated, selector-skipped); player props banned from pool (both selection paths); drift lesson learned the hard way (a3ccfff7→409af9ae); market-reliability weighting (Jul-4) | **Yes** | Auto-restart of stopped lanes on fresh approved cycle is still manual |
| Mr. Dub flagship | `8c5908ab` | Derived-only flagship (timeline/KPIs/charts/attribution reconciled EXACTLY to canonical); replaced "just a ledger" | **Yes** | — |
| Results honesty | PR #563 era + `1f114fec` | Settled-only hit rates, pending/unsupported never losses, stale-optimizer banner, page 21MB→11MB | **Yes** | Optimizer track stale since Jun-18 (disclosed) |
| Homer Nukes retirement | `d912adbb` | Data-gated product retired cleanly; historical ledger kept | **Yes** | — |
| MLB revival | `77088d03`, `1332a8fc` | Real-odds boards + 400-1,100 props/day, honest hit-rate banners | Yes | No MLB suggested parlays; MLB props not auto-settled |
| Knockout sportsbook UX | `d58835e5` | 12-col raw table → filterable/sortable pick board with row-expansion parlay previews; client-clock statuses | **Yes** | Game-detail player-props table still thin for future games (honest "pending") |
| Freshness/status system | `438f1006`, `7edd728d`, `1f114fec` | FreshnessBadge/StatusBadge on all 13 routes; SlateStatusBar client-hydrated — frozen-build-clock class of bugs closed | **Yes** | daily-rebuild.yml dormant (owner secret) |
| Daily ops | `7edd728d` | `refresh_daily_products.sh` (fail-closed, md5 money guard) + `settle_soccer_day.sh` + DAILY_OPS.md; first production run held all guards (Jul-5) | **Yes** | Loop is operator-run nightly; workflows exist but key secrets unset |

---

## 4. Architecture overview

```
  The Odds API          API-Football / MLB StatsAPI
      │ (real odds)          │ (official finals + player stats)
      ▼                      ▼
  pipeline/world_cup/*.py  scripts/settle_soccer_day.sh ──── ONLY writer of canonical money
  pipeline/mlb/*.py              │  (dry-run → hand-grade → --apply → ledger rebuild → money gates)
      │                          ▼
      ▼                    app/public/data/mr-dub/portfolio.json   ◄─ CANONICAL (never hand-edit)
  app/public/data/…              banked-ladders.json (append-only crown truth)
  (projections, boards,          daily-summary.json / ledger.json (rebuilt, derived)
   props, specials, parlays)     dual-bank-builder-active.json (lane lifecycle)
      │                          bank-builder-approved.json (operator lock, date-gated)
      ▼                                │
  app/scripts/activate-daily-portfolio.mjs → daily-portfolio.json ($ exposure, active lanes)
      │
      ▼
  Next.js STATIC EXPORT (build-time fs reads) → 62 routes
      │  server components read artifacts; client components (FreshnessBadge, SlateStatusChips,
      │  KnockoutPickBoard) re-derive time-dependent state from the real browser clock
      ▼
  Vercel (deploy = the "clock tick") ── smoke-test-production.mjs (9 checks)
```

- **Source of truth:** `portfolio.json` (+ `banked-ladders.json` for the crown). Everything else on the money side is derived by `build-mr-dub-ledger.mjs` and validated by forensic day-chain audit.
- **Never manually edit:** `portfolio.json`, `banked-ladders.json`, `bank-builder-approved.json` after user approval (the only historical drift source was a manual rewrite), settlement history files.
- **Stale-state risk remaining:** static export freezes at build; mitigated everywhere user-visible by client hydration; truly fixed only by daily rebuilds (hook secret pending).
- **Duplicate logic (known, tolerated):** ~4 local `usd()`/date formatters across components; two board-parlay builders (board tiers vs suggested parlays) with different scopes; `--vault-*` vs `--gtp-*` token split (686 uses of `--vault-gold-bright`= red accent — intentional, documented).

---

## 5. Product-by-product assessment

| Product | Verdict | Evidence & remaining risk |
|---|---|---|
| **Bank Builder** | **Launch-ready; the flagship.** | 17–12 canonical, 2 banked $10K ladders, approval lock proven (drift only ever came from manual rewrite — now memorialized + regression-tested), team-markets-only enforced in both selector paths, reliability weighting added Jul-4 with tests. Risk: lane restart after stops is operator-gated (by design, but a UX "awaiting approval" state depends on the operator acting). |
| **Moonshot** | Honest but not yet compelling. **0–5.** | Structured tiers exist, volatility labels exist, +700 floor prevents junk activation. Inference: at $25/day it is a lottery ticket; fine for launch as clearly-labeled entertainment. Recommendation: keep, but don't feature above BB. |
| **WC Specials** | Honest tracker, weak record. **0–17.** | Tiered (Reliable/Balanced/Aggressive/Game Script), grouped by game, no forced cards (thin slates produce fewer cards, disclosed). By design these are +700..+3000 longshots — the 0-17 is expected variance, but the page must keep leading with that honesty. |
| **Suggested Parlays** | Functional, thin coverage. | Honest no-play states; optimizer *results* stale since Jun-18 (banner-disclosed). Biggest gap: no automated grading revival for the optimizer track. |
| **MLB** | Good data, under-productized. | Fresh daily board (15 games, ~1,100 props), honest market-implied labels. Gaps: no MLB suggested parlays, no automated MLB prop settlement into /results. |
| **Knockout board** | **Launch-ready; best UX in the app.** | Filters/sort/expansion, real-clock statuses, fabrication-guarded view-model (7 tests), same-game parlay previews with correlation warnings. Debt: none blocking. |
| **Mr. Dub** | **Launch-ready; the proof surface.** | Reconciles exactly to canonical (tested); day-by-day from $100; charts/attribution derived-only. |
| **Results** | Honest; performance acceptable. | Settled-only math, pending/unsupported never losses, stale banners self-correcting; 11MB page (down from 21MB) — still heavy; further pagination is post-launch polish. |

---

## 6. Methodology assessment (settled data only; n is SMALL)

**Facts (canonical settled legs, n=29 BB decisions / ~39 legs):** double chance **8–0**, moneyline 8–2 (both losses knockout traps: Argentina −700 drew at 90'; Austria dog), totals 10–6 (every recent loss a 90'-draw trap), BTTS 1–3, player props 0–1 in BB (~8% across WC props broadly — June-30 audit).

**What the model does well:** draw-protected markets (DC/DNB); favorite identification in non-knockout contexts; discipline (no-play states, juice floors, no fabricated markets).
**What it does poorly:** totals confidence in tight/drawish knockout games; BTTS calibration (~55% modeled vs 25% settled); anything player-prop in soccer.
**Rules added because of failures (all tested):** player-prop ban in BB (`bb2cfcd2`); approved-card lock + no-drift tests (`409af9ae`); 90'-regulation settlement (`ecde5d56`); ultra-juice floors; market-reliability weighting (BTTS +0.25 always, totals +0.15 when draw ≥26%) (`26284b49`).
**Should be tested next (recommendations):** totals prob floor ≥0.62 for survival legs; safety-first mode for Steps 3+ (accept below-rung combined price); shared reliability table across BB/Specials/Moonshot.
**Do NOT change yet (insufficient sample):** anything based on <10 settled observations per market-competition cell — e.g., don't ban totals outright (10–6 overall), don't tune BTTS weights further until n≥10. **Open question:** whether the 59-63% modeled totals probabilities are miscalibrated in knockouts specifically or just unlucky (n=3 recent losses) — needs ~3+ more weeks of data.

---

## 7. UI/UX assessment (scored 1-5: clarity / trust / actionability / mobile / launch-ready)

| Page | C | T | A | M | Launch | Notes |
|---|---|---|---|---|---|---|
| / + /today | 4 | 5 | 4 | 4 | ✅ | Flagship cards + honest badges; strong front door |
| /games | 4 | 5 | 4 | 4 | ✅ | Model reads + freshness-gated boards |
| /bank-builder | 4 | 5 | 4 | 4 | ✅ | ClimbHero + locked-card surface |
| /world-cup + knockout board | 5 | 5 | 5 | 4 | ✅ | Best-in-app; "know what to bet in 30s" achieved |
| Game detail ([slug]) | 4 | 5 | 4 | 4 | ✅ | Hero + picks + parlays; props honest-pending for future games |
| /moonshot, /world-cup-specials | 4 | 5 | 3 | 4 | ✅ | Honest; actionability limited by product nature |
| /mlb | 4 | 5 | 4 | 4 | ✅ | Rich board; parlays gap |
| /picks | 3 | 4 | 3 | 4 | ✅* | Legacy card clutter in collapsed section (minor) |
| /results | 4 | 5 | 3 | 3 | ✅ | 11MB weight is the mobile drag |
| /mr-dub | 5 | 5 | 4 | 4 | ✅ | The proof page |
| /methodology | 4 | 5 | 3 | 4 | ✅ | Honest badges incl. "legacy pipeline run · N days ago" |

Cross-cutting gaps (all cosmetic): token-system split (`--vault` vs `--gtp`), a few duplicated formatters, /picks legacy set.

---

## 8. Data freshness & ops

**Automated now:** settlement engine (official-gated, idempotent), full display refresh (one command, money-md5-guarded), health gate, nightly-settle bot (pushes to main), smoke test.
**Operator-required (by design):** BB card approval; settlement `--apply` decision; deploy push.
**Operator-required (should be automated):** the nightly loop itself (cron secrets unset: `ODDS_API_KEY`, `API_FOOTBALL_KEY` in GH); the daily Vercel rebuild (`VERCEL_DEPLOY_HOOK_URL`).
**Can fail silently:** none known with money impact — the md5 guard, official gate, and health check all fail loudly. Watch item: Odds API credits (~19,400 remaining; ~60-100/day burn → ~6 months headroom; no automated low-credit alarm — recommended).

**Daily checklist (through July 10):** evening — `settle_soccer_day.sh --date <finished>` (dry → verify → `--apply`) → `refresh_daily_products.sh --date <next>` → full gates → commit/push (rebase over nightly bot; `june30-reset` needs `--force-with-lease`) → smoke 9/9. Morning — glance at /today freshness badge; approve a BB card if desired.

---

## 9. Testing review

**Strong protection (facts):** money integrity/forensic/idempotence; BB no-drift + team-market-only + max-legs; 90'/Over-line settlement parsing; pending-not-loss; no-Homer-active; knockout view-model fabrication guards; page-structure pins; reliability-weighting regressions. 179 test files / 1,572 tests, all green.
**Known cost:** state-pinned tests churn ~15-40 on every settlement (mitigated by the subagent + flag-don't-mask playbook — it has caught zero masked bugs so far, which is the point).
**Recommended additions:** refresh-orchestrator idempotence (run twice → identical artifacts); MLB schedule board-shape guard; low-credit alarm test; a "no stale active cards" cross-page sweep test; hit-rate denominator property test.

---

## 10. Risk register

| Risk | Sev | Mitigation today | Remaining exposure → recommended fix |
|---|---|---|---|
| Money corruption | Critical | Official-only writer, md5 guards, forensic day-chain, idempotence, health | Near-zero technical; human `--apply` misuse → keep hand-grade step mandatory |
| Approved-card drift | High | Date-gated lock, selector skip, no-drift tests, documented lesson | Only manual rewrite can drift → never edit approved.json post-approval |
| Settlement double-count | High | Idempotent NO-OP re-runs (proven Jul-3/4) | Low |
| Stale slate shown live | Med | Client-clock badges/chips everywhere | Frozen non-time content until rebuild → activate deploy hook |
| Overfitting to tiny sample | **Med-High** | "Do not change blindly" rule; changes documented + tested | Real — freeze further model tuning until n≥10 per cell (§6) |
| Test migration masking bugs | Med | Flag-don't-mask rule + authoritative state tables | Discipline-dependent → keep delegating with explicit tables |
| API credit exhaustion | Med | Bounded fetches, credit logs | No alarm → add credit floor check to refresh script |
| Vercel deploy lag/queue | Low | Poll + smoke before declaring done | Occasional 20-min queues |
| User trust (confusing UI) | Low-Med | Honesty-first copy, badges, no-play states | Side-product 0-X records must stay prominent, not hidden |

---

## 11. Roadmap to July 10

**Must (launch blockers): none.** The product is deployable today.
**Should (high-impact, low-risk):**
1. Owner: set `VERCEL_DEPLOY_HOOK_URL` + cron secrets → hands-free daily rebuild/settle (5 min, zero code).
2. Run the nightly loop daily (checklist §8) — the product's freshness IS the product.
3. Approve a fresh BB card (both lanes stopped) so the flagship shows a live climb at launch.
4. Add the credit-floor guard to `refresh_daily_products.sh` (~20 lines + test; low risk).
**Can wait:** /results pagination; /picks legacy-card cleanup; MLB suggested parlays; token unification.

## 12. 30/60/90-day roadmap (realistic)

**30 days:** hands-free daily ops (cron + deploy hook + failure alerting); MLB prop settlement → /results; MLB suggested parlays (Safe/Balanced/Value tiers reusing board-parlay math); revive optimizer grading; accumulate model sample (no tuning until §6 thresholds); post-World-Cup transition plan (the WC ends — MLB/NBA become the product).
**60 days:** calibration report (modeled vs settled by market×competition, auto-generated monthly); interactive parlay builder (extend row-expansion previews into a slip builder — paper-only); NFL/NHL season prep using the WC pipeline pattern; second odds source for line-shopping honesty.
**90 days:** accounts + saved slips; bankroll simulator (Monte Carlo on the ladder model, using real settled distributions); automated backtesting harness over the settlement archive; admin dashboard (credits, gate status, pending settlements); alerting (settlement failures, credit floor, gate failures → email/push).

## 13. Recommended next Claude Code prompt

> "Nightly loop for July 5: settle July-5 WC from official results (dry-run → hand-grade → apply), roll to July-6 with refresh_daily_products.sh, propose a fresh Bank Builder card for approval under the new reliability weighting, add the Odds-API credit-floor guard to the refresh script with a test, run all gates, deploy, smoke."

---
*Distinctions maintained throughout: §2-3 facts from artifacts/git; §5-6 verdicts are assessments over stated evidence; §6 "open question" and all of §11-12 are recommendations. Nothing here is a performance claim beyond the settled ledger.*
