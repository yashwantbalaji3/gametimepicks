# GameTimePicks Master Roadmap V2

**Execution control file — founder-owned, Claude Code-updated**  
**Created:** 2026-10-07  
**Primary references:** `TRANSFER_HANDOFF_2026-10-07.md`, `GameTimePicks_Audit_2026-10-07.md`  
**Repository:** `yashwantbalaji3/gametimepicks`

---

# 0. How to use this roadmap

This file is the durable execution control plane for GameTimePicks. Fresh Claude Code sessions should use it instead of relying on the retired Coordinator as the primary executor.

## Operating model
- Founder + ChatGPT own product direction, priorities, architecture decisions, and review.
- Fresh isolated Claude Code sessions execute bounded workstreams.
- GitHub is the source of truth.
- CI + Production acceptance are integration gates.
- The retired Coordinator remains reference/archive only.
- Several research/build lanes may progress in parallel, but **only one Production-bound PR integrates at a time**.
- **Localhost-first, cost-controlled releases are mandatory.** Vercel must not be the development/debugging loop. Batch locally verified changes and only deploy deliberate, approved release candidates. See `COST-001` and §22.

## Mandatory Claude Code session protocol
1. Read this file end to end.
2. Fetch current `origin/main`; record the starting SHA.
3. Read the relevant handoff branch/file and audit finding.
4. **Reproduce the issue on current main before modifying it.** The audit was pinned to an older deployed revision.
5. Deep-think independently before implementation: trace the real data/model/UI path, compare alternatives, challenge stale assumptions, and prefer a superior implementation when evidence supports it.
6. Mark the selected roadmap task `IN_PROGRESS` and append a Session Log entry before implementation.
7. **Implement, debug, test, and visually inspect locally first.** Reproduce on localhost; run targeted tests, relevant broader regressions, and the local production build/export when required. For frontend work inspect desktop + mobile locally. Batch related fixes before asking for any remote build.
8. **No Vercel debugging loop.** Do not push speculative edits or rely on repeated preview/Production deployments to discover ordinary code, layout, or build problems. Remote-only exceptions require a written reason and a bounded build budget.
9. Before pushing, check whether the connected Vercel project would auto-deploy that push; merely opening a PR or pushing a branch can consume Build CPU. If automatic deployment gating is not yet verified, stop and resolve `COST-001` first unless there is an urgent justified exception.
10. Keep scope bounded to that task unless a blocking cross-cutting defect requires expansion; document any expansion.
11. Reuse existing handoff branches only when useful. Never assume a handoff branch should be merged wholesale; refresh against current main first.
12. Preserve truth/provenance rules and historical immutability.
13. Run task-specific acceptance tests plus relevant regression suites **locally before remote integration**.
14. Update this roadmap before finishing with status, branch, PR, exact head SHA, local test evidence, blockers, follow-ups, and Production acceptance where applicable.
15. A Production-bound task is `DONE` only after local validation, exact-head CI, an approved controlled deployment, and Production acceptance all pass. Record Vercel build/deploy count and cost evidence when available.
16. A research/shadow task may be `DONE` after its research artifact, replay/backtest, forward receipt setup, and acceptance evidence are complete; `DONE` does not imply Production promotion.
17. For user-facing changes requested for founder review, show the **localhost candidate** (screenshots/video/local review) and obtain founder approval before requesting the controlled remote deployment. Do not mistake a local approval for automatic permission to deploy unrelated features.

## Status values
`NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `READY_FOR_REVIEW` · `READY_FOR_PRODUCTION` · `DONE` · `DEFERRED` · `SUPERSEDED`

**Stage annotations (founder directive 2026-10-09).** A status says where the WORK is. A stage says how far its EVIDENCE has got, and stages are never interchangeable. Each status may carry the highest stage reached, in this order:
1. RESEARCH COMPLETED
2. IMPLEMENTED LOCALLY
3. CI VALIDATED
4. PRODUCTION DEPLOYED
5. FORWARD EVALUATED
6. STATISTICALLY QUALIFIED
7. PRODUCT ELIGIBLE
8. FULLY ACCEPTED

For example, a model can be PRODUCTION DEPLOYED (visible, labelled experimental) without being FORWARD EVALUATED, and FORWARD EVALUATED without being STATISTICALLY QUALIFIED. `DONE` means FULLY ACCEPTED against the task's own acceptance list.

---

# 1. Product north star

GameTimePicks should become one coherent prediction platform:

**Point-in-time capture → Feature Snapshot → Sport Model → World/Distribution Receipt → Canonical Forecast → Exact Market Snapshot → Eligibility Decision → Top Boards / Model Picks / Bank Builder / Moonshot / Parlay Lab → Immutable Product Receipt → Official Settlement → Results / Model Evaluation**

Live extends the chain:

**Live Observation → Conditional Live Forecast Receipt → Live Opportunity Eligibility**

A live forecast is a **new receipt** linked to its pregame parent. It never mutates the original pregame forecast.

## Core principles
- The model is the intelligence; 10,000 simulations are the sampling layer.
- Use the strongest defensible sport-specific model/ensemble, not a formula because it sounds advanced.
- Every feature must be point-in-time correct and earn its place through out-of-sample value.
- Winner, score, spread/run line, total, and supported player outcomes should derive from coherent worlds when the promoted model supports them.
- One canonical forecast truth feeds all downstream products.
- Products may filter, rank, combine, or price canonical forecasts; they may not silently reverse them.
- Market price is not a GTP forecast probability.
- Display maturity and product eligibility are separate.
- Historical forecasts are immutable.
- Pending, void, no-play, withdrawn, cancelled, and unmeasurable are not losses.
- Missing data is not zero.
- No fabricated live coordinates/events.
- Every recommendation must trace to forecast + market + eligibility evidence.
- Models improve by champion/challenger, not uncontrolled self-modification.
- **Vercel builds are controlled release events, not iteration steps.** Localhost-first is the default, including model research and UI experimentation; remote exceptions are logged and justified.

---

# 2. Current priority queue

**Founder-approved priority override (2026-10-08) — NFL World Model V2, time-sensitive.** The founder moved `NFL-001` → `NFL-005` to the top of the execution order, ahead of `TRUTH-001`. This replaces the earlier instruction to finish only `NFL-001` before returning to `TRUTH-001`. Immediate objective: the strongest *defensible* NFL Week 5 forecasts, starting with Thursday TB @ DAL (2026-10-08, 8:15 PM ET); see the Week 5 readiness milestone in §8. No task IDs, acceptance criteria or history were changed. Unvalidated models stay in shadow; no model is promoted to meet a kickoff.

| Rank | Task ID | Department | Task | Status | Dependency | Production-bound? |
|---:|---|---|---|---|---|---|
| 0 | `CI-001` | Release Engineering / CI | Main-wide `quality` failure: adapters.test.mjs MLB 8 rolling-window `ready` precondition + vacuous per-player check | DONE 2026-10-08 — #1021 merged `d03691c4`; exact-head CI green; Production READY, build-info = merge SHA | None — P0 blocker for #1020 and all PRs | Test/fixture only (1 Production build on merge) |
| 1 | `NFL-001` | NFL Modeling | World Model V2 research, team/player world architecture — champion/control audit (preserve V1 control, reproduce analytic-winner vs sampled-score disagreement and the historical V2 evaluation) | DONE 2026-10-08 (research audit; evidence `docs/NFL_WORLD_MODEL_V2_2026-10-08.md`) | None (TEMPORAL-001 can progress in parallel) | Shadow (audit); Week 5 truth fixes may ship |
| 2 | `NFL-002` | NFL Modeling | Benchmark ladder: MOV/Elo champion → opponent-adjusted EPA → dynamic hierarchical → drive process → distributional ML → calibrated ensemble | IN_PROGRESS — L6 win REJECTED / margin ELIGIBLE / totals REJECTED; incumbent retained; Week 5 forward shadow captured | NFL-001 | Shadow → family-by-family promotion |
| 3 | `NFL-003` | NFL Modeling | Player opportunity allocation (plays → pass/rush → attempts/carries → targets → catches → yards → TDs, with `OTHER`) | IN_PROGRESS — allocV1 PRODUCTION DEPLOYED inside World Model V2 (experimental, labelled); not FORWARD EVALUATED; first-game review: rushing-efficiency tail hypothesis (§NFL-005) | NFL-002 team volume | Shadow → family-by-family promotion |
| 4 | `NFL-004` | NFL Modeling | TD model: hierarchical Bernoulli → team scoring opportunities → red-zone role → drive attribution | IN_PROGRESS — RESEARCH (passing-TD pure-sim candidate failed preregistered dev bars; 50/50 blend passed dev, forward shadow only; world TD v2 preregistered, forward-only). Not qualified; passing TD and first TD withheld publicly; anytime TD stays on the existing published model | NFL-003 | Shadow → family-by-family promotion |
| 5 | `NFL-005` | NFL Modeling | Shared worlds + forward promotion (winner/score/spread/total/player reconcile) | IN_PROGRESS — PRODUCTION DEPLOYED (World Model V2, experimental: #1024, #1026, #1027, #1029 → 2.2.0); FORWARD EVALUATION begun (1 game reviewed, 2026-10-08 TB @ DAL); not STATISTICALLY QUALIFIED; not PRODUCT ELIGIBLE | NFL-002, NFL-003, NFL-004 | Yes, family by family |
| 6 | `TRUTH-001` | Truth / Market Identity | Fix signed-line/model-vs-market truth defects and stale semantics/copy | IN_PROGRESS — PR 1 #1037 PRODUCTION DEPLOYED (merge `20910052`, 2026-10-09); PR 2 #1038 posted-line run line PRODUCTION DEPLOYED (merge `80a6a3fe`, 2026-10-10); PR 3 #1039 product/Results truth PRODUCTION DEPLOYED (merge `f15a51f9`, 2026-10-10); PR 4 #1042 recovery evidence PRODUCTION DEPLOYED (merge `c71a7f5a`, 2026-10-10); served-forecast evidence #1046 READY_FOR_REVIEW; Stage B restatement #1045 and timing amendment #1049 DRAFT (local, not applied) | COST-001 deployment gate verified ✓ | Yes |
| 7 | `CONTRACT-001` | Canonical Architecture | Freeze Event/FeatureSnapshot/WorldReceipt/Forecast/Market/Eligibility/Product/Settlement/Live contracts | IN_PROGRESS — RESEARCH COMPLETED (inventory, gaps, consumer matrix); foundation PRODUCTION DEPLOYED (#1040: read-only ForecastVersion/Settlement projection; no consumer, no migration); engineering lead: Lane A (founder, 2026-10-09) | Founder rules below | Foundation |
| 8 | `MLB-001` | MLB Modeling | World Model V2 rules + baseline audit (extra-innings runner, safety-cap run, starter removal, K/BB/HBP, PA conversion, bullpen, DP/advancement, lineup opportunities) | NOT_STARTED | TEMPORAL-001 can progress in parallel | Shadow |
| 9 | `MLB-002` | MLB Modeling | Benchmark ladder (PA control → Poisson → hierarchical → NB → bivariate → enhanced PA → boosting → ensemble) | NOT_STARTED | MLB-001 | Shadow |
| 10 | `MLB-003` | MLB Modeling | Batter markets from shared PA/base-state worlds; project every confirmed starter | NOT_STARTED | MLB-002 | Shadow → family-by-family |
| 11 | `MLB-004` | MLB Modeling | Pitcher markets (workload survival, BF, K/contact/BB, bullpen transition) | NOT_STARTED | MLB-002 | Shadow → family-by-family |
| 12 | `MLB-005` | MLB Modeling | Shared WorldReceipt + forward shadow | NOT_STARTED | MLB-003, MLB-004 | Family-by-family |
| 13 | `LEDGER-001` | Results / Data | Harden ledger validation, conflict quarantine, correction events, publication evidence | IN_PROGRESS — NFL hook only: World Model V2 grader (private, #1027). Ledger hardening itself not started; zero-build settlement assessment open | CONTRACT-001 | Yes |
| 14 | `TEMPORAL-001` | Data Platform | Point-in-time temporal data/identity foundation for MLB/NFL critical fields | NOT_STARTED | CONTRACT-001 | Foundation |
| 15 | `UX-001` | Frontend | Canonical Sport Hub / UX System V2 | IN_PROGRESS — PRODUCTION DEPLOYED in part (#1026 NFL unified, #1028 Live first, #1030 sport catalog + switcher); #1031 hydration, #1032 resolver + tablet Menu, #1033 nav cleanup READY_FOR_REVIEW; Home/Today, sport-hub layouts not started | CONTRACT-001 view contracts | Yes |
| 16 | `RESULTS-001` | Results | Prop-family Results V2 + time filters + drill-down | IN_PROGRESS — NFL World Model V2 per-family grading (private, #1027) and the public coverage note; Results V2 pages not started | LEDGER-001 | Yes |
| 17 | `PRODUCT-001` | Product Engine | Canonical multi-sport candidate/eligibility/selection engine | NOT_STARTED | CONTRACT-001, LEDGER-001 | Shadow → Yes |
| 18 | `PRODUCT-002` | Bank Builder / Moonshot | Migrate to canonical multi-sport forecast candidates | NOT_STARTED | PRODUCT-001 + passing family gates | Yes |
| 19 | `PARLAY-001` | Parlay Lab | Same-world joint probability / dependency architecture | NOT_STARTED | PRODUCT-001 + world receipts | Shadow → Yes |
| 20 | `LIVE-001` | Live | MLB factual prop tracking + event timeline | IN_PROGRESS — factual NFL/MLB score tracking and NFL rush/rec/receptions beside frozen projections PRODUCTION DEPLOYED (/live, game pages, #1028 Live Now). MLB player join waits on TRUTH-001; WM2 rows on /live and `passing:YDS` planned | Live data/ID capability | Yes |
| 21 | `LIVE-002` | Live | MLB visual Game Center / pitch & field graphics | NOT_STARTED | LIVE-001 | Yes |
| 22 | `LIVE-003` | Live Modeling | Conditional live forecasts from captured state | NOT_STARTED | LIVE-001/002 replay archive | Shadow |
| 23 | `LIVE-004` | Live Products | Validated live straight opportunities | NOT_STARTED | LIVE-003 + fresh market identity | Shadow → Yes |
| 24 | `LIVE-005` | Live Products | Supported live parlays | NOT_STARTED | LIVE-004 + dependence validation | Last |
| 25 | `OPS-001` | Operations | Freshness, dependency receipts, retries, alerts, cost controls | NOT_STARTED | Parallel | Yes |
| 26 | `TRUTHDOC-001` | Documentation | Generated “what runs now” inventory | NOT_STARTED | CONTRACT-001 | Yes |
| 27 | `COST-002` | Release Engineering / FinOps | Reduce build memory so the export fits Vercel Standard (free first build slot); profile `/simulate/d/*` and last-quarter routes | NOT_STARTED | COST-001 Phase 1 | Build config/data loading; Production only after founder approval |

**Standing / parallel workstreams (not ranked against the queue above):**

| Task ID | Department | Task | Status | Dependency | Production-bound? |
|---|---|---|---|---|---|
| `COST-001` | Release Engineering / FinOps | Audit Build CPU causes and auto-deploy triggers; enforce localhost-first and no wasted Vercel builds | IN_PROGRESS — Phase 1 verified 2026-10-08; awaiting founder spend-alert confirmation | None — do first | Process/config, no app release expected |
| `OPS-002` | Operations / Release Engineering | Bot commit identity: Vercel BLOCKED 21 bot-authored Production deployments (`TEAM_ACCESS_REQUIRED`) on 2026-10-07 | IN_PROGRESS — fix merged (#1019 → `f65e7656`, 2026-10-08 04:03Z); first bot data commit attributed `github-actions[bot]`, READY, live; **7-day observation running from cutover 2026-10-08T05:56:44Z** (earliest DONE ≈ 2026-10-15T05:57Z) | None | Workflow/identity config; Production freshness |
| `NCAAF-001` | NCAAF Modeling (DP) | Point-in-time data foundation — DP-owned, independent lane | Owned by DP (status in §12) | None | Foundation |

- `COST-001` protections remain mandatory for every task above: localhost-first, `claude/*` branches create no Vercel deployment, one controlled Production build per approved merge, and no documentation-only Production deployment.
- `OPS-002` observation and DP's `NCAAF-001` continue in parallel and are not paused or re-scoped by the NFL override.
- Previous order (2026-10-07/08, before the override): CI-001, COST-001, OPS-002, TRUTH-001, CONTRACT-001, LEDGER-001, TEMPORAL-001, UX-001, RESULTS-001, MLB-001, NFL-001, PRODUCT-001, … (see git history of this file).

---

# 3. Universal contracts and invariants

## Canonical entities
### Event
Canonical sport/competition/event ID, provider mappings, participants, season/ruleset, scheduled start, schedule revisions. Never join doubleheaders/reschedules on display text alone.

### FeatureSnapshot
`effectiveAt`, provider `observedAt` when supplied, `ingestedAt`, source/version, as-of cutoff, content hash, missingness, transformations.

### WorldReceipt
Engine/code/parameter hashes, model version, seed scheme, input snapshot IDs, as-of time, simulation count, **exact outcome counts**, distributions/joint representation, calibration version, coherence diagnostics, promotion state.

### ForecastVersion
Event/subject/target, quantity/unit, distribution reference, horizon (`pregame` or `live`), publication evidence, predecessor, immutable ID, canonical/noncanonical status.

### MarketSnapshot
Event/subject, period, **signed line**, side, book, odds/price format, capture time, suspension state, overtime/void rules.

### EligibilityDecision
Forecast + market + policy version + as-of, allowed/refused, all reasons, maturity separate from eligibility.

### ProductSelection
Forecast and price references for every leg, selection policy/hash, candidates/rejections, dependency method, offered vs derived price, immutable activation receipt.

### SettlementEvent
Official source reference, settlement-rule version, provisional/final/corrected state, push/void semantics, correction chain.

### LiveObservation
Event/player IDs, source sequence/event ID, source time when available, ingestion time, correction identity, score/stat/event fields, freshness.

## Universal acceptance invariants
- `+1.5` can never populate a `-1.5` comparison.
- Same forecast version + target + market line must resolve to the same underlying probability everywhere.
- All scalar/vector probabilities are finite and within `[0,1]`; complete categorical vectors sum to 1 within tolerance.
- Exact simulation counts reconcile with configured sample count.
- Historical pregame forecast hashes cannot change after publication.
- Conflicting same-ID claims quarantine both payloads; source priority cannot erase disagreement.
- Pending/void/no-play/unmeasurable rows cannot receive W/L scoring metrics.
- Corrections append evidence; the forecast stays frozen.
- Display maturity cannot make a forecast eligible.
- Market-only legs cannot acquire a model probability.
- Missing live rows display unavailable; provider zero displays zero.
- Missing odds never default to `-110`.
- Missing coordinates never create a synthetic trajectory.
- Live forecasts use new identities and reference observed cutoff/state.
- All charts require accessible/tabular alternatives.
- No model promotion without preregistered evidence.
- **No random Vercel builds:** local implementation, unit/integration tests, production build/export, and visual review precede remote builds.
- Docs-only, research, roadmap-progress, and non-deployed evidence changes should not cause app builds when safe gating is configured; do not suppress a data change if the deployed site actually depends on it.
- Only approved, locally verified release candidates may trigger normal Vercel deployments; all exceptions are explained and counted.

---

# 3A. Release engineering — Vercel cost control (founder-mandated)

## `COST-001` — Localhost-first development and controlled deployments
**Priority:** P0 / immediate — **do before normal roadmap bootstrap or the next application PR**  
**Status:** IN_PROGRESS — Phase 1 executed and verified 2026-10-08; **last acceptance item: founder confirms Spend Management notify-only alerts** (dashboard-only) → then DONE  
**Owner/session:** Claude Code session 2026-10-07 (COST-001)  
**Branch:** `claude/cost-001-vercel-cost-control` (merged) · closeout docs: `claude/cost-001-phase1-closeout`  
**PR:** [#1017](https://github.com/yashwantbalaji3/gametimepicks/pull/1017) (merged)  
**Exact head:** `5b8a5bff717e0dd0f086a6515ecd80d1b95f50d4` → merge `f1f46556903b4add02c654f39c3a4fc1dbb8156d`  
**Evidence:** `docs/COST_001_VERCEL_COST_CONTROL.md`; `scripts/vercel-cost-report.mjs`  
**Production acceptance:** PASS — Production serves `f1f46556` (built 2026-10-08T01:53:53Z); key routes 200; smoke 8/9 with 1 pre-existing unrelated failure (docs/COST_001 §9)  

### Progress (2026-10-07/08)
- Status: IN_PROGRESS
- Base main SHA: `6f913e67eb`
- **Measured cause (Vercel billing API, not estimates):** cycle 2026-09-09 → 10-09 = **$315.52 to date, projected $339.62; Build CPU Minutes = 99.9%**. Run-rate since 09-25 ≈ **$19/day ≈ $585/month**, versus ≈ $150/month 09-13 → 09-22.
- **Why it tripled:** on 2026-09-24 the build machine moved Standard → **Enhanced** (wedge fix). CPU-minutes per build did not change; the **billed price per CPU-minute** did ($0.0013–0.0019 → $0.0035), because Pro's first Standard build slot is free and Enhanced has no free slot. ⚠ Reverting to Standard is NOT safe today: build peak memory 7.1–12.9 GB vs Standard's 8 GB.
- **Attribution 09-25 → 10-06 (exact billed CPU per deployment, reconciles to invoice ±4%):** previews **37%** (572 builds, ~300 branches, no consumer — `quality-gate` already builds every PR for free); bot data commits to `main` **36%** (real build inputs); PR merges 13%; redundant parallel `main` builds 6%; ignored builds 3% (a skip still bills 16 CPU-min for the clone).
- **Trigger inventory:** every push to any branch created a Vercel deployment (main → Production, others → Preview); no deploy hooks; Vercel crons are not builds; `[skip ci]` is ignored by Vercel; duplicate project dormant since 07-31.
- **Implemented locally (Phase 1A):** `app/vercel.json` `git.deploymentEnabled` = `main` + `preview/**` only; guard test `app/src/lib/vercel-preview-gating.test.mjs` (mutation-probed); read-only `scripts/vercel-cost-report.mjs`; strategy + local-first gate in `docs/COST_001_VERCEL_COST_CONTROL.md`.
- Local tests: preview-gating + canonical-project guards 11/11 pass; 4 mutations all caught; cost report run live.
- Vercel Preview builds triggered: **0** (branch push proven gated) · Production builds triggered: **1** (merge `f1f46556`, 48 CPU-min ≈ $0.17) · Vercel settings changed: **1** (build queue, below).
- **Phase 1 executed (founder approval 2026-10-07):**
  - Branch push `5b8a5bff` (01:27:46Z) → **0 Vercel deployments** in 184 s; control branch without the rule (`claude/mlb-playoff-slate-receipts`) did create a Preview in the same window.
  - PR #1017 exact-head CI run 37713335118: `python` pass, `quality` pass (20m8s).
  - Build queue on `gametime-picks` (`prj_qaHS65v4G30tTy1s6MYbsLbKYvbh`) set 01:31:41Z: `buildQueue` none (run all immediately) → `WAIT_FOR_NAMESPACE_QUEUE` (one build per branch). Re-read confirmed nothing else changed (machine stays `enhanced`). Rollback in docs §9.
  - Merged 01:52:28Z with `--match-head-commit`; exactly one Production deployment `dpl_FTMcpA7YhM77nrSHTde2h3X6yhxj`, READY 01:57:05Z.
  - Spend alerts: Vercel supports one budget at 50/75/100%; founder steps in docs §10 (budget $150 → $75 / $112.50 / $150; **Pause Production Deployments must be OFF** — Vercel defaults it on and this cycle already exceeds $150). Exact $100 check via `vercel-cost-report.mjs --budget 100`.
- **Phase 2 (local, no Vercel):** Docker 4 CPU / 7.6 GiB, no swap, Node 24: both the default build and `experimental.cpus: 2` hit the memory ceiling and had static workers **OOM-killed** (1 and 2), restarting `/simulate/d/<date>` pages. **Standard remains unsafe; worker capping does not fix it.** Follow-up `COST-002`.
- Follow-ups: Phase 2 local Standard-machine (8 GB) feasibility test; separate task for the bot commit identity that caused 21 BLOCKED production deploys on 10-07.
- Expected effect (to be observed, not claimed): Phase 1 ≈ $585 → ≈ $300/month; Phase 2 (if proven) ≈ $10–40/month.

### Founder cost context and objective
The latest Vercel billing screenshot shows **Build CPU Minutes: $339.09** and **On-Demand Charges: $119.32** (different dashboard categories; do not assume they are additive), while the founder reports **over $400 usage for the cycle**, versus a previous sustainable monthly bill well below $100. The cause is **not yet proven**. Treat runaway build-trigger frequency and CPU cost as urgent infrastructure debt, not an acceptable price of development speed.

**Goal:** move toward a sustainable monthly Vercel bill **below $100 if technically feasible**, with an explicit monthly budget/alert threshold approved by the founder after measuring baseline. Never promise that a config change alone guarantees a dollar amount.

### Default development and release workflow
1. **Localhost first:** reproduce, edit, run targeted tests, broader regressions, local production build/export where relevant, and desktop/mobile visual QA locally.
2. **Batch related work:** improve and iterate through multiple local commits/screenshots before proposing one coherent integration candidate. Local commits are fine; avoid remote speculative pushes while auto-deploy triggers are active.
3. **Founder review gate:** for visible UI/product changes requiring approval, present local screenshots/video or a live localhost walkthrough; do not deploy just to show the first draft.
4. **Remote CI is a gate, not the primary development loop.** Require a validated branch/exact head. Avoid duplicative expensive app builds in GitHub Actions and Vercel unless verification requires both.
5. **One controlled Production deploy per approved integration when possible**, followed by Production smoke/acceptance. A second deploy requires documented root cause; do not silently loop deploy–patch–deploy.
6. **No Preview spam:** do not allow PR/branch/documentation pushes to launch repeated Vercel previews without a real validation need. Verify the actual Vercel Git integration and deploy rules first, not just a written policy.
7. **Data-only and shadow-model work:** do not trigger full app builds when data can be collected/evaluated separately and the deployed app does not require regeneration. If the statically exported pages consume the changed data, preserve necessary production freshness; design an alternate cheaper delivery path before suppressing dependent builds.
8. **Emergency exception:** critical Production incident or genuinely Vercel-only failure may require a remote build before full local review. Record the reason, attempted builds, measured impact, and prevention follow-up; keep scope narrow.

### First task: measure before changing configuration
Inspect current Vercel deployment history, billing usage, Git integration, repository workflows, build logs, and static export dependencies. Without guessing, document:
- Frequency, duration, and cause of Production and Preview builds; expensive repeated build steps.
- Which pushes to `main`, PR branches, research branches, docs/roadmap updates, bot/generated-data branches, and scheduled jobs currently trigger Vercel builds.
- Build CPU usage attributed to ordinary app code changes versus MLB/NFL data bot commits, generated JSON, static page regeneration, or automatic previews (where Vercel provides sufficient evidence).
- Whether expensive steps are duplicated between GitHub CI, Next.js static export, code generation, and Vercel; where caching is safe.
- Whether ignored-build rules or path-based triggers would be safe given static export semantics; whether preview deployments can be explicitly permitted only for selected candidates.
- How to keep the Vercel production artifact current without rebuilding it for every research/receipt/roadmap update.
- Any Vercel configuration limitations by plan; do not assume a particular ignore-build mechanism exists until verified.

### Candidate cost measures to evaluate (implement only after impact analysis)
- Scope deployments to approved application-affecting change sets; suppress unnecessary docs/research/status/evidence previews.
- Use Vercel's supported ignored-build/automatic-deploy controls where compatible; test changed-path and bot-commit behavior against real dependency paths.
- Use a single deliberate PR release candidate rather than a string of intermediate preview builds.
- Cache safe build artifacts/dependencies and move heavy historical simulations/backtests out of the web build.
- Split high-frequency live data and model-research refresh from full Next.js static export when technically and economically justified.
- Batch data releases or use incremental API/object reads only if source freshness and consumer correctness remain intact.
- Document cost drivers for CI and external compute separately from Vercel so savings are not falsely attributed.

### Acceptance / definition of done
- Deployment-trigger and top Build CPU-driver inventory with evidence, not hypotheses presented as facts.
- Safe no-build behavior demonstrated for a docs-only/roadmap or non-deployed research commit **without disabling legitimate app/data releases**.
- Local development/QA checklist and clear founder-controlled deploy gate documented and adopted.
- Reviewed approach to Preview vs Production deployment behavior, including how remote-only verification is requested.
- At least one demonstrably safe waste-reduction mechanism in place where the audit confirms excess builds; otherwise record the technical blocker and alternate plan.
- Alerts/budget check for build usage and monthly spend established where supported; report baseline and next-cycle comparison method.
- Exact build/deploy counts and reasons are captured in future Production-task Session Logs.
- No service interruption, stale production artifact, dropped data refresh, or weakened release gate from cost optimizations.

### Finding (2026-10-09): data commits are the bulk of Production builds
- **21:00Z on Oct 8 → 13:15Z on Oct 9:** 39 Production deployments. 5 were PR merges (#1026–#1030); **34 came from automated data commits**: hourly `mlb lineup refresh`, `nba results capture`, NFL/EPL settlement receipts, daily products, nightly settle and others.
- **Why they build:** each touches `app/public/data/**` or another BUILD_INPUT in `vercel-ignore-build.sh`, so each is a full build. That is correct for freshness, but the volume dominates Build CPU.
- **Options, assessment only (not implemented):**
  - coalesce data commits into a few scheduled publication windows;
  - move high-churn, low-value families (for example NBA results during the preseason) off the build path;
  - serve settlement and results from a runtime store (the LEDGER-001 / OPS-001 zero-build settlement assessment).
- **Billed CPU per build still needs the dashboard login.** Savings will not be claimed until measured.

### Measured build causes and Stage A (2026-10-09; founder decision: COST-001 is P0)
**Method:**
- Every Production deployment in the 7 days to 2026-10-09 13:15Z: 564 records.
- Replayed the ignore step's own rule: diff the build inputs from the last BUILT commit.
- **Result: about 480 real builds (~69 a day)**, with 46 skipped.

GitHub's deployment status can't be used to count builds: commits that touch no build input also report "Deployment has completed".

**Who builds:**

| Source | Builds |
|---|---|
| PR merges | 94 |
| MLB lineup refresh | 58 |
| Daily products | 45 |
| MLB daily production slate | 42 |
| NFL settlement receipts | 40 |
| NFL event window | 39 |
| Nightly settle | 30 |
| NBA results capture | 25 |
| EPL matchweek refresh | 18 |
| Pregame weather | 12 |
| Others | the remainder |

Bot data commits are 386 of the 480 (80%).

**Superseded builds:** 263 of 480 (55%) were superseded by another build within 10 minutes, and 174 within 5. The pairs:

| Pair | Occurrences |
|---|---|
| MLB slate → daily products | 35 |
| Event window ↔ its own settlement receipts | 35 |
| Nightly settle → MLB slate | 14 |
| Morning projections → MLB slate | 7 |

**Repeated writes without real change:**
- **MLB lineup refresh:** a commit at 03:03Z, after the slate had finished, changed only timestamps in two public MLB files plus a new timestamped prediction-snapshot file (a build input), and still triggered a build.
- **NBA results capture:** it committed in-progress status and scores that no reader uses. Every reader uses FINAL rows only.

**Stage A, smallest safe reductions** (branch `claude/cost-001-coalesce-builds`, needs founder approval; no ignore-step change):
1. **`nfl-event-window`:** one push per run. The window commit and the receipts commit go out in one push from an `always()` step. Saves about 1 build per run (about 35 a week).
2. **`nba-results-refresh`:** commit `latest.json` only when something a reader can see changed: a final, a corrected final, a postponement, a schedule change or the window state (`lib/sports/nba/results-publishable.mjs`). Replayed over the last 7 days, 12 of 30 commits would have been dropped. The saving grows in the regular season.

**#1035 merged** at exact head `a524b8b7e4` (founder approval; `python` ✓ `quality` ✓; MERGEABLE/CLEAN) → `cd9a6a7e880be48ba95870c6cffe0e8eedcf06d0` at 16:23:13Z.
- Production build-info = `cd9a6a7e`, built 16:25:15Z; Vercel success 16:29:20Z. Preview deployments: 0.
- The merge commit was checked against the approved head: the reviewed files are identical, and the 30 differing roadmap/report lines all come from main.
- **Behaviour check pending:** the first post-merge `nfl-event-window` run (one push) and `nba-results-refresh` run (in-progress-only changes not committed).
- **Baseline for the measurement:** Oct 3–8, ignore-step replay: 70.2 builds a day (55.7 automated, 14.5 merges).
- **Decision recorded:** the founder REJECTED the commit-message deferral marker (2026-10-09). The ignore step's "never read the commit message" guard stays.

**Proposed, needing a founder decision (not implemented):**
- **A `[deploy:defer <N>m]` commit marker** that the ignore step honours. It would skip only when every build-input commit since the last build carries a valid marker and the oldest is younger than its window, plus a scheduled backstop that publishes expired deferrals. It would coalesce the chained MLB/daily workflows (about 60 more builds a week).
  - It **reverses a pinned policy**: `vercel-ignore-build.behavior.test.mjs` asserts the script "must not read the commit message at all" (the 2026-09-22 audit). That decision belongs to the founder.
- **MLB lineup refresh:** don't rewrite timestamp-only files, and don't write an identical prediction snapshot. This is MLB pipeline scope and needs the MLB owner's review of the snapshot history semantics.

**Savings will not be claimed until measured:** builds per day before and after, from the same replay method; billed CPU needs the dashboard login.

**Stage B (runtime Results pilot):** options in `docs/research/ops/zero-build-settlement-assessment-2026-10-09.md`; pilot design and cost estimate in `docs/research/ops/runtime-results-pilot-design-2026-10-09.md`. It reuses the existing private Blob store and SDK: write-once versions, `ifMatch` manifest, an `/api/results` function, and the static snapshot as fallback. Local validation comes before any Production PR. The founder approved the direction: Vercel Blob, NFL World Model V2 grades first, the static snapshot as fallback. No Production pilot without separate approval.

### Remaining tasks (COST-001)
| # | Task | Needs | Status |
|---|---|---|---|
| 1 | Push branch; confirm via Vercel API it creates **zero** deployments | founder OK to push | DONE — 0 deployments (2026-10-08 01:27Z) |
| 2 | PR → exact-head CI → merge; exactly **1** production build; `build-info` advances | founder OK to merge | DONE — #1017, 1 build, prod `f1f46556` |
| 3 | On-demand concurrency → "Run up to one build per branch" | founder approval | DONE — 01:31:41Z; post-merge data deploys monitored |
| 4 | Spend Management notifications (notify-only, **no pause**) | founder, dashboard (docs §10) | WAITING ON FOUNDER |
| 5 | Phase 2 local memory test | local | DONE (finding: Standard unsafe) → continues as `COST-002` |
| 6 | Re-run `scripts/vercel-cost-report.mjs` after 7 days of the 2026-10-09 cycle; record observed vs baseline | — | NOT_STARTED (due ≈ 2026-10-16) |
| 7 | Phase 3 only if `COST-002` cannot reach Standard: founder data-freshness SLO → publisher cadence or runtime data delivery | founder decision | DEFERRED |

## `COST-002` — Build memory reduction (path back to the free Standard build slot)
**Priority:** P1 (cost) · **Status:** NOT_STARTED · **Depends on:** COST-001 Phase 1
- Evidence: docs/COST_001_VERCEL_COST_CONTROL.md §11 — constrained builds OOM at the 8 GB ceiling with or without a worker cap; restarted pages `/simulate/d/<date>` (candidate, not proven).
- Do: profile per-route render memory locally (Docker 4 CPU / 8 GB harness); reduce the heaviest routes' build-time data loads without changing published content; re-run ≥ 3 constrained builds.
- Acceptance: ≥ 3 consecutive constrained builds with **0 OOM kills and ≥ 1.5 GiB headroom**; byte-identical public export (excluding build stamps) vs. baseline. Only then propose Standard + on-demand off (founder approval; Enhanced is the one-click rollback). Expected ≈ $10–40/month if achieved — not claimed until observed.

### Cost metrics to track
`monthly_total`, `Build CPU Minutes charge`, `build count`, `preview count`, `Production count`, `median/p95 build minutes`, `top trigger categories`, `avoided builds`, `Vercel-specific incidents`, `projected month-end cost` (if measurable). Set alerts with founder-agreed thresholds; **do not claim a saving until observed**.

---

# 4. Truth, market identity and product semantics

## `TRUTH-001` — P0 truth correction package
**Status:** IN_PROGRESS — PR 1 (#1037) PRODUCTION DEPLOYED; PR 2 (#1038, posted-line run line) PRODUCTION DEPLOYED; product-truth PR 3 (#1039) PRODUCTION DEPLOYED; historical recovery PR 4 (#1042) PRODUCTION DEPLOYED; served-forecast evidence (#1046) READY_FOR_REVIEW; Stage B (#1045) and the timing amendment (#1049) DRAFT  
**Owner/session:** Claude Code, Lane A (Core Intelligence), 2026-10-09  
**Branches:** `claude/truth-001-mlb-truth` (merged) · `claude/truth-001-runline-posted` (#1038, merged) · `claude/truth-001-product-truth` (#1039, merged)  
**PR:** [#1037](https://github.com/yashwantbalaji3/gametimepicks/pull/1037) merged · [#1038](https://github.com/yashwantbalaji3/gametimepicks/pull/1038) merged · [#1039](https://github.com/yashwantbalaji3/gametimepicks/pull/1039) merged · [#1042](https://github.com/yashwantbalaji3/gametimepicks/pull/1042) · [#1045](https://github.com/yashwantbalaji3/gametimepicks/pull/1045) · [#1046](https://github.com/yashwantbalaji3/gametimepicks/pull/1046)  
**Exact head (#1037):** `dbe65178c21bf21431326f62c47b37c37475f4dd` → merge `20910052555031e4790c8336116f4d0c6e3cde76` (2026-10-09T22:05:39Z, `--match-head-commit`)  
**Evidence:** this section; tests named below  
**Production acceptance (#1037):** PASS (record below)

### Reproduce on current main
- Signed run-line/model-vs-market mismatch.
- Missing/weak gaps rendered as `ALIGNED`.
- MLB props copy contradicting score/total availability.
- Different MLB engines/snapshots appearing under one simulation story without source labeling.
- `DATA PENDING` when the real state is `NO QUALIFYING CARD`.
- Conflicting Moonshot/Results bankroll language.
- Ambiguous Bank Builder exposure scope.
- Rounded probabilities presented as exact counts out of 10,000.
- MLB simulated box score (`mlb-full-game-report.tsx` `BoxScore`): on a confirmed order, a batter with no posted prop line keeps his real name but is simulated at **replacement-level rates**. His row looks like a projected one, and only game-level notes give the count (e.g. 2026-10-07 TB@NYY 849838: 3 TB, 2 NYY rows). Found by `CI-001`. Fix here is disclosure only: a per-row rate-source flag on **new** artifacts (never rewrite published ones; old games show "not stated per row"), rows marked or suppressed, and `adapters.test.mjs` MLB 8c extended to require the flag where present. Making the gap disappear is `MLB-003`.

### Acceptance
- Signed-market tests cover both orientations, alternate lines, integer pushes, period/rules differences.
- Missing != aligned.
- State vocabulary distinguishes `NO_QUALIFYING_CARD`, `MISSING_INPUT`, `STALE`, `PAUSED`, `PIPELINE_FAILURE`.
- Visible probability/line carries scope/provenance.
- Exact numerators/denominators persist or UI says “approximately.”
- Production pages match corrected semantics.

### Existing references
- `claude/handoff-pe-1-markets`
- `claude/handoff-tr-copy-1`
- `claude/handoff-pe-stage4-package`
Use only after current-main reproduction.

### Baseline audit on current main (2026-10-09, `3e8aa34d71`, read-only)
Six audits (game/market, player identity, product state and copy, MLB simulation story, results, historical immutability) against committed artifacts. Classes: (1) confirmed defect · (2) previously resolved · (3) data limitation · (5) contract dependency · (6) future enhancement · (7) unsupported claim.

| # | Finding (evidence) | Class | Disposition |
|---|---|---|---|
| A1 | **MLB Overview run line compares opposite signs.** Row "HOME −1.5 cover" paired P(home by 2+) with the book's no-vig cover at the line it POSTED, which is signed for home. 372 of 816 committed market blocks have home +1.5. 2026-10-06 LAD @ ATL: "ATL −1.5 cover 26% · market 65%"; at +1.5 the sim says 55%. `/markets` and the Model vs Market tab were already correct (`homeCoverProbability`) | (1) | Fixed, PR 1 |
| A2 | **MLB player identity.** `generate_mlb_board.py` looked the provider name up exactly in one slate-wide roster dict. Accents ("Jose Ramirez" ≠ "José Ramírez"): since 09-01, 1,286 batter + 40 pitcher rows with a posted line got no playerId/projection and were simulated at replacement level, with a note saying "no posted prop line". Namesakes: "Max Muncy" in Dodgers games resolved to the A's Max Muncy (691777) on 38 rows | (1) | Fixed, PR 1 |
| A3 | **"Aligned · model ≈ market" on missing or large gaps** (v2 board). Null edge (Jose Ramirez hits) and +25.3 pts Low confidence (Brenton Doyle) both read "Aligned" | (1) | Fixed, PR 1 |
| A4 | **Replacement-rated batters unmarked per row** in the simulated box score (the item below). 977 of 4,248 confirmed batter rows; 2026-10-07 849838: 3 TB, 2 NYY | (1) + (5) | Disclosure fixed on new artifacts, PR 1; coverage is `MLB-003` |
| A5 | **MLB story mixes engines and clocks.** Chapter 6 lists player-prop-engine picks inside the full-game story, unlabelled, claiming "furthest from the posted line" (ranked by probability). The close stamped the slate clock (after first pitch) on carried pregame forecasts: all 9 postseason games 10-05..10-08 | (1) | Fixed, PR 1 |
| A6 | **Rounded probabilities shown as exact "N / 10,000".** 849832: "5,310 of 10,000" vs persisted counts 5,307. Prop-engine picks counted as full-game simulations. Three tests pinned the unmarked strings. NFL already fixed (6bef3033a7) | (1) | Fixed, PR 1 |
| A7 | Props tab said HR/RBI/Runs "not simulated" while the Box Score shows them | (1) minor | Fixed, PR 1 |
| A8 | **MLB run-line PICK ignores the posted sign.** `decision.ts` picks ±1.5 off the simulated favourite: `mlb/predictions/2026-10-05` 849839 publishes "NYY +1.5" (STRONG) while the book posted NYY −1.5; 218 of 579 committed run-line picks are at the opposite sign to the book line for that team (re-counted 2026-10-09) | (1) + (5) | **Founder decision** (below) |
| B1 | `/build` and `/build/custom` say "Data pending" when the producers ran and found no card (today: 0 MLB games); `build-header-scope.test.mjs` pins the ternary | (1) | Next PR |
| B2 | `/homer-nukes` says "not published yet" on a no-games day (producer writes no file by design) | (1) | Next PR |
| B3 | `/moonshot` header pill reads the retired legacy lane (`moonshot-lane/active.json`, 2026-08-17) → "Not published today · stale" on a no-games day | (1) | Next PR |
| B4 | **Moonshot bankroll contradiction.** `mr-dub/portfolio.json`: `separateFromCore:false`, Moonshot results move the core bankroll since 2026-08-15; /moonshot's "Open decision" text says the record "never touches the protected bankroll"; Results explorer says "each with its own bankroll… never added together"; ladder copy says flat stake vs "whole balance rides" | (1) | Next PR (copy follows the artifact) |
| B5 | **Bank Builder / Moonshot "at risk".** `product-lanes-ladder.tsx` prints the step STAKE as "at risk · open exposure" (e.g. $400.22) while the ledger's exposure is the lane seed ($25); exposure scope (lane / day / both lanes) unstated | (1) | Next PR |
| B6 | `/today` shows "No-play" on a no-games day; `/bank-builder` says it is not a no-play call | (1) minor | Next PR |
| B7 | State vocabulary: `product-state.mjs` has NOT_RUN / GENERATION_FAILED / NO_EVENTS / INPUTS_MISSING / INPUTS_STALE / COMPLETED_NO_QUALIFIED_CARD, used only by /bank-builder and /mr-dub; no PAUSED/PIPELINE_FAILURE equivalents for other producers | (5) | `CONTRACT-001` (one product-state vocabulary) |
| C1 | `/results` "What the model is learning" panel reads `audit/market-reliability.json`, last written 2026-06-07 by a script nothing runs; lists NBA Points as "Working" at 53.7% while the ledger and `/results/model-audit` say 47.3% | (1) | Next PR |
| C2 | `/results/model-audit` gold "Cross-sport" tile pools frozen NBA + live MLB (50.2%, 52,928 decisive), the blend eb3590fead removed from /results | (1) | Next PR |
| C3 | `/results` accuracy footnote says "since 2026-05-27" over lifetime figures (NBA from 05-15: 49.1% shown vs 47.7% since 05-27) | (1) | Next PR |
| C4 | Pending/void/no-play counted as losses | — | Not reproduced: every public denominator is decisive-only (artifact recomputation, 41 projection files) |
| C5 | Forecast Record page / CSV / Ask parity | (2) | Verified for 24 sport/family pairs |
| D1 | Historical rewrites: MLB full-game "unavailable" erasures after first pitch (09-20, 09-25, 10-01, 10-03) and board pruning of started games (08-27 → 09-09) | (2) | Both stopped (`f96e91fc94`, paid-run gate `19261185b7`); damaged public files were never restored (internal snapshots hold the forecasts). Restoration = historical data change → founder decision. Latent: a `--forced` morning-projections run would still prune; immutability test pins only `boards/2026-08-03` → `LEDGER-001` |
| D2 | Missing odds default to −110 in model-vs-market code | (7) | Not reproduced; only `accounts/guardrails.mjs` / `bet-insights.mjs` default a user's own won-slip price (personal P&L, low) |
| D3 | NFL spread/total comparison sign | (2) | Not reproduced (NFL compares win % and total only) |

### PR 1 — MLB truth package (`claude/truth-001-mlb-truth`, stage IMPLEMENTED LOCALLY)
Commits (all forward-only; no published artifact rewritten):
1. `d0d67679fd` player identity (A2): resolve against the two clubs in the row's own game, by role, with the existing suffix-preserving `normalize_name`; exactly one id or refuse; counts in `summary.playerIdentity`. Test `pipeline/mlb/generate_mlb_board_player_identity_test.py` (verbatim 849832 names; 4/4 mutations caught), registered in `scripts/run_all_tests.sh`. Replay on committed boards since 09-01 (confirmed lineups as roster): 5,094 rows same id, 378 newly resolved (42 players), 2 WSH@LAD Muncy rows 691777 → 571970, 0 regressions.
2. `3baa9444a6` run line (A1): `lib/mlb/full-game/market-overview.ts` uses the shared `homeCoverProbability`; alternate lines the sim did not publish are withheld; the market column names book + capture time. Test checks the model cell against each game's exact run-differential counts on every committed market block (mutation caught).
3. `1f052d1ba6` Aligned (A3): `mlbBoardSignalDisplay` → Unavailable / Low confidence / Aligned (0 < gap < 5) / Model lead / Watchlist; classification thresholds unchanged.
4. `0028a80992` per-row rate source (A4): optional `rateSource` on new `SimBatterLine`s; box score marks "replacement rates" and states the per-team count on older artifacts without guessing rows; note now says "no GTP projection" rather than "no posted prop line"; `adapters.test.mjs` MLB 8c accepts the key and checks it against `9 − ratedCount`; `input-snapshot` `paddedSlots` counts negative sentinel ids.
5. `661556a9cd` story (A5): "Player markets · prop engine"; time via `simProvenance` (moved verbatim to `lib/mlb/full-game/sim-provenance.ts`, one owner for header + story).
6. `5934eb7818` counts (A6): `lib/sim-frequency.ts` exact win tallies from persisted counts (583/583 reconcile), "≈" otherwise; prop-engine picks state their own percentage.
7. `6c7f81e2ea` copy (A7).
8. explorer source guard: `simulation-explorer.test.mjs` pinned the old in-card formula; it now asserts the exact/≈ rule.

**Local validation (final head):** CI unit phase 9,150 pass / 2 fail / 1 skipped (the 2 are `rls-live`, which need a local Postgres; pre-existing, documented by OPS-002/CI-001); local production build `npm run build` PASS (2,784 pages, 2m40s, 16 GB machine; build-generated `data/ask-projection` changes discarded, not committed); post-build phase 689 pass / 0 fail / 3 skipped; Python CI script (`scripts/ci/run-python-tests.sh`) 90/90; `tsc --noEmit` clean; server render of the real report on 849819 / 849832 / 849838: "ATL +1.5 cover 55% · market 65%", "CWS +1.5 cover 61% · market 62%", "CLE wins 5,307 of 10,000", book + capture time shown. Today's MLB slate has 0 games, so no MLB game page is currently built: every A-item is latent until the next postseason slate and reaches pages on the first build after merge plus the next MLB run (identity: next board generation).

**Expected deployment impact:** one Production build on merge (app source changed). Data effect only on newly generated MLB boards / simulations: more batters and pitchers resolved (projected instead of replacement-rated; more leans with a model probability), `rateSource` on new simulated rows. No change to any NFL, soccer, NBA or UFC producer or page.

### PR 1 release record (#1037)
- **CI (exact head `dbe6517`):** run 37992923795, `python` ✓ `quality` ✓. The first head `af033fa154` failed `quality` on one test: `mock.timers.enable({apis, now})` is a Node 22 API and CI pins Node 20.4.0. It was replaced with a plain Date stub. The local unit phase was re-run on Node 20.4.0 (9,150 pass, 2 known `rls-live` env failures). The founder re-approved the changed head.
- **Pre-merge checks:**
  - head unchanged; MERGEABLE/CLEAN;
  - 36 files, none under `app/public/data`/`data/`, none Vercel/workflow/ignore-build;
  - Production at main head `ea5b3d2e`, all recent deployments `success`, no other release in flight.
- **Cross-sport check (condition 9):** the visible text of all 2,766 exported pages, base `3e8aa34d71` vs PR build, differs on exactly 14 pages. All are archived NFL preseason `/games/nfl/<Aug 14–22>` reports, which gain "≈" on four counts (those simulations contain ties, so the counts are approximate); no number changed. Founder accepted.
- **Max Muncy (condition 7):** 38 wrong-id rows in Dodgers games over 17 dates (571970 = LAD, 691777 = ATH per StatsAPI confirmed lineups). The bounded replay could test only 2 (09-05); 21 rows were before 09-01, 13 had no simulated players, and 2 used lineup proxies already carrying the wrong id.
- **Merge:** `20910052555031e4790c8336116f4d0c6e3cde76` at 22:05:39Z.
- **Vercel:** Production deployment `gametime-picks-ipf9j1oym` (created 22:05:43Z, ≈5 min, Ready). `build-info` = `20910052`, built 22:07:12Z, serving by 22:10:38Z. Preview builds 0. Billed CPU: dashboard only.
- **Production acceptance PASS:**
  - 13 key routes 200 (`/`, `/mlb/`, `/nfl/`, `/results/`, `/today/`, `/markets/`, `/live/`, `/bank-builder/`, `/simulate/`, `/moonshot/`, `/results/model-audit/`, an NFL preseason report, an NFL game dashboard).
  - The NFL preseason report shows the approved "≈ 4,945 / ≈ 4,994 / ≈ 421".
  - `/nfl/`, the NFL game dashboard, `/live/`, `/mlb/` and `/simulate/` contain no "≈" (unchanged).
  - MLB game-page fixes are deployed but latent: 0 MLB games on 2026-10-09, so no MLB game page is built until the next postseason slate.

### PR 2 — posted-line run line (#1038; founder decision 1, Option A)
- **Implementation:**
  - decision engine `mlb-prediction-2026.10-v2`;
  - `postedRunLine` evaluates both sides AT the captured signed home line (shared `homeCoverProbability`) and carries basis, homeLine, the book's no-vig price for the picked side, the bookmaker and the capture time;
  - no posted line / integer line / unsimulated margin → no pick, with a reason. A line is never inferred.
- **Grading:** v2 picks grade under `run_line_posted` (ledger family `mlb_run_line_posted`); v1 stays `run_line`; every graded row records `decisionEngineVersion`. No published pick or graded row is rewritten.
- **Founder safeguard (review of the first head):** a corrected market definition is not a qualified model.
  - A v2 call **inherits every v1 restriction and none of v1's performance** (`POSTED_RUN_LINE_INHERITS_V1_RESTRICTIONS`): it is paused while either record is BREACHED.
  - Lifting the inheritance is a founder decision on v2's own evidence, never a scorecard default or a zero-pick record.
  - The command centre shows an inherited hold as PAUSED and a zero-pick v2 record as "0 graded · too early", never v1's 810 or HOLDING.
  - Verified that no product module (products, daily-portfolio, parlays, top10, multi-sport) consumes the decision engine's run-line call; product run-line legs come from sportsbook team markets under their own gates. Pinned by test.
  - Statistical qualification of v2 is NOT claimed: there is no preregistered bar for MLB game calls; the coin floor + live-record gate apply.
- **Validation:**
  - 13 + 2 safeguard tests; 5 mutation probes caught;
  - unit phase on Node 20.4.0: 9,135 pass, 2 known env failures;
  - Python 89/89; build PASS; post-build 119 rendered guards pass;
  - a dry run of the producer from the repo root picks the posted sides (ATL +1.5 10-06, CWS +1.5 10-08);
  - `workflow-script-cwd.test.mjs` caught an `@/` import that would have failed `mlb-daily-production` at runtime (fixed: relative import).
- **Status:** READY_FOR_REVIEW. Do not merge without explicit founder approval.

- **Release (2026-10-10).**
  - **Approval:** founder approval at exact head `b7de8a4acdfff6933eeb10786d9e0d1a5419d7d5`.
  - **Pre-merge checks:**
    - head unchanged; quality and python green;
    - `CLEAN` against main (only bot data commits after it);
    - scope = the reviewed head plus the main merge and roadmap;
    - inheritance constant `true` and wired;
    - no eligibility, odds or workflow file touched;
    - no other integration or deployment in flight.
  - **Merge:** `--match-head-commit`, as `80a6a3fe9c6358b72860d3c74c49a478975c15e3` at 01:14:55Z.
  - **Production:** `build-info` reported that commit, built 01:16:24Z, checked live 01:19:55Z. `/`, `/mlb/`, `/results/`, `/results/forecasts/`, `/results/model-audit/`, `/results/picks/mlb/`, `/today/`, `/methodology/`, `/system-status/`, `/markets/` and `/live/` all returned 200.
  - **Command centre:** `/mlb/` model status shows "Run line calls (posted line) · Too early to judge · 0 graded". v1 `mlb_run_line` is HOLDING (not paused), so there is no restriction to inherit today; the hold engages automatically if v1 is BREACHED.
  - **Results:** unchanged at 13,741 published and 10,933 measured, equal to the ledger row count. The MLB graded log is unchanged.

### Founder policy — public forecast of record (decision 2026-10-09, Option B)
- Going forward, an official PUBLIC forecast of record needs verifiable publication evidence from before the event's actual start; generation time alone is not sufficient.
- Records distinguish `generatedAt`, captured/`frozenAt`, `publishedAt`, actual start, and the publication source/evidence. A git commit timestamp alone does not prove public availability.
- **Case BAL @ NYY 823491 (2026-09-25):** graded from a revision generated 20:04:50Z (snapshot) but committed in `2bedba6304` at 20:05:01Z, one second after the 20:05 first pitch. The last publicly committed pregame forecast is `f51be27b62` (19:23:37Z): same picks, different probabilities (ML 0.544 vs 0.56, total 0.526 vs 0.546, run line 0.654 vs 0.637).
- **To do (append-only, separate reviewable PR, no bulk regrade):** a correction record referencing both forecasts, their model versions and timestamps, the reason, and the effect on Results. Uncertainty is reported, not resolved by assumption.

### PR 3 — product and Results truth (`claude/truth-001-product-truth`, IMPLEMENTED LOCALLY; founder decision 5 direction approved)
- **Moonshot bankroll (B4), traced before copy:** Rule S (founder 2026-09-10) folds Moonshot into the core paper bankroll. The fold's −$4,675 = 35 Bank Builder × $100 + 47 Moonshot × $25, and `portfolio.json` `moonshot.separateFromCore: false`. Copy is corrected on /moonshot ("never touches the protected bankroll"), the /results explorer ("each with its own bankroll") and /mr-dub ("side lanes are separate flat-stake paper"). /mr-dub's canonical row reads "Core bankroll (Bank Builder + Moonshot)", and the retired Jun 23 – Jul 6 single-card lane (0–7) is named as such. No accounting change.
- **At-risk amounts (B5):** lane cards printed the rolled stake as "at risk" ($400.22 vs the $25 seed). They now print "$25 seed at risk · $400.22 stake includes rolled wins". Bank Builder tiles name their scope ("At risk today (Bank Builder lane seeds)", "At risk (seed)").
- **Results (C1–C3):** the stale June "What the model is learning" panel is withheld until the artifact states a time within 7 days of the newest settled slate. The pooled "Cross-sport" tile is removed from /results/model-audit, and the NBA tile states its frozen window. The accuracy footnote prints each record's real window instead of "since 2026-05-27".
- **No-games-day states (B1, B2):** /build and /build/custom say "No qualifying card / legs" when the day's producer ran with nothing to show ("Data pending" only when no producer output exists). /homer-nukes says no MLB games are scheduled instead of "not published yet".
- Remaining in PR 3: the /moonshot status pill (B3) and /today "No-play" on a no-games day (B6); then validation (unit, build, post-build, rendered check) and the PR.

- **Release (2026-10-10).**
  - **Approval:** founder approval at exact head `defb18c591da7ba8210302a120a38d4928494487`.
  - **Pre-merge checks:**
    - head unchanged; quality and python green;
    - `CLEAN` against main (only bot commits after it);
    - scope = the reviewed product/Results truth files and the roadmap; no data, workflow, odds or ledger file;
    - no other integration or deploy in flight.
  - **Merge:** `--match-head-commit`, as `f15a51f971cb4d39a1efb9792f2702a78b74bb7e` at 02:38:32Z.
  - **Production:** `build-info` reported that commit, built 02:43:35Z, checked live 02:46:56Z.
  - **Routes:** `/`, `/today/`, `/moonshot/`, `/bank-builder/`, `/build/`, `/mr-dub/`, `/results/`, `/results/forecasts/`, `/results/model-audit/`, `/mlb/`, `/nfl/`, `/homer-nukes/`, `/markets/` and `/live/` all returned 200.
  - **Accounting, compared with a pre-merge snapshot of the same pages:**
    - Bank Builder, Build, Results and Results/forecasts show identical figures (13,741 published).
    - Moonshot and Mr. Dub show identical balances ($14,390.40 / $20,465.40) plus the new bankroll-rule disclosure ("47 lost runs so far, −$1,175").
    - Model audit loses only the removed cross-sport tile.
    - Today says "No games today" instead of "No-play" on a no-games day.
    - **No accounting or denominator change.**

### Historical MLB forecast recovery (founder decision 3: approved to develop, PR 4)
- **Release (2026-10-10).**
  - **Approval:** founder approval at exact head `e8e861d5ce1eaec9f5e90baf73d67ad785da583e` (renewed after the supersession record was added).
  - **Pre-merge checks:**
    - head unchanged; quality and python green; `CLEAN` against main;
    - no other integration or deploy in flight;
    - files added only, plus the roadmap; no Results reader uses them;
    - content scan clean;
    - supersession record shows 11 corroborated and 3 superseded;
    - export guard re-probed: passes on the clean site, fails on a planted file.
  - **Merge:** `--match-head-commit`, as `c71a7f5a74d7416aebd4b73a92ae82c19a4dfba9` at 04:17:15Z.
  - **Production:** `build-info` reported that commit, built 04:18:51Z, checked live 04:22:35Z. One Production deployment, READY.
  - **Routes:** `/`, `/mlb/`, `/results/`, `/results/forecasts/`, `/results/model-audit/`, `/results/picks/mlb/`, `/markets/`, `/live/`, `/nfl/` and `/today/` all returned 200.
  - **Recovery URLs:** `/data/mlb/corrections/pregame-forecast-recoveries.jsonl`, `…/forecast-of-record-corrections.jsonl` and the folder itself all return **404**.
  - **Results:** 13,741 published / 10,933 measured, unchanged. Model audit, MLB picks and `/mlb/` show identical figures. On `/results/`, the 7-day MLB window moved 21–21–3 → 15–15–3 because the local day rolled from Fri Oct 9 to Sat Oct 10, as the page states. #1042 changed no reader.
- **Served-forecast evidence (#1046, READY_FOR_REVIEW).** Per-game classification of all 810 graded games (`data/internal/ops/forecast-of-record-shadow/classification.json`):

| Class | Games |
|---|---|
| `VERIFIED_AGREES` (served = graded) | 573 |
| `VERIFIED_DIFFERENT_REVISION` | 22 |
| `VERIFIED_NEVER_PUBLIC` | 4 |
| `UNVERIFIED_*` (fail closed) | 211 |

  - **Basis:** the exact Vercel record inside its window, GitHub's conservative clock elsewhere, and the actual first pitch from the StatsAPI play-by-play.
  - **Consistency:** GitHub never contradicts Vercel where both resolve (139/139 identical).
  - Reproducible from committed files only.

- **Supersession of the 14 proposals (2026-10-10):** recorded append-only in `data/internal/mlb/corrections/forecast-of-record-proposals-supersession-2026-10-10.json`; the proposals file itself is unchanged.
  - **11 CORROBORATED:** #1046's evidence (actual first pitch plus the exact deployment record) verifies the same served revision, with an identical hash.
  - **3 SUPERSEDED_UNVERIFIABLE:** 823084, 823650, 824542. They must not be applied.
  - Nothing is applied. Stage B (#1045) applies only verified rows, after separate approval.
- **Future hardening (founder note):** move the non-public recovery and proposal artifacts out of `app/public/` to `data/internal/`. Today they are kept out of the export only by the prune step plus the post-build guard `recovery-not-public.test.mjs`, which is mutation-checked: a planted file or reference fails it.
Investigation (read-only):
- 243 MLB games marked `unavailable` 2026-09-01 → 10-08:
  - **231 PUBLISHED_RECOVERABLE:** public pre-first-pitch commit on `main`; hash recomputes (also 5,014/5,014 game entries across every scanned revision); a matching prediction snapshot; model `mlb-fullgame-2026.08-pa-v2`, engine v1.
  - 8 NOT_ACTUALLY_ERASED (7 never forecast pregame; CHC@BOS 824706 pulled before first pitch).
  - 4 UNRECOVERABLE (09-07: only post-start forecasts).
- 27 are tight (commit < 5 min before first pitch, 6 < 2 min) and stay quarantined until GitHub Actions push logs and deployment timing prove publication.
- The erasure is visible today only in the raw `/data/mlb/{full-game-simulations,predictions}/<date>.json`.
- **Design:** a new append-only `mlb/corrections/pregame-forecast-recoveries.jsonl` (original commit, times, hash, versions, as-of times, values), plus a status file for the 12 non-recoverable games.
- **Never:** rewrite the original files, regenerate, use post-start revisions, or count recovered forecasts in public denominators without proven publication eligibility.

### Founder decisions requested at the first checkpoint (as written, kept for history) and their resolution
1. **A8, MLB run-line pick semantics.** Option A (recommended): evaluate the pick at the book's signed line when one is posted (pick the side with the higher cover probability at that line), keep ±1.5 off the simulated favourite only when no line is posted, and bump `DECISION_ENGINE_VERSION` so Results separate the two definitions. Option B: keep today's rule and label the hero card "simulated line (not the posted line)". A changes a graded family's definition forward-only; B is copy only. → **Resolved 2026-10-09: Option A approved**, implemented in #1038 with the founder's restriction-inheritance safeguard. Implemented stricter than the option text, per the founder's decision ("do not infer a posted line from a simulated market convention"): with no posted line there is no run-line pick at all.
2. **D1 restoration.** Whether to restore the pregame forecasts erased from public MLB files on 09-20/09-25/10-01/10-03 (and pruned board leans 08-27 → 09-09) from the internal snapshots, as a labelled correction, or leave them with the existing corrections register. → **Resolved 2026-10-09: approved to develop** as an append-only correction package, restoring only verifiably published pregame forecasts (see "Historical MLB forecast recovery" above).

---

# 5. Canonical architecture, ledger and temporal data

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- NFL-local truth defect found and fixed in the unified package: World Model V2's QB split (see NFL-003). No cross-sport provenance defect found in this work.

## `CONTRACT-001` — Canonical forecast architecture
**Priority:** P0  
**Status:** NOT_STARTED

### Deliverables
- Versioned schemas for §3 entities.
- Signed market identity library.
- Forecast/provenance normalization.
- One eligibility evaluator interface.
- One selector interface.
- One settlement vocabulary.
- Explicit legacy adapters; no historical rewrites.
- Live-vs-pregame boundary documented/tested.
- Additive migration plan + rollback.

### Progress (2026-10-09, Lane A; research only, nothing implemented)
**Status:** IN_PROGRESS — inventory RESEARCH COMPLETED (deliverables 1, 2, 5 drafted); implementation candidates next.
**Ownership (founder decision 2026-10-09):** Lane A (Core Intelligence) is the CONTRACT-001 engineering lead and may audit, specify, test and prepare isolated implementation candidates. The NFL/UX session keeps its active shared interfaces; changing them needs coordination and founder approval. The TypeScript/Python event-id discrepancy is to be documented and tested; existing event ids are NOT migrated, and every historical reference is preserved.
- **Inventory:** every §3 entity has partial, sport-local implementations and no shared layer.
  - Event: `identity/event-identity.ts` + `pipeline/mlb/settlement_lineage.py` + `data-platform/contract.mjs` + `sports/schedule-contract.mjs` + NFL `nfl-<providerEventId>`.
  - ForecastVersion: `forecast-ledger/` (`forecast-ledger@1`, `fl1-` FNV id of sport|event|subject|family|kind; model version deliberately not in the id).
  - WorldReceipt: MLB `artifactHash`, NFL World Model V2 `artifact.mjs` (2.2.0, STATUS evidence ladder), NFL `sim-v2/receipt.mjs` (`simulation-receipt@2`), NBA `forecast-receipt@1`.
  - MarketSnapshot: `markets/`, `event-markets/` (no consumers outside its folder), ledger `marketBlock`.
  - EligibilityDecision: 43 exported `*Eligib*` functions in 33 files; `products/product-eligible-leg.mjs` is the only closed reason set.
  - ProductSelection: `products/selector/`, `recommendation-receipt.mjs`, per-product ledgers.
  - SettlementEvent: ledger `SETTLEMENT_STATE`, `identity/settlement-lineage.ts`, NFL `prop-settlement-ledger.mjs` (a real correction chain).
  - LiveObservation: `live/contract.mjs` (`LIVE_SCHEMA_VERSION 1`).
- **Gaps (verified unless noted):**
  - ForecastVersion has no `horizon` and no `predecessor`; the ledger is pregame-only by rule, so a live forecast has no identity.
  - No shared signed-line type: the only signed-line rule is `markets/game-intelligence.ts` `homeCoverProbability` (now also used by the MLB Overview, TRUTH-001 A1). The ledger market block has no side, period, suspension or OT/void rule.
  - Settlement words differ by owner (WIN/LOSS…, won/lost…, hit/miss…; MLB stores a push as `state VOID` + `finalCategory PUSH`, NFL as SETTLED); correction is a count except in the NFL prop ledger.
  - Version strings follow at least six conventions (`x@1`, `x-1`, `x-v1`, dotted, calendar, semver, bare integers); sport lists differ (`data-platform` MLB/NFL/EPL/UFC vs ledger + LIGUE_1/NBA).
  - **Event-id divergence (latent defect, verified):** for the same game, Python `derive_event_id` gives `…t19` for `19:00Z` and `…t190000+00` for `+00:00`, while TypeScript gives `…t1900` for all three forms; `cross-language-agreement.test.mjs` only uses `HH:MM:SSZ`. Every committed MLB board row (60,111) uses `HH:MM:SSZ`, so no live divergence today.
  - Product-state vocabulary (TRUTH-001 B7) is used only by /bank-builder and /mr-dub; `PRODUCT_STATES` and `daily-state-machine.mjs` `LIFECYCLE_STATES` are two product state machines.
  - Market identity: at least five key schemes that do not agree (`eligible-leg/contract.mjs` legId, `engine-v2/receipt.mjs` receiptId, `daily-portfolio/mlb-team-legs.ts` selection-string ids parsed back with a regex for the signed line, ledger `fl1-`, top-boards `providerEventId:playerId:family`); `mlb_total` vs `mlb_total_runs` for the same family; American-odds/de-vig maths re-implemented in 25+ TS/JS files and ~10 Python files; no suspension or OT/void rule on any market snapshot.
  - Eligibility: at least eight reason vocabularies naming the same concept differently (MISSING_IDENTITY / IDENTITY_MISSING / IDENTITY_UNRESOLVED / INELIGIBLE_IDENTITY); price-staleness bound 12 h (`LEG_BOUNDS`) vs 3 days (`card-leg-eligibility`); "HOLDING" is healthy in model-health but blocks a leg in the eligibility modules; four `PROBABILITY_BASIS` vocabularies.
  - Product selection: two policy registries (`selection-policy.mjs`, `selector/policies.mjs`), four hash algorithms (sha256, md5, sha1, FNV-1a), and no product stores one immutable activation receipt with policy hash + leg forecast refs + price refs (the engine-v2 receipt is shadow-only). Homer Nukes daily files are overwritten per run.
- **Consumer matrix (import level):** MLB game page → identity, `mlb/full-game`, `mlb/prediction`, `markets`, live-record-gate; NFL game page / top boards → World Model V2 + `forecast-view`; MLB top board → `data-mlb` only; /markets → `markets/*`; Bank Builder → `product-state` + `daily-portfolio`; Moonshot → `moonshot-state` + retired `moonshot-lane`; End Zone Vault and Homer Nukes → raw files, no contract; Results → `results/v2` reading the emitted ledger. No route imports `data-platform`, `forecast-ledger` (only its outputs), `event-markets` or `bank-builder-eligibility.ts`.
- **Recommended first implementation (additive, no migration, no NFL file edited):** a read-only `lib/contracts/` projection of `forecast-ledger@1` rows into versioned ForecastVersion/Settlement shapes (`horizon` derived as pregame from the existing `publishedAt < eventStart` rule; predecessor / receipt refs null with a reason; one settlement-word table), plus the signed market identity library generalising `homeCoverProbability` (MLB first). Tests: every committed row projects with identical `forecastId`/probability/decisive counts; pending/void can never map to WIN/LOSS; `+1.5` never fills `−1.5` across all committed market blocks.
- **Owner decisions needed before integration (§22 rule 2):** who integrates market identity / forecast schema / settlement (the NFL owner's artifacts are consumers); canonical version-string style and sport list; any `forecast-ledger@1` identity change (would be a new `fl2` namespace, never a rewrite); the Python event-id fix (changes ids minted for future MLB settlement rows; MLB is Lane A, but the settlement path is shared).

- **Foundation PRODUCTION DEPLOYED (#1040, 2026-10-09).** Founder approval at exact head `02d1270f803f29eb2a38cf0a5e7847ce6e898f65`. Merged with `--match-head-commit` as `83b220f384c1b6c6ff944afc356ad725daa3fd44` at 23:19:10Z.
  - Production `build-info` reported that commit, built 23:20:35Z, checked live 23:23:41Z.
  - `/`, `/mlb/`, `/nfl/`, `/results/`, `/results/forecasts/`, `/results/model-audit/`, `/markets/`, `/live/` and an NFL game page all returned 200.
  - `/results/forecasts` still read 13,741 published / 10,933 measured / 32 not final / 2,776 void, equal to the ledger row count, so Results did not change.
  - Contents: `app/src/lib/contracts/forecast-version.mjs` (versioned `ForecastVersion` / `Settlement` projection of `forecast-ledger@1` rows, `NULL_REASON` for missing legacy provenance, `ContractRefusal`) plus tests.
  - The TypeScript/Python event-id divergence is pinned by tests and documented, not migrated (latent today: every board start is `HH:MM:SSZ`).
  - Nothing consumes the projection yet. Acceptance items 1–2 are covered for the ledger sample; the shared market identity, eligibility, selector and settlement integration remain open.

### Acceptance
- Current MLB/NFL sample forecasts project into the contract without changing historical meaning.
- Legacy missing provenance remains null/classified, never fabricated.
- Research models remain isolated/namespaced.
- Research producers never overwrite public artifacts.

## `LEDGER-001` — Forecast ledger hardening
**Priority:** P1  
**Status:** IN_PROGRESS — NFL World Model V2 grader hook only (private); ledger hardening not started.

### Deliverables
- Probability bounds/class-mass validation.
- Pending/void/no-play scoring invariants.
- Cross-owner conflict quarantine.
- Immutable correction-event references with old/new values, source, reason, timestamp, prior-event hash.
- Prospective publication/freeze evidence.
- Distribution links sufficient for CRPS/joint evaluation.
- Stable one-forecast-of-record projection.

### Acceptance
- Existing history reconciles without synthetic timestamps.
- Page/CSV/Ask/source totals agree.
- Conflict fixtures cannot be silently merged.
- Correction replay is idempotent.
- Historical prediction bytes remain unchanged.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- NFL hooks ready for the ledger: every World Model V2 run is an immutable record. Each carries event id, per-player family distributions with percentiles and ladders, model version, simulationId = inputsKey, generatedAt, input as-of timestamps (forecast, injuries, rosters, depth chart, packet sha) and availability state per player. Still to do: a grader and ledger rows (settle against official box scores; pending/void/no-play never counted as a loss). The player board's existing settlement is unchanged.

### Observation (2026-10-09): final → grade latency
**Step-order cause (2026-10-09, #1036):** inside `nfl-event-window` the player-event capture ran before the nflverse capture it reads, so a final was graded one window late. The 16:07Z run left TB @ DAL ungraded for this reason. #1036 moves the free nflverse capture first, with `!cancelled()` on the dependent steps and an order guard test.

**Founder decision (2026-10-09): recorded as an operational limitation under OPS-001, LEDGER-001, RESULTS-001 and NFL-005.** The future Results architecture must settle promptly and reliably without website builds, keep finality, and not create a competing settlement system.

**Freshness targets** (founder; these are targets, not claims about current infrastructure — measure what providers deliver):
- live data about every 30–60 s where the feed supports it;
- provisional finals 5–15 min after reliable final stats are available;
- canonical results after the sport's own reconciliation (the existing 3-hour rule kept where it applies);
- historical reporting in scheduled batches;
- pregame data at event-appropriate freshness.

TB @ DAL went final at about 03:30Z on Oct 9. It is settled and graded only by `nfl-event-window`, whose next delivery was the Friday 13:00Z slot. That slot had not started by 13:41Z; measured delivery latency is 1h40m–4h55m.

So a Thursday night final waits about 14 hours or more for its grades. That is input to the zero-build settlement assessment (with OPS-001 and COST-001).

The World Model V2 grader alone writes only `data/internal/` (not a build input). The same window's settlement-receipts commit also stages `app/public/data/nfl/{interval-calibration.json,reconciliation/,live-props/}`, which are build inputs.

**Assessment, 2026-10-09:** `docs/research/ops/zero-build-settlement-assessment-2026-10-09.md`. Nothing has been implemented. The recommendation:
1. Coalesced publication windows (COST-001 option E) for high-churn families.
2. Then a runtime results store on Vercel Blob, piloted on NFL World Model V2 grades (option F).
3. A Supabase table only when LEDGER-001 needs queries across events.

Founder decisions are needed on per-family freshness targets and on a runtime read path for public Results.

## `TEMPORAL-001` — Temporal Data & Identity Platform
**Priority:** P1  
**Status:** NOT_STARTED

Start with MLB/NFL critical fields:
- canonical entity mappings;
- schedule revisions;
- lineup/role history;
- injuries/availability;
- point-in-time feature snapshots;
- market snapshots by capture time;
- provider-quality metadata;
- bitemporal/as-of reads where necessary.

### Feature admission rule
Every feature must pass:
1. available at cutoff;
2. stable entity definition;
3. incremental out-of-sample value;
4. acceptable coverage/latency/cost.

### Leakage tests
Reject post-cutoff lineups, postgame-inferred starters, target-game season aggregates, closing odds in earlier forecasts, retrospective injury labels, same-game EPA/xG in pregame features, or calibrators/scalers fitted across the test boundary.

---

# 6. Model evaluation and release control

## `EVAL-001`
**Priority:** P1  
**Status:** NOT_STARTED

### Champion/challenger structure
For each sport/target:
- Champion production model.
- Simple sport-appropriate baseline.
- Independent sports-signal challenger.
- Market-informed challenger, explicitly labeled.
- Optional ensemble.
- Frozen prospective receipts for all compared models.

### Primary metrics
| Target | Primary | Secondary |
|---|---|---|
| Binary winner/over/TD | Log loss + Brier | reliability, calibration slope/intercept, skill vs baseline |
| Multiclass | Multiclass log loss/Brier | classwise calibration, confusion |
| Counts/yards/scores | CRPS + distribution log score | MAE, RMSE, bias, quantiles/tails |
| Intervals | Interval/WIS | 50/80/95 coverage + width |
| Survival/hazard | censored survival score / integrated Brier | time calibration, cause-specific incidence |
| Joint worlds/parlays | joint event scores + energy/variogram diagnostics | tail co-occurrence, dependence |
| Price decisions | time-matched CLV + paper return/risk | turnover, drawdown, coverage |

### Promotion protocol
Pre-register target/horizon, dataset/window, champion/baseline, primary score, minimum improvement/noninferiority margin, effective sample requirement, calibration/tail/subgroup guards, and rollback. Use chronological rolling/expanding folds and a final untouched evaluation window. Do not count correlated legs as independent evidence.

---

# 7. MLB World Model V2

## Vision
One coherent baseball model should generate winner, score, run line, total, and every supported/promoted player market from shared game worlds.

## `MLB-001` — Rules + baseline audit
**Priority:** P1  
**Status:** NOT_STARTED

Reproduce/fix in a new version where confirmed:
- postseason extra-innings automatic-runner logic;
- synthetic terminal safety-cap run;
- starter-removal assumptions;
- player-specific K/BB/HBP rates;
- PA conversion mismatch;
- bullpen quality/availability;
- double-play/free-advancement assumptions;
- lineup/batting-order opportunities.

## `MLB-002` — Benchmark ladder
**Status:** IN_PROGRESS — first challenger `mlb-pa-matchup-v1` NOT QUALIFIED (founder decision 3, 2026-10-10); prospective forward shadow approved to prepare

### Progress (2026-10-10, Lane A)
- **Challenger `mlb-pa-matchup-v1`** (#1047, research only; the published engine path is byte-identical).
  - **Mechanism:** DIPS-style matchup. K, BB and HR come from log5(batter vs hand, starter, league) with fixed priors; balls-in-play hits from the board projection with the slot's league PA.
  - **Registration:** preregistered at `6620ac4e75`, with three dated amendments, all before the holdout.
  - **Holdout** (359 games, read once):

| Metric | Control | Challenger | Difference, 95% |
|---|---|---|---|
| Winner log loss | 0.7026 | 0.6896 | −0.0129 [−0.0272, +0.0012] |
| Totals CRPS | 2.510 | 2.449 | −0.061 [−0.114, −0.007] |
| Calibration slope | 0.21 | 0.65 | — |

  - **Verdict:** the primary bar fails (the interval includes 0), and the challenger remains worse than the market. **NOT QUALIFIED. Not promoted; no recommendations published from it; no betting-value claim; this holdout is not re-tuned against.**
  - **Next:** a fresh preregistration for a prospective forward shadow, new games only.
- **P317 league-rates candidate** (`mlb-fullgame-engine-league-rates-v1`): forward shadow still ACCUMULATING (196/200 at 2026-10-09).

### Team/game candidates
1. Existing PA engine control.
2. Independent Poisson baseline.
3. Hierarchical Poisson.
4. Negative Binomial/shared-environment count model.
5. Bivariate/shared-latent count challenger.
6. Enhanced PA categorical state-transition model.
7. GAM/gradient/distributional boosting where justified.
8. Calibrated/stacked ensemble only when out-of-fold proper scores improve.

### Features to ablate
Team attack/defense, batting order, projected PA, batter/pitcher talent, handedness/platoon, pitch mix/contact, starter workload/pitch count/rest, times-through-order, bullpen quality/availability, defense, park, weather/roof, travel/rest, injuries, confirmed lineup, postseason manager usage.

### Evaluation
- winner: log loss/Brier;
- score: distribution log score/CRPS;
- total/run line: CRPS + threshold Brier + calibration;
- interval coverage + width;
- regular/postseason subgroup checks.

## `MLB-003` — Batter markets
**Status:** NOT_STARTED

Generative PA state candidate:
`K / BB / HBP / 1B / 2B / 3B / HR / other out / error`

Derive hits, total bases, HR, runs, RBI, H+R+RBI from shared PA/base-state worlds.

Coverage requirement (from `CI-001`, 2026-10-08): today a batter has a GTP projection only if a book posted a line for him (board `leans`). Everyone else in a confirmed order is simulated at replacement level, and full-game `ready` is structurally rare (8 of 860 games). The V2 batter model must project every confirmed starter independently of market posting. The per-row disclosure in the meantime is `TRUTH-001`.

Candidate approaches: binomial/beta-binomial opportunity baselines, hierarchical multinomial PA outcomes, appearance/role mixtures, GAM/boosting conditional rates. Shrink tiny BvP samples heavily.

Input finding (TRUTH-001, 2026-10-09): about a third of the replacement-rated confirmed batters (302 of 977) DID have a posted line; the board failed to resolve their names (accents, namesakes). That identity defect is fixed in TRUTH-001 PR 1, forward-only. The remaining gap is genuine (no line or too little data) and is what MLB-003 must close. New simulated rows carry `rateSource`, so MLB-003 can measure it per row.

## `MLB-004` — Pitcher markets
**Status:** NOT_STARTED

Model starter workload/removal survival + BF + per-PA K/contact/walk/HBP + opponent lineup + pitch count/rest/injury limits + times through order + bullpen transition + inherited-run attribution.

Hard invariants: `K ≤ BF`; correct outs/innings notation; earned runs separate from total runs.

## `MLB-005` — Shared WorldReceipt + forward shadow
**Status:** NOT_STARTED
- One coherent world population.
- Persist exact counts and reusable joint representation.
- Winner/score/total/run line/player outputs derive from those worlds.
- Family-by-family promotion only.
- Historical projections remain untouched.

### Existing references
- `claude/mlb-playoff-slate-receipts`
- `claude/arch-sw1-soccer-worlds-z8g61r` contains MS-2a MLB game-log work; inspect before reuse.

---

# 8. NFL World Model V2

## Vision
One coherent football world should connect game script, score, team opportunity, player volume, efficiency, and scoring.

## `NFL-001` — Champion/control audit
**Priority:** P1 → **P0 (founder priority override 2026-10-08)**  
**Status:** DONE (research audit, 2026-10-08) — every acceptance item below evidenced; no promotion  
**Owner/session:** Claude Code session 2026-10-08 (NFL World Model V2)  
**Branch:** `claude/nfl-world-model-v2-priority-79e413` (worktree, from `origin/main` `629cfbf494bb2ca2809af5e379abaa56901e49f9`)  
**PR:** see Week 5 milestone  
**Evidence:** `docs/NFL_WORLD_MODEL_V2_2026-10-08.md` §1  
**Production acceptance:** n/a (audit); the Week 5 truth fixes it found ship under the milestone PR
- Preserve canonical V1 as control.
- Reproduce analytic winner vs sampled-score disagreement.
- Reproduce historical V2 evaluation.
- Do not promote V2 for architectural elegance alone.

### Completion record (2026-10-08)
- Control preserved: the published pair (MOV-Elo win, HFA-Elo margin, v3 totals, cutoff-Elo fallback) is unchanged; NFL-002's challenger did not clear the win bar.
- Disagreement reproduced on Week 5: published P(home) vs share of its own 10,000 draws — PHI@JAX 0.659 vs 0.524, DEN@LAC 0.331 vs 0.414, MIN@NO 0.264 vs 0.330. Cause: two ratings (win vs margin head) + logistic vs normal. Held-out, the margin-implied win probability is worse (0.63759 vs 0.62907), so counting draws is not a fix.
- Historical V2 evaluation reproduced: `validate-drive-sim-v2.mjs --protocol A --runs 2000` rerun is identical to the committed `sim-v2/validation-A.json` (timestamps aside): winner LL V2 0.6468 vs V1 0.6358 (market 0.6101), margin CRPS 7.678 vs 7.667, total CRPS 7.706 vs 7.709, margin 80% coverage 0.826 vs 0.778. V2 is anchored to the champion's means (not independent) and stays shadow.
- Also found and fixed under the Week 5 milestone: team heads blind to QB1 absence (false TB lean), London PHI vs JAX given home field, relief-share passer projections, simulation-count copy.

## `NFL-002` — Benchmark ladder
**Status:** IN_PROGRESS — RESEARCH (L6 win REJECTED / margin ELIGIBLE / totals REJECTED; incumbent retained); Week 5 forward shadow captured. Not qualified.
**Status (2026-10-08):** IN_PROGRESS — rungs 1, 2, 3, 6 scored once on held-out 2006–2021 under a committed registration; rung 4 reviewed (Sim V2); rung 5 not started. **Incumbent retained.**
1. Existing MOV/Elo champion.
2. Opponent-adjusted EPA/success-rate temporal baseline.
3. Dynamic hierarchical offense/defense strength.
4. Possession/drive process.
5. Distributional ML challenger.
6. Calibrated ensemble if superior.

Features: QB scenario/availability, OL, skill-player availability, pace, PROE/pass rate, EPA/success/explosiveness, field position, weather, home field, rest/travel, coaching, opponent matchup, game state, rule era.

### Progress (2026-10-08, NFL World Model V2 session)
- Registration `data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json` (committed before any score; same windows as P297 + a forward guard refit on 2006–15, scored 2016–21). Code `app/src/lib/sports/nfl/team-ladder-v2.mjs`, replay `scripts/research/nfl/replay-team-ladder.mjs`; implementation checks reproduce the incumbent receipts exactly (win 0.62907, margin 10.78546, totals 10.87108).
- Held-out 2006–21 (4,292 games): incumbent win LL **0.62907** · L2 EPA-adj 0.63227 · L3 dynamic O/D points 0.62815 · **L6 coherent stack 0.62632** · market 0.61012. Margin MAE incumbent 10.785 → L6 **10.624** (CRPS 7.757 → 7.629). Totals: L6 10.794 vs v3 10.801 (NLL tie).
- Verdicts (`nfl-002-team-ladder-evaluation.json`): L6 **win REJECTED** (Δ −0.00276 < 0.003 bar; bootstrap hi95 +0.00073; forward guard tie) · **margin ELIGIBLE** · **totals REJECTED** · coherent pair REJECTED. Not retried.
- Rung 4: Sim V2 drive process does not beat the incumbent (see NFL-001). Rung 5: NOT_STARTED. QB scenario feature: blocked by the absence of pregame-timestamped historical depth charts (`pregame-availability-margin-refusal.json`).
- Forward shadow: L6 receipts for all 15 Week 5 games captured pre-kickoff (`data/internal/research/nfl/team-ladder-forward/`), to be graded after finals.
- Next: grade Week 5+ forward receipts; founder decision on proposing the ELIGIBLE L6 margin head; rung 5; a pregame-knowable QB term only with archived pregame evidence.
- **Founder decision (2026-10-08):** do NOT promote the L6 margin head yet; keep collecting forward evidence; the incumbent remains champion.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- Still open: there is no single-distribution win head (L6 win REJECTED). The game page therefore shows the forecast of record's win chance, and the simulated games' own counted win share sits in the simulation section with the difference stated once. Week 5 home share is higher in 14 of 15 games. Score-model validation remains: the score draw has no key-number clustering, and exact-score frequencies are not published.

## `NFL-003` — Player opportunity allocation
**Status:** IN_PROGRESS — allocV1 PRODUCTION DEPLOYED inside World Model V2 (experimental); not FORWARD EVALUATED.

World sequence:
`plays → pass/rush → attempts/carries → targets → catches → yards → TDs`

Use bounded/multinomial allocation including `OTHER`.

Candidates: hierarchical shares, Dirichlet-multinomial allocation, beta-binomial receptions, mixture/quantile yards, NB where defensible.

Hard invariants: allocated opportunities reconcile; catches ≤ targets; receiving totals reconcile with QB passing under documented exceptions; legal scoring/clock/OT; negative-yard plays preserved.

### Findings (2026-10-08) — status remains NOT_STARTED (no allocation model built)
- Public boards merge two marginal engines on one row (props-v1 rush/rec yds; share-level receptions/pass yds/ATD); no shared world. Receiving vs passing does not reconcile across engines (Week 5 Σ visible receiving ÷ passer: TB 1.74 before the guard below, MIN 1.17). Share-level shares never fade (retired QBs carry shares); an Out player's volume is not redistributed; normalisation can leave `OTHER` at 0.
- Week 5 truth guard shipped instead of a model change: `applyPasserShareFloor` (board-roster-integrity.mjs) withholds a published passer whose share is a relief appearance's (< 0.75; every Week 5 starter ≥ 0.806) — Jalon Daniels (TB, 0.58), Keenum/Bagent (CHI, 0.46/0.52).

### Progress (2026-10-08, local; branch `claude/nfl-003-005-world-model`) — status IN_PROGRESS
- Candidate `nfl-opportunity-allocation-v1` (allocV1): active-set reallocation of vacated share (rho per family) with a conserved `OTHER` floor 0.02, plus team volume from team form + opponent allowed + expected margin (fit on dev). Registration `reports/nfl-003-opportunity-allocation-preregistration.json` committed before any number; engine = P300's code (incumbent reproduced exactly).
- Development look (THIRD look at 2014–21, disclosed; cannot confer eligibility), identical rows to P300: pass yds MAE **66.97 → 62.44** (bootstrap [−5.43, −3.73]; ECE 0.055 → 0.048), rush yds 18.58 → 18.27, rec yds 21.43 → 21.34, receptions 1.571 → 1.565 (level 1.035 → 1.006); better in both eras for every family → **PROCEED_TO_FORWARD ×4** (`reports/nfl-003-opportunity-allocation-development.json`).
- Remaining for acceptance: blind 2026 forward test from Week 6 (capture tool not yet built); Dirichlet-multinomial allocation worlds (in progress under NFL-005); hard invariants on published boards.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- **Live defect fixed:** World Model V2 split passing attempts between the starter and an active backup QB (Week 5 build: Burrow 0.65 / Flacco 0.33 → 152 passing yds). The development fit's active set came from who actually played. Prospectively, the depth-chart QB1 who is not ruled out now holds the passing share; every other passer's share is vacated (rho 0.5 → capped 0.98). All 15 Week 5 games now have one passer at 0.98.
- Player yardage/receptions on every public NFL surface now come from one source of record, World Model V2 (`lib/sports/nfl/forecast-view.mjs`), pending founder confirmation at Checkpoint B. A game without a simulation falls back to the player board's families, labelled. Still open: forward evaluation (n ≥ 300 per family).

## `NFL-004` — TD model
**Status:** IN_PROGRESS — RESEARCH; candidates in forward shadow only; nothing qualified or published from this task.
Hierarchical Bernoulli baseline → team scoring opportunities → red-zone/goal-line role → TD attribution within drives. Evaluate rare-event log loss/calibration separately.

### Findings (2026-10-08) — status remains NOT_STARTED
- Three different public ATD numbers for one player (board `nfl-anytime-td-opportunity-v1`, Vault `nfl-anytime-td-v1-calibration`, Sim V2), e.g. Javonte Williams 0.725 / 0.625 / 0.563. ATD forward 782/1000, level 1.104 (bar [0.90, 1.10]); replay top bins over-predict (0.83 → 0.53, n=36). Passing-TD joint v3 log loss 0.676 vs baseline 0.593. Week 1 joint-v2 forward cohort never graded (no grader).

### Progress (2026-10-08, local) — status IN_PROGRESS
- New table `replay/player-redzone-v1.json.gz` (inside-20/10/5 carries and targets per player-game, nflverse pbp 2013–2025; 99.8% join, carries exact 98.6%, targets 99.9%), builder `scripts/research/nfl/build-player-redzone-v1.mjs`.
- Candidate `nfl-anytime-td-redzone-v1` (rzTdV1): inside-N carry/target share shrunk to the overall share (dev chose N=10, k=40, rho=0). Development look (second look at 2014–21, disclosed), identical rows to P301: log loss **0.50435 → 0.50295** (bootstrap hi95 −0.00036), ECE 0.020 → 0.014, top decile 0.527 vs 0.440 → **0.469 vs 0.444** → **PROCEED_TO_FORWARD**. Ablation: capping the incumbent's named pool alone reaches 0.50292 log loss but keeps the top-bin over-prediction.
- Remaining: blind 2026 forward test (ATD protocol); one public ATD number per player (board / Vault / Sim V2) once a model is promoted.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- Anytime TD on the unified surfaces = the published opportunity touchdown model (player board), labelled. World TD marginals stay unpublished; root cause recorded (`reports/nfl-005-game-worlds-td-diagnosis.json`: scorer-eligibility gate double-counts opportunity).
- Passing TDs: credited to a passer in every world; no evaluated distribution → withheld with a reason (no placeholder).
- First TD scorer: needs scoring-event ORDER, which the worlds do not generate → withheld. Research plan: settlement rule (first TD of the game by any player; no-TD games settle 'no scorer'), sequential competing-risks model over drives (team first-possession, scoring hazard by team strength and pace, opportunity-weighted scorer at the event). New preregistration before any look.

### Progress (2026-10-08 late; master completion directive; branch `claude/nfl-wm2-grading`)
- **Passing TDs (A), development look 2022–25** (one look; seed `nfl004-ptd`; 2,208 starter QB-games; 4.56M team-worlds, 0 invariant failures). Preregistration `90dd95ed8b`, receipt `1da0c98f65` on branch `claude/nfl-004-passing-td`:
  - The world's own distribution: **DO_NOT_PROCEED.** RPS 0.11909 vs baseline 0.11891; P(≥2) ECE 0.0306 > 0.03; P(≥3) log loss +0.0025 over the 0.002 allowance.
  - 50/50 hybrid of world and per-QB rate baseline: **PROCEED_TO_FORWARD_SHADOW.** RPS 0.11832; every line's ECE ≤ 0.026.
  - Cause: starter credit spread too thin (0.943 vs 0.965 of team passing TDs; pass-attempt kappa 5); no QB-skill term (level 1.022 → 0.963 by QB tier). Team TD level is fine (1.009).
  - Several world inputs were fit on 2022–25, which favours the world. Not published; the hybrid needs ≥ 400 forward starter rows on the same bars. World v2 (kappa 20 + QB rate tilt) is drafted, not registered.
- **Anytime TD (B):** world TD scorer v2 preregistered FORWARD-ONLY (`reports/nfl-004-world-td-v2-preregistration.json`, research branch `98a0a929a8`): opportunity-weighted scorer, no renormalising gate, other-TD term. Needs ≥ 1,000 forward rows and log loss ≤ min(rzTdV1, incumbent), ECE ≤ 0.03, level 0.95–1.05. The published anytime-TD source stays the player board's touchdown model until then.
- **First TD (C):** still withheld; the worlds generate no scoring order (see the earlier plan).

## `NFL-005` — Shared worlds + forward promotion
**Status:** IN_PROGRESS — PRODUCTION DEPLOYED (experimental World Model V2); FORWARD EVALUATION begun; not STATISTICALLY QUALIFIED; not PRODUCT ELIGIBLE.
Winner/score/spread/total/player outputs reconcile. If worlds are reweighted to a validated winner head, measure effective sample size and downstream distortion. Promote family by family.

### Findings (2026-10-08) — status remains NOT_STARTED
- Production win % (MOV-Elo head) and the 10,000 sampled scores (margin head) come from different ratings; Week 5 gaps up to 0.134 (PHI@JAX). The margin-implied win probability is worse (0.63759 held-out), so counting draws is not the fix; NFL-002 L6 is the first single-distribution candidate (win not yet eligible).
- Sim V2 is jointly coherent (receipt checks Σrec = pass yds, Σtargets = attempts) but has zero player-level validation and no forward grades on main.

### Progress (2026-10-08, local) — status IN_PROGRESS
- First player-level validation of Sim V2 (`reports/nfl-005-shared-worlds-preregistration.json` → `-development.json`): Sim V2 fed allocV1 inputs, protocol A games 2019–21 (821 games, 821,000 runs, 0 failed, Σ receiving = passing in every run) vs allocV1 analytic on identical rows → **DO_NOT_PROCEED ×4**: MAE receptions 1.590 vs 1.573, rec yds 21.53 vs 21.19, rush yds 18.82 vs 18.43, pass yds 66.44 vs 62.74; levels off (rec 0.889, rush 1.113). The drive engine's yardage biases carry into players.
- Analytic allocV1 is incoherent in 8.2% of team-games (Σ named receiving mean > 1.1 × passer). Next candidate: allocation worlds generated around allocV1's marginals (Dirichlet-multinomial, exact Σ receiving = passing), registered separately.
- Second candidate `nfl-allocation-worlds-v1` (`reports/nfl-005-allocation-worlds-preregistration.json` → `-development.json`): per team-game worlds around allocV1's inputs — team volume draw, Dirichlet-multinomial allocation over active players + `OTHER` (kappa fit on dev: targets 20, carries 10, passes 5), binomial catches, gamma yards per opportunity, passing = Σ receiving and completions = Σ receptions by construction. 2019–21 identical rows, 3,284,000 worlds, **0 invariant violations**; MAE vs allocV1 analytic: receptions 1.587 vs 1.573, rec yds 21.27 vs 21.19 (coverage 0.879, at the band edge), rush yds **18.23 vs 18.43**, pass yds **62.59 vs 62.74** → **PROCEED_TO_FORWARD_SHADOW ×4** (development tier).
- Not yet in the worlds: team-game outcome (score/margin/total) coupling to player volume, and the NFL-004 TD scorer; both are the next registered extensions. Winner/score still come from the incumbent heads (NFL-002 L6 margin ELIGIBLE, win REJECTED).

- Third candidate `nfl-game-worlds-v1` (`reports/nfl-005-game-worlds-preregistration.json` → `-development.json`): allocation worlds coupled to the game — score drawn from the PUBLISHED margin/totals heads, team TDs from the empirical TD-given-points table (2015–18, 2022–25 only), pass/rush volume shifted by the world's realised margin (dev fit: −0.147 pass attempts and +0.280 carries per point of lead), and every TD credited to a player with a carry / an unused catch in that world (NFL-004 inside-10 weights). 3,284,000 worlds, 0 invariant violations. Players **PROCEED_TO_FORWARD_SHADOW ×4** (MAE non-inferior; ECE better than analytic: pass yds 0.028 vs 0.048, rec yds 0.020 vs 0.035, rush 0.032 vs 0.038). World anytime-TD **DO_NOT_PROCEED** (log loss 0.5138 vs rzTdV1 analytic 0.5109, ECE 0.034 > 0.03) → TD probabilities stay with rzTdV1 analytic.
- Remaining incoherence (recorded, not hidden): world win share follows the published margin head, not the published MOV-Elo win head (e.g. CHI @ GB 0.584 vs 0.551). Closing it needs a single-distribution win head (NFL-002 L6 win REJECTED today).
- **World Model V2 simulation engine (2026-10-08 evening; PR branch `claude/nfl-world-model-v2-sim`):** `app/src/lib/sports/nfl/world-model-v2/engine.mjs`. 10,000 worlds per game; each world is one consistent game. Covers explicit overtime (10-minute-OT record 2017–25), exact scoring composition (offensive TDs from the validated table; defensive/special-teams TDs, extra points, two-point conversions, field goals and safeties from exact historical compositions), game-script volume, allocV1 allocation, and passing TDs credited to a passer with a completion. Invariants are checked in every team-world; Week 5: 300,000 checked, 0 violations. Win chance is counted from the worlds; the forecast of record stays the published win head, and the difference is shown (home higher in 14 of 15 games, e.g. DEN@LAC 44.3% vs 33.1%). Per-game versioned artifacts, the experimental page `/nfl/world-model/[eventId]` and Top boards `/nfl/world-model/` are built from the same artifacts (parity tested). World TD and passing-TD marginals are NOT published.
- **World TD scorer root cause (development 2022–25 only, no refit; `reports/nfl-005-game-worlds-td-diagnosis.json`):** the failing receipt numbers are from the 2019–21 TEST window. Primary cause: the scorer-eligibility gate (a TD needs a touch in that world, while red-zone shares are unconditional), which moves TD mass from part-time to every-down players. Contributors: Dirichlet touch rates too low, missing other-TD term, oversized OTHER bucket. Team TD dispersion ruled out. A fix needs a new registration and a forward evaluation.
- NFL-005 stays IN_PROGRESS: the runner works, but no forward evaluation exists, the TD scorer is unvalidated, and the event window does not yet rebuild the artifacts.

### Week 5 prospective captures (2026-10-08) — private shadow, immutable
- Tool `scripts/research/nfl/capture-v2-candidates-forward.mjs`; 2026 inputs from committed sources only (`replay/player-games-2026-v1.json.gz`, Weeks 1–4: 1,564 rows, 128 team-games); active set = active roster minus the event's committed Out/IR exclusions (Questionable/Doubtful active, declared); red-zone history ends 2025 (no 2026 play-by-play on disk, declared).
- Capture #1 `v2-candidates-forward/2026-week05-20261008T1821Z.json` (allocV1, rzTdV1 + incumbent, allocation worlds) and capture #2 `...T1827Z.json` (adds game worlds) — all 15 games, before every kickoff; pushed to GitHub at 18:21:39Z / 18:27Z. Later captures are new files; an earlier capture is never replaced or re-labelled. Plus NFL-002 L6 receipts (`team-ladder-forward/`, 15:5x–16:01Z).
- Example (TB @ DAL): allocV1 gives Jalon Daniels Mayfield's vacated passing share → 182 median passing yds (board withheld 116); rzTdV1 Javonte Williams 0.58 vs published 0.725.

### Next step for NFL-003 / NFL-004 / NFL-005 — blind 2026 forward capture (partly done for Week 5)
Mirror `scripts/research/nfl/forward-player-props-share-level.mjs` (P300's forward test): each week, before the first kickoff, fold the historical tables plus 2026 nflverse finals (player stats, snap sheets, play-by-play for red-zone shares), take the board's pregame availability as the active set (ESPN ↔ gsis join), and write one immutable private file per week with allocV1, rzTdV1 and allocation-world quantiles beside the incumbent's; grade after finals under the P300 / ATD forward protocols. Needs: the 2026 play-by-play download in the existing `nfl-props-forward-shadow` workflow (a workflow change → its own tested PR + founder approval). Target: first capture before Week 6 (TNF 2026-10-15).

### Existing references
- `claude/arch-nfl-ns1-ns2-e2-87uth3`
- `claude/handoff-nfl-7-0-top-board-receipts`

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- One NFL forecast consumption layer (`forecast-view.mjs` + `forecast-view-load.mjs`) feeds the hub Weekly leaders, the game dashboard and their parity tests; each family has exactly one source.
- **Game dashboard** (`/nfl/game/[id]`):
  - Hero: forecast of record, projected score centrepiece, win chance, margin, total with 80% ranges, likeliest exact final from the score-shape engine.
  - Simulated game outcomes: counted win share, margin and total histograms, scoring mix.
  - Player projections: tabs, portraits, logos, live stat feed.
  - Simulated game explorer (5 real sampled games) and collapsible model details.
- `/nfl/world-model/*` routes now redirect into these surfaces. The separate player board and score-range sections are retired from the page; the board artifact is still produced and settled.
- **Freshness:** the event window runs `build-nfl-world-model-v2.mjs` after the boards. A game is re-simulated only when its inputs key changes (heads, availability, passer, version); no change writes nothing, including the index. Started games are never touched, and every run stays write-once under `data/internal/nfl/world-model-v2/runs/`. Artifact schema 2 adds histograms, `inputsKey` and `supersedes`. Model version 2.1.0 (QB rule).
- **Still open:**
  - The weekly input packet is exported from the research branch (`export-world-model-v2-inputs.mjs`); move it to main so Week 6+ simulations need no manual step.
  - Forward grading of World Model V2 runs (immutable records exist; grader to port).
  - TD families.
  - Promotion.

### Progress (2026-10-08 late; master completion directive; branch `claude/nfl-wm2-grading`)
- **#1026 merged** at exact head `0095da9657` (CI run 37851962553 `python` ✓ `quality` ✓; MERGEABLE/CLEAN; in scope) → `ccc4fb624974229fbe7c3748db09f643c6832eba` 22:37:14Z. Vercel Production `Duj7uEM9DgeQBPdppWGnGUmRYPWr` READY 22:43:30Z (~6 min); build-info = `ccc4fb62`. Preview 0; odds credits 0. Exact CPU charge: dashboard (not readable from this session).
- **Production acceptance:**
  - 15/15 game pages carry the hero, simulation, players, explorer and model status.
  - All 50 board rows (5 published families × 10) match the forecast view computed from the merge commit; passing TD and first TD are withheld with reasons.
  - 30/30 depth-chart passers render; the results-coverage disclosure is live; the `/nfl/world-model/*` redirect works.
  - 375 px: no horizontal scroll. Forecast heads (22:17Z) are identical to the simulation inputs for 15/15 games.
- **Grading:** `grade-nfl-world-model-v2.mjs` + `world-model-v2/grade.mjs` grade the LAST run before each kickoff against the official box scores.
  - States: GRADED / PENDING / NO_LINE (never losses). Per-family MAE, bias, 80/50% coverage and ladder Brier; no combined accuracy.
  - Runs in the settlement phase (`data/internal`, no build).
- **Automated weekly inputs:**
  - The event window folds 2026 finals (`build-player-games-2026.mjs`) and exports the packet for the week of the next game (`--week auto`). A packet is written only when its model content changes; on main's data it reproduced the manual Week 5 packet exactly ("unchanged").
  - The committed gsis→ESPN id map replaces the local raw players.csv.
  - Re-simulation is keyed per game (its own teams' slice), with legacy-key compatibility so existing runs are not re-simulated.

### Progress (2026-10-09; founder decisions for #1028/#1029; branch `claude/nfl-wm2-refresh-noise`)
- **Problem:** the 01:00Z event window re-simulated 14 unchanged games. The World Model V2 spreads were derived from the forecast's sampled 80% range, which moves by about a point on every regeneration.
- **Fix (#1029):** the first head added a 0.75-point tolerance. The founder asked for deterministic fingerprints instead, so it was replaced with no threshold:
  - The forecast publishes its simulation's exact inputs (`forecastSummary.distribution`). This is additive, with 0 other field changes across 14 forecasts.
  - World Model V2 keys on those inputs (`world-model-v2/heads.mjs`). Older records fall back to `headsSource: "RANGE"`.
  - Version is now 2.2.0.
- **Tests:** `refresh.test.mjs` runs the real builder on a committed two-game Week 5 sample. It covers:
  - Unchanged inputs, and percentile noise of 1–3 points.
  - Questionable and Out designations; a depth-chart QB swap (Hurts → McKee); QB1 ruled Out (Jones → Richardson).
  - An opportunity change, model parameters, and a ±0.01 distribution change.
  - A started game.
  - Top Board = game page parity after a refresh.
- **2.1.0 vs 2.2.0 on the 14 unstarted Week 5 games** (main data, 2.2.0 range-input control run to measure noise):
  - Home win probability: mean |Δ| 0.89 pp, max 2.31 pp (SF @ SEA). Noise alone: mean 0.39 pp, max 1.00 pp.
  - Player medians move about as much as noise: passing mean 1.03 yd, rushing 0.26, receiving 0.31, receptions 0.03.
  - Projected scores: 3 of 14 move by one point per team.
  - Unchanged: status, eligibility and promotion flags, every forecast of record, and the withheld families.
  - Invariant violations: 0. TB @ DAL is byte-identical; no earlier run file is removed.
- **#1029 merged** at exact head `72aa8fa30d` (`python` ✓ `quality` ✓, MERGEABLE/CLEAN) → `e3368f004333e3e8aabfde045853813f4d8c1798` at 02:42:00Z.
  - Production build-info = `e3368f00`, built 02:43:20Z; Vercel success 02:45:45Z.
  - Vercel Build CPU: not readable without a dashboard login.
- **Pending:** the one-time 2.2.0 regeneration of the unstarted Week 5 games runs at the next event window (Fri 13:00Z sweep).
  - **Done 2026-10-09:** run `37956745466`, 16:07:01 → 16:09:22Z, success.
    - It was dispatched by `sport-schedules` when the Friday NFL injury facts changed. That is existing automation, not a manual duplicate; the scheduled 13:00Z slot had not been delivered by 16:18Z.
    - **14/14** unstarted Week 5 games regenerated on **2.2.0** at 16:08:16Z with `headsSource: DISTRIBUTION`, each with `supersedes` set to its 01:00Z run. 14 new run files.
    - Injuries are as of 16:08:16Z; the QBs are consistent (CHI Bagent, with Caleb Williams Out).
    - **TB @ DAL** is byte-identical to its pregame record (`00c260b8…`), with no new run.
    - All 14 forecasts carry `forecastSummary.distribution`. Five boards × 10 rows; the 50 V2 board rows equal their game pages; no Q/D/OUT player on a board.
    - Production served the 2.2.0 pages from build `6e3f6cb8` (16:13:24Z). TB @ DAL's page still shows its frozen 2.1.0 run.
  - **Grading gap found in that run:** TB @ DAL stayed ungraded. The player-event capture (16:08:32Z) read the nflverse game list before the nflverse capture refreshed it (16:08:50Z), a documented one-window lag. Fixed by #1036 (nflverse first); see the LEDGER-001 observation.
  - **TB @ DAL graded 2026-10-09** by the next window (run `37974332405`, 18:36:32Z, before #1036): final, 42 rows, against its frozen 2.1.0 run `8ca1b01a873fdcda`. Later runs left the grade unchanged.
  - **#1036 released 2026-10-09:**
    - Merge `9ff2763030` at 19:12:39Z; build-info `9ff27630` at 19:14:11Z; Vercel READY at 19:17:25Z; 0 hydration errors; 0 Preview.
    - First run after it, `37981662094` (19:39Z): nflverse captured at 19:40:29Z, then player events at 19:40:30Z. One push of 2 commits, one deployment (`7ac70c67a0`).
    - Four legitimate re-simulations from injury changes: LV @ NE (Nailor OUT), MIN @ NO (Fant cleared), NYG @ WSH (Diggs OUT), CHI @ GB (Caleb Williams OUT → QUESTIONABLE, now the passer). TB @ DAL untouched.
    - Runs `37984332498` (20:02Z) and `38009261827` (00:29Z) also made one deployment each (`4c7272077e`, `1ada44a2fc`).
    - Same-run grading of a **new** final is not yet demonstrated. It is first possible when Sunday's games finish.
  - **Settlement delay (founder decision 2026-10-09):** the first V2 game was not graded promptly after it ended. This is recorded as an operational limitation here and under OPS-001, LEDGER-001 and RESULTS-001. See the LEDGER-001 observation.
  - Until then Production shows the 2.1.0 runs (PHI vs JAX `076bd90906ca28d4`, 01:00:16Z).
  - The new simulation timestamps will be recorded here when it runs.

### First game performance review — TB @ DAL, 2026-10-08 (branch `claude/nfl-wm2-review-tb-dal`; evidence only, not on `main` yet)
**Report:** `docs/research/nfl/world-model-v2-reviews/2026-10-08-tb-at-dal.md`, with its evidence JSON. This is the review structure for future games. It is not a roadmap.

**Primary record:** the last pregame run `8ca1b01a873fdcda` (2.1.0, 23:21:10Z), live in Production at 23:25:40Z. Re-running the builder at the producing commit `d84a1aee4d` reproduced it exactly.

**Findings (n = 1, no significance claimed, no model change):**
- **Winner:** a miss on a 35% event (V2 DAL 64.4%; incumbent 61.8%; market about 80.5%).
- **Score:** TB 24 at its median; DAL 16 at the 8.9th percentile.
- **Players:** 80% intervals covered 28 of 36 graded player forecasts.
- **Volume** given the score state was represented.
- **Per-carry yardage tail** is about 10 times thinner than 2013–2025 history (0.17% vs 1.79%): a SUPPORTED HYPOTHESIS for NFL-003.
- **Turnovers:** there is no turnover process (structural).
- **Pickens/Lamb:** the inversion is not an allocation defect.
- **Sportsbook lines:** there was no V2 pregame selection, so line outcomes are descriptive only.
- **Anytime TD** (existing model, not V2): 4 scorers vs 3.51 expected (n = 14 settled).

**Grading:**
- **Not yet run in the repository:** the event-window settle and grade steps had not been delivered by 13:41Z.
- **Pipeline verified:** main's pipeline grades the game correctly in a scratch copy (36 GRADED, 6 NO_LINE).

**Next:** a preregistered rushing-tail calibration study (NFL-003). Turnover and independent score heads become NFL-002 challengers, preregistered before any data look.

## Milestone — NFL Week 5 readiness (2026-10-08 → 2026-10-12)
Founder-approved, time-sensitive milestone **inside** the NFL program (not a new task). Work items belong to `NFL-001` → `NFL-005` above.
- Window: Thursday 2026-10-08 TB @ DAL (8:15 PM ET, first priority) → Sunday 2026-10-11 → Monday 2026-10-12.
- Target per game: correct teams/kickoff/event identity; current QB and key roster assumptions; predicted winner and win probability; projected score and score distribution; expected margin and spread probabilities; expected total and total probabilities; supported player projections only where validated; model provenance and forecast timestamp; game-detail navigation.
- Rules: unvalidated challengers stay in shadow (the incumbent is retained wherever a challenger has not shown adequate held-out performance); no QUESTIONABLE/OUT/ineligible players in public ranked recommendations; preliminary vs frozen pregame forecasts are distinguished; frozen forecasts are never revised after kickoff; no Elo-derived probability is presented as an observed simulation count; model-vs-market comparisons match exact selection, direction, line and settlement rules; a known `TRUTH-001`-class defect touching NFL is fixed within NFL scope or the claim is suppressed (the cross-sport `TRUTH-001` task stays intact).
- Release: local-first; one focused PR of validated changes; exact-head CI green; **founder approval before the Production merge**; `COST-001` protections apply.
- Status: IN_PROGRESS — Thursday TB @ DAL release DONE (2026-10-08 17:25Z); Sunday/Monday games ride the same producers; milestone closes after MNF (2026-10-12).
- **Production release (founder-approved 2026-10-08 as a Week 5 correctness release, not the V2 launch):** [#1022](https://github.com/yashwantbalaji3/gametimepicks/pull/1022) exact head `0e01d413cb2f4b71ec96ab0287f1c138e0af737a` (CI run 37809110362: `python` ✓, `quality` ✓, built that SHA) → merge `902583b101831d634e7dc0605d2ad0c952cf5962` at 17:08:37Z with `--match-head-commit`. Merge deployment `dpl_8HVn1D2T18UGRKLRawW7J2ogXkCt` READY 17:12:48Z; its own `build-info` = `90258…`; 40 CPU-min billed ≈ $0.14. Preview deployments: 0.
- **Regeneration:** one zero-credit `nfl-event-window` dispatch (`skip_odds=true`, run 37815894943, 17:21Z; reason: verify before TNF rather than rely on schedulers measured 1h40m–4h55m late) → commit `54ad287c6f` (15 forecasts, 15 boards, weekly boards; roster audit 0 violations) → Production `build-info` `54ad287c` built 17:24:50Z.
- **Live verification (17:30Z, gametime-picks.vercel.app):** TB @ DAL — "Not in this number: … Baker Mayfield (TB, Out)", comparison withheld, no lean, win-chance copy corrected, Daniels' passing line withheld with its reason (Prescott kept); CHI @ GB — Caleb Williams disclosure, Keenum/Bagent passing withheld; PHI vs JAX — "PHI 22 — 21 JAX", PHI 48.8% / JAX 48.4%, at Tottenham Hotspur Stadium; `/nfl` — no lean, corrected "Likely winner" copy, no Out player (Pittman) on boards.
- **Freeze:** `frozen-carry` selection run against `main`'s 11 TB @ DAL receipts at 00:16Z selects the 17:22:25Z receipt (`864b496f65e7aa74`, DAL 0.6181, `WITHHELD_TEAM_INPUTS`, side HOME); 0 receipts at/after kickoff. Later pre-kickoff refreshes add revisions under the same producers.
- Follow-ups (minor): CHI @ GB disclosure says "their price already reflects the absence" while no price is captured yet; the page `<title>` keeps the source matchup "PHI @ JAX" (body states the neutral venue).
- Delivered for Week 5 (PR pending founder approval; producers + copy only): TB@DAL and CHI@GB disclose that the team model cannot see the QB1 absence and withhold the model-vs-market comparison (no false "lean"); PHI vs JAX (London) is a neutral site; relief-share passers withheld; win-chance copy no longer claims a simulation count; revisable forecasts no longer called frozen. Verified locally: 1/15 forecast summaries change (PHI vs JAX), 3 player rows change. Evidence `docs/NFL_WORLD_MODEL_V2_2026-10-08.md`.
- Coverage: all 15 Week 5 games forecast (CAR, KC bye); spread/total probabilities are not yet published per game (the forecast artifact carries medians/ranges only) — open item.

---

# 9. Soccer roadmap

## `SOCCER-001` — Team result/score research
**Status:** NOT_STARTED
Benchmark dynamic Poisson attack/defense → Dixon-Coles → hierarchical Bayesian → bivariate/shared-latent → shot/chance/xG process.

Features: lagged xG/xGA, lineup/keeper, rest, home advantage, competition-specific parameters with partial pooling. Keep 90-minute result separate from qualification.

## `SOCCER-002` — Player markets
**Status:** NOT_STARTED
`minutes/start/sub survival → shots → SOT → chance quality → goals`, with keeper saves linked to opposition SOT.

## `SOCCER-003` — League expansion
**Status:** NOT_STARTED
Stabilize EPL → correct/grade Ligue 1 → league-specific validation → La Liga/Bundesliga/Serie A Experimental only when point-in-time data and safety checks exist.

### Existing references
- `claude/handoff-soccer-stage13-prep`
- `claude/handoff-results-13b-ligue1`
- `claude/handoff-soccer-13e-board-fit`
- `claude/arch-sw1-soccer-worlds-z8g61r`

---

# 10. NBA roadmap

## `NBA-001` — Private/shadow readiness
**Status:** NOT_STARTED
Preserve current shadow/private work; do not imply public forecast parity.

## `NBA-002` — World model research
**Status:** NOT_STARTED
`minutes/rotation → possessions → shot/FT/rebound/assist events → team score/player outputs`

Benchmark Elo/pace-efficiency, hierarchical possessions, lineup-adjusted latent strength, distributional boosting/ensemble.

Hard invariants: player minutes = 240 regulation + 25 per OT; five players on court; `3PM ≤ 3PA ≤ FGA`; PRA derives from same P/R/A path; overtime and late-foul effects explicit.

### Existing references
- `claude/handoff-nba-b-pretip-boards`
- `claude/handoff-nba-stage12-prep`

---

# 11. UFC roadmap

## `UFC-001` — Near-term truthful operations
**Status:** NOT_STARTED
Use existing Saturday/U1/U2 work only after current-main refresh.

## `UFC-002` — World/process model
**Status:** NOT_STARTED
Benchmark Bradley-Terry/Elo → hierarchical fighter/style effects → round-state Markov process → competing KO/TKO/submission hazards → decision at time limit.

Features: age, weight class, layoff, short notice, opponent-adjusted striking/grappling, scheduled rounds.

Hard invariants: finish occurs once and ends bout; winner/method/time derive from same path; draw/NC/overturn explicit.

### Existing references
- `claude/ufc-saturday-9z4up5`
- `claude/handoff-ufc-u1`
- `claude/handoff-ufc-u2-rest`

---

# 12. NCAAF roadmap

## `NCAAF-001` — Point-in-time data foundation
**Status:** NOT_STARTED
Independent DP-friendly lane.

Capture schedules/events, teams/conferences, rosters, QB role, transfers, returning production, coaching, recruiting/talent priors, efficiency/EPA/success, pace, strength of schedule, weather, participation.

## `NCAAF-002` — Game model
**Status:** NOT_STARTED
Benchmark hierarchical conference/team ratings → opponent-adjusted EPA/success → latent/Elo → drive process. Cold-start/sparse-team uncertainty is central. Player props wait for trustworthy participation archives.

---

# 13. NHL roadmap

## `NHL-001` — Data foundation
**Status:** NOT_STARTED
Schedules, rosters/lines, goalie starts, TOI, shots/xG, special teams, rest, injuries.

## `NHL-002` — World model
**Status:** NOT_STARTED
Benchmark Poisson/Skellam → hierarchical/bivariate scoring → shots × xG conversion → goalie effects → manpower/line-dependent hazards. Model regulation, OT, shootout separately.

## `NHL-003` — Player/goalie markets
**Status:** NOT_STARTED
`TOI/line/PP usage → shots → conversion` and `opponent shot process → SOG → saves/goals`.

---

# 14. Canonical Product Engine

## `PRODUCT-001` — Canonical candidate universe
**Priority:** P2  
**Status:** NOT_STARTED

Every model-driven candidate needs forecast ID, sport, event, subject, target/market, selection, signed line, model probability, market probability, edge/value definition, uncertainty, model version, WorldReceipt, MarketSnapshot, maturity, eligibility, rejection reasons, dependency metadata.

Rules:
- all qualified sports may contribute;
- never force sport diversity;
- same data-quality floor across products;
- market-only paper constructions are clearly labeled;
- model favorite and price-value selection are distinct concepts.

## `PRODUCT-002` — Bank Builder
**Status:** NOT_STARTED
Objective: high probability + validated family + fresh evidence + controlled dependence + reasonable value.

Hard rule: a directional Bank Builder leg cannot silently oppose the canonical forecast for that market.

## `PRODUCT-003` — Moonshot
**Status:** NOT_STARTED
Higher variance/upside, but same provenance and eligibility floor.

## `PARLAY-001` — Parlay Lab
**Status:** NOT_STARTED
When legs share common worlds:
`P(all legs) = worlds where all legs occur / valid worlds`

Never market `product of marginals` as GTP joint probability unless independence is explicitly justified.

Audit bounded selector search/top-30 truncation with exact small-universe solver and counterexample tests.

---

# 15. Results & Forecast Ledger V2

## `RESULTS-001` — Prop-family performance center
**Priority:** P1  
**Status:** IN_PROGRESS — NFL World Model V2 per-family grading (private); Results V2 not started.

### Sport tabs
MLB / NFL / Soccer / NBA / UFC / NCAAF / NHL as supported.

### MLB examples
Moneyline, Run Line, Total, Hits, Total Bases, H+R+RBI, Runs, RBI, HR, Pitcher Ks, Pitcher Outs.

### NFL examples
Winner, Spread, Total, Passing Yards, Rushing Yards, Receiving Yards, Receptions, TDs.

### Time filters
`Yesterday | 3D | 7D | 10D | 30D | Season | All Time | Custom`

Additional filters: model version, product, player/team, status, horizon, eligibility era.

### Simple view
Hit rate, W-L, pushes, sample, trend.

### Analyst view
Brier, log loss, calibration, CRPS, interval coverage, model-generation comparison, CLV only where time-matched evidence exists.

### Drill-down
Every metric links to all underlying forecasts with date/event/subject/target/line/selection/projection/probability/market snapshot/result/status/model version/publication evidence.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- Needed from RESULTS-001 for NFL: per-family metrics for World Model V2 records (MAE / CRPS / 80% coverage for yards and receptions; Brier / log loss / calibration bands for TD families), and champion/challenger tables (old version, new version, period, n, metrics, reason, rollback rule). No combined accuracy % across incompatible families.

## `RESULTS-002` — Product results
**Status:** NOT_STARTED
Separate model-family performance from Bank Builder, Moonshot, Top Boards, Parlay Lab, and live recommendations. Grade exact frozen/public product receipts, never reconstructed current logic.

---

# 16. Sport Hub / UX System V2

## `UX-001` — Shared Sport Hub
**Priority:** P1  
**Status:** IN_PROGRESS — partly PRODUCTION DEPLOYED (#1026, #1028, #1030); #1031–#1033 READY_FOR_REVIEW; website-wide restructuring not complete.

### Progress (2026-10-08 night, unified NFL experience directive; branch `claude/nfl-unified-experience`)
- NFL is the first sport on the shared presentation pieces: `components/nfl/forecast/` (one model-status explainer, hero, histogram panels, tabbed player rows with ESPN portraits + team logos, sampled-game explorer, collapsible methodology). Remaining UX-001 scope: generalise these into the Sport Hub components for every sport (not started); NFL week selector beyond the existing `/nfl/week/[key]` permalinks.

### Progress (2026-10-09; founder UX decisions; branch `claude/ux-live-first`)
- **Audit:** read-only audit of Production published as an artifact (https://claude.ai/artifact/Nifv8hDm5fuy4XaX8v5LNw), with phone screenshots, page lengths (NFL hub 25,505 px / 4,641 words; Results 17,576 px; Today 11,908 px), click depth, ten evidenced problems and a 10-PR sequence.
- **Founder decisions (2026-10-08):**
  - No global Simple/Analyst switch. Collapsible detail sitewide; Simple/Analyst only inside Results (RESULTS-001).
  - Live replaces Parlays in the primaries; Parlays stays in the Menu sheet, rail and footer.
  - Today folds into Home only after every Today function, filter, deep link and nav dependency is verified; no redirect before that.
  - Proceed with the phased sequence.
- **PR 1 · Live first:**
  - `components/live/live-now-strip.tsx` + `live-now.tsx`: a view-time read of the live gateway list. It shows only games stated LIVE/DELAYED, links only to built pages, and renders nothing otherwise.
  - The strip sits on Home (before the hero) and the NFL and MLB hubs (under the title).
  - The five primaries are Home · Sports · Live · Simulations · Results, on every surface.
  - Hub lists lead with rows the schedule owner states are in progress.
  - The `#player-board` alias anchor on simulated NFL game pages keeps /live and saved links landing on the player projections.
  - Verified locally against the real gateway during TB @ DAL and CLE @ CWS at 390 px and 1280 px: the strip is at the top, both games show, links resolve, no overflow.

- **#1028 merged** at exact head `c4d8f43241` → `71c82da625c26f4697650ae7bfd715d2c227659e` at 02:34:03Z.
  - CI: `python` ✓. `quality` failed once: the Firefox scroll-box check on `/results/` found 6 boxes. It did not reproduce locally (head, or head merged with main, 13/13 routes) or on Production, and passed on the single permitted re-run. No test was changed.
  - Production build-info = `71c82da6`, built 02:37:53Z; Vercel success 02:40:28Z.
  - Verified in Production during TB @ DAL (4th quarter) and CLE @ CWS:
    - Live Now shows both games with working links.
    - A feed failure after load shows "last known"; a feed down from the first load shows no strip.
    - In-progress games come first.
    - The five primaries and Parlays (Menu sheet) are intact.
  - Vercel Build CPU: not readable without a dashboard login.
- **Pre-existing defect (recorded here, not a new task):** React hydration errors #425/#418/#423 on `/nfl/` (7) and on NFL game pages (9, e.g. `/nfl/game/401872981/`). The text the server renders differs from the client's.
  - Identical counts on Production before and after #1028; Home, MLB, Live, Results, Sports and Parlays have 0.
  - **Root cause (2026-10-09):** `components/nfl/forecast/styles.tsx` rendered its CSS as a React text child (`<style>{CSS}</style>`). The server HTML escaped `>` as `&gt;` (`.nf-split &gt; div`, a broken rule in the static page) while the browser kept `>`. React threw #425 → #418 → #423 and re-rendered each NFL page on the client.
  - **Fix (branch `claude/ux-001-nfl-hydration`):** `dangerouslySetInnerHTML`, as `simulation-v2-report` and `results/nfl` already do. The two other `<style>{…}</style>` uses (Mr. Dub ledger, internal /launch) are converted too.
  - `uiux/style-element-hydration.test.mjs` forbids the pattern and checks that the built NFL pages carry no entity inside `<style>`. It fails on main's code.
  - Local result: 0 page errors on /nfl/ and every NFL game page checked (Production: 7 and 9).

- **#1031 merged** at exact head `920faf4a9a` (founder decision 1, 2026-10-09; `python` ✓ `quality` ✓) → `ae9e8f8f14a9031eb7a0b3cbe3be41b2f394d6b2` at 13:59:30Z.
  - Production build-info = `ae9e8f8f`, built 14:02:04Z; Vercel success 14:04:40Z.
  - **0 hydration errors in Chromium and Firefox** on the NFL hub, 4 game pages and the week page, and across an 80-page sitemap scan; the NFL CSS now ships unescaped.
  - Residual: WebKit-only errors on NFL game pages and `/ufc/` (date-and-time joined with " at "), and non-US-locale errors (numbers formatted with no locale). Fixed in #1034 (`claude/ux-001-webkit-date-hydration`), awaiting approval.

- **#1032 merged** at exact head `529c6f0720` (founder decision 1, afternoon; `python` ✓ `quality` ✓; no other deploy in progress) → `9ad3b8e5b159019f596dd88379b3133be9675e89` at 14:48:42Z.
  - Production build-info = `9ad3b8e5`, built 14:50:24Z; Vercel success 14:53:07Z.
  - One nav system per width:
    - 390–767 px: bar plus Menu.
    - 768–1023 px: the five primaries plus a header Menu (full-height sheet with search; Tab and Shift+Tab contained, Escape closes, focus returns).
    - 1024 px and up: rail.
  - Active state matches the shared resolver on 25 routes at 1280 and 390 px.
  - The Safari (WebKit) Menu focus trap holds on Production: 25 Tabs, all inside.
  - Legacy redirects and deep links return 200.
  - Billed Build CPU needs the dashboard.

- **#1034 merged** at exact head `34d0a95250` → `646c75b3aeea136b13f7875790865d113cf128ba` at 15:15:22Z. Production build `646c75b3` at 15:17:07Z; Vercel success 15:20:27Z.
  - 0 hydration errors in Chromium, Firefox and WebKit, and in a de-DE browser, on the NFL hub, game and week pages, `/ufc/`, `/results/model-audit/`, `/simulate/d`, `/saved`, `/my` and the main pages.
  - 95-page sitemap scan: 0 errors in three engines.
  - The e2e accessibility suite against Production: 468 passed, 0 failed (9 data-dependent skips).
  - A first verification pass ran during a local network outage and was discarded.
- **#1033 merged** at exact head `26920ece4b` (after #1034 was verified) → `627eea577bc83068397fff27f43d72cb5c063e52` at 15:59:52Z. Production build `627eea57` at 16:01:25Z; Vercel success 16:03:48Z.
  - The sitemap lists `/nba/` and `/soccer/ligue-1/`.
  - 7 redirects land where the table now says (`/nhl`, `/ipl` → `/today/`; `/trends` → `/mlb/board/`; …).
  - The MLB pages without the null tab strip render with 0 errors.
  - The active-state matrix is identical to the post-#1032 baseline on 50 route×viewport checks.
  - The tablet Menu and the WebKit trap hold.
  - 95-page scan: 0 errors in three engines. Accessibility suite: 468 passed, 0 failed.

### Progress (2026-10-09; UX-001 phase 2 · navigation and sport switcher; branch `claude/ux-001-sport-nav`)
- **One sport catalog** (`lib/sports/catalog.ts`): Football (NFL) · Basketball (NBA) · Baseball (MLB) · Soccer (Premier League, Ligue 1) · MMA (UFC), in the founder's naming and order.
  - Soccer competitions beyond the Premier League come only through the league registry's publishing gate (`soccerLeaguePages`), so there is no placeholder for a planned, held or rejected league.
  - Ligue 1's note is "model-only forecasts · backtest only", matching its page and the capability registry.
- **Everything that lists sports reads it:**
  - The registry's Sports group (rail, footer, phone Menu). Ligue 1 was public with no link before.
  - The new shared `SportSwitcher` on every hub (NFL, NBA, MLB, Premier League, Ligue 1, UFC). It is server-rendered from the hub's key and wraps rather than scrolling sideways.
  - The `/sports` chooser, which previously had no NBA or Ligue 1.
- **Guards:** new `catalog.test.mjs`. Source guards now read the catalog beside the registry, with no assertion weakened.
- **#1030 merged** at exact head `cdcc524d65` (`python` ✓ `quality` ✓) → `63be71c62003201cf7a5ae7886b637086fb7eb59` at 03:44:39Z.
  - Production build-info = `63be71c6`, built 03:45:55Z; Vercel success 03:48:14Z.
  - Verified at 390 and 1280 px: all six hubs show the switcher with the correct current page and no overflow; Menu, rail and /sports list the same six hubs; aliases and deep links return 200.
- **Shared active-route resolver (branch `claude/ux-001-nav-resolver`):** `lib/nav-active-route.ts` `ownersOf` / `activeHref`. Each path has an ordered owner chain:
  - an explicit alias entry, else
  - its destination ancestors, longest first, else
  - Sports, for anything inside a hub.

  Each surface lights the first owner it carries:
  - Top nav, rail and Menu sheet replace their three hand-written matchers. The Menu sheet's bare prefix rule is gone.
  - The phone bar's bucket comes from the same chain; every existing pinned mapping is unchanged.
  - Dead `picks`, `bank`, `moonshot` and `mrdub` buckets and their glyphs are removed.
- **Tablet gap closed:**
  - 768–1023 px: the header carries the five primaries plus a Menu button that opens the same sheet (portaled out of the blurred header) with search.
  - Below 768 px: the phone header and bar only. The 640–767 px band no longer paints the primaries twice.
- **Shared focus trap (`useDialogFocus`):** it now moves focus itself on every Tab. WebKit's default Tab order skips links, so Tab left the open Menu every other press; this reproduced on Production in WebKit.
- **Tests:**
  - New `nav-resolver.test.mjs`.
  - Stale assertions corrected: `mr-dub-ui` asserted the dead `"mrdub"` string and now asserts the behaviour; `nav-three-click` checked retired `/picks` and now checks `/build`; e2e `p202` and `p243-journeys` still expected Parlays on the bar from before #1028.
- **Remaining phase 2:** remove the unused navigation components; correct the stale route-inventory entries (`/nba` is a hub, not a redirect; `/nhl` and `/ipl` targets).

- **Navigation cleanup (branch `claude/ux-001-nav-cleanup`):**
  - Deleted 11 navigation components that nothing imports: projections-experience (its own sport nav), home-sports-coverage, homepage-sports-rail, sports-coverage-board, sport-lobby-actions, board-with-tabs, slate-tabs, homepage-trending-tabs, date-status-header, sport-section-tabs (it returned null) and mlb-section-tabs.
  - Removed the latter's four MLB mounts and their empty spacer divs, the slate-tabs-only CSS, and two token-registry rows. The date-sport-controls exception list is now empty, with the cap tightened from 1 to 0.
  - Route table: `/nba` is a public hub (it had been missing from sitemap.xml); the `/nhl`, `/ipl` → `/today` and `/trends` → `/mlb/board` targets now match their pages.
  - The sitemap now lists every catalog hub, so Ligue 1's family route no longer hides it.
  - New `audits/route-inventory-drift.test.mjs`: every redirect row's target matches its page's ClientRedirect, and every catalog hub is public and in the built sitemap.

## Universal order
1. Sport header + period selector
2. Slate summary
3. Top Boards
4. Model / market-value opportunities
5. Game details
6. Live follow
7. Results snapshot
8. Methodology/model status

Users should learn GameTimePicks once; switching sports changes data, not the mental model.

### Period semantics
- MLB/NBA/NHL: day
- NFL/NCAAF: week
- Soccer: matchday/date range
- UFC: event/card

### Conceptual shared components
`SportHubShell`, `SportPeriodSelector`, `SlateSummaryTable`, `TopBoardsSection`, `ModelOpportunitiesSection`, `SimulationGameCard`, `LiveFollowPreview`, `SportResultsSnapshot`, `CapabilityState`.

Reuse existing components if better; do not create duplicates just to match these names.

### Slate summary
As supported: matchup, model-favored result, probability including draw/tie mass, named score statistic, spread/handicap, total, top model read, lifecycle/status, details link.

### Top Board row
Rank, player/team, projection, market line, model probability, market probability, market age, model maturity, eligibility, forecast ID/details.

Never compare incomparable families globally by raw probability alone.

### Game page structure
Overview · Players · Distributions · Live · Market Comparison · Methodology

### UX state vocabulary
Unavailable · No forecast · Paused · No qualifying card · Stale · Partial · All-started · Pipeline failure · Corrected · Experimental · Established

### Accessibility acceptance
Keyboard navigation; screen-reader names/tab semantics; non-color status encoding; chart tables; filter focus management; reduced motion; 320/390/768/1440 layouts; no page-level horizontal overflow; announce meaningful live changes, not every poll.

---

# 17. Live Game Intelligence / Live Hub V2

## `LIVE-001` — L1 factual MLB tracking
**Priority:** P2  
**Status:** IN_PROGRESS — factual NFL/MLB score + NFL player-stat tracking PRODUCTION DEPLOYED; MLB player join waits on TRUTH-001.

Capture player box/stat progression, event timeline, score/inning/out/base state, current batter/pitcher, source age, correction identity.

Display frozen pregame projection, current observed stat, target line, opportunity count, source freshness.

MLB player rows from `full-game-simulations` are not a usable pregame projection until the replacement-level rows are identifiable per row (`TRUTH-001`). A bookmaker `player-props` row is never one. See `adapters.test.mjs` MLB 8 (`CI-001`).
- 2026-10-09 (TRUTH-001 PR 1, not merged): NEW artifacts carry `rateSource` per batter row (checked in MLB 8c). Older artifacts stay unflagged, so a live join must still exclude them or treat their rows as unflagged.

Graph cumulative observed stat as steps, threshold as horizontal line, pregame projection/reference separately.

Use `Threshold reached — awaiting official settlement`, not premature `WIN`. Under bets generally cannot clear before period end.

### NFL live readiness, TB @ DAL (2026-10-08/09), and the World Model V2 integration plan
- **Working (Production):**
  - The /live and game-page panels: score, period, clock and down-and-distance from the ESPN public feed (gateway TTL 25 s, client poll 30 s; stale shows "Last known", unavailable is stated).
  - Factual live receiving yards, receptions and rushing yards beside the frozen projections.
  - Sportsbook lines with book and capture time on /live and, since #1027, on game pages.
  - Frozen pregame forecasts untouched after kickoff.
- **Not tracked live, by design:**
  - Passing yards: the gateway map leaves `passing:YDS` out (ESTIMATE family at the time).
  - Anytime TD: no box-score field names the scorer by id. The only producer is the manual live-props capture. Since #1027 the TD card says "Not tracked live · settled from the official box score after the game".
- **Integration plan (founder decision 5; LIVE tasks):**
  - /live tracks the same World Model V2 rows the game pages show once WM2 grading runs, through `forecast-view.mjs` instead of the board.
  - Add `passing:YDS` to the gateway map now that passing yards is a published WM2 family.
  - TD events need an id-bearing source (play-by-play athlete ids); until then they stay untracked.
  - **Order (2026-10-09):** `passing:YDS` is mapped only AFTER /live reads the World Model V2 rows. The gateway guard (`live-slot.test.mjs`) keeps passing yards out while /live compares against the player board, whose passing-yards family is ESTIMATE (rejected at its own bar). Mapping it first would put a live number beside a rejected forecast.
  - Live tracking stays factual and separate from any live re-simulation (LIVE-003, shadow).

## `LIVE-002` — L2 visual Game Center
**Status:** NOT_STARTED

MLB: diamond, inning/score, balls/strikes/outs, baserunners, batter/pitcher, real pitch coordinates when available, batted-ball coordinates when available, play timeline, prop trajectories.

Never fabricate broadcast-like paths when source coordinates are unavailable.

Later adapt the same Live shell to NFL possession/down-distance/drive charts, Soccer clock/cards/shots/xG where legitimate, and NBA/NHL/UFC event structures.

## `LIVE-003` — L3 conditional forecast
**Status:** NOT_STARTED
Initialize future worlds from actual live state.

For additive stats:
`actual_so_far + simulated_future_remainder`

Each checkpoint is a new forecast identity with observed cutoff, state hash, model version, parent pregame forecast.

Display separately: Pregame · Actual now · Conditional live forecast.

Replay historical event streams using real observation latency.

## `LIVE-004` — L4 live straights
**Status:** NOT_STARTED
Requires validated live target, exact fresh market, synchronized state/quote, unsuspended state, latency/price-age limits, calibrated model, eligibility, replayability.

## `LIVE-005` — Live parlays
**Status:** NOT_STARTED
Only after live straights and dependence/joint-world validation.

---

# 18. Operations, freshness and cost

## `OPS-002` — Bot commit identity and blocked Production deployments
**Priority:** HIGH — address promptly after COST-001 Phase 1 (founder, 2026-10-07)  
**Status:** IN_PROGRESS — merged and verified in Production; **seven-day observation running** (cutover 2026-10-08T05:56:44Z → earliest DONE ≈ 2026-10-15T05:57Z)  
**Owner/session:** Claude Code session 2026-10-08 (OPS-002)  
**Branch:** `claude/ops-002-bot-commit-identity` (from `origin/main` `a20ec45c79`, merged) · acceptance monitor + records: `claude/ops-002-acceptance-monitor`  
**PR:** [#1019](https://github.com/yashwantbalaji3/gametimepicks/pull/1019) (merged by founder approval, exact head enforced with `--match-head-commit`)  
**Exact head:** `f4cc4b885b171e55de7c2c509cc6d7d0d1e6b9dd` → merge `f65e7656afc21f59b959aafb06a25f46e530a8e9` (2026-10-08T04:03:07Z)  
**CI (exact head):** quality-gate run 37723793669: `python` ✓ (03:41:30Z), `quality` ✓ (03:59:44Z); post-merge `main` quality-gate ✓  
**Evidence:** `docs/OPS_002_BOT_COMMIT_IDENTITY.md`; `scripts/ops-002-identity-report.mjs` + `scripts/ops-002-acceptance.mjs`; guards `app/src/lib/ops/bot-commit-identity.test.mjs`, `app/src/lib/ops/ops-002-acceptance.test.mjs`  
**Production acceptance:** initial verification PASS (below); seven-day acceptance NOT_YET

### Progress (2026-10-08)
- Status: IN_PROGRESS
- Base main SHA: `a20ec45c790b731c1db1fda0adac6f6f47a71bcf`
- **Root cause (proven, not intermittent):** Vercel checks that the GitHub account resolved from the commit **author email** is a team member **only when the repo is private**. `bot@users.noreply.github.com` is the legacy login-based noreply form and resolves to the stranger `bot` (58210622). Vercel's `meta.githubRepoVisibility` shows the repo **private 2026-10-07 17:09Z → 10-08 00:08Z** — the only private period in 4,254 deployments since 08-20. `gtp-bot` Production deployments: **private 21/21 BLOCKED; public 0/1,616 blocked.** In the same private window `github-actions[bot]` (type Bot) built READY (`dpl_8gZDEGumuxFxtZx5kRh7bUC6niTG`). The COST-001 "intermittent" reading was the visibility change.
- Same latent defect: `GametimePicks Bot <noreply@github.com>` → GitHub `web-flow` (8 workflows); `noreply@anthropic.com` → Anthropic's `claude` account (2); `gtp-lifecycle@…` → unregistered, claimable login (1).
- **Fix:** every workflow identity (34 files, 45 name/email pairs) → `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>` = the `GITHUB_TOKEN` pusher; id-bound noreply (cannot be captured by a login). No permissions/steps/triggers/path scopes changed (js-yaml structural diff: 34/34 identical apart from the strings). No new secret, seat, account or service; Vercel team-access protection untouched; no historical data touched.
- Rejected: adding `bot` to the team (stranger, paid seat); relying on public visibility; machine user + seat; new GitHub App (secret + token step × 35 workflows for the same `bot` type); keeping custom names with the bot email.
- Local tests: new guard 7/7; it **fails on origin/main** (3) and catches all 5 mutation probes; identity-step simulation gives author = committer = `github-actions[bot]`; report script reproduces the 21 blocks (exit 2); CI unit phase: see Session Log.
- Vercel Preview builds triggered: 0 (branch gated). Production builds expected on merge: 1 (test under `app/src/` is a build input; ≈ $0.15–0.17; bot data commits build every few minutes anyway).
- Blockers: founder approval to merge.
- Follow-ups (docs/OPS_002 §7): **F1** local `.git/config` identity `gtp-ops[bot] <gtp-ops@users.noreply.github.com>` resolves to user `gtp-ops` (140865288) — ownership unconfirmed; affects Claude-session commits (not Production today: merges are founder-authored). **F2** explain the 10-07 visibility change (also affects the "Actions are free" assumption). **F3** NWS User-Agent contact uses the dead `bot@` address (OPS-001, cosmetic).

### Production verification (2026-10-08)
- Merge deployment `dpl_9N2jR3QXtGTXKP1NobMRy6vR4ERu` (author founder) READY 04:06:50Z. Billed `cpuTimeForBilling` was 2,400,000 ms = **40 CPU-min ≈ $0.14**. Production build-info = `f65e7656` (built 04:04:23Z). `/`, `/mlb/`, `/nfl/`, `/results/`, `/today/`, `/markets/`, `/live/`, `/bank-builder/` all returned 200.
- Vercel deployments created by this work: **Preview 0** (branch push 03:39:39Z, verified by API) · **Production 1** (the merge). No synthetic commits, redeploys or setting changes.
- No scheduled workflow ran from 02:50Z to 05:56Z. This is GitHub's normal overnight scheduler gap (last night: 02:38Z → 05:09Z), it started before the merge, and githubstatus showed Actions operational.
- **Cutover:** first post-merge data commit `851ecc754ebb7c9017d16a169aee30061dff32af` (`auto: nba results capture 2026-10-08T05:56:43Z`), committed 05:56:44Z by the real scheduled `nba-results-refresh`.
  - Git author = committer = `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`; GitHub `author.login` `github-actions[bot]`, type Bot.
  - Vercel `dpl_BjrG1yjNziJ91VNqAnRv3nKASiSS`: `attribution.gitUser = {id: 41898282, login: github-actions[bot], type: bot}`, **`seatBlock` none, READY** 06:00:34Z (repo public).
  - Production build-info advanced to `851ecc75` (built 05:58:04Z) = `main` head.
  - The commit touched only the producer's own two files (`app/public/data/nba/results/finals-2026-27.json`, `latest.json`); no other sport data changed.
- Acceptance report at cutover: 0 blocks; 1/1 post-cutover data deployments attributed to the bot; Production at main head; verdict **NOT_YET** (0 of 7 days). The verdict refuses to pass on absence of evidence.

### Remaining acceptance (OPS-002)
| # | Item | Status |
|---|---|---|
| 1 | Exact-head CI green on the PR | DONE — run 37723793669 (`python`, `quality` ✓) |
| 2 | Founder approves merge; merge exact head (`--match-head-commit`); 1 Production build | DONE — approved 2026-10-08; merged `f65e7656`; 1 build (40 CPU-min ≈ $0.14) |
| 3 | Cutover = first post-merge data commit authored `github-actions[bot]`; Vercel attributes it `github-actions[bot]/bot`, READY; build-info advances | DONE — `851ecc75` @ 05:56:44Z → `dpl_BjrG1yjNziJ91VNqAnRv3nKASiSS` READY, live |
| 4 | ≥ 7 days after cutover: `node scripts/ops-002-identity-report.mjs --cli-auth --cutover <cutover>` returns **`PASS`** (exit 0). PASS requires all of: no `TEAM_ACCESS_REQUIRED`; every post-cutover `auto…` deployment attributed to `github-actions[bot]`/bot; ≥ 1 READY bot data deployment in **every** 24 h slot; live build-info = newest READY build; `main` head deployed; nothing errored, blocked or stuck. `NOT_YET` (3) and `STALE` (4) are never acceptance (founder requirement 2026-10-08; docs/OPS_002 §6) | after merge (read-only, $0) |
| 5 | Record evidence → `DONE` | NOT_STARTED — earliest 2026-10-15T05:57Z. If the report is not run, the seven days are not accepted |

Daily check (read-only, $0): `node scripts/ops-002-identity-report.mjs --cli-auth --cutover 2026-10-08T05:56:44Z`. Any `FAIL` reopens the investigation; `STALE` means a freshness incident (OPS-001 territory) and must be explained before acceptance.

**PR #1020 integration status (2026-10-08 12:55Z):** founder-approved conditionally, **not merged**.
- `python` ✓, but `quality` ✗ on head `a462bc5a1e` (run 37777802882). The one failure is `app/src/lib/live/adapters/adapters.test.mjs` "MLB 8 · MLB carries NO live player stats", which says "no ready simulation in the last 14 slates".
- Bisect: `34d87c5d0b` (`auto: mlb daily production slate 2026-10-08`, 09:32Z) is the first bad commit. It fails identically on `origin/main` without #1020; the earlier #1020 head passed this suite at 06:29Z.
- Cause: the newest `ready` MLB full-game simulation is in the 2026-09-24 slate; every slate since is `degraded`/`unavailable`. Today's slate pushed 09-24 out of the test's rolling 14-slate window.
- This is a **main-wide red test independent of OPS-002**, and it blocks every PR's quality gate. It was not weakened here.
- Follow-up **OPS-002-F4** (MLB/live owner): decide whether the test's window should anchor to a fixed fixture, or whether "no ready MLB simulation since 09-24" is itself a Production truth defect. After that fix lands on `main`, re-run #1020's CI and merge at the exact head.
- Until #1020 merges, run the daily report from the `claude/ops-002-acceptance-monitor` branch. The `main` version (#1019) exits 0 on "no failures" and does not enforce the evidence rules.
- **Resolved 2026-10-08 by `CI-001`** (#1021, merge `d03691c4`): MLB 8 now uses verbatim fixtures plus a whole-corpus contract instead of a rolling `ready` window. The #1020 branch was refreshed by merging `origin/main`, never rebased. MLB 8 now passes there (adapters 27/27), and #1020 awaits founder approval of its final exact head.

**Monitoring coverage (PR #1020 review):**
- Data commits are recognised by `^auto[:\- ]` (2,167 of 2,167 bot commits since 09-01) plus `— automated` (`roll_to_next_day.sh`, the manual lifecycle; previously uncovered).
- A CI test parses every producer's commit subject and fails on an unrecognised one.
- Retired identities FAIL whatever their subject.
- Residual limitation: a new producer with both a new subject convention and a new identity is caught by the CI identity guard, not the runtime report.
- Expired Vercel CLI sessions now give a clear refresh instruction (`npx vercel whoami`) instead of a 403.
- Full procedure: docs/OPS_002 §6.

Limit: while the repo is public Vercel runs no team-access check, so the 7 days prove **attribution**; behaviour under private visibility rests on the one READY `github-actions[bot]` deployment during the private window plus Vercel's `type: bot`. Do not make the repo private to test it.

### Evidence (COST-001 audit, Vercel API, read-only)
- 2026-10-07 17:40Z → 23:58Z: **21 Production deployments BLOCKED**, `readyStateReason`: "the commit author doesn't have permission to create deployments for this project"; `seatBlock.blockCode: TEAM_ACCESS_REQUIRED`, `gitUserId: 58210622`.
- All blocked commits were authored `gtp-bot <bot@users.noreply.github.com>`. GitHub resolves that noreply address to an **unrelated real GitHub account `bot` (id 58210622)**; Vercel attributes the deployment to that user and applies its team-access check. Other bot identities (`gtp-mlb-production-bot`, `gtp-pregame-bot`, `github-actions[bot]`) and PR merges built normally in the same window; `gtp-bot` deployments were READY again from 2026-10-08 00:08Z (intermittent).
- Effect: bot data reached Production only when another author's commit happened to build (the ignore script diffs from the last successful deploy, so nothing was lost, only delayed). This is a **Production freshness** defect, not a cost defect.

### Scope / rules
- Inventory every workflow/script that sets the data-commit author/committer.
- Choose one identity GitHub and Vercel attribute correctly (a GitHub App bot identity or `github-actions[bot]`), verified against Vercel deployment `attribution`/`seatBlock` history.
- **Do not weaken Vercel team-access protections.** Do not rewrite historical commits or receipts.
- Update any workflow-text guard tests that pin the identity; localhost-first; change producers only (no bot-regenerated artifacts in the PR).

### Acceptance
- No `TEAM_ACCESS_REQUIRED` blocks for bot data commits over ≥ 7 days; Vercel attribution for data commits names the intended bot identity.
- Production `build-info` keeps pace with bot data commits (lag measured with `scripts/vercel-cost-report.mjs` + build-info).


## `CI-001` — MLB live-adapter test MLB 8: main-wide CI blocker (rolling-window precondition + vacuous subject)
**Priority:** P0 — main-wide `quality` failure blocking PR #1020 and every later integration  
**Status:** DONE (2026-10-08). Founder-approved merge, exact-head CI green, Production acceptance PASS  
**Owner/session:** Claude Code session 2026-10-08 (CI-001)  
**Branch:** `claude/mlb-ci-001-adapter-test-determinism` (from `origin/main` `60e05879cb4a4f47646958e9ba2555b5f78aee02`)  
**PR / exact head / merge:** [#1021](https://github.com/yashwantbalaji3/gametimepicks/pull/1021) · exact head `f842d15d47ee1f815231cda38615b637065d7cd1` · merge `d03691c445b39e03f79561e1099491a3783cce90` (2026-10-08T13:50:01Z, `--match-head-commit`)  
**Evidence:** `app/src/lib/live/adapters/adapters.test.mjs` (MLB 8, 8a, 8b, 8c); fixture `app/src/lib/live/fixtures/mlb-full-game-sims.json`  
**Production acceptance:** PASS. `dpl_Bk1ZAgxsAvZCUHTk77hrzJ9Gdyo8` READY 13:53:52Z; `/data/build-info.json` = `d03691c4` (built 13:51:27Z); key routes 200; smoke 8/9 (same pre-existing failure as COST-001 §9)

### Reproduction (current main)
- `origin/main` `60e05879` locally: `npx tsx --test src/lib/live/adapters/adapters.test.mjs` → `not ok — MLB 8 … 'no ready simulation in the last 14 slates'`. Same failure in CI on PR #1020 (run 37780742736, `quality`).

### Root cause (proven from committed artifacts)
1. **The failing line was a precondition on rolling data, not the test's subject.** MLB 8 required ≥ 1 `ready` full-game simulation among the newest 14 slate files. The newest `ready` label is 2026-09-24. The 2026-10-08 slate pushed it out of the window.
2. **`ready` became rare by design on 2026-09-25** (`80f619ce71`, board-adapter.ts). It now requires 9 batters per side with a posted-line GTP projection plus both probable starters. Under that predicate only **8 of 245** historical `ready` games qualify, and the newest is **2026-09-07**. The 09-24 `ready` labels predate the correction, and published levels are immutable by design. In the postseason, books post 6–8 batter lines per side at board time, so every game is `degraded`.
3. **The subject assertion was vacuous from the commit that introduced it** (`a790ce4810`, 2026-09-15). It claimed "the simulation emits no per-player output (`players` undefined on gamePk 824307)". In fact every simulated game since 2026-07-24, 824307 included, carries `players: { batters[18], pitchers[≤2] }`, which is an **object**. The check `Array.isArray(g.players) && g.players.length > 0` can never see that shape, so it passed on all 583 simulated games without checking anything.

### Actual simulation health (not the same thing as `ready`)
- **Full-game simulations:** 860 committed games. All re-verify against their `artifactHash`. Every `ready` or `degraded` game (583) has 10,000 runs, full winner / score / total / run-line / team-total distributions and per-player means. Since 2026-10-04: **0 `unavailable`**, all `degraded` (input completeness, not failure).
- **`ready` is an input-completeness label, not product eligibility.** It only drives the "Complete inputs" / "Degraded inputs" chip. Product gating (`simReady`, featured, daily brief) reads `gameLabSimulation.status` from `mlb/game-simulations`, which is **100% `ready` on every slate 09-22 → 10-08**.
- **Historical, already fixed:** 2026-09-04 → 10-02 end-of-day files show most games `unavailable` (e.g. 09-13 and 09-20: 15/15). Earlier same-day revisions held the pregame forecasts (09-13: 9 ready / 5 degraded). A post-first-pitch refresh erased them. Fixed by `f96e91fc94` (2026-10-03, frozen-pregame carry). Append-only prediction snapshots kept every run, so grading is intact. Not rewritten here, because historical artifacts are immutable.
- **Per-player rows are GTP simulation output, never bookmaker prices.** Inputs are the board's `projection` (e.g. 1.11 hits from a 150-game sample), not the `line` or odds. The market block is game-level and display-only.

### Implementation
- MLB 8: the live MLB adapter emits `playerStats: null` for every fixture event. Its comment now gives the real reason a live join is deferred: a bookmaker price list on one side, and per-player means that do not mark replacement-rated rows on the other.
- MLB 8a (new): a deterministic fixture of 5 verbatim games covering `ready` (current predicate) / `degraded` (no starter, confirmed with replacement-rated batters, prop-derived with filler rows) / `unavailable`. Each game must re-hash to its producer `artifactHash`, so an edited fixture cannot pass. Provenance (path, commit, hash) is in the file.
- MLB 8b (new): a shape-correct predicate with positive and negative controls. It pins that the old predicate is blind. Player rows must exactly match the `SimBatterLine` / `SimPitcherLine` keys and carry no market field (odds/price/implied/book/provider/line/point/market…). Values must be finite non-negative means. A filler row (`playerId < 0`) must be named "Lineup fallback" and nothing else may be. Every simulated level has full distributions.
- MLB 8c (new): the same contract over **every** committed slate, whatever the level. `unavailable` must carry no players and no win probability. Confirmed orders contain no fillers. Prop-derived filler count = 9 − rated. No rolling window and no dependence on any level being common.
- No `ready` status fabricated, no eligibility relaxed, no sportsbook lines inserted, no historical artifact modified.

### Acceptance
- MLB 8–8c pass on current main data. They also pass with 40 synthetic future degraded-only slates (the exact failure mode). Mutation probes caught: fixture edit (8a), odds field on a corpus player row (8c), players on an `unavailable` game (8c), filler given a real name (8c), old `Array.isArray` predicate restored (8b, 8c), live adapter emitting `playerStats` (MLB 8).
- CI unit phase locally; exact-head CI green on the PR; merge with `--match-head-commit`; one Production build; Production build-info advances to the merge SHA; key routes 200.

### Completion record (2026-10-08)
- Status: DONE
- Exact tested head: `f842d15d47ee1f815231cda38615b637065d7cd1`. quality-gate run 37783964588: `quality` success, `python` success. CI log: MLB 8, 8a, 8b, 8c ok; unit phase 9,043 pass, 0 fail.
- Scope at merge: 3 files (`adapters.test.mjs`, `fixtures/mlb-full-game-sims.json`, this roadmap). No producer, simulation, UI or data change.
- Merge SHA: `d03691c445b39e03f79561e1099491a3783cce90`
- Production build SHA: `d03691c4` (`dpl_Bk1ZAgxsAvZCUHTk77hrzJ9Gdyo8`; building 13:50:07Z → READY 13:53:52Z; aliases `gametime-picks.vercel.app`, `gametimepicks.yashwantbalaji.com`)
- Local acceptance: PASS
- Vercel Preview build count: **0** (two branch pushes; 0 Preview deployments project-wide since the COST-001 gate went live at 01:53Z)
- Vercel Production build count: **1**. It was the only deployment created 13:00Z → 13:55Z. Billed `cpuTimeForBilling` 40.0 CPU-min ≈ **$0.14** (Enhanced, $0.0035/CPU-min).
- Production acceptance: PASS. Before the merge, build-info was `60e05879` (the pre-merge main head); after, `d03691c4`. HTTP 200: `/`, `/mlb/`, `/nfl/`, `/results/`, `/today/`, `/markets/`, `/live/`, `/bank-builder/`, `/simulate/`. `/ops/` 404 with `X-Robots-Tag: noindex, nofollow, noarchive`, unchanged. `smoke-test-production.mjs`: 8/9; the one failure ("home does not reflect canonical money") is the pre-existing stale check recorded in COST-001 §9.
- COST-001 protections intact: `app/vercel.json` `git.deploymentEnabled` = `main` + `preview/**` only (unchanged); build queue `WAIT_FOR_NAMESPACE_QUEUE` (unchanged); machine `enhanced` (unchanged); no Vercel setting touched.
- Evidence path: this section; PR #1021; `adapters.test.mjs` MLB 8–8c.
- Close-out: this documentation-only update sits on `claude/ci-001-closeout` and is to be **batched** with the next integration rather than merged alone (a docs-only main push is an ignored build that still bills ≈ 16 CPU-min).

### Follow-ups
- Replacement-level batter rows are not disclosed per row in the simulated box score. Folded into **`TRUTH-001`** (provenance of visible numbers) and **`MLB-003`** (structural cause: projections exist only where a book posts a line, so `ready` is rare, 8/860). `LIVE-001` carries the dependency. No separate task, to avoid duplicate ownership.

## `OPS-001`
**Priority:** P1/P2  
**Status:** NOT_STARTED

Add dependency completion receipts, idempotent jobs, retry budgets, missing-artifact alerts, stale-but-green detection, source outage monitoring, provider capture age, market age, model age, build/deploy age, live observation latency, API/cost ceilings, rollback readiness.

**Vercel FinOps ownership:** implement/maintain `COST-001` policies across all lanes: measure preview/Production build counts and CPU charges; identify docs/data/branch-triggered waste; maintain a founder-approved spend budget, alert thresholds, and exception log. Revalidate deployment gating when build dependencies or workflows change. Do not disable legitimate current data delivery to reduce spend.

Do not conflate build freshness, capture freshness, provider observation age, market age, or model age.

---

# 19. Generated Product Truth Documentation

## `TRUTHDOC-001`
**Priority:** P2  
**Status:** NOT_STARTED

Generate current runtime inventory: sport, family, producer, model/version, maturity, display status, product eligibility, input source, last successful capture, last forecast, last settlement, degradation, owning code path.

Old handoffs/READMEs remain dated history; runtime truth wins.

---

# 20. Personal Tracking / My GameTime

## `MYGAMETIME-001`
**Priority:** DEFERRED  
**Status:** DEFERRED

When resumed: saved forecast, original line/odds, live result/progress, what changed since save, personal slips/exposure, explanation. Private user records remain isolated from public model/product records.

---

# 21. Existing handoff branch index

Reference only. Always inspect current main and handoff docs first.

- `claude/handoff-pe-1-markets`
- `claude/handoff-tr-copy-1`
- `claude/handoff-today-t1`
- `claude/handoff-nba-b-pretip-boards`
- `claude/handoff-pe-stage4-package`
- `claude/handoff-nfl-7-0-top-board-receipts`
- `claude/handoff-results-hn1`
- `claude/handoff-results-13b-ligue1`
- `claude/handoff-soccer-stage13-prep`
- `claude/handoff-ask-pr-b`
- `claude/handoff-research-entry-points-r1`
- `claude/handoff-live-today-stage9-11-prep`
- `claude/handoff-ufc-u1`
- `claude/handoff-ufc-u2-rest`
- `claude/handoff-nba-stage12-prep`
- `claude/handoff-soccer-13e-board-fit`
- `claude/ufc-saturday-9z4up5`
- `claude/arch-a1-envelope-e1-evidence-sxl22l`
- `claude/arch-nfl-ns1-ns2-e2-87uth3`
- `claude/arch-sw1-soccer-worlds-z8g61r`
- `claude/mlb-playoff-slate-receipts`

Known stale/high-conflict reference: `claude/handoff-live-today-stage9-11-prep` predates the MLB Live repair; rebuild relevant work on current main rather than blindly merging it.

---

# 22. Integration and Production policy

1. Builders may work in parallel on isolated branches.
2. Shared contract surfaces have one integration owner at a time: market identity, forecast schema, eligibility evaluator, settlement writer, shared UI contracts.
3. Only one Production-bound PR integrates at a time.
4. **Before remote PR/build/deploy:** merge latest `origin/main` (do not rebase frozen/shared evidence branches), run local targeted tests, relevant regression suites, local production build/export, and local UI validation where applicable. Batch related fixes.
5. **A PR/branch push can auto-trigger Vercel even without a manual deploy.** Verify the auto-deploy policy is active and correct before pushing. Roadmap/docs-only and shadow branches should be excluded where safe. Do not suppress data commits the deployed app needs. *(COST-001: once `app/vercel.json` `git.deploymentEnabled` is on main, only `main` and `preview/**` branches create Vercel deployments; a remote preview is requested by pushing to `preview/<task-id>` and logged in the Session Log. Every merge to `main` is a full production build.)*
6. Merge only the exact locally tested and CI-green intended head; avoid speculative remote retries.
7. Use the fewest Vercel builds consistent with safety: one controlled Production deploy per integration where possible. Any extra deployment must be justified and recorded.
8. Production acceptance verifies expected change, no unintended sport/product regressions, provenance parity, and result/accounting parity where affected.
9. Record remote preview count, Production count, reason for any extra Vercel build, and cost evidence when available.
10. Research producers never overwrite public artifact paths.
11. Never run multiple official settlement writers.
12. Never weaken tests/truth gates merely to reach green.
13. Emergency Production incidents and Vercel-only reproduction can bypass the ordinary predeploy sequence only with an explicit, bounded, logged exception; rollback path stays available.

---

# 23. Founder decisions — locked direction

Unless explicitly changed by the founder:
- Canonical forecast mandate: **YES**.
- Market-only products: allowed only as clearly labeled research/paper constructs; not the long-term flagship Bank Builder/Moonshot architecture.
- First model investment: **MLB + NFL**.
- Live rollout: factual → visualization → conditional forecast → live straights → live parlays.
- Quality bar: preregistered target/horizon-specific proper-score evaluation with uncertainty/calibration.
- Expansion: MLB/NFL foundations first; then Soccer/NBA/UFC; NCAAF/NHL after owned temporal-data foundations.
- Language: separate Model Favorite, Value Opportunity, Paper Construction, and Live Progress.
- Execution: fresh isolated Claude Code sessions; one Production integration at a time.
- No arbitrary “1,000 picks before display” rule: Experimental forecasts may display honestly; product eligibility requires evidence.
- No historical rescoring/rewrite: forward-only model evolution.
- **Localhost-first/Vercel release control: YES, founder-mandated.** Do not use Vercel for ordinary debugging. Measure and gate auto-deploy triggers before pushing implementation/roadmap updates. Batch locally and deploy approved candidates intentionally; preserve data freshness and CI/production gates.

---

# 24. Task update template

Use under the selected task:

```md
### Progress
- Status: IN_PROGRESS
- Owner/session:
- Started:
- Branch:
- Base main SHA:
- Current head SHA:
- PR:
- Scope actually implemented:
- Local tests/build/desktop/mobile evidence:
- Tests/evidence:
- Vercel Preview builds triggered:
- Vercel Production builds triggered:
- Extra remote-build reason (if any):
- Build CPU/cost evidence (if available):
- Production acceptance:
- Blockers:
- Follow-ups:
- Completed:
```

For a completed Production task:

```md
- Status: DONE
- Exact tested head:
- Merge SHA:
- Production build SHA:
- Local acceptance: PASS
- Vercel Preview build count:
- Vercel Production build count:
- Production acceptance: PASS
- Evidence path:
```

---

# 25. Session Log

Append one entry per Claude Code session. Never rewrite prior entries.

```md
## YYYY-MM-DD — <session/owner> — <task ID>
- Starting main SHA:
- Branch:
- Goal:
- Reproduced current issue/state:
- Decisions made:
- Files/contracts changed:
- Local tests/build/UX checks run:
- Result:
- PR / exact head:
- Vercel Preview / Production build counts:
- Remote-only exception and justification (if any):
- Build CPU/cost evidence (if available):
- Production acceptance:
- Roadmap tasks updated:
- Remaining blockers / recommended next task:
```

## 2026-10-07 — Claude Code (COST-001 session) — `COST-001`
- Starting main SHA: `6f913e67eb`
- Branch: `claude/cost-001-vercel-cost-control` (local; not pushed)
- Goal: measure Vercel Build CPU causes and deploy triggers; design localhost-first, low-waste deployment control without weakening data freshness or CI.
- Reproduced current issue/state: billing API shows cycle 09-09 → 10-09 at $315.52 to date (projected $339.62), Build CPU 99.9%; ~$19/day since the 09-24 Standard → Enhanced switch; 81 production + 50 preview builds/day (7-day window).
- Decisions made: previews become opt-in (`main` + `preview/**`); do **not** revert to Standard until build memory is proven < 8 GB locally; do **not** exclude bot data paths (they are real build inputs); recommend "one build per branch" queue mode; no hard spend cap (would stop data publication).
- Files/contracts changed: `app/vercel.json` (git.deploymentEnabled); `app/src/lib/vercel-preview-gating.test.mjs` (new guard); `scripts/vercel-cost-report.mjs` (new, read-only); `docs/COST_001_VERCEL_COST_CONTROL.md` (new); this roadmap added to the repo.
- Local tests/build/UX checks run: guard tests 11/11 pass; 4 mutation probes all fail the guard as intended; cost report executed against live billing. No app build needed (no rendered code changed).
- Result: audit complete; Phase 1A ready; awaiting founder approval to push/merge and for the queue-mode setting.
- PR / exact head: none yet
- Vercel Preview / Production build counts: 0 / 0
- Remote-only exception and justification (if any): none
- Build CPU/cost evidence: baseline in docs/COST_001_VERCEL_COST_CONTROL.md §7
- Production acceptance: n/a (nothing deployed)
- Roadmap tasks updated: COST-001 (status, progress, remaining tasks), §22.5, change log
- Remaining blockers / recommended next task: founder approvals (COST-001 remaining tasks 1–4); then Phase 2 local memory test; separate task for gtp-bot commit identity (21 BLOCKED production deploys 2026-10-07 17:40–23:58Z). TRUTH-001 stays NOT_STARTED until COST-001 task 1–2 verify the deploy gate.

## 2026-10-08 — Claude Code (COST-001 session, continued) — `COST-001` Phase 1 execution
- Starting main SHA: `6f913e67eb` (PR base) → merged at `f1f46556`
- Branch: `claude/cost-001-vercel-cost-control` (PR #1017, merged); closeout docs `claude/cost-001-phase1-closeout`
- Goal: execute founder-approved Phase 1 with safeguards; continue Phase 2 locally; open OPS-002.
- Decisions made: keep Enhanced (Phase 2 shows Standard unsafe); spend alerts are a founder dashboard action with pause OFF; post-merge roadmap updates batched into one docs-only PR.
- Files/contracts changed: roadmap (OPS-002, COST-002, COST-001 progress); docs/COST_001 §9–§11. No app code.
- Local tests/build/UX checks run: guard tests 11/11; two Docker 4 CPU / 7.6 GiB constrained production builds (both OOM-killed a static worker → Standard unsafe).
- Result: preview gating proven (0 deployments on branch push; control branch did deploy); exact-head CI green (run 37713335118); queue set to one build per branch (01:31:41Z); merged 01:52:28Z; post-merge main quality-gate green (run 37715075260).
- PR / exact head: #1017 / `5b8a5bff717e0dd0f086a6515ecd80d1b95f50d4` → merge `f1f46556903b4add02c654f39c3a4fc1dbb8156d`
- Vercel Preview / Production build counts: **0 / 1** (merge build `dpl_FTMcpA7YhM77nrSHTde2h3X6yhxj`, 48 CPU-min ≈ $0.17). The closeout docs PR merge is expected to create one **ignored** production deployment (no app build, ≈ 16 CPU-min).
- Remote-only exception: none.
- Build CPU/cost evidence: baseline 7-day $19.41/day, cycle projection $339.62 (docs §7); first comparison due ≈ 2026-10-16.
- Production acceptance: PASS — prod `f1f46556` then `784ab15b` (first post-merge bot data commit, READY 3m47s, no queue wait); key routes 200; `/ops/` pruned with noindex; smoke 8/9 — the failing "home reflects canonical money" check fails identically on every prod build back to 10-06 (pre-existing, unrelated; follow-up).
- Roadmap tasks updated: COST-001, OPS-002 (new), COST-002 (new), TRUTH-001 unblocked.
- Remaining blockers / recommended next task: founder sets Spend Management (docs §10) → COST-001 DONE. Then OPS-002 (bot identity, HIGH) and TRUTH-001 can proceed; TRUTH-001 is not blocked by cost controls. Follow-up: update or retire the stale smoke "home money" check.

## 2026-10-08 — Claude Code (OPS-002 session) — `OPS-002`
- Starting main SHA: `a20ec45c790b731c1db1fda0adac6f6f47a71bcf` (repo, origin, clean tree verified; local `main` was 4 behind and was not used)
- Branch: `claude/ops-002-bot-commit-identity` from `origin/main`; implementation commit `cb9561d9c4`
- Goal: find the real cause of the 21 `TEAM_ACCESS_REQUIRED` Production blocks and fix bot commit identity durably.
- Reproduced current issue/state: Vercel `GET /v6/deployments` (4,254 records, 08-20 → 10-08) plus the GitHub commits/users API. All 21 BLOCKED = `gtp-bot` → GitHub user `bot` **while `githubRepoVisibility` = private** (10-07 17:09Z → 10-08 00:08Z). 0 of 1,616 public-period `gtp-bot` deployments were blocked. Production at the start was healthy and current (build-info = `a20ec45c` = main head).
- Decisions made: one identity for all workflow commits, `github-actions[bot]` with the id-bound noreply (the same account as the `GITHUB_TOKEN` pusher). Also retired `web-flow`, `claude` and the unregistered `gtp-lifecycle@` attributions. No App, secret, seat or Vercel/GitHub setting change. Corrects COST-001's "intermittent" reading.
- Files/contracts changed: 34 `.github/workflows/*.yml` (identity strings only); `app/src/lib/ops/bot-commit-identity.test.mjs` (new); `scripts/ops-002-identity-report.mjs` (new, read-only); `docs/OPS_002_BOT_COMMIT_IDENTITY.md` (new); `docs/AUTOMATION.md`, `docs/deploy.md` (identity mentions); this roadmap.
- Local tests/build/UX checks run: guard 7/7 (fails 3 on origin/main; 5/5 mutation probes caught); js-yaml parse + structural diff of 34 workflows vs main (identical apart from identity, permissions unchanged); identity-step simulation (author = committer = bot); report script on the incident window (21 blocks, exit 2). CI unit phase (`run-suite.mjs --phase unit`) in the dev checkout: 9,039 / 9,043 pass. The 3 failures do not come from this change: the 2 `rls-live` tests fail identically on `origin/main` (they need a live DB), and `ask-official-cards` "LIVE why-words" reads a stale, git-ignored local `data/ask-projection/v1/parlays.json` (absent in clean checkouts; passes on clean main). Clean worktree of `cb9561d9c4`: **9,039 pass, 2 fail (both `rls-live`, identical on origin/main), 2 skipped**. No app build needed: no rendered code changed.
- Result: fix ready; awaiting founder approval to merge.
- PR / exact head: opened from this branch after the single push (number/head recorded in the post-merge batched update)
- Vercel Preview / Production build counts: 0 / 0 so far. Merge expected = 1 Production build (≈ $0.15–0.17).
- Remote-only exception: none.
- Build CPU/cost evidence: n/a until merge; the identity report and `vercel-cost-report.mjs` are both read-only.
- Production acceptance: PENDING. Cutover + 7-day observation per OPS-002 "Remaining acceptance".
- Roadmap tasks updated: OPS-002 (status, progress, remaining acceptance), priority table, change log.
- Remaining blockers / recommended next task: founder merge approval for OPS-002. Founder follow-ups F1 (local `gtp-ops` identity ownership) and F2 (why the repo went private on 10-07). Next roadmap task: **TRUTH-001** (P0, unblocked). The OPS-002 observation does not block it.

## 2026-10-08 — Claude Code (OPS-002 session, continued) — `OPS-002` merge + Production verification
- Starting main SHA: `a20ec45c79` (PR base). Main unchanged at merge time.
- Branch: `claude/ops-002-bot-commit-identity` (PR #1019, merged) · follow-up `claude/ops-002-acceptance-monitor`
- Goal: founder-approved conditional merge (exact head, all CI green). Verify the first real bot data commit. Make the seven-day acceptance unable to pass on absence of evidence.
- Decisions made:
  - Merged only after exact-head CI was green: run 37723793669, `python` ✓ 03:41:30Z, `quality` ✓ 03:59:44Z. Used `gh pr merge --merge --match-head-commit f4cc4b88…`.
  - Waited for a genuine scheduled data commit; created no synthetic commits.
  - Built the monitoring improvement on a separate branch so the approved head stayed untouched.
- Files/contracts changed (follow-up branch):
  - `scripts/ops-002-acceptance.mjs` (new, pure verdict)
  - `scripts/ops-002-identity-report.mjs` (now exits with the verdict)
  - `app/src/lib/ops/ops-002-acceptance.test.mjs` (new, 8 tests)
  - docs/OPS_002 §6, this roadmap.
- Monitoring improvement (founder requirement): PASS now requires all of the following. Otherwise the result is FAIL 2 / NOT_YET 3 / STALE 4.
  - ≥ 7 days since cutover.
  - ≥ 1 READY `github-actions[bot]` data deployment in **every** 24 h slot.
  - No block and no foreign identity.
  - Positively verified freshness: live build-info = newest READY build, `main` head deployed, nothing errored, blocked or pending > 30 min.
- Local tests/build/UX checks run: acceptance tests 8/8 + identity guard 7/7. The acceptance tests catch 6/6 mutation probes, including restoring the old "pass when no failures" logic (3 fail). Report run live at the cutover gave NOT_YET (correct). No app build needed.
- Result: **merged `f65e7656` (04:03:07Z).**
  - Merge deployment READY 04:06:50Z, 40 CPU-min ≈ $0.14; key routes 200; post-merge main quality-gate ✓.
  - **Cutover 2026-10-08T05:56:44Z:** `851ecc75` (`auto: nba results capture`) authored and committed as `github-actions[bot]`. Vercel `dpl_BjrG1yjNziJ91VNqAnRv3nKASiSS` attributes it to `github-actions[bot]` (id 41898282, type bot), no seatBlock, READY 06:00:34Z. Production build-info = `851ecc75`. Only the NBA results files changed.
- PR / exact head: #1019 / `f4cc4b885b171e55de7c2c509cc6d7d0d1e6b9dd` → merge `f65e7656afc21f59b959aafb06a25f46e530a8e9`. The follow-up PR (acceptance monitor + these records) is opened from `claude/ops-002-acceptance-monitor` and awaits founder approval to merge.
- Vercel Preview / Production build counts: **0 / 1** for OPS-002 (plus genuine bot data deployments, which happen anyway).
- Remote-only exception: none.
- Build CPU/cost evidence: merge build 2,400,000 ms `cpuTimeForBilling` = 40 CPU-min ≈ $0.14 on Enhanced.
- Production acceptance: initial verification **PASS**; seven-day acceptance **NOT_YET**. Window 2026-10-08T05:56:44Z → earliest 2026-10-15T05:57Z. OPS-002 stays IN_PROGRESS.
- Roadmap tasks updated: OPS-002 (header, production verification, remaining acceptance), priority table, change log.
- Remaining blockers / recommended next task:
  - Run the daily report through 2026-10-15; mark OPS-002 DONE only on `PASS`.
  - Founder: approve or merge the follow-up PR (≈ 1 build, ≈ $0.14, often absorbed by the next bot data build).
  - Founder follow-ups F1 and F2 are still open.
  - Next roadmap task: TRUTH-001. Not started in this session, per founder instruction.

## 2026-10-08 — Claude Code (CI-001 session) — `CI-001`
- Starting main SHA: `60e05879cb4a4f47646958e9ba2555b5f78aee02` (fetched; branch created from `origin/main`)
- Branch: `claude/mlb-ci-001-adapter-test-determinism`
- Goal: find the real cause of the main-wide MLB 8 failure blocking PR #1020 and fix it without fabricating readiness, relaxing eligibility or touching historical forecasts.
- Reproduced current issue/state: MLB 8 fails on `60e05879` locally and in CI (run 37780742736) with "no ready simulation in the last 14 slates". The newest `ready` label is 2026-09-24; the newest `ready` under today's predicate is 2026-09-07 (8 of 245).
- Decisions made: (1) The red line was a rolling-data precondition. The subject check had been vacuous since `a790ce4810`, because the predicate looked for an array while `players` is an object, present on all 583 simulated games. (2) Do not chase `ready`. It is an input-completeness label; product gating reads `gameLabSimulation`, which is 100% ready. (3) Replace with hash-verified verbatim fixtures (8a/8b) plus a status-agnostic whole-corpus contract (8c). (4) The pre-10-03 `unavailable` erasures were already fixed by `f96e91fc94`; documented, not rewritten. (5) The per-row replacement-rate disclosure gap is out of scope. It is folded into `TRUTH-001` and `MLB-003` (founder direction, same session, before merge).
- Files/contracts changed: `app/src/lib/live/adapters/adapters.test.mjs` (MLB 8 rewritten; 8a/8b/8c new); `app/src/lib/live/fixtures/mlb-full-game-sims.json` (new, 5 verbatim games with provenance); this roadmap. No producer, UI or data change.
- Local tests/build/UX checks run: adapters.test.mjs 27/27. MLB + full-game-sim + live suites 726/727; the 1 is a `BUILT EXPORT` post-build test that needs `out/`. CI unit phase (`run-suite.mjs --phase unit`): 9,043 / 9,047 pass, 1 skipped, 3 failures that are local-only and in untouched files (2 `rls-live` need a live DB; `ask-official-cards` reads a stale git-ignored local file; all documented by the OPS-002 session). `tsc --noEmit` 0. Mutation probes 6/6 caught; the failure scenario (40 future degraded-only slates) passes. No app build: no rendered code changed.
- Result: fix ready; PR → exact-head CI → merge → Production verification.
- PR / exact head: reported in the session hand-off; recorded in the next batched roadmap update
- Vercel Preview / Production build counts: 0 Preview (branch gated by `git.deploymentEnabled`); merge expected = 1 Production build (test file under `app/src/` is a build input).
- Remote-only exception: none.
- Build CPU/cost evidence: ≈ $0.14–0.17 for the one merge build (COST-001 measured rate).
- Production acceptance: PENDING. Merge build READY; build-info = merge SHA; key routes 200.
- Roadmap tasks updated: `CI-001` (new); the replacement-level disclosure finding is recorded under `TRUTH-001` (disclosure), `MLB-003` (coverage) and `LIVE-001` (dependency), with no new task ID; priority table; change log.
- Remaining blockers / recommended next task: after merge, rebase/re-run PR #1020 (OPS-002 follow-up). Then `TRUTH-001`. The `TRUTH-001` box-score item comes before any `LIVE-001` MLB player join.

## 2026-10-08 — Claude Code (CI-001 session, close-out) — `CI-001`
- Starting main SHA: `60e05879cb` → merged `d03691c445`
- Branch: `claude/mlb-ci-001-adapter-test-determinism` (merged); close-out docs: `claude/ci-001-closeout` (not merged; batch with the next integration)
- Goal: founder-approved merge of #1021 with exact-head verification, then controlled Production acceptance.
- Reproduced current issue/state: exact head `f842d15d47` green on both checks (run 37783964588); scope 3 files; mergeable CLEAN.
- Decisions made: merged with `--match-head-commit`. DONE record kept off `main` until the next batch, per founder instruction.
- Files/contracts changed: this roadmap only (CI-001 → DONE).
- Local tests/build/UX checks run: none needed (no code change in the close-out).
- Result: CI-001 DONE.
- PR / exact head: #1021 · `f842d15d47` → merge `d03691c445`
- Vercel Preview / Production build counts: 0 / 1
- Remote-only exception: none.
- Build CPU/cost evidence: merge build 40.0 billed CPU-min ≈ $0.14. Cycle to date $329.89, projected $340.12 (`vercel-cost-report.mjs --days 1`).
- Production acceptance: PASS (see CI-001 completion record).
- Roadmap tasks updated: CI-001 (DONE), priority table.
- Remaining blockers / recommended next task: re-run CI on #1020 (OPS-002 follow-up) on top of `d03691c4`. Next roadmap task: `TRUTH-001`, which now includes the MLB box-score replacement-level disclosure item.

## 2026-10-08 — Claude Code (OPS-002 session, resumed) — `OPS-002` PR #1020 refresh
- Starting main SHA: `f08ddfd1f44d9ff3a3770e27fc300ce5a4033c89` (contains CI-001 merge `d03691c445b39e03f79561e1099491a3783cce90`)
- Branch: `claude/ops-002-acceptance-monitor` (PR #1020), previous head `45a628dfa4`
- Goal: un-block #1020 after CI-001; refresh against main without losing the monitoring work or roadmap history; fold in the pending CI-001 `DONE` records without a docs-only deployment.
- Decisions made:
  - Merged `origin/main` into the branch; no rebase, so pushed history is preserved. The only conflict was in this Session Log: both sides had appended an entry. Both were kept in chronological order, unedited.
  - Merged `claude/ci-001-closeout` (`759247c2e4`, roadmap only, based on `d03691c4`) cleanly. Against that branch, this file differs only where OPS-002 status lines were superseded; every CI-001 record is retained. CI-001's `DONE` record therefore reaches `main` with #1020's single merge, with no separate documentation deployment.
- Files/contracts changed: this roadmap only (merge resolution, the #1020 blocker marked resolved, this entry). No script, test, workflow, app or Vercel config change in this step.
- Local tests: adapters 27/27 (MLB 8 + 8a/8b/8c green). OPS-002 + COST-001 guards 28/28. CI unit phase: see the hand-off.
- Result: #1020 ready for exact-head CI → founder approval of the final head → merge (≈ 1 Production build).
- Vercel Preview / Production build counts this step: 0 / 0.
- Production acceptance: unchanged. The OPS-002 seven-day observation continues from cutover 2026-10-08T05:56:44Z; status IN_PROGRESS, not DONE.

## 2026-10-08 — Claude Code (NFL World Model V2 session) — `NFL-001` → `NFL-005` (founder priority override)
- Starting main SHA: `629cfbf494bb2ca2809af5e379abaa56901e49f9` (fetched 15:33Z; isolated worktree `.claude/worktrees/nfl-world-model-v2-priority-79e413`, branch `claude/nfl-world-model-v2-priority-79e413`)
- Goal: founder-approved override — NFL-001..005 ahead of TRUTH-001; strongest defensible Week 5 forecasts, TB @ DAL first.
- Roadmap: §2 reordered per the founder (NFL-001..005, TRUTH-001, CONTRACT-001, MLB-001..005, then the remaining queue); COST-001/OPS-002/NCAAF-001 kept as standing parallel lanes; Week 5 milestone added in §8. No task ID, acceptance criterion or prior record changed.
- Reproduced current state (NFL-001): champion = MOV-Elo win head + HFA-Elo margin head + v3 totals; published win % is analytic and disagrees with its own 10,000 draws (PHI@JAX 0.659 vs 0.524); Sim V2 does not beat the incumbent (winner LL worse, CRPS tied) and is anchored to the champion; team heads are blind to availability (TB@DAL: Mayfield Out → a 16.6pp "lean" toward TB); London PHI vs JAX given JAX home field; Daniels 116 pass yds from a relief share; "won in 10,000 simulations" copy on an analytic number.
- Decisions: NFL-002 ladder preregistered and scored once (L6 win REJECTED, margin ELIGIBLE, totals REJECTED → incumbent retained, nothing promoted); Week 5 ships truth fixes only (disclose/withhold, venue identity, passer floor, copy) — no model change; spread/total probabilities per game not published while win and margin come from different ratings.
- Files/contracts: `app/src/lib/sports/nfl/{team-ladder-v2,team-input-coherence}.mjs` (+tests); `board-roster-integrity.mjs` (applyPasserShareFloor, coverage); `output-state.mjs` (withheld comparison ⇒ no lean); `win-margin-heads.mjs` (neutralSiteOf); `game-sim.mjs` (opt-in neutral); `build-nfl-public-forecasts.mjs`, `build-nfl-player-board.mjs`, `ops/forecast-input-state.mjs`; NFL game/hub/week pages, `player-board.tsx`, `simulate/presentation/nfl.ts`; research `scripts/research/nfl/{replay-team-ladder,capture-team-ladder-forward}.mjs`; receipts under `data/internal/research/nfl/reports/nfl-002-*` and `team-ladder-forward/`. No forecast contract redesign (CONTRACT-001 untouched): new fields are additive (`teamInputs`, `withheldPassers`, `integrity.passerShareFloor`, `marketComparison.state = WITHHELD_TEAM_INPUTS`).
- Local tests/build/UX: unit suite 9,068/9,072 (2 failures = `rls-live` needs a local Postgres binary; environment); typecheck clean; new tests 22 + 8/8 mutation probes caught; scratch e2e at one clock vs `origin/main` producers: 1/15 forecast summaries changed (PHI vs JAX), 3 player rows changed, board audit 0, roster audit 0. Local production build `npm run build` PASS (2,766 pages, next-build 117–139 s, 16 GB machine); post-build suite 673/676, 0 failures (3 skips), on both the committed data and an overlay of the regenerated Week 5 artifacts. Static-export visual QA (mobile 784 px and desktop): TB@DAL disclosure + withheld comparison + withheld Daniels passing line; PHI vs JAX "PHI 22 — 21 JAX", PHI 48.8% / JAX 48.4%; `/nfl` no lean; 0 console errors; no horizontal overflow. Sim V2 protocol A rerun identical to its receipt.
- Result: READY_FOR_REVIEW (Week 5 truth package); NFL-002 IN_PROGRESS; NFL-003/004/005 NOT_STARTED with findings recorded.
- PR / exact head: (filled at push)
- Vercel Preview / Production build counts: 0 / 0 so far (branch `claude/*` is not deployed by `git.deploymentEnabled`). Expected on merge: 1 Production build.
- Production acceptance: pending founder approval + merge; the forecast changes reach `/nfl` on the next event-window run before kickoff (or a free manual `nfl-event-window` dispatch with `skip_odds=true`).
- Roadmap tasks updated: §2, NFL-001..005, Week 5 milestone, policy change log.
- Remaining blockers / next: founder approval; post-kickoff grading of L6 forward receipts; NFL-003 allocation model; NFL-004 single ATD number; NFL-005 single-distribution win/margin.

## 2026-10-08 — Claude Code (NFL World Model V2 session, close-out) — Week 5 release of `NFL-001`/`NFL-002` findings
- Starting main SHA: `684506ba25` at PR open; merge `902583b101831d634e7dc0605d2ad0c952cf5962`; close-out branch `claude/nfl-world-model-v2-closeout` from `c990ac0ddc` (records only — not merged on its own; reconciles with the next NFL implementation PR, as CI-001's close-out did).
- Goal: founder-approved integration of #1022 as a Week 5 correctness release; Production verification before TNF.
- Pre-merge re-check (17:07Z): PR head unchanged `0e01d413cb`; CI run 37809110362 `python` ✓ `quality` ✓ on that SHA; MERGEABLE/CLEAN; diff vs main = the 27 files of this session; disclosure, neutral-site and passer safeguards present at the exact head.
- PR / exact head: [#1022](https://github.com/yashwantbalaji3/gametimepicks/pull/1022) / `0e01d413cb2f4b71ec96ab0287f1c138e0af737a` → merge `902583b101` (17:08:37Z, `--match-head-commit`).
- Vercel Preview / Production build counts: Preview **0** (no deployment from the branch, none on any branch 15:30Z→17:30Z). Production: **1** for the merge (`dpl_8HVn1D2T18UGRKLRawW7J2ogXkCt`, 40 CPU-min ≈ $0.14) + the data commit from the one zero-credit event-window dispatch (`54ad287c6f`, `dpl_7ppq1cBe8DoH7Ast5gW5FiN2BKgy`, billing pending at read time).
- Remote-only exception: the manual zero-credit `nfl-event-window` dispatch (run 37815894943) — justified to verify the regenerated Week 5 artifacts before TNF; no odds credits; the scheduled refreshes would have regenerated the same artifacts ~22:15Z.
- Production acceptance: PASS — see the Week 5 milestone record in §8 (live TB @ DAL, CHI @ GB, PHI vs JAX, `/nfl`; freeze selection).
- Roadmap tasks updated: Week 5 milestone; NFL-002 founder decision; this entry.
- Remaining / next: grade L6 forward receipts after finals; `NFL-003` → `NFL-005` local-first under their acceptance criteria; any further release is its own tested PR + founder approval.

## 2026-10-08 — Claude Code (NFL World Model V2 session, continued) — `NFL-003`, `NFL-004`, `NFL-005` development
- Branch: `claude/nfl-003-005-world-model` (local-first; stacked on `claude/nfl-world-model-v2-closeout`); no PR, no deployment.
- Goal: founder direction after the #1022 release — substantial, validated progress on coherent player distributions, TD modelling and shared worlds; no promotion.
- Protocol: no unspent historical window exists for player families (2014–21 spent by P299/P300/P301; 2022–25 dev), so every candidate was registered before computation as a DEVELOPMENT look on identical incumbent rows, able only to earn PROCEED_TO_FORWARD; eligibility requires the blind 2026 forward test.
- Results (all committed receipts under `data/internal/research/nfl/reports/`): NFL-003 allocV1 PROCEED ×4 (pass yds MAE 66.97 → 62.44); NFL-004 rzTdV1 PROCEED (log loss 0.50435 → 0.50295; top decile fixed); NFL-005 Sim V2 + allocV1 DO_NOT_PROCEED ×4 (coherent, less accurate); NFL-005 allocation worlds PROCEED_TO_FORWARD_SHADOW ×4 (coherent, non-inferior). Incumbent engines reproduced their receipts exactly in every run.
- Files: `scripts/research/nfl/{build-player-redzone-v1,replay-opportunity-allocation,replay-redzone-td,replay-shared-worlds,replay-allocation-worlds}.mjs`; `data/internal/research/nfl/replay/player-redzone-v1.json.gz`; five registrations + five receipts. No `app/` change.
- Vercel Preview / Production build counts: 0 / 0.
- Remaining: blind 2026 forward capture (spec in NFL-005 above); couple world volume to the team score worlds; TD scorer inside the worlds; one public ATD number.

## 2026-10-08 — Claude Code (NFL World Model V2 session, Week 5 full-priority directive) — `NFL-002` → `NFL-005`, Week 5 milestone
- Founder directive (≈18:10Z): full engineering focus on Week 5 before TNF; no TRUTH-001/CONTRACT-001/MLB work; no unnecessary deployments.
- Built and registered before scoring: `nfl-game-worlds-v1` (score from the published heads, TD | points, game-script volume, opportunity-gated scorers) → players PROCEED_TO_FORWARD_SHADOW ×4, world TD scorer DO_NOT_PROCEED. 2026 player-games from committed sources; prospective capture tool + grader.
- Week 5 prospective captures (private, immutable, pushed): #1 18:21Z (allocV1, rzTdV1, allocation worlds), #2 18:27Z (+ game worlds). #3 after TNF inactives (pending).
- Release decision (evidence-based): **no model release** — every V2 candidate is development-tier; the "expected statistical summaries" disclosure stays. One truth fix shipped instead:
  - [#1023](https://github.com/yashwantbalaji3/gametimepicks/pull/1023) End Zone Vault shows / selects / ranks from the board's published anytime-TD family (was a second "our model" number: Javonte Williams 62.5% vs 72.5%). Founder truth review found two genuine issues on head `45794c242b` (pool still from the role-share roster — 25 eligible players missing, count 147 vs 172; inaccurate "simulated scoring distribution" / "one number across the site" copy); fixed on head `ce1bd46a5c` (172 candidates = 172 eligible board players, 0/12 differ, 0 questionable). Founder approved merge at that exact head conditional on green CI.
- **#1023 merged** at exact head `ce1bd46a5c` (CI run 37829253371: `python` ✓ `quality` ✓ on that SHA; MERGEABLE/CLEAN; same 3 files) → merge `ab2aa3a010e9ae27c207d767d4f18bb3fbe51c59` at 19:29:06Z (`--match-head-commit`). Deployment `dpl_33ShkFjSHsW18uXimHHsSrspTu13` READY 19:35:11Z; its own and Production `build-info` = `ab2aa3a0`; 64 CPU-min ≈ $0.22.
- Vault data: the live page briefly carried the new copy over the old data (a false "same as the board" claim), so ONE zero-credit `nfl-event-window` dispatch was run at 19:36Z (run 37833227448; no other window was running) → `e9ac36125` (Vault 172 candidates, ledger entry unchanged, roster audit 0) → Production 19:40:00Z. Live `/endzone-vault`: "172 players cleared the minimum … the 12 above are the highest", Javonte Williams 72.5% = game page; deployed artifact 12/12 rows equal the boards, ranked by the displayed number, 0 Questionable/Out listed (Swift, Bowers withheld with designation); no new accuracy/calibration claim.
- Vercel today from this session: Preview **0**; Production builds: #1022 merge 40 CPU-min, 17:21Z dispatch data commit 48 CPU-min, #1023 merge 64 CPU-min, 19:36Z dispatch data commit (billing pending at 19:44Z).
- **World Model V2 full simulation engine directive (≈19:55Z):** built the coherent game-world engine, per-game artifacts, experimental game pages and simulation-derived Top boards on `claude/nfl-world-model-v2-sim` from `main` `907a698e4f`. Research-side input exporter and TD diagnosis committed on `claude/nfl-003-005-world-model` (`8be895d99d`, `6f32bfa7f5`). The TB@DAL post-inactives watcher was left running; the frozen captures are untouched. Release path A (experimental display) awaits founder approval; path B (promotion) is not proposed.
- **#1027 merged** at exact head `71dba8c4c8` (CI run 37864467401 `python` ✓ `quality` ✓; MERGEABLE/CLEAN; 33 in-scope files) → `a4b200c4a2` 00:48:24Z; Vercel Production `ELLXQ612w2vqZGwqQNfsMowpGqpp` READY 00:52Z (~4 min); build-info `a4b200c4`.
  - Live during TB @ DAL: 48 priced rows on the game page, the precise results note, the /live source note and the TD wording.
  - Exact CPU charge needs the dashboard login.
- **Week 5 capture #3:** `v2-candidates-forward/2026-week05-20261008T2324Z.json`, 23:24:01Z, after the 23:21Z post-inactives refresh; 15 games, 0 refused; research branch `12650411a1`. Captures #1/#2 unchanged.
- **Refresh note:** the 01:00Z window re-simulated 14 unstarted games although availability was unchanged.
  - Cause 1, one-time: the first automated packet dropped the started TB @ DAL, so the whole-packet legacy key no longer matched. New runs carry per-game keys.
  - Cause 2, recurring: the margin sigma is derived from the forecast's simulated p10/p90, which jitters by about 0.4 between regenerations.
  - Fix in its own PR: a tolerance on head sigmas. TB @ DAL was untouched (frozen at kickoff).
- **#1024 launched (founder launch decision, experimental public integration):**
  - Pre-merge checks at exact head `6af3b00a51`: CI run 37838853725 `python` ✓ `quality` ✓; MERGEABLE/CLEAN; 46 in-scope files with no forecast, board, Vault, injury or capture file.
  - All 15 artifacts rebuilt from the engine with their recorded seeds came out identical. TD marginals are absent. The frozen captures are unchanged: one commit each, sha `2f269a14…` and `a1078a7c…`.
  - Merged with `--match-head-commit` → `aed2872f85edccd7f8b579608b8fbea94d54946b` at 20:52:50Z.
  - Vercel Production `dpl_3FC4ruwLRf9zTWbrYvZvjwbYf21S` READY at 20:58Z. Preview **0**; odds credits **0**.
  - Production parity: 15/15 `/nfl/world-model/[eventId]` pages match their artifacts (win chances, simulation id, version, disclosures, players, game-page link); 40/40 `/nfl/world-model/` board rows equal `topBoards` over the committed artifacts.
  - Mobile 375 px: no page-level horizontal scroll.
  - Gap found: the `/nfl` hub had no entry point. Fixed by a separate discovery PR (one hub card, tested) awaiting approval.

### 2026-10-09 — Friday master directive (P0 NFL verification and first V2 review, P1 UX and roadmap)
- **Clock:** started 13:28Z. `origin/main` = `0afbdc78d3`.
- **Friday 13:00Z event window: IN PROGRESS (not yet delivered).**
  - At 13:41Z there was no run after `37867518729` (01:00Z).
  - The scheduler's measured latency is a median of 2h52m.
  - No duplicate was dispatched.
  - 2.2.0 is deployed (`e3368f0043`). Its one-time regeneration of the 14 unstarted games will happen in that run.
- **TB @ DAL review (NFL-005; branch `claude/nfl-wm2-review-tb-dal` `002707290e`):**
  - Final TB 24–16 (FINAL_PROVISIONAL).
  - The primary record was reproduced exactly.
  - Findings and classifications are in §NFL-005.
  - Grading is not yet in the repository (latency); it is verified correct in scratch.
- **Sunday readiness (main's data at 13:11Z):**
  - 14/14 upcoming games are simulated (2.1.0, 01:00Z).
  - QB assumptions are consistent with injuries (CHI Bagent with Caleb Williams Out at 14:28Z on Oct 8).
  - 5 boards × 10 rows, with 50/50 board rows matching their game pages.
  - No Q/D/OUT player on any board; passing TD and first TD are withheld.
  - Injuries are as of 01:00Z, and Friday reports arrive with today's windows.
  - The 13:30Z Sunday London game relies on the Saturday sweep plus `nfl-kickoff-refresh`, which runs every 30 minutes from 09:00Z Sunday.
- **UX-001:** #1031 `920faf4a9a`, #1032 `529c6f0720` and #1033 `26920ece4b`: all CI green on their exact heads, MERGEABLE/CLEAN, and they merge cleanly in sequence. The combined tree (all three on main) builds and passes 9,802 unit tests; the only 2 failures need a local Postgres. Each awaits founder approval.
- **Roadmap:**
  - Stage annotations were added.
  - Statuses reconciled with evidence: NFL-002 (section line), NFL-003, NFL-004, NFL-005, LEDGER-001, RESULTS-001, UX-001 and LIVE-001 are now IN_PROGRESS, with stages.
  - OPS-002 is unchanged: IN_PROGRESS until its acceptance on or after 2026-10-15.
- **Cost:**
  - Preview 0.
  - Production deployments from this session: #1028, #1029 and #1030 merges (Oct 9, earlier) only.
  - COST-001 finding: 34 of 39 recent Production deployments were automated data commits.
  - Odds credits 0.

### 2026-10-09 (afternoon) — founder decisions: #1031, COST-001 P0, runtime Results direction
- **#1031:** merged and verified (UX-001 entry). #1034 (WebKit and locale hydration) is open, awaiting approval.
- **COST-001 P0:**
  - About 480 builds a week, 80% from bot data commits, 55% superseded within 10 minutes.
  - Stage A (event-window single push; NBA publishable-only commits) is on `claude/cost-001-coalesce-builds`.
  - The deferral marker and the MLB lineup idempotency fix are proposed, pending founder decisions.
- **Runtime Results:** the pilot direction is approved (Vercel Blob, NFL World Model V2 grades first). It is local design and validation only until separately approved.
- **This documentation** (the TB @ DAL review, the settlement assessment, the status reconciliation) reaches `main` with the Stage A PR. No documentation-only build.

### 2026-10-09 (late afternoon) — #1034, #1033 and #1035 merged; Friday refresh verified
- **Merges, one at a time, each verified in Production before the next:**
  - #1034 → `646c75b3ae`
  - #1033 → `627eea577b`
  - #1035 → `cd9a6a7e88`

  The records are in UX-001 and COST-001.
- **Friday NFL refresh:** run `37956745466`, dispatched by sport-schedules on the injury change. 2.2.0 regenerated the 14 unstarted games; TB @ DAL is frozen; boards match their game pages. Details are under NFL-005.
- **Grading-order defect:** found and fixed in #1036 (awaiting approval). TB @ DAL will be graded by the next window run either way.
- **Cost:** Preview 0. Production deployments from these merges: one each. The #1035 effect is measured from its first post-merge runs, against the 70.2/day baseline.

### 2026-10-09 (evening) — Claude Code (Lane A, Core Intelligence) — `TRUTH-001`
- Starting main SHA: `3e8aa34d71` (fetched; isolated worktree `.claude/worktrees/gametimepicks-core-intelligence-ebaedd`, branch `claude/truth-001-mlb-truth`; tree clean; main unchanged at the end of the session's local work).
- Isolation: Lane B (NFL operations, UX-001, COST-001) and DP's NCAAF lane untouched. No NFL, UX, workflow or Vercel file changed.
- Goal: founder directive (Core Intelligence mission) — TRUTH-001 first, then CONTRACT-001, then MLB-001 → MLB-005.
- Reproduced current state: six read-only audits against committed artifacts; findings and classes in the TRUTH-001 section (A1–A8, B1–B7, C1–C5, D1–D3).
- Decisions made: MLB first (highest public-correctness risk among confirmed defects, two of them producer-side); fix the producer or the shared rule rather than the display where possible (A2 producer, A1 shared `homeCoverProbability`, A5 shared `simProvenance`); never rewrite published artifacts (A4 flag forward-only, older games state the count without guessing rows); A8 and D1 go to the founder.
- Files/contracts changed: `pipeline/mlb/generate_mlb_board.py` (+ new test, runner list); `app/src/lib/mlb/full-game/{types,board-adapter,simulate,input-snapshot}.ts|mjs`, new `market-overview.ts`, `box-score-rates.ts`, `sim-provenance.ts`; `app/src/lib/{sim-frequency.ts,game-lab/mlb-report.ts,home/game-answers.ts,mlb/prediction/{story,slate}.ts,simulate/presentation/mlb.ts}`; components `game/mlb-full-game-report.tsx`, `game/mlb-simulation-report-v2.tsx`, `entity/{index,simulation-card}.tsx`. Contract change: `SimBatterLine.rateSource` optional (additive), `adapters.test.mjs` MLB 8c accepts and checks it.
- Local tests/build/UX checks run: see TRUTH-001 "Local validation" (unit 9,143/9,147 with the 2 known `rls-live` env failures; Python 90/90; tsc clean; mutation probes caught on every new rule; server render of real artifacts). Local production build: recorded below when complete.
- Result: TRUTH-001 PR 1 ready for PR; TRUTH-001 stays IN_PROGRESS (B and C items, founder decisions A8 and D1).
- PR / exact head: code head `6c7f81e2ea`; PR number at push.
- Vercel Preview / Production build counts: 0 / 0 (nothing pushed yet; `claude/*` branches are not deployed).
- Remote-only exception: none.
- Production acceptance: n/a until approved and merged; MLB pages are latent (0 games today).
- Roadmap tasks updated: TRUTH-001 (status, audit, PR 1, founder decisions), priority table, MLB-003 (identity share of the coverage gap), LIVE-001 (per-row flag).
- Remaining blockers / recommended next task: founder approval of PR 1 and decisions A8/D1; next TRUTH-001 PR = product-state (B1–B6) and Results (C1–C3) truth; then CONTRACT-001 inventory (B7 is its first input).

### 2026-10-09 (night) — Claude Code (Lane A) — `TRUTH-001` founder decisions, #1037 release, #1038 safeguard
- Founder decisions: #1037 approved at `dbe65178` (with "≈" on 14 archived NFL preseason pages); forecast-of-record Option B; historical recovery approved to develop; #1038 safeguard required; product-truth direction approved; CONTRACT-001 lead = Lane A.
- #1037: all pre-merge conditions re-verified; merged `20910052` (22:05:39Z, `--match-head-commit`); Vercel Production Ready; build-info `20910052`; Production acceptance PASS (see TRUTH-001 PR 1 release record). Preview 0; Production builds 1.
- #1038: restriction inheritance added (`a3c1ed42a6`); merged `origin/main` (with #1037) and this roadmap update; awaits exact-head CI and founder approval. Not merged.
- PR 3 product truth: 5 commits local on `claude/truth-001-product-truth` (`2a6a1c2ef9`, `4e278490fb`, `ae531656fe`, `d8b919b08f`, + no-games-day states); unit phase on Node 20.4.0 9,136 pass / 2 known env failures (before the no-games-day commit).
- Recovery: investigation complete (231 / 8 / 4, 27 tight); BAL @ NYY 823491 publication-timing case verified.
- Next: finish PR 3 (B3, B6, validation) → open; build PR 4 (recovery + 823491 correction) as append-only, quarantining tight cases; CONTRACT-001 event-id test.

### 2026-10-10 — Claude Code (Lane B, NFL operations) — #1036 release record; Results parity §1b fix
- **#1036:** merged and verified in Production. The release record and the post-merge window runs are under NFL-005.
- **First post-#1035 window** (run `37974332405`, 18:35Z):
  - one push and one deployment (`8e88377c70`);
  - TB @ DAL graded one window late, as #1036 predicted;
  - BAL passer Huntley, with Lamar Jackson OUT.
- **Single push confirmed** on all four post-#1035 window runs: one Production deployment each, 0 Preview.
- **Main-wide CI failure** (reported by Lane A; it blocked #1048):
  - The NFL graded-picks record became `recordBasis: "MIXED"` in the nightly settle at 09:25Z (`78758d6f46`). Its bases: 105 historical model-favored picks plus TB @ DAL, the first pick on the frozen published side.
  - Stage 3D deliberately emits no pooled projection cell for a mixed record. Parity test §1b still demanded a cell.
  - Fix: the test asserts the rule itself. A MIXED owner gets no pooled cell, has no top-level hit rate, and its `byBasis` rows sum exactly to its counts. Every other owner keeps the exact count match.
  - A mutation that re-enables the pooled cell fails the test.
  - The producer is unchanged. Splitting the bases is the intended Stage 3D behaviour.
- **Cost:** 41 Production deployment events from 19:17Z Oct 9 to 11:30Z Oct 10, including Lane A's merges.
  - These are events, not builds. Ignored deployments are not yet replayed out, so this is not a build count and no saving is claimed.
  - The 7-day comparison against 70.2 builds/day continues. Billed CPU needs the Vercel dashboard (founder).
- **Sunday (P0):** 14/14 Week 5 games are on 2.2.0. The kickoff refresh runs every 30 minutes from 09:00Z. PHI @ JAX (London) kicks off at 13:30Z. CHI's Caleb Williams is QUESTIONABLE.

---

# 26. Immediate execution waves

## Wave A — start now
1. **`COST-001`** — inspect actual deployment triggers and establish safe no-waste auto-deployment gating before any normal GitHub push, PR preview, or application implementation release.
2. `TRUTH-001`
3. `CONTRACT-001`
4. `LEDGER-001`

## Wave B — parallel after contract shape stabilizes
5. `UX-001`
6. `RESULTS-001`
7. `MLB-001` / `MLB-002`
8. `NFL-001` / `NFL-002`
9. `TEMPORAL-001`

## Wave C
10. `PRODUCT-001`
11. `PRODUCT-002`
12. `PRODUCT-003`
13. `PARLAY-001`

## Wave D
14. `LIVE-001`
15. `LIVE-002`
16. sport-hub rollouts beyond the prototype
17. `OPS-001`

## Wave E
18. `LIVE-003`
19. `LIVE-004`
20. `LIVE-005`
21. broader Soccer/NBA/UFC world-model promotion
22. NCAAF/NHL after temporal-data readiness

---

## Roadmap policy change log

- **2026-10-08 — Founder priority override (NFL World Model V2):** `NFL-001` → `NFL-005` move to the top of the queue, then `TRUTH-001`, `CONTRACT-001`, `MLB-001` → `MLB-005`; this replaces the earlier "NFL-001 only, then TRUTH-001" instruction. Time-sensitive Week 5 readiness milestone (2026-10-08 → 10-12) inside the NFL program. Unvalidated models stay in shadow; `COST-001` protections, `OPS-002` observation and DP's `NCAAF-001` are unaffected. Wave lists in §26 are historical; §2 is the execution order.
- **2026-10-08 — CI-001:** main's `quality` gate was red because adapters.test.mjs MLB 8 required a `ready` MLB simulation in the newest 14 slates. `ready` (input completeness) has been rare by design since 2026-09-25, while the simulations themselves are healthy. The test's per-player check had been vacuous since it was written. It is replaced by hash-verified fixtures and a status-agnostic corpus contract. Rule: **tests must not take a precondition from rolling committed data; use pinned, self-verifying evidence or whole-history invariants.** The replacement-level batter disclosure finding is folded into `TRUTH-001` and `MLB-003`.
- **2026-10-07 — Founder infrastructure-cost directive:** Added `COST-001` as the first priority after reviewing the previous Vercel billing cycle. Localhost-first implementation, local build/test/UX acceptance, batched changes, controlled automatic deployment triggers, founder review where requested, limited remote builds, budget/Build CPU measurement, and explicit remote-build exceptions are now mandatory. **This is a roadmap policy update only; `COST-001` implementation and Vercel configuration audit have not yet been performed.**
- **2026-10-08 — OPS-002 merged and verified:** #1019 → `f65e7656`. The first bot data commit (`851ecc75`, 05:56:44Z) was attributed to `github-actions[bot]` and went READY and live. The seven-day acceptance now needs positive evidence (daily bot deployments + verified freshness) and cannot pass on zero failures alone; earliest DONE 2026-10-15.
- **2026-10-08 — OPS-002 root cause:** the 21 blocked bot deploys were Vercel's private-repo team-access check applied to `gtp-bot`'s stranger identity (`bot`) while the repo was briefly private. They were not intermittent. All workflow commits now author as `github-actions[bot]`, guarded by `bot-commit-identity.test.mjs`. Seven-day attribution observation follows the merge.
- **2026-10-08 — COST-001 Phase 1 executed:** previews gated (proven), build queue one-per-branch, PR #1017 merged with one Production build; Phase 2 local test shows Standard unsafe → `COST-002`; `OPS-002` opened for blocked bot deploys.
- **2026-10-07 — COST-001 audit:** roadmap adopted into the repository. Measured Build CPU as 99.9% of the bill, driven by the 09-24 Enhanced machine (no free slot) × ~130 builds/day, 37% of them unconsumed previews. Previews made opt-in (`preview/**`) in `app/vercel.json` pending approval; full evidence in `docs/COST_001_VERCEL_COST_CONTROL.md`.

---

# 27. Definition of success

GameTimePicks reaches the intended architecture when a user can:
1. Open any sport and see the same information hierarchy.
2. Understand the slate/week immediately.
3. View consistent Top Boards for supported markets.
4. Open a game and see one coherent model story.
5. Trace every model probability to an immutable forecast/world receipt.
6. See Bank Builder/Moonshot/Parlay Lab use the same canonical truth.
7. Never encounter a silent contradiction between model favorite and product selection.
8. See prop-family Results over any supported time window and inspect every underlying forecast.
9. Follow a game live with factual event/stat progress and useful visualization.
10. Distinguish pregame truth, current actual state, and conditional live forecast.
11. Receive live opportunities only after validation.
12. Trust that historical forecasts, outcomes, and accounting are immutable/auditable.
13. Switch sports without relearning the interface.
14. Know when a model is Experimental vs Established and displayable vs product-eligible.
15. Know every model was promoted because evidence supported it—not because it looked sophisticated or ran 10,000 simulations.
16. Keep the development loop on localhost; approve deliberate Vercel releases; measure Build CPU and deployment count so monthly infrastructure spend stays sustainable.

