# GameTimePicks · NCAAF Engineering Playbook
## NCAAF-001 → NCAAF-010 | Research foundation → qualified public product

> **Owner:** DP — independent NCAAF engineering lane  
> **Founder / integration authority:** GameTimePicks founder; shared-platform changes coordinated with the main engineering owner  
> **Issued:** October 9, 2026 · **Document version:** 1.0 (proposed execution plan)  
> **Working repository:** `yashwantbalaji3/gametimepicks`  
> **Suggested location in DP worktree:** `docs/ncaaf/NCAAF_V1_EXECUTION_PLAYBOOK.md`  
> **Initial research branch:** `dp/ncaaf-v1` (verify actual branch/worktree on startup)  
> **Sole authoritative platform roadmap:** `GAMETIMEPICKS_MASTER_ROADMAP_V2.md`

**How to use this document:** Feed it to your Claude Code session at the start of NCAAF work. It is a durable *subordinate NCAAF execution playbook*, not a second GameTimePicks master roadmap. Read the master roadmap and current `main` before executing, preserve the work already done, update the progress ledger in §17 after meaningful milestones, and continue to the next *locally authorized* phase when its gate passes. **Do not stop after every small task.** Escalate only genuine external dependencies or reserved founder decisions (§4). Never interpret a check box in this playbook as permission to publish or merge to Production.

**Status disclaimer:** Historical observations below come from DP's Stage 0/Stage 1 handoffs, dated October 8–9, 2026. They are not a live audit of current `main` and not independent verification of DP's source code. The first action is to verify the current branch, commits, files, tests, and newly merged platform changes.

---

## 1. North star and non-negotiables

**Product goal:** Add NCAAF to GameTimePicks as **another first-class sport in the existing product**, with a defensible team-level forecasting engine, coherent simulations, immutable pregame predictions, factual live tracking where supported, gradeable results, and a familiar mobile/desktop experience. It must *feel and behave like NFL, MLB, NBA, UFC, and soccer on this website*—not like a new standalone website or an experimental dashboard with its own menus, colors, terminology, and data contracts.

**Model goal:** Estimate honest uncertainty about college-football matchups. Start with data-supported team markets (winner, score, margin, total; market-facing selections only when time-stamped prices and eligibility permit). More features and 10,000 simulations do **not** themselves demonstrate accuracy. Model promotion follows preregistered chronological and prospective evaluation, not aesthetics or an individual winning bet.

**Operating invariants:**

1. **One canonical GameTimePicks forecast lineage.** Reuse the platform's event, feature snapshot, world receipt, forecast, market, eligibility, product selection, settlement, and live observation identities. Do not create an independent competing forecasting platform.
2. **One Sport Hub UX system.** Reuse UX-001 navigation, sport chooser, visual components, responsive conventions, freshness labels, accessibility, and Results pathways. Confirm current interfaces from the actual repository: paths in this document are *candidates*, not permissions or guaranteed exports.
3. **Point-in-time or refusal.** A postgame observation, season-ending rating, present-day roster, or closing line cannot become an earlier pregame feature without verifiable as-of evidence. Record `observedAt`/`ingestedAt`/cutoff/source where possible; otherwise withhold that feature.
4. **Immutable public history.** A captured forecast cannot be rewritten after kickoff. Later corrections append new records and reference the originals. Reconstructed historical predictions must never masquerade as live historical picks.
5. **Results are not marketing.** Pending/void/no-play/unmeasurable do not count as losses; distinguish continuous-score accuracy, probabilistic scoring, interval coverage, and *actual published* market-pick hit rate.
6. **No invented inputs.** Unknown QB starters, injuries, missing odds, play coordinates, team IDs, player opportunity, or live events remain unknown. Zero is not missing; missing is not a loss; missing market prices never default to `-110`.
7. **Fail closed.** NCAAF remains research-only / disabled in shared registries until approved with real evidence. Display readiness and product eligibility are separate decisions.
8. **No speculative Vercel builds.** Local-first, no unauthorized deploy or paid API credits. Generated internal research and documentation are not reasons to rebuild thousands of public pages.
9. **Founder controls integration.** DP may execute *NCAAF-local* research and coding autonomously. Shared code, credentials/spend, GitHub workflows, `main` merges, consumer-facing features, and model/product promotion require review.
10. **Other sports remain untouched.** NFL/MLB/NBA/UFC/EPL/soccer model rules and player data must never be silently modified to accommodate NCAAF.

---

## 2. What we already know — verified versus proposed

### 2.1 Initial inputs to retain, not redo

| Artifact / evidence | Reported state | Action for DP |
|---|---|---|
| `STAGE_0_ARCHITECTURE_MAP.md` | Stage 0 architecture surveyed at main `2ba7dc13f9…` (Oct 8); no NCAAF integration existed on that base | Preserve, revalidate against **current** main before editing shared contracts |
| `DATA_CAPABILITY_MATRIX.md` | Stage 1 source/data matrix probed Oct 9; evidence states `VERIFIED`, `PARTIAL`, `ADVERTISED`, `ACCESS_BLOCKED`, `PAID_DECISION`, `UNAVAILABLE` | Use as capability baseline; update evidence, never silently upgrade source status |
| `app/src/lib/sports/ncaaf/espn-events.mjs` and `.test.mjs` | Reported normalized event and team IDs, conflict handling, 14 tests | Verify files, run tests, inspect diff and commit SHA before marking implemented |
| `app/scripts/ncaaf/probe-espn-coverage.mjs` | Reported bounded 250-request cap, 300-ms throttle, local cache | Verify rate bounds and caching; do not commit provider raw bodies |
| `data/internal/research/ncaaf/capability/espn-coverage-v1.json` | Reported derived coverage counts only | Recompute from allowed source snapshots and compare hashes |
| Master roadmap §12 | **Existing** `NCAAF-001` (point-in-time data foundation) and `NCAAF-002` (game model), originally `NOT_STARTED` | Keep IDs and historical wording; reconcile actual status only with evidence |

### 2.2 DP's October 9 capability findings (research observations, not guaranteed future coverage)

- 2021–2025 ESPN event probe reported **8,138 events across multiple groups**, **8,113 played finals**, **6 forfeits**, **16 canceled**, **3 postponed**, **345 overtime** and **391 neutral-site** events. These are *not* 8,138 FBS–FBS games; the report estimated roughly **774–808 FBS–FBS games per season**.
- Final scores and season-scoped team identities were supported in the probe; historical kickoff revisions were **not** recoverable, so forward timestamped snapshots are needed.
- Box scores, drives, and plays were only **partially tested** (one ESPN 2025 two-overtime game). Do not assume game-wide availability or point-in-time access to derived metrics.
- Historical *pregame* rosters, starting QB availability, injuries, depth charts, and trustworthy player participation were **unavailable**. Present-day rosters and postgame box-score participants are **not** historical pregame lineups.
- ESPN pregame odds appeared in the 2026 upcoming-game probe, but not in sampled finals. Closing-line historical records lacking capture timestamps are **benchmarks only**, not timestamped pregame model features or archived published selections.
- CollegeFootballData (CFBD) endpoints were described but several remain unexercised without DP's own API key. Verify current provider terms, commercial rights, tier limits and identity maps before depending on them. **No paid tier or odds credits without founder approval.**
- `ncaaf-team-<ESPN team id>` is the proposed sport-prefixed identity to avoid numeric collision with NFL IDs. ESPN and CFBD IDs must not be equated without a proven crosswalk; ambiguous merges quarantine evidence.
- 2021+ NCAA overtime rules require explicit simulation tests; **revalidate rules per season**, including alternating two-point attempts beginning in the appropriate overtime period.

**V1 scope commitment:** team strength, winner probabilities, coherent team scores, margin and total distributions. **Player props are NOT a promised V1 launch feature.** They may enter private research only after genuine dated roles/participation and relevant market coverage are demonstrated.

---

## 3. Execution model, task IDs and milestone overview

`NCAAF-001` and `NCAAF-002` are already in the master roadmap. **`NCAAF-003`–`NCAAF-010` are the founder-requested proposed extensions for DP's subordinate plan**, not claims that they already exist on `main`. Ask the main engineering owner to register/reconcile them in the authoritative roadmap through an appropriately batched integration. Do not independently edit the shared roadmap from an isolated DP branch and cause conflict.

| Phase | Work package | Main output | Local advance rule | Public release? |
|---|---|---|---|---|
| `NCAAF-001` | Data foundation and time integrity | Reproducible historical corpus; provider/ID/as-of audit | Corpus + coverage/contract tests pass | No |
| `NCAAF-002` | Team strength and baselines | Preregistered Elo/hierarchical baselines, chronological reports | Champion/baseline comparison reproducible | No |
| `NCAAF-003` | Coherent game worlds | Reproducible joint-score simulator; winner/margin/total parity | Structural/world consistency gates pass | No |
| `NCAAF-004` | Advanced challenger and calibration | Tested improved distribution models; calibration evidence | Research winner selected or baseline retained | No |
| `NCAAF-005` | Forward forecast receipts | Timestamped weekly shadow forecasts and as-of records | Zero leakage and write-once validation | No |
| `NCAAF-006` | Results and grader | Idempotent official grading; lineage and performance | Historical+forward grading integrity | No |
| `NCAAF-007` | Market/product research | Exact price/line mapping and family-level gates | Qualified *candidate* matrix; refusals tested | Not without separate gate |
| `NCAAF-008` | Standardized sport hub UX | Local NCAAF hub/game/results/top-board surfaces, shared design | Usability/accessibility/parity tests | Not without separate gate |
| `NCAAF-009` | Ops and live factual integration | Safe refresh/alerts/live/settlement runbooks | Freshness/retry/cost rehearsals pass | Not without separate gate |
| `NCAAF-010` | Public beta and launch | Multi-sport parity QA and founder-approved release package | All applicable launch gates met | **Founder approval** |

**Three macro milestones:** **A. Intelligence** (`001–004`) → **B. Measurable forecasting** (`005–007`) → **C. Integrated product** (`008–010`). They are conceptual; some independent local tasks may overlap. External evidence gates (especially forward validation) cannot be accelerated by coding, but other independent work may continue.

**Initial honest status:** `NCAAF-001 = IN_PROGRESS / Stage 0–1 discovery reported; code not independently accepted`; `NCAAF-002 = NOT_STARTED / proposed research framework`; `003–010 = PLANNED / proposed IDs, no implementation evidence`. Adjust only after verifying the actual branch and master roadmap.

---

## 4. Autonomy, protected boundaries and escalation

### DP may proceed without asking on each small task

- Local/isolated NCAAF module code; NCAAF-specific tests; bounded free-source probes within authorized terms and rate limits; derived internal datasets; independent model candidates; statistical evaluations; preregistration before viewing held-out results; benchmark reports; private UI mocks using existing components; research documentation; local Git commits and branch pushes that do **not** deploy.
- Continue automatically to the next **local** phase once all acceptance checks for the prior phase are met. If a phase is blocked by forward observation, continue independent permitted tasks; do not manufacture evidence.
- Make reversible small design choices that do not modify platform contracts, pricing, authorized data scope or public surfaces. Prefer existing patterns over new abstractions.

### Founder / shared-engineering gate required

| Decision type | Approval owner / rule |
|---|---|
| Provider subscription, paid odds/historical calls, API credits, commercial data license | Founder first; document actual price/rights/limits |
| Shared `app/src/lib/...` registries, contracts, forecast-ledger allowlist, sport owners, source authorizations, model-eval core | Main engineering owner + founder; separate scoped integration |
| Any GitHub Actions workflow, scheduler, CI configuration, Vercel setting, public data export, routing or `main` merge | Founder; review exact SHA, green required CI, one Production PR at a time |
| Publicly exposed NCAAF forecasts, qualified probabilities, Top Boards, pricing comparison, Bank Builder/Parlay Lab | Model-family qualification + founder Product gate |
| Changing evaluation protocol after viewing evaluation outcomes | Explicit methodological review; disclose contaminated window and use new forward evidence |
| Data-sharing across providers or publishing source-derived datasets/portraits without verified rights | Founder/legal/terms review |

**Protected paths from Stage 0 (examples; inspect current CODEOWNERS first):** `app/src/lib/sport-capability-registry.ts`, `app/src/lib/sports/source-registry.mjs`, `app/src/lib/sports/sport-owners.mjs`, `app/src/lib/forecast-ledger/contract.mjs`, shared identity and `model-eval`, product eligibility, `.github/workflows/**`, `app/scripts/prune-internal-routes.mjs`, `app/public/data/**`, navigation, `package.json`/lockfile, other sport directories. **Do not touch merely to make NCAAF tests green**; design proposals and integration requests instead.

**Escalation format (one direct question):** decision required → options A/B → evidence → cost/security/forecast impact → recommended option → what permitted independent work continues meanwhile. Do not block an entire session on a noncritical question.

---

## 5. Standardization: NCAAF must look and behave like the other GameTimePicks sports

> **This section is a product acceptance contract, not an invitation to build a bespoke UI.** Before designing, inspect the current UX-001 components/routes from `origin/main`, especially `/nfl/`, `/mlb/`, `/nba/`, `/ufc/`, `/epl/` and any soccer competition hub. Names/routes may evolve; reuse the implementation actually deployed rather than hard-coding old assumptions. Do not copy sport-specific *statistical parameters* from NFL just because the code structure is reusable.

### 5.1 Common sport-hub information architecture

Match the canonical cross-sport page hierarchy:

1. **Sport header:** logo/mark, sport label, season/week/competition context, timezone-correct kickoff or event start; concise model and freshness status.
2. **Period and slate controls:** selected week/date, previous/next week, conference or team filters, search; URL-deep-linkable and keyboard accessible.
3. **Game slate summary:** chronological grouping **LIVE → UPCOMING → FINALS**; team logos, records if licensed/accurate, kickoff, model preview, status and direct game link. Avoid repeating the same game across many surfaces.
4. **Qualified model overview:** win probabilities and coherent score/margin/total summaries; clearly mark unpublished/refused families rather than fill with proxies.
5. **Top Boards / best opportunities:** only for **eligible, supported families**. Team winner/spread/total views may qualify independently; no fabricated player boards. Link each row to the corresponding game and back.
6. **Game simulation details:** distribution of plausible scores, score interval, winner chances, likely score explanation, simulation count and exact/named model version; use simple default view and optionally expand analyst detail without reviving a globally prohibited mode.
7. **Live factual and Results:** visible path from each game into live score/progress and settled forecast history; scores never overwrite frozen pregame values.
8. **Methodology / limitations:** meaningful short default copy and expandable evidence/provenance; clear model-vs-market distinction.

### 5.2 Canonical NCAAF proposed user journeys

- `Sports → NCAAF → Week → Game → Forecast/Simulations → Results` with **2–3 interactions** from a sport hub to a game's key forecast.
- `Home/Live → NCAAF live game → factual score + frozen forecast → Results` when live feeds qualify.
- `Top Board/team card → exact game → same forecast version` (bidirectional deep links; no version/rounding mismatch).
- `Results → NCAAF → specific historical game → originally frozen forecast + official settlement` (no after-the-fact historical predictions displayed as archived picks).
- Query parameters for week/team/market preserve state under navigations and redirects; no dead tabs; include NCAAF in the **single canonical sport list**, never a private parallel selector.

### 5.3 Visual, copy, and accessibility standards

| Component | Expected GameTimePicks behavior | Never do |
|---|---|---|
| Team identity | Approved school logos/abbreviations, consistent image fallback and accessible alternative text | Invent copyrighted images, guess school/college identity from display text |
| Model metric | Clear **winner %**, projected score distribution/interval, projected margin/total with units and horizon | Show 10,000 draws as “10,000 independent predictions”; interchange mean/median/mode |
| Market comparisons | Signed spread, total line, bookmaker, odds and timestamp, edge only with eligible matching model | Default missing odds to `-110`, confuse home +3.5 with -3.5 |
| Status | `PREVIEW`, `SHADOW`, `EVALUATING`, `QUALIFIED`, `PAUSED`, `UNAVAILABLE` consistent with platform actual vocabulary | Replace official registry states with invented public states; call research “ready” |
| Live | Score/period/clock/last-updated from verified feeds; stale and failure indicators | Depict unobserved play locations, event sequence, or live win % as factual |
| Top Boards | Shared table/card language, mobile row readability, logos, direct links, family filters | Publish unqualified player yards/TD boards merely to match NFL's number of tabs |
| Results | Shared sport filters, versioned original projections, model/baseline stats and counts, CSV when supported | Aggregate disparate hit rates into one misleading win percentage |
| Mobile | Same nav + sports chooser; no sideways page scroll; internal table scroll focusable | Build NCAAF-only sidebars, conflicting active routes, giant 20-screen hub |
| Accessibility | Semantic headings, contrast, meaningful tooltips, keyboard/focus, loading/empty/error alternatives | Treat hover-only details or decorative logos as the only way to identify a team |

**Model coherence in the UI:** The game page, slate card, shared Results viewer and any NCAAF Top Board must read the **same canonical forecast/world receipt version** for the same event, target, unit and as-of. A separate research challenger, if shown privately, is explicitly labeled and must not silently replace the published model of record. If market price is stale, show it as stale and reduce/withhold eligibility according to existing policy.

**Page routes:** Propose `/ncaaf/` and an event-detail route using the current shared route design (`/ncaaf/game/<canonical-id>/` or the common sport adapter chosen by the shared owner); these routes are **not approved for implementation on main** until the routing owner verifies the latest convention and authorizes the integration. Do not add redirects or public sitemap entries in the research lane.

### 5.4 Shared-platform parity checklist (must complete before NCAAF-010)

- [ ] One canonical sport chooser includes NCAAF across Sports, Home, Live, Results, and mobile/desktop nav where appropriate.
- [ ] All supported game pages use the same shell and hierarchy as existing sports (sport header → slate → projections → simulation → Results).
- [ ] Every team and event ID is stable across schedule, score, world, market and grade artifacts.
- [ ] User-visible forecast numbers reconcile everywhere to the same immutable version, with exact numerator or honest rounded percentage.
- [ ] No published/eligible Top Board family lacks a tested game-level forecast source.
- [ ] Factual live observations are separate from frozen pregame predictions and clearly timestamped.
- [ ] All pending, postponed, forfeited, voided and unavailable states appear without invented grades.
- [ ] Team logos have approved sources and robust fallbacks; portraits appear **only if player feature and rights qualify**.
- [ ] Keyboard, mobile, tablet, Chromium/Firefox/WebKit, alternate-locale hydration, accessibility, routes and redirects pass.
- [ ] Sitemap, deep links, Saved Forecasts, Ask GameTime and product discoverability are compatible **only where deliberately supported**; unsupported capabilities fail closed.
- [ ] No new NCAAF-specific layout frameworks or duplicate navigation components.

---

## 6. Cross-sport technical contracts and proposed file organization

Use DP's Stage 0 map as the starting point; verify real exports, functions and CODEOWNERS from current `origin/main` before building adapters.

```text
# NCAAF-local work (subject to current-repo verification)
app/src/lib/sports/ncaaf/
  espn-events.mjs                   # existing reported normalizer
  espn-events.test.mjs
  identity.mjs                     # canonical event/team identity + conflict tests
  corpus.mjs                       # as-of historical training rows
  elo-baseline.mjs                 # reproducible ratings
  team-model.mjs                   # team-strength distribution
  joint-game-worlds.mjs            # coherent game results
  grade.mjs                        # local grading adapter / stage 6
  *.test.mjs
app/scripts/ncaaf/
  probe-espn-coverage.mjs          # existing reported probe
  build-corpus.mjs
  evaluate-baselines.mjs
  run-shadow-forecasts.mjs
  validate-receipts.mjs
  grade-shadow.mjs

data/internal/research/ncaaf/
  capability/                      # small aggregate evidence and manifests
  corpus/                          # bounded derived/versioned artifacts
  experiments/                     # registration, exact inputs, scores
  forecasts/                       # write-once shadow forecasts
  grades/                          # research grades, corrections
  .cache/                          # gitignored raw source payloads

docs/ncaaf/
  NCAAF_V1_EXECUTION_PLAYBOOK.md
  STAGE_0_ARCHITECTURE_MAP.md
  DATA_CAPABILITY_MATRIX.md
  MODEL_EVALUATION_PROTOCOL.md
  WORLD_MODEL_SPEC.md
  FORWARD_CAPTURE_PROTOCOL.md
  RELEASE_INTEGRATION_CHECKLIST.md
```

**Proposed shared extensions (never apply without gate):**

| Shared interface | NCAAF consumer/adapter | Owner requirement |
|---|---|---|
| `sports/source-registry.mjs` | verified sources with explicit permitted use/status | Shared registry owner |
| `sport-capability-registry.ts` | NCAAF row starts research/disabled with evidence | Shared capability owner |
| `forecast-ledger/{contract,identity,measure,row}.mjs` | `NCAAF` allowlist and proper measurement kinds | Shared forecast owner |
| `forecast-ledger/adapters/ncaaf.mjs` | exactly mapped NCAAF rows | Shared ledger owner |
| `identity/event-identity.ts` + adapter | canonical event/team identity and competition/season | Shared identity owner |
| `sports/sport-owners.mjs` / workflows | scheduled owner and health checks | Operations owner; founder merge |
| `model-eval/` | scoring/report integration | Shared evaluation owner |
| `products/eligible-leg/` | only family-qualified, exact-market legs | Product owner |
| Shared sport hubs, live shell, Results and nav | consistent NCAAF displays | UX-001/RESULTS/LIVE owners |
| `prune-internal-routes.mjs` / static export | ensure private research never leaks into `out/data` | Security/route owner |

**Canonical entity fields to preserve** (adapt—not redefine—the current contract):

- `Event`: canonical `sport/competition/season/event`, provider event IDs, home/away, venue, kickoff revisions, status/ruleset.
- `FeatureSnapshot`: as-of cutoff, source, effective/observed/ingested time, transformation version, content hash and missingness.
- `WorldReceipt`: model/code/parameter hashes, seed, world count, exact counts/joint distribution, input snapshot IDs, simulation diagnostics, eligibility/maturity.
- `ForecastVersion`: target/subject/unit/horizon, frozen probability/distribution reference, published-at, version/predecessor, canonical/noncanonical.
- `MarketSnapshot`: exact event/subject/period, **signed line**, side, bookmaker, odds, capture time, stale/suspended/void policy.
- `EligibilityDecision`: versioned refusal/allow reason, market alignment, maturity distinct from eligibility.
- `SettlementEvent`: actual source, versioned rules, provisional/canonical/corrected, pushes/voids, append-only correction chain.
- `LiveObservation`: factual event/player identity, source timestamp and ingestion time, provider event sequence, missing versus zero, stale status.

Do not synthesize a full line or implied probability when source/rights or point-in-time evidence is missing.

---

## 7. NCAAF-001 — Historical data foundation & point-in-time identity

**Mission:** Build a reproducible leakage-safe historical corpus sufficient for honest team-level predictions. **Dependency:** Stage 0/1 handoffs; verify current branch first.

### Tasks

- [ ] **001.1 Baseline and ownership:** inspect `origin/main`, worktree, Stage 0/1 report SHAs, CODEOWNERS, repository status, NCAAF files/tests. Record exact base SHA and all changes. Don't reset/overwrite other people's work.
- [ ] **001.2 Evidence provenance:** maintain source matrix with version, terms, observed availability, season coverage, permitted uses, failure/withdrawal behavior, request costs, capture/retention rules. Preserve the six evidence states in §2.
- [ ] **001.3 Bounded ingestion:** use request caps, throttling, retries/backoff, local caching and partial-run receipts. Probe free authorized sources only; do not embed tokens or commit raw source payloads.
- [ ] **001.4 Identity normalization:** event IDs, sport-prefixed team IDs, home/away identity, season, conference/division by season, opponent, venue, neutral site, week, postseason, game status, overtime, reschedules. Quarantine provider conflicts; prohibit name-only merges.
- [ ] **001.5 Outcome semantics:** separate `FINAL`, `SCHEDULED`, `POSTPONED`, `CANCELED`, `FORFEIT`, `NO_SCORE`, `UNKNOWN`, and corrections; never treat scheduled `0` as score. Cross-check totals/lines and provider disagreements.
- [ ] **001.6 As-of model:** document for each field whether observable *before* kickoff. Historical final score may update future weeks' training features only after the prior game finishes. Do not use current team rosters or postgame QB starter labels as pregame input.
- [ ] **001.7 Corpus builder:** deterministic schema and versioned dataset; chronological game ordering; season boundaries; FBS–FBS scope explicit; FBS–FCS games separately handled and never silently treated as identical-strength opponents. Expose data quality/coverage manifest.
- [ ] **001.8 Stress samples:** sample multiple seasons/conferences, short weeks, bowl games, overtime, neutral sites, FBS/FCS, games with provider conflicts, reschedules, odd statuses, and early-season cold starts. Validate play/drive availability before adding advanced efficiency features.
- [ ] **001.9 Prospective capture design:** write-once schedules, kickoff changes, future roster and injury observations, when sourced and authorized. Never reconstruct exact past availability retrospectively.
- [ ] **001.10 Reproduction:** tests for count reconciliation, ID collision, duplicate events, no future-year leakage, as-of windows, deterministic outputs, incomplete-source refusal and cache replay. Record request count and seconds/run.

**Artifacts:** `DATA_CAPABILITY_MATRIX.md` update, dataset schema + dictionary, normalized event/identity code/tests, `corpus-manifest.json` with coverage and hashes, readme and usage bounds, replay command.

**Gate 001 → 002:** Demonstrate reproducibility of the eligible historical corpus; source/identity conflicts fail closed; no known future features; all coverage and exclusions documented; 14 reported normalization tests verified (or corrected). Record SHAs/logs. If drive data remains partial, proceed with the scores-only baseline rather than blocking all modeling.

---

## 8. NCAAF-002 — Team ratings, probabilistic baselines & benchmark ladder

**Mission:** Produce a clearly preregistered and reproducible team-outcome baseline before selecting complicated models. **Input:** accepted 001 corpus.

### Tasks

- [ ] **002.1 Evaluation preregistration BEFORE tuning:** targets (winner, both scores, margin, total), game population, train/validation/test chronology, rules for postponed/forfeit/neutral site/postseason/FCS, baseline comparisons, scoring and pass bars. Append amendments; never rewrite an evaluated protocol.
- [ ] **002.2 Naive benchmarks:** equal-prior/coin-flip (winner), league/conference prior, prior-team average/ratings where available, simple score models with honest dispersion. Record why each baseline is valid or limited.
- [ ] **002.3 Dynamic Elo:** ratings update only after games complete; home-field and venue adjustment; K-factor tuning on development data; season regression-to-mean; new FBS and missing-history priors; regularization for sparse teams.
- [ ] **002.4 Hierarchical model:** team attack/defense + conference strength and variance; shrink estimates early season; carryover across coaching/roster changes only with as-of support; interval estimates rather than overconfident rankings.
- [ ] **002.5 Opponent strength:** adjust for strength-of-schedule without using final end-of-season ratings on earlier games. Reject hindsight features; preserve as-of join assertions.
- [ ] **002.6 Scoring:** baseline team score distributions, correlation uncertainty, home/away effects, matchup effects; compare Poisson, overdispersed alternatives, and simple bivariate approaches with appropriate handling of football scoring peculiarities.
- [ ] **002.7 Validation:** expanding-window chronological evaluation, by season/week/conference and early-season cohorts; report Brier/log loss; for scores report MAE, proper distribution score (e.g. CRPS), bias and interval coverage. Report confidence intervals/bootstrap by *game*, not by world draw.
- [ ] **002.8 Model inventory:** document configuration hashes, feature provenance, ablation results, baseline champion and failure reasons. A more complex challenger is not automatically better.

**Evaluation policy:** Choose date splits only after inspecting data availability and preregister them; e.g., early seasons for development and later seasons for held-out chronological evaluation, **but data already examined is not a pristine blind test**. Require genuine 2026+ pregame captures to support eventual publication. The 2021–25 coverage probe alone does not establish forward accuracy.

**Gate 002 → 003:** at least one complete, reproducible team/winner/score baseline with honest calibration reporting, cold-start handling, and no known temporal leakage. Keep the best *supported* baseline as champion; do not make up “edge” absent price.

---

## 9. NCAAF-003 — Coherent simulated college-football game worlds

**Mission:** Produce a joint distribution of full-game outcomes; no independent incompatible guesses for score, winner, total, and spread.

### Tasks

- [ ] **003.1 World specification:** specify latent team offense/defense, pace/possessions (where evidence supports), scoring process, environment/venue, shared matchup uncertainty and residual correlation. Record assumptions and versions.
- [ ] **003.2 First coherent engine:** draw home and away scores jointly from the baseline, then derive winner/margin/total from *those exact worlds*. Keep 1,000/10,000 configurable seeds; never call N simulations N historical independent outcomes.
- [ ] **003.3 Football rules:** valid scoring decomposition if events modeled, nonnegative integers, regulation vs overtime, ties resolved under season-specific NCAA rules, score clustering around football values without forcing every score to 3/7 multiples where 2pt/safety exist.
- [ ] **003.4 Optional possession/drive engine:** only after Stage 1–2 prove suitable coverage; explicitly model starting field position and pace uncertainty where supported. Compare to simpler score worlds before adoption.
- [ ] **003.5 Exact counts and probabilities:** `N` world outcomes, winner counts sum to `N`, categorical vectors sum to 1, finite unit-checked percentiles; derive cover/O-U probability only when an exact matching captured line exists and pushes are accounted for.
- [ ] **003.6 Coherence guards:** each world `margin = homeScore − awayScore`, `total = sum`, winner/OT outcome consistent; unchanged seed+input+code reproduces exact outputs. Mutation-tests for invalid scores, seed mismatch, player/team ID mismatch and missing input.
- [ ] **003.7 Versioned receipts:** code/config/model/data hashes, seed scheme, world count, exact numerators, run timing, as-of cutoff, refusals and simulation error diagnostics. No public export.
- [ ] **003.8 Compare distributions:** score cluster frequencies, tails, upset frequency, overtime rate, implied team strength, totals/variance against actual held-out games and meaningful benchmarks.

**Gate 003 → 004:** structural coherence 100% on synthetic/integration fixtures, reproducible receipts, no unacknowledged model contradictions, calibrated/uncalibrated research maturity honestly labeled. A simulation engine that only *looks* coherent is insufficient.

---

## 10. NCAAF-004 — Advanced challengers, calibration & model selection

**Mission:** Research improvements to the champion rather than retelling the same historical wins.

### Tasks

- [ ] **004.1 Hypothesis register:** each challenger gets an expected mechanism, baseline, metrics, allowable training data, preregistered threshold and downside risk.
- [ ] **004.2 Candidate techniques:** hierarchical Bayes for team/conference, dynamic latent strength, opponent-adjusted efficiency, overdispersed count/drive hazards, distributional regression/GAM/boosting, properly trained calibrated ensembles. Implement only if Stage 1 data genuinely supports them.
- [ ] **004.3 Evaluation separation:** train → development validation → locked evaluation / prospective shadow. Record data windows looked at; no repeatedly “blind-testing” the same held-out set.
- [ ] **004.4 Calibration:** reliability curves, log loss/Brier, ECE with uncertainty, calibration slope/intercept, low-frequency upset and early-season performance. Calibrate on prior data only; test on later games.
- [ ] **004.5 Score accuracy:** CRPS, absolute errors, score/margin/total tail and 10th–90th coverage, cross-family coherence. Diagnose negative log likelihood if modeled, not just nearest median score.
- [ ] **004.6 Cohorts & ablations:** conference differences, FBS entrants, weak schedules, neutral/bowl, early season, high totals, severe mismatches; show failure cases and data-missing refusal rates.
- [ ] **004.7 Champion/challenger receipt:** list improved, tied or failed families; model family can remain at baseline if challenger fails bars. Record a *research champion* distinctly from an *eligible public model*.

**Gate 004 → 005:** complete defensible evaluation report and clearly frozen candidate/model selection. If no advanced model improves on baseline, proceed with the honest baseline in shadow instead of inventing superiority. Model publication still requires prospective evaluation.

---

## 11. NCAAF-005 — Prospective weekly forecasting and immutable receipts

**Mission:** Generate actual pregame forecasts that future Results can grade; shadow first.

### Tasks

- [ ] **005.1 Forecast schedule:** define weekly run and event-window cutoff policy; kickoff-change handling, pregame latest-valid selection, timeout/missed-run recovery, freshness SLO. No workflow modifications yet.
- [ ] **005.2 As-of capture:** bounded free authorized upcoming schedule, source timestamps, eligible teams/venue, roster availability only if legitimately captured, prior-games-only features, capture hash and missingness.
- [ ] **005.3 Model runner:** generate winner, team score, margin, total distributions from one world receipt; run on isolated NCAAF paths only.
- [ ] **005.4 Write-once:** store immutable run receipts per event/run; predecessor/supersedes relationship, run time, as-of cutoff, code+feature hashes, model version, seed and event rules; pre/post kickoff rejection.
- [ ] **005.5 Safety:** `NO_FORECAST` for unsupported events/sources/identity, `STALE` when outdated, `RESEARCH_ONLY`/shadow maturity; never falsely label as “GameTimePicks pick.”
- [ ] **005.6 Freeze protocol:** snapshot prior to kickoff and keep every captured version; later model changes never mutate history. Test DST, timezone boundaries and Sunday/Monday games.
- [ ] **005.7 Forward evidence:** produce weekly cohort manifest of eligible/refused games and timestamp hashes; archive unchanged/no-op behavior; avoid public builds.
- [ ] **005.8 Readiness audit:** compare schedule completeness, latest roster availability, input cutoff, model status and missing data against expected events.

**Gate 005 → 006:** genuine forward-written receipts from real pregame event windows; documented refusals and timestamp integrity; strictly reproducible; no deploys. If season timing limits sample size, continue accumulating and separately develop grader fixtures.

---

## 12. NCAAF-006 — Official results, grading and trustworthy performance

**Mission:** Determine what the model actually got right or wrong, preserving official finality and uncertainty.

### Tasks

- [ ] **006.1 Outcome source contract:** official final source, status, source time/ingestion time, version/correction policy, canceled/forfeit/overtime semantics.
- [ ] **006.2 Last-valid snapshot selection:** grade the prespecified latest eligible pregame forecast, with rules for multiple pregame versions; preserve all other captures as separate sensitivity evidence, not extra independent games.
- [ ] **006.3 Grade game families:** binary winner proper score; continuous team scores, margin and total errors; interval coverage; price-threshold cover/O-U only if *captured* pregame line and policy exist.
- [ ] **006.4 Status integrity:** pending not losses, canceled/unplayed no plays, push versus W/L, missing official values unavailable, corrections append new settlement version; never use postgame new projections to grade earlier results.
- [ ] **006.5 Idempotency:** rerunning same final input changes nothing; duplicate results cannot grade twice; corrections generate traceable superseding rows.
- [ ] **006.6 Results cohorts:** report by model version, season, conference, matchup, win probability, market family, time horizon, last 7/30/season/all where sample size allows, confidence intervals and exact denominator.
- [ ] **006.7 Baseline comparisons:** log loss/Brier and score CRPS/MAE versus registered baselines; do not assert “winning percentage” from unrelated metrics; don't inflate denominators with 10k worlds.
- [ ] **006.8 Ledger adapter proposal:** map to shared `SettlementEvent` and forecast measurement kinds; do not add allowlist/adapter import without review.

**Gate 006 → 007:** synthetic and real final-state grading contract tests, immutable corrections, no leakage or regrading artifacts, trustworthy Results report; forward sample limitations disclosed.

---

## 13. NCAAF-007 — Markets, family qualification and eligible product research

**Mission:** Make model/price semantics exact; decide *family by family* what could become user-facing.

### Tasks

- [ ] **007.1 Supported family matrix:** winner moneyline, spreads and game totals first; team total only if directly derived/validated; label whether probabilistic only, market-comparable, qualified, paused, or blocked using actual platform states.
- [ ] **007.2 Capture real lines:** event/provider matching, home/away, book, price, **signed** spread, line value, period, overtime and void/push rules, precise before-kickoff `capturedAt`; no guessed lines.
- [ ] **007.3 Match source timing:** separate closing-line *benchmark* from a genuinely captured pregame market and from current live price. A current public number may not prove what was offered historically.
- [ ] **007.4 Model vs market:** derive over/under/cover probabilities from the world distribution, exact line and market rules. Distinguish sportsbook-implied chance after de-vig from model chance; don't make “aligned” mean missing.
- [ ] **007.5 Eligibility:** feature freshness, minimum sample/calibration, observed participation where relevant, stale/uncertain event, market availability and support; generate versioned reason-coded refusal decisions.
- [ ] **007.6 Product integration proposal:** only if qualified, propose reuse of shared Picks, Parlay Lab, Bank Builder, Moonshot and market cards; same-game dependence from joint worlds, not naive independent-leg multiplication. No direct changes to products in DP lane.
- [ ] **007.7 Player markets as a separate future extension:** require historical as-of participation/roles, team opportunity conservation, injury availability, trustworthy market capture and forward evaluation. **If missing, explicitly withhold.** Do not make NFL-style player Top Boards mandatory.
- [ ] **007.8 Market/legal/terms review:** source commercial use and redistribution of provider odds/assets, privacy and applicable regulations; founder decision before public product use.

**Gate 007 → 008:** comprehensive family matrix with explicit qualified/refused evidence; shared owners sign off on contract proposal. Research completion does **not** authorize eligible user-facing picks.

---

## 14. NCAAF-008 — Standardized UI/UX and familiar GameTimePicks experience

**Mission:** Build a local, testable NCAAF consumer experience using existing UX-001 components. **No public merge without approval.**

### Tasks

- [ ] **008.1 Inventory current shared UI:** inspect latest merged NFL/MLB/NBA/UFC/EPL/soccer page shells, sport navigation, mobile bottom bar, Live Now strip, Results table, model method sections and logos. Record precise reusable components and design tokens.
- [ ] **008.2 Proposed route and canonical mapping:** route `/ncaaf/` plus a game detail consistent with current platform; deep links for seasons/weeks/game/forecast/results. Share current route resolver; no duplicate route registry.
- [ ] **008.3 Header/slate:** “NCAAF · Week X / Season YYYY”; conference/team filter, search and date controls; fixture logo + opponent + kickoff; live/upcoming/final grouping.
- [ ] **008.4 Primary forecast card:** two team logos, calibrated winner probabilities if qualified, mean/median clearly labeled, projected score interval, margin and total; one clear line of model provenance and data freshness. Event withheld reason when not ready.
- [ ] **008.5 Game simulation:** simple readable outcome overview first; extend to distribution charts, win-frequency counts and optional detailed box/outcome table; mark what is simulated versus actually observed.
- [ ] **008.6 Qualified Top Boards:** team-level candidate tables if family passes `007`; one row per canonical event/market, visible source line, no fabricated player ranking. Cross-links into game and Results.
- [ ] **008.7 Results and methodology:** plug into shared filtered Results components; immutable historical values, correct grading status, model version and baseline results; explicit historical “shadow” versus published selection.
- [ ] **008.8 Art direction/assets:** follow GameTimePicks green/dark visual identity *as implemented in the design tokens*, use licensed/approved school marks, accessible alt text, robust fallbacks and consistent responsive player/team artwork policies.
- [ ] **008.9 UX validations:** users find a Week 6 matchup and its forecast in ≤3 interactions from NCAAF hub; game ↔ Top Board ↔ Results links; mobile (375px), tablet (768–1023px) and desktop; Chrome/Firefox/WebKit, non-US locale, contrast, keyboard, reduced-motion, scroll containers, empty/loading/stale states.
- [ ] **008.10 Parity assertions:** generated page numbers match canonical world receipt version and units; no score/game conflict, no duplicative competition routing, no broken redirects; 0 hydration mismatches on tested pages.

**Gate 008 → 009:** local production-export build, all relevant tests, accessibility/browsers checks pass; founder sees local screenshots or walkthrough before public-facing integration. “Polished” does not justify unsupported accuracy or eligible markets.

---

## 15. NCAAF-009 — Automation, cost efficiency and factual live intelligence

**Mission:** Operate a reliable sport lane with the current GameTimePicks Ops/COST/LIVE architecture, without one full deploy per fact update.

### Tasks

- [ ] **009.1 Runbook:** pregame capture windows, schedule changes, kickoff guard, retry/backoff, missing-provider behavior, model warm start, weekly publish freeze and manual recovery.
- [ ] **009.2 Owner integration proposal:** job permissions, runtime/timeout, concurrency, secret handling, frequency and failure alerts; shared workflows only after founder/ops authorization.
- [ ] **009.3 Build decoupling:** keep raw and research artifacts internal; no unnecessary static export on capture, internal grade or every live score tick. Preserve necessary public freshness; propose existing runtime publishing infrastructure rather than inventing a new backend.
- [ ] **009.4 Factual live adapter:** actual score, quarter, game status, clock, recent scoring events and verified player stats where feed supports them; source age and last-success time visible. A missing feed displays stale/unavailable, never synthetic numbers.
- [ ] **009.5 Live model separation:** pregame forecast stays frozen; a separately validated live model would require historical game-state replay and new identities. Do not repurpose a pregame percent as a live probability.
- [ ] **009.6 Results publication:** current provisional/final/canonical rule and immutable correction chain; coordinate with RESULTS-001 and LEDGER-001 runtime plan when available.
- [ ] **009.7 SLO and tests:** acceptable pregame freshness, retry deadlines, caught-up events, source outages, late kickoff revisions, provider conflict, no-op writing, zero duplicate events, idempotent grades, cost accounting.
- [ ] **009.8 Recovery drills:** canceled workflow, bad API data, unavailable line, stale input, bot identity/deployment blocked, version skew; prove safe rollback/disable.

**Gate 009 → 010:** tested operational runbooks + simulation freshness and grading without duplicate data or avoidable builds; measured or bounded external/API cost. No unapproved scheduled pipeline goes live.

---

## 16. NCAAF-010 — Public beta, sign-off and launch

**Mission:** Move from private research to a publicly usable NCAAF hub **only** for independently verified features.

### Tasks and release gates

- [ ] **010.1 Scope:** explicit launch family table (`TEAM_WINNER`, `GAME_SPREAD`, `GAME_TOTAL`, etc.) and refused/unavailable families. A factual schedule/results-only launch is legitimate if prediction quality is not yet sufficient.
- [ ] **010.2 Data:** provider rights, attribution, coverage, identities, kickoff and availability state; no personal/private data, raw provider dataset republishes or unauthorized logos.
- [ ] **010.3 Modeling:** preregistered baseline/champion tests; honest calibration, temporal leakage audit, stability across cohorts, forward-sample qualification; external challenger review if high-stakes claims.
- [ ] **010.4 Contract:** canonical events/forecasts/worlds/market/eligibility/settlement align with shared system; include allowlist/owner/source registry migrations only after gate.
- [ ] **010.5 UX:** NCAAF uses existing hub, game page, Top Boards (only qualified families), Live, Results and methodology design; nav/search/deep-link/sitemap integration; familiar GameTimePicks dark/green branding.
- [ ] **010.6 QA:** exact world counts, zero parity mismatches, signed line/void/push tests, unknown vs zero, no future data, accessibility, 375px mobile and tablet widths, cross-browser hydration, routing and 404s.
- [ ] **010.7 Operations:** weekly refresh, live-data freshness, stale feeds, settlement latency, retry alerts, frozen records, workload sizing, no unnecessary Preview builds, measured Production/build/Blob costs.
- [ ] **010.8 Security:** public-safe exported data only; internal forecasts, raw source caches and secrets unavailable; API auth, quotas/rate caps, supply chain/dependency review.
- [ ] **010.9 Launch package:** exact code/branch/PR SHA, CI runs, local build, model report, feature eligibility, screenshots, rollback, contact/owner, user-facing limitations and expected cost.
- [ ] **010.10 Founder Product gate:** explicit approve/withhold decision for each family and Production merge, **one Production PR at a time**, exact-head CI, verify deployed SHA plus real-browser/live acceptance and accurate roadmap closeout.

**NCAAF V1 is successful when:** a regular user can find an NCAAF game from the existing Sport chooser, understand a permitted probabilistic forecast and its uncertainty, follow a factual live game when available, view the original pregame forecast and official result, and do all of this with the same navigation and design conventions as the rest of GameTimePicks. If evidence supports only team-level outcomes, publish only those; do not delay a truthful MVP indefinitely for unverified player props.

---

## 17. DP-owned progress ledger and repeatable session protocol

### 17.1 Task state vocabulary

`PLANNED` (proposed) · `NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `DEFERRED` · `DONE`.

Always add independent **maturity** labels: `DESIGNED`, `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `PR_READY`, `CI_GREEN`, `MERGED`, `PRODUCTION_VERIFIED`, `FORWARD_EVALUATING`, `MODEL_QUALIFIED`, `PRODUCT_ELIGIBLE`. A phase may be `DONE` as *research* while its model remains `FORWARD_EVALUATING`, not published. Do not write a stage label as a platform status without using the platform's actual vocabulary.

### 17.2 Initial tracker (update with Git evidence, not enthusiasm)

| ID | Phase status | Maturity / evidence | Owner | Next specific action |
|---|---|---|---|---|
| NCAAF-001 | IN_PROGRESS *(provisional)* | Stage 0 map + Stage 1 capability report; reported 14 tests; implementation SHA needs confirmation | DP | Verify branch and code/tests; build coverage-safe corpus |
| NCAAF-002 | NOT_STARTED | Only master roadmap concept | DP | Preregister historical evaluation/baseline protocol after 001 corpus |
| NCAAF-003 | PLANNED | Proposed subordinate ID | DP | World specification once baseline available |
| NCAAF-004 | PLANNED | Proposed subordinate ID | DP | Challenger research and calibration |
| NCAAF-005 | PLANNED | Proposed subordinate ID | DP | Build write-once forward shadow capture |
| NCAAF-006 | PLANNED | Proposed subordinate ID | DP | Private official Results/grading |
| NCAAF-007 | PLANNED | Proposed subordinate ID | DP + shared owner | Market/family eligibility research |
| NCAAF-008 | PLANNED | Proposed subordinate ID | DP + UX owner | Local shared-hub adaptation |
| NCAAF-009 | PLANNED | Proposed subordinate ID | DP + Ops owner | Automation/factual live test plan |
| NCAAF-010 | PLANNED | Proposed subordinate ID | Founder + shared owner | Public beta gate |

### 17.3 At the start of each Claude Code session

1. Read this playbook, Stage 0 map, Stage 1 matrix and NCAAF section of `GAMETIMEPICKS_MASTER_ROADMAP_V2.md`.
2. `git status`, current branch and worktree, fetch `origin/main`, compare merge base and reserved-file diffs. Do not reset/rebase other people's work. Read CODEOWNERS.
3. Inspect latest platform changes in shared Sport Hub, forecast/identity/Results and deployment controls; adapt references to current API, **do not edit them**.
4. Identify next unchecked task in the active phase; review last phase report, exact SHA and open blockers.
5. Choose a small, testable local slice; no speculative deployment.

### 17.4 During development

- Keep changes NCAAF-local. Use approved open-source or free bounded providers; keep raw cache ignored. Record provider version, observed timestamps, request counts and unresolved source contracts.
- Preregister before assessing reserved evaluation outcomes. Use local fixtures and synthetic mutation tests for edge cases.
- For each implementation change: focused tests → broader relevant suite → local build only if necessary → source-level diff check → commit SHA. Local Mac Postgres failures are **not** automatically a pass; classify baseline and require CI where integration demands.
- Batch doc updates into meaningful engineering releases; no docs-only Vercel deployment.
- Do not accumulate dormant always-running monitoring jobs; use bounded checks with explicit deadlines.

### 17.5 Phase closure template (copy, fill, append)

```markdown
### NCAAF-00X — Phase checkpoint — YYYY-MM-DD
- Owner / branch / HEAD:
- Base main SHA and changed paths:
- Accepted deliverables with paths:
- Tests / commands / run references / baseline comparison:
- Provider rights / cost / requests:
- Data windows, as-of cutoff, known missingness:
- Evaluation registration + result (if model phase):
- Model maturity / family eligibility:
- Invariants & mutation tests:
- Unresolved errors or blockers:
- Approval needed? (YES/NO; one direct question):
- Next authorized task:
- Master-roadmap sync note to main owner (do not double-write):
```

### 17.6 Cadence and founder communications

Send a concise founder update on significant phase completion or a genuine blocker—not every local commit. If no decision is required, **continue** to the next permitted phase. You may use a short weekly summary if work continues across multiple phases. On any merge proposal, state exact-head SHA, scope, CI, risk/cost, eligibility impact, and rollback; *never interpret an earlier approval as applying to a changed head*.

**Handoff to main engineering owner:** Provide a small `NCAAF_ROADMAP_SYNC.md` or section in the checkpoint with verified task status, branch/head, evidence locations, blocked family list, requested shared contract edits, and any founder decisions. Main owner batches it into the one authoritative roadmap with an approved engineering integration; DP keeps this playbook as an execution scratchpad, not a second company-wide status authority.

---

## 18. Global launch acceptance and anti-pattern register

### Required global acceptance

- [ ] NCAAF 001–010 milestone ledger accurate; no task marked complete without evidence.
- [ ] Official provider rights and retention/publication rules checked for actual usage.
- [ ] Historical and forward as-of data clearly separated, no leaked season-final or postgame inputs.
- [ ] Event and team identities verified; cross-provider conflicts quarantined; no mixing with NFL IDs.
- [ ] Baselines reported, challenger performance evaluated, model uncertainty and cold starts disclosed.
- [ ] Every public predicted number backed by a canonical versioned receipt; game/slate/board/Results identical.
- [ ] Unsupported player props and injured/unknown-player claims withheld; market families qualified individually.
- [ ] Official grading tracks frozen forecast version; pending/void/no-play states and corrected outcomes are append-only.
- [ ] Live feed clearly separate from predictions, factual and stale-aware.
- [ ] Shared GameTimePicks design system, sport hub navigation and responsive Results conventions reused—not rebuilt from scratch.
- [ ] Browser/accessibility/deep-link/redirect and complete-week coverage tests pass.
- [ ] COST-001/Ops controls preserved, no needless builds, paid use and Production integrations authorized.
- [ ] Exact-head GitHub CI green and documented founder approval before Production merge.

### Explicitly forbidden shortcuts

- Using today's roster or postgame QB box score as if known before a 2022 kickoff.
- Using a season-final conference rating as a Week 2 predictor without time-corrected provenance.
- Calling 10,000 Monte Carlo draws 10,000 real historical games or 10,000 independent evidence points.
- Adding a visually complete Top 10 player board using fake projections/undefined participation.
- Guessing team/provider IDs; auto-resolving conflicts by display name.
- Giving a research model fake sportsbook lines, odds, results or “verified 75% hit rate.”
- Building an NCAAF-specific sidebar, Results table, league switcher, component theme or distinct product engine.
- Auto-merging shared files/registry/workflow edits to solve a local test failure.
- Publishing raw licensed source datasets or tokens into the static export.
- Spending paid historical odds credits or launching cloud builds without approval.
- Rewriting historical forecasts, evaluation receipts or old roadmap Session Log entries.

---

## 19. Immediate execution queue for DP (do this first)

**First focused block — no new approval needed:**

1. Verify `dp/ncaaf-v1` branch head, repository state, existing NCAAF file list and the Stage 0/1 reported implementation. Run the 14 reported tests or correct the reported count with evidence; preserve SHA and test output.
2. Reconcile NCAAF-001 baseline to current main without touching reserved files. Ensure raw probe bodies are ignored and the derived `espn-coverage-v1.json` is reproducible.
3. Write a **short** Stage 1 acceptance receipt covering what `VERIFIED` truly means, especially FBS/FCS coverage, conference changes, missing historical pregame rosters and partial drive data.
4. Implement the bounded, deterministic scores-only historical corpus and schema/coverage/refusal tests under `app/src/lib/sports/ncaaf/` and `app/scripts/ncaaf/` (NCAAF-001 remaining scope).
5. Preregister the NCAAF-002 baseline evaluation protocol **before** fitting/tuning. State season windows, proper scoring, opponent-strength/cold-start policy, leakage checks and immutable receipts.
6. Continue into local NCAAF-002 once Gate 001 passes. Do not wait for an unrelated company-wide PR.
7. Provide a succinct checkpoint to founder: actual SHA, accepted Stage 1 evidence, corpus size by year/game type, failing tests, evaluation protocol and the next tasks. Include only genuine paid/shared-decision questions.

**Do not** merge to `main`, edit the master roadmap directly, add public routes/Top Boards, modify another sport, create Vercel deployments, or buy odds/CFBD services merely to make this first block run.

---

## 20. Reference inventory / provenance

These documents are **inputs and source-of-truth candidates** to verify against current `main`:

- `GAMETIMEPICKS_MASTER_ROADMAP_V2.md`, especially §0, §3 (contracts/invariants), §3A COST-001, §7 UX-001, §12 NCAAF-001/002 and release discipline.
- DP `STAGE_0_ARCHITECTURE_MAP.md` (Oct 8, base `2ba7dc13f9…`), including reserved paths, shared architecture sequence, reported fail-closed NCAAF capability and proposed research paths.
- DP `DATA_CAPABILITY_MATRIX.md` (Oct 9), including verified/partial/advertised data distinctions, ESPN 2021–25 coverage counts, `ncaaf-team-<ESPN id>` rule, model-scope constraints and bounded probe command.
- `app/src/lib/sports/source-registry.mjs`, `app/src/lib/sport-capability-registry.ts`, `app/src/lib/forecast-ledger/`, `app/src/lib/identity/`, `app/src/lib/model-eval/`, `app/src/lib/sports/sport-owners.mjs`, `app/scripts/prune-internal-routes.mjs` (**inspect current code; shared changes gated**).
- Current UX-001 merged components for NFL/MLB/NBA/UFC/EPL/soccer sport hubs, games, Live, Results, shared navigation and design tokens (**inspect current code rather than trusting older screenshots**).

**External provider research notes only:** ESPN unofficial college football endpoints, CollegeFootballData API/terms/tiers, NWS, Open-Meteo historical forecast license and The Odds API historical products were described in DP's October 9 matrix. Availability, provider prices and legal terms can change. Validate primary terms and authorized use before collecting at scale, licensing, publishing or charging.

---

**Final instruction to DP:** Treat this playbook as your mission and phase checklist. Build a defensible college-football intelligence system, then propose integration through the **same** canonical GameTimePicks Sport Hub, Forecast Ledger, Results, Live, UX and Product Engine framework. Keep progressing autonomously through local engineering gates; stop only for real data/spend/shared-contract/Production/model-publication decisions. Accuracy, reproducibility, source truth, platform consistency and low operating costs take precedence over superficial feature completeness.
