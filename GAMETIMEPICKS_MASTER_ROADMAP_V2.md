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

| Rank | Task ID | Department | Task | Status | Dependency | Production-bound? |
|---:|---|---|---|---|---|---|
| 1 | `COST-001` | Release Engineering / FinOps | Audit Build CPU causes and auto-deploy triggers; enforce localhost-first and no wasted Vercel builds | IN_PROGRESS — Phase 1 verified 2026-10-08; awaiting founder spend-alert confirmation | None — do first | Process/config, no app release expected |
| 2 | `OPS-002` | Operations / Release Engineering | Bot commit identity: Vercel BLOCKED 21 bot-authored Production deployments (`TEAM_ACCESS_REQUIRED`) on 2026-10-07 | IN_PROGRESS — fix merged (#1019 → `f65e7656`, 2026-10-08 04:03Z); first bot data commit attributed `github-actions[bot]`, READY, live; **7-day observation running from cutover 2026-10-08T05:56:44Z** (earliest DONE ≈ 2026-10-15T05:57Z) | None | Workflow/identity config; Production freshness |
| 3 | `TRUTH-001` | Truth / Market Identity | Fix signed-line/model-vs-market truth defects and stale semantics/copy | NOT_STARTED — unblocked (deploy gate verified 2026-10-08) | COST-001 deployment gate verified ✓ | Yes |
| 4 | `CONTRACT-001` | Canonical Architecture | Freeze Event/FeatureSnapshot/WorldReceipt/Forecast/Market/Eligibility/Product/Settlement/Live contracts | NOT_STARTED | Founder rules below | Foundation |
| 5 | `LEDGER-001` | Results / Data | Harden ledger validation, conflict quarantine, correction events, publication evidence | NOT_STARTED | CONTRACT-001 | Yes |
| 6 | `TEMPORAL-001` | Data Platform | Point-in-time temporal data/identity foundation for MLB/NFL critical fields | NOT_STARTED | CONTRACT-001 | Foundation |
| 7 | `UX-001` | Frontend | Canonical Sport Hub / UX System V2 | NOT_STARTED | CONTRACT-001 view contracts | Yes |
| 8 | `RESULTS-001` | Results | Prop-family Results V2 + time filters + drill-down | NOT_STARTED | LEDGER-001 | Yes |
| 9 | `MLB-001` | MLB Modeling | World Model V2 research, rules, feature audit, benchmark ladder | NOT_STARTED | TEMPORAL-001 can progress in parallel | Shadow |
| 10 | `NFL-001` | NFL Modeling | World Model V2 research, team/player world architecture | NOT_STARTED | TEMPORAL-001 can progress in parallel | Shadow |
| 11 | `PRODUCT-001` | Product Engine | Canonical multi-sport candidate/eligibility/selection engine | NOT_STARTED | CONTRACT-001, LEDGER-001 | Shadow → Yes |
| 12 | `PRODUCT-002` | Bank Builder / Moonshot | Migrate to canonical multi-sport forecast candidates | NOT_STARTED | PRODUCT-001 + passing family gates | Yes |
| 13 | `PARLAY-001` | Parlay Lab | Same-world joint probability / dependency architecture | NOT_STARTED | PRODUCT-001 + world receipts | Shadow → Yes |
| 14 | `LIVE-001` | Live | MLB factual prop tracking + event timeline | NOT_STARTED | Live data/ID capability | Yes |
| 15 | `LIVE-002` | Live | MLB visual Game Center / pitch & field graphics | NOT_STARTED | LIVE-001 | Yes |
| 16 | `LIVE-003` | Live Modeling | Conditional live forecasts from captured state | NOT_STARTED | LIVE-001/002 replay archive | Shadow |
| 17 | `LIVE-004` | Live Products | Validated live straight opportunities | NOT_STARTED | LIVE-003 + fresh market identity | Shadow → Yes |
| 18 | `LIVE-005` | Live Products | Supported live parlays | NOT_STARTED | LIVE-004 + dependence validation | Last |
| 19 | `OPS-001` | Operations | Freshness, dependency receipts, retries, alerts, cost controls | NOT_STARTED | Parallel | Yes |
| 20 | `TRUTHDOC-001` | Documentation | Generated “what runs now” inventory | NOT_STARTED | CONTRACT-001 | Yes |
| 21 | `COST-002` | Release Engineering / FinOps | Reduce build memory so the export fits Vercel Standard (free first build slot); profile `/simulate/d/*` and last-quarter routes | NOT_STARTED | COST-001 Phase 1 | Build config/data loading; Production only after founder approval |

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
**Status:** NOT_STARTED  
**Owner/session:** —  
**Branch:** —  
**PR:** —  
**Exact head:** —  
**Evidence:** —  
**Production acceptance:** —

### Reproduce on current main
- Signed run-line/model-vs-market mismatch.
- Missing/weak gaps rendered as `ALIGNED`.
- MLB props copy contradicting score/total availability.
- Different MLB engines/snapshots appearing under one simulation story without source labeling.
- `DATA PENDING` when the real state is `NO QUALIFYING CARD`.
- Conflicting Moonshot/Results bankroll language.
- Ambiguous Bank Builder exposure scope.
- Rounded probabilities presented as exact counts out of 10,000.

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

---

# 5. Canonical architecture, ledger and temporal data

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

### Acceptance
- Current MLB/NFL sample forecasts project into the contract without changing historical meaning.
- Legacy missing provenance remains null/classified, never fabricated.
- Research models remain isolated/namespaced.
- Research producers never overwrite public artifacts.

## `LEDGER-001` — Forecast ledger hardening
**Priority:** P1  
**Status:** NOT_STARTED

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
**Status:** NOT_STARTED

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

Candidate approaches: binomial/beta-binomial opportunity baselines, hierarchical multinomial PA outcomes, appearance/role mixtures, GAM/boosting conditional rates. Shrink tiny BvP samples heavily.

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
**Priority:** P1  
**Status:** NOT_STARTED
- Preserve canonical V1 as control.
- Reproduce analytic winner vs sampled-score disagreement.
- Reproduce historical V2 evaluation.
- Do not promote V2 for architectural elegance alone.

## `NFL-002` — Benchmark ladder
**Status:** NOT_STARTED
1. Existing MOV/Elo champion.
2. Opponent-adjusted EPA/success-rate temporal baseline.
3. Dynamic hierarchical offense/defense strength.
4. Possession/drive process.
5. Distributional ML challenger.
6. Calibrated ensemble if superior.

Features: QB scenario/availability, OL, skill-player availability, pace, PROE/pass rate, EPA/success/explosiveness, field position, weather, home field, rest/travel, coaching, opponent matchup, game state, rule era.

## `NFL-003` — Player opportunity allocation
**Status:** NOT_STARTED

World sequence:
`plays → pass/rush → attempts/carries → targets → catches → yards → TDs`

Use bounded/multinomial allocation including `OTHER`.

Candidates: hierarchical shares, Dirichlet-multinomial allocation, beta-binomial receptions, mixture/quantile yards, NB where defensible.

Hard invariants: allocated opportunities reconcile; catches ≤ targets; receiving totals reconcile with QB passing under documented exceptions; legal scoring/clock/OT; negative-yard plays preserved.

## `NFL-004` — TD model
**Status:** NOT_STARTED
Hierarchical Bernoulli baseline → team scoring opportunities → red-zone/goal-line role → TD attribution within drives. Evaluate rare-event log loss/calibration separately.

## `NFL-005` — Shared worlds + forward promotion
**Status:** NOT_STARTED
Winner/score/spread/total/player outputs reconcile. If worlds are reweighted to a validated winner head, measure effective sample size and downstream distortion. Promote family by family.

### Existing references
- `claude/arch-nfl-ns1-ns2-e2-87uth3`
- `claude/handoff-nfl-7-0-top-board-receipts`

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
**Status:** NOT_STARTED

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

## `RESULTS-002` — Product results
**Status:** NOT_STARTED
Separate model-family performance from Bank Builder, Moonshot, Top Boards, Parlay Lab, and live recommendations. Grade exact frozen/public product receipts, never reconstructed current logic.

---

# 16. Sport Hub / UX System V2

## `UX-001` — Shared Sport Hub
**Priority:** P1  
**Status:** NOT_STARTED

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
**Status:** NOT_STARTED

Capture player box/stat progression, event timeline, score/inning/out/base state, current batter/pitcher, source age, correction identity.

Display frozen pregame projection, current observed stat, target line, opportunity count, source freshness.

Graph cumulative observed stat as steps, threshold as horizontal line, pregame projection/reference separately.

Use `Threshold reached — awaiting official settlement`, not premature `WIN`. Under bets generally cannot clear before period end.

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

