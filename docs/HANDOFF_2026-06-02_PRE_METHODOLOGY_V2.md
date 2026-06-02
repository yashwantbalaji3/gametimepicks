# HANDOFF — Pre Suggested-Parlay Methodology v2 (2026-06-02, ~20:30 UTC)

> Session handoff for the next Claude Code session. **Stop point: context
> limit, before Suggested-Parlay Methodology v2.** The product-quality sprint
> (#250–#254) is merged and QA'd. The next task is **Methodology v2 — shadow
> audit + docs first, live only if evidence supports it.** Do NOT start it
> without operator instruction. Repo-relative paths below map to the local
> checkout / a GitHub blob URL on `main` — they are not chat attachments.

---

## 1. Executive summary

This arc shipped the model-honesty foundation (#245–#249) and a five-PR
product-quality sprint (#250–#254). Net: the public surfaces are **honest and
calibrated to the data we actually have** — actionable-vs-prop-line projection
labels, single-sport official Suggested with compact honest empty sections, a
stepped Build-a-Parlay, a transparent paper-only Bank Builder with **real L10
badges**, and a WNBA feasibility verdict (**not ready — schedule-only**). The
model's `edgePct`/`confidence` remain **non-predictive** and are not used as
quality signals; **#245 recalibration stays shadow-only**; **L10** is used only
as transparency + a soft tie-breaker. The next task — **Suggested Parlay
Methodology v2** — introduces **L5/L10-based leg quality + odds caps per risk
section** and revised daily targets; it must be **shadow-audited and
documented before any live wiring.**

---

## 2. Current repo state

- **Branch:** `main`
- **main SHA:** `f78f3893b760fc447522d058d19c844c4d7c6976` (`f78f389`)
- **origin/main:** same — **clean + synced (0/0).**
- **Open PRs:**
  - **Preview (DO NOT TOUCH):** #215, #214, #213 — draft/unmerged.
  - **Stale (DO NOT CLOSE):** #5, #4, #2, #1 — open.
  - No feature/work PRs open.
- Always re-verify with `git rev-parse HEAD` + `gh pr list` — do not assume.

---

## 3. Product-quality sprint summary (this arc)

| PR | Title | What it did |
|----|-------|-------------|
| #245 | shadow projection→prob recalibration | σ-scale/shrink recalibration, leave-one-day-out; **fixes calibration (OOS Brier 0.275→0.244) but does NOT beat the market** → kept **shadow-only**, nothing wired |
| #246 | sports capability gates | `sport-capabilities.ts` derived from `sports-coverage.ts`; gates `canShowProjections/Suggested/BuildYourOwn/Grade` + mixed rules + tests |
| #247 | single-sport official Suggested | removed mixed from official Suggested (no "Mixed" pill; "All" tab = union of single-sport); mixed → Build Your Own only |
| #248 | BYO modeled-only legs | `getLegPool` runs `filterBuildYourOwnLegs` → no schedule-only/coming-soon/unknown legs in custom builds |
| #249 | product UX + sports audit | `PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md` + offline scripts `shadow-l10-audit.mjs`, `audit-suggested-section-funnel.mjs` |
| **#250** | **projections fallback clarity** | actionable-vs-prop-line counts; default to **latest actionable slate** over a future props-only shell; honest "Latest/Upcoming slate" labels |
| **#251** | **Suggested empty-section UX** | summary banner ("N cards across M of 4 sections · K empty after filters · not padded") + **compact** honest empty High/Longshot |
| **#252** | **Build a Parlay redesign** | **Quick Generate / Manual Build switch** (one tool at a time); chips (Custom · Modeled sports only · Not officially tracked); DNP → "Availability filters"; edge/confidence de-emphasized |
| **#253** | **Bank Builder + L10** | eligibility panel; **real per-leg L10 badges** (enriched from optimizer legPool); specific honest empty reasons; L10 = display + soft tie-breaker (no hard gate, no perf claim) |
| **#254** | **WNBA feasibility (docs-only)** | verdict: **not ready, stays schedule-only**; no code/registry change |

Canonical: `RELEASE_AND_PR_HISTORY.md`, `MODEL_AUDITS_INDEX.md`,
`PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md`.

---

## 4. Current product behavior (verified by post-#253 QA + post-#254 checks)

- **Home (`/`):** status bar (TODAY 2026-06-02 · ACTIVE SLATE "2026-06-01"→now
  "2026-06-02 · pregame" · LATEST SETTLED 2026-06-01 · $100 paper); 5 path
  cards; featured/suggested preview is **official single-sport only (no
  Mixed)**; honest record shown (not a perf claim).
- **Projections (`/projections`):** counts are **actionable projections only**;
  props-only/insufficient entries are labelled **"prop lines · projections
  pending"**; default = latest **actionable** slate ("Latest actionable slate"
  / "Upcoming slate — lines posted, projections pending"). Currently shows
  **June-2 MLB: 15 games / 626 actionable**; NBA 0/0 honest (ScheduleUnavailable).
  NBA/MLB-only note.
- **Suggested Parlays (`/parlay-lab#suggested`):** **single-sport only, no
  Mixed pill** (pills All / NBA / MLB). Summary banner + **compact empty
  High/Longshot** (~82px) with honest "after sport, variety, and volume
  filters" copy. #241 volume discipline intact. (June-2 MLB-only: Low/Medium
  have cards; High/Longshot emptied by exposure caps — honest.)
- **Build a Parlay (`/parlay-lab#build`):** header "Build a Parlay" + chips;
  **Quick Generate / Manual Build switch** (only one tool renders); MLB/NBA/Mixed
  scope (modeled-only; schedule-only never selectable); DNP under "Availability
  filters"; "not officially tracked"; edge/confidence de-emphasized.
- **Bank Builder (`/bank-builder`):** **paper-only**; eligibility panel (chips +
  criteria); official single-sport pool; pending/unsettled; ~+100 target; never
  forces a card; **real per-leg L10 badges** ("L10 8/10"); specific honest empty
  reasons; transparency note ("not a prediction or win-rate claim").
- **Results (`/results`):** latest settled **June-1**; **no premature June-2
  settlement**; public era from `2026-05-27` (**no May 25/26 leak**); historical
  **Mixed** sport-mix row retained with an honest "historical/generated" caption.
- **Sports & Events (`/events`):** NBA/MLB = Projections+Parlays; NHL/WNBA/UFC/
  FIFA/IPL/MLS = schedule-only; **EPL = coming soon**; no unsupported picks.
- **Mobile (375):** no horizontal overflow on any page; 5-item bottom nav
  (Home/Projections/Parlay Lab/Results/Sports); no console errors.

---

## 5. Data / workflow state

- **Latest settled slate:** **2026-06-01** (`optimizer-graded/2026-06-01.json`).
- **Active slate:** **2026-06-02** — `boards/2026-06-02.json`,
  `parlays/optimizer/2026-06-02.json` (64 slips + publicRiskSections),
  `parlays/snapshots/2026-06-02.json`, `mlb/boards/2026-06-02.json` all exist.
- **June-2 settlement:** **UNSETTLED** — `optimizer-graded/2026-06-02.json`
  MISSING (correct; it settles after games finish + nightly-settle runs).
- **Workflows (crons; GHA scheduled delivery is chronically delayed on this
  repo — do NOT manually dispatch without approval):**
  - **morning-projections** `30 13 * * *` (13:30 UTC / 9:30 ET) — June-2 run
    fired late at **2026-06-02 17:52 UTC**, success.
  - **auto-refresh** `0 12,14,16,18,20,22,0,2,4 * * *` — latest 16:41 UTC ok.
  - **nightly-settle** `0 7 * * *` (07:00 UTC / 3 ET) — latest **11:10 UTC**
    (settled June-1); the next run settles June-2.
- **Do not change workflow schedules; do not manually dispatch.**

---

## 6. Current model state (canonical: `MODEL_AND_OPTIMIZER.md`, `MODEL_AUDITS_INDEX.md`)

- **`edgePct`/`confidence` are NOT predictive** (#240: edge anti-predictive,
  confidence non-predictive). **Never** use them as quality signals or to back
  a win-rate claim. They were de-emphasized in Build-a-Parlay (#252).
- **#245 recalibration is shadow-only** — recalibration fixes calibration but
  does not beat the market out-of-sample → nothing wired.
- **L10 (recent form)** — #249 shadow audit: weakly monotonic, **not
  anti-predictive**, 100% `recentSeries` coverage; a hard ≥70–80% all-legs gate
  starves candidates. So L10 is used **only as display + a soft tie-breaker**
  (Bank Builder, #253). No hard L10 gate, **no performance claim**.
- **`audit/policy.json`** is proposed-only / **unconsumed** by the optimizer.

---

## 7. Sports coverage state (canonical: `sports-coverage.ts`, `SPORTS_COVERAGE_POLICY.md`)

- **Modeled (`level: "full"`):** **NBA, MLB only.**
- **Schedule-only (`level: "schedule"`):** NHL, **WNBA**, UFC, FIFA/World Cup,
  IPL, MLS.
- **Coming-soon (`level: "coming-soon"`):** EPL.
- Capability gates (`sport-capabilities.ts`) are fail-closed; a sport graduates
  only by flipping its `level` after a real pipeline ships.

---

## 8. WNBA feasibility verdict (`WNBA_SHADOW_FEASIBILITY_2026-06-02.md`, #254)

- **Schedule:** REAL (ESPN snapshot in `event-schedules.ts`).
- **Odds / player props:** ✗ (Odds API hardcoded `basketball_nba`; **WNBA
  prop-odds availability unverified — the biggest blocker**).
- **Player stats:** ✗ (NBA-only resolver/fetcher).
- **Grading / Results:** ✗ (markets + `_SPORTS` are NBA/MLB only).
- **Projection model + optimizer:** reusable but uncalibrated / no WNBA config.
- **Verdict: NOT ready → stays schedule-only.** No public WNBA
  projections/parlays; not promoted. Next is a **decision gate** (confirm a WNBA
  odds source) before any approval-gated shadow ingestion.

---

## 9. New Methodology v2 — user requirements to implement (verbatim, preserve all)

1. **New methodology starts from June 2 onward.**
2. **Do not hide or rewrite June 1 results** (historical, immutable).
3. **Low Risk** should ideally use legs that are **5/5 in last 5 games (L5)**.
4. **Low Risk** should **not** include legs with odds **greater than −150**
   (i.e., Low Risk legs must be ≤ −150 — heavier favorites only).
5. **Medium** should mix **5/5 and 4/5 L5** legs.
6. **High Risk** should generally use **4/5 or 5/5 L5** legs.
7. **Longshot** should generally use **4/5 or 5/5 L5** legs.
8. **Bank Builder** defaults to a **$100 bankroll** (already the case).
9. **Bank Builder** legs should have **8/10+ in last 10 games (L10)** where
   possible.
10. **Daily suggested target:** **5 Low · 5 Medium · 2–3 High · 2–3 Longshot ·
    ~15 total.**
11. **Targets are not guarantees; no padding, no fake cards.**
12. If not enough qualified candidates exist, **show fewer cards with honest
    empty states.**
13. Use **real `recentSeries` / L5 / L10 only.**
14. **Do not use `edgePct`/`confidence` as quality signals.**

---

## 10. Recommended next task — Methodology v2 (shadow audit + docs first)

**Sequence (do NOT wire live first):**
1. **Run the methodology-v2 prompt**, then a **self-review** pass.
2. **Shadow audit** on settled public-era slates (May 27 – latest, **excl. May
   25/26**) reusing `app/scripts/shadow-l10-audit.mjs` +
   `audit-suggested-section-funnel.mjs` patterns: measure, per the v2 rules,
   how many legs/cards qualify (L5 5/5, L5 4/5, odds ≤ −150 for Low, L10 ≥ 8/10
   for Bank Builder) and what daily counts the rules actually yield. Output a
   `docs/METHODOLOGY_V2_*` doc + an offline script. **No live wiring.**
3. **Live implementation only if evidence supports it**, and only with operator
   approval — pause before wiring.

**Key architectural anchors for v2:**
- The risk **sections are currently defined by combined odds + leg count**
  (`app/src/lib/parlay-risk-sections.ts`), NOT by L5 quality. v2 adds **L5-based
  leg eligibility + odds caps per section** — that is **optimizer/pipeline-side
  leg selection + section assignment** (Python: `pipeline/parlay_optimizer.py`
  `generate_public_risk_sections`, leg eligibility gates), then surfaced via
  `publicRiskSections`. Expect Python pipeline work, shadow-audited first.
- **L5/L10 come from `recentSeries`** (real per-game values). The **optimizer
  legPool carries `recentSeries`; the published snapshot does NOT** — Bank
  Builder (#253) enriches snapshot legs from the optimizer via
  `recent-form.ts::indexRecentSeries`/`attachRecentSeries` (join by
  playerId+market+line+side). v2 must source L5/L10 from a path that has
  `recentSeries` (optimizer/pipeline side natively).
- Existing helpers to reuse: `recent-form.ts` (legL10HitRate; add an L5 variant
  = last-5 window), `parlay-volume-discipline.ts` (#241 caps),
  `sport-capabilities.ts` (single-sport official + modeled-only), the funnel +
  L10 audit scripts.
- v2's daily targets (5/5/2–3/2–3) interact with #241 volume caps (Low 3 / Med
  3 / High 2 / Longshot 1) — reconcile in the shadow audit (the new targets are
  larger; decide whether v2 changes the caps, all evidence-gated).

---

## 11. Hard rules to preserve

- No fabricated data (schedules/odds/projections/parlays/results/recentSeries).
- No unsupported-sport picks; WNBA/NHL/UFC/FIFA/IPL/MLS stay schedule-only;
  EPL coming-soon. No public WNBA projections/parlays; do not flip its level.
- **No `edgePct`/`confidence` as quality signals**; use real `recentSeries`
  (L5/L10) only.
- No May 25/26 public-rate leak; public era starts `2026-05-27`. Don't rewrite
  June-1; new methodology applies June-2 onward.
- No same-slate contamination; never settle a slate before its games are final.
- **#245 recalibration not wired; `audit/policy.json` not consumed.**
- No workflow-schedule change; no manual dispatch — both approval-gated.
- Bank Builder **paper-only**; never forces a card; no win-rate/perf claims.
- Official Suggested **single-sport only**; mixed **only in Build Your Own**,
  modeled sports only, custom/not tracked.
- No banned betting copy: lock, guaranteed, free money, risk-free, can't miss,
  cant miss, easy win, easy money, no-brainer, no brainer, sure thing, sharp
  money; avoid user-facing "safe/safety" except CSS `safe-area-inset-bottom`.
- Preview PRs **#213/#214/#215** untouched; stale PRs **#1/#2/#4/#5** not closed.
- Merge gate: real `Vercel – gametimepicks` SUCCESS + `mergeStateStatus =
  CLEAN`; squash-merge; sync main after every merge. (Don't run `npm run build`
  while a dev server is live — it corrupts `.next`; clear `.next` + restart if
  a stale-chunk 500 appears.)

---

## 12. Exact next prompt summary for the next session

> "Proceed with Suggested Parlay Methodology v2 — **shadow audit + docs first**,
> live only if evidence supports it." Then: PHASE 0 sync/baseline; verify June-2
> settled state; **build an offline shadow script** that evaluates the v2 rules
> (§9) against settled public-era slates (real `recentSeries`; May 25/26
> excluded); produce a `METHODOLOGY_V2` doc with per-rule qualified-candidate
> counts + daily-target feasibility; **pause for approval before any live
> optimizer/pipeline wiring.** Preserve all §11 hard rules.

---

## 13. Verification commands for the next session

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git status --short && git rev-parse HEAD && git ls-remote origin main | cut -f1
git rev-list --left-right --count HEAD...origin/main
gh pr list --state open --limit 30
gh run list --limit 20

cd app
npx tsx --test src/lib/*.test.mjs   # expect all pass (656 as of this handoff)
npx tsc --noEmit                    # expect clean
npm run build                       # expect green (141 routes)

# reproduce model/UX evidence (offline, read-only):
npx tsx scripts/shadow-l10-audit.mjs
npx tsx scripts/audit-suggested-section-funnel.mjs 2026-06-02 2026-06-01 2026-05-30
npx tsx scripts/model-calibration-analysis.mjs
npx tsx scripts/shadow-projection-recalibration.mjs
```

Preview/browser harness: `.claude/launch.json` config `gtp-dev` (`npm run dev`,
port 3000). Build before starting the dev server (avoid the `.next` collision).

*Handoff: `docs/HANDOFF_2026-06-02_PRE_METHODOLOGY_V2.md`. main `f78f389`.
Latest settled `2026-06-01`. June-2 active + unsettled. Next: Methodology v2 —
shadow audit + docs first, no live wiring without approval.*
