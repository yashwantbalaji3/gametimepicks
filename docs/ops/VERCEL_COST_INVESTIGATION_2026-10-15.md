# COST-002 progress: Vercel cost and build-reliability investigation (2026-10-15)

**Scope:** the founder's P0 directive. Read-only research and local benchmarks. No deployments, no infrastructure changes, no merges.

**Evidence classes.** Every figure below is one of:
- **MEASURED:** GitHub's Vercel commit statuses; a Vercel build log; local benchmarks.
- **ESTIMATED:** derived from measurements. $ figures use the COST-001 rate assumption of $0.0035 per build-CPU-minute on the 8-vCPU Enhanced machine.
- **UNKNOWN:** needs the Vercel dashboard.

Appendices in `docs/research/ops/vercel-cost-2026-10-15/`:
- `DEPLOYMENTS.md` (14-day statistics);
- `WORKFLOWS.md` (build-trigger inventory);
- the benchmark harness and the output-equivalence script.

## 0. Relation to existing work (not duplicated)
- **COST-001 Phase 1 (10-07/08):**
  - previews off for `claude/*` branches;
  - build queue set to `WAIT_FOR_NAMESPACE_QUEUE` (one build per branch; this is why queued intermediates get cancelled when a newer one finishes);
  - Spend Management steps;
  - `scripts/vercel-cost-report.mjs`, which uses billed `cpuTimeForBilling` but needs a valid Vercel token.
- **That cycle's dashboard:** $339.09 Build CPU and $119.32 on-demand.
- **COST-001 Stage A (NBA results gate)** and NON_BUILD_INPUTS `ops/` are in place.
- **COST-001 §11 / COST-002:**
  - a Standard-machine (4 CPU / 7.6 GiB, no swap) Docker test hit the memory ceiling and OOM-killed a static worker, with or without `cpus: 2`;
  - COST-002 was opened to profile and reduce per-route build memory, as the path back to the cheaper Standard machine;
  - **this investigation is COST-002 progress.**

## 1. Billing figures provided by the founder
The founder reported **$65.32 "Build CPU Minutes"** and **$45.65 on-demand**. These likely overlap: on-demand is usage beyond the plan's included credit, and Build CPU is one usage line. Our 14-day model estimates about $118 of build CPU at the assumed rate. That is about 1.8× the dashboard figure, so the billing period, the effective rate or the included allowance differs from our assumption. **Savings below are therefore stated as % of build CPU-minutes, which carries over to dollars once the period is known.**

To reconcile, the founder should retrieve:
- the billing-cycle start and end dates;
- the per-category Usage table (Build CPU minutes, Function invocations / duration / Active CPU, Fast Data Transfer, Fast Origin Transfer, Edge Requests, Blob operations and storage, Observability or Speed Insights if enabled);
- the included-credit line.

## 2. Deployment volume and cost (MEASURED counts; ESTIMATED CPU)
| window | deployments/day | full builds/day | ignored/day | failed (total) | est. CPU-min/day | est. $/day |
|---|---|---|---|---|---|---|
| 1 d (10-14 05Z → 10-15 05Z) | 75 | 37 | 8 | 5 | 4,216 | $14.76 |
| 7 d | 85 | 61 | 8.4 | 9 | 2,832 | $9.91 |
| 14 d | 90 | 71.5 | 9.4 | 9 | 2,405 | $8.42 |

- **There is no duplicate Vercel project.** Every status on 1,322 commits comes from `gametime-picks`.
- **Bot workflows cause about 82% of build CPU.** Human merges are about 13% over 7 days.
- **Top sources (14 d, est. CPU-min):** human merges 5,931 · mlb-lineup-refresh 4,097 · daily-products 3,300 · mlb-daily-production 3,293 · nfl settlement receipts 2,694 · nightly-settle 2,141 · nba-results 1,412.
- **Builds are getting slower:** the estimated median build was 3.0–3.9 min through 10-12, then 5.1 (10-13) and 6.2 (10-14).
- **Every deployment clones the repository: 51.5 s in the measured log.** The tracked tree is about 2.3 GB / 107k files, and `data/internal` alone is 1,126 MB / 100k files that are almost never build inputs. Ignored deployments therefore still cost about 16 CPU-min each (COST-001 §2.4).

## 3. The 46-minute failures: ROOT CAUSE CONFIRMED (memory exhaustion in static generation)
- **Vercel log `dpl_8LLRvH9ztE8Mc2PmLuyrUAUxUpB4`** (8 cores, 16 GB):
  - `mem 7.03G/16.00G` at "Generating static pages (0/2874)";
  - **`mem 15.51G/16.00G · load 6.2 · self 18M`** at 2155/2874;
  - then no output for 44 minutes until the platform kill at 46m10s.
  - The wrapper's own RSS falling from 50 MB to 18 MB shows it was being paged out under memory pressure.
- **Five builds (10-14 13:45Z → 10-15 02:57Z)** have the same timing signature: about 46 min after the builder became free. Four earlier failures (10-10 → 10-12) were fast (under 2 min) and are a different class.
- **Static generation uses cores − 1 = 7 workers by default.** The last quarter of generation renders the heaviest pages:
  - `/mlb/board/<date>`: 147 pages, up to 5.5 MB each. Each has 14.5k spans, 527 unique inline SVGs and 1.67 MB of inline styles, against 0.12 MB of visible text.
  - `/results/date/<date>`: 130 pages, up to 5.2 MB, of which 62% is the inline RSC payload.
- **CI corroborates it** (Linux, 15.6 GB): the peak during generation rose from about 9 GB (Oct 13) to 12–14 GB (Oct 14–15). This is cgroup memory, which includes file cache.
- **Ruled out:**
  - #1080's code: local peak RSS 6.48 → 6.72 GB, with the same time.
  - Slow code: local full build is 2.3 min.
  - A duplicate project.
  - The build cache: it was restored normally in the failed log.
- **Local benchmarks** (same machine shape: 8 cores / 16–17 GB; swap-outs indicate pressure, because macOS compresses memory):

| config | next build | pages | swap-outs | export | HTML |
|---|---|---|---|---|---|
| 7 workers (default), 2 runs | 138–139 s | 2,874 | 49,960–179,820 | 1,811 MB | 1,087 MB |
| **4 workers** | **139 s** | 2,874 | **10,872** | 1,811 MB | 1,087 MB |
| 2 workers | 165 s | 2,874 | 0 | 1,811 MB | 1,087 MB |
| archives limited to 21 days | 122 s | 2,646 | 116,884 | **880 MB** | **483 MB** |
| 4 workers + 21-day archives | 127 s | 2,646 | **0** | 880 MB | 483 MB |

- **Repeat runs (9 builds, swap-outs = the consistent pressure signal on macOS):**
  - 7 workers: 49,960–179,820 (5 runs);
  - **4 workers: 0–10,872 (3 runs)**;
  - 3 workers: 0;
  - `next build` 121–139 s vs 124–139 s, so no time penalty.
  - Peak RSS + compressor does not separate the configurations (7.9–9.3 GiB), because macOS reports compressed sizes. The Linux number to confirm after merge is the Vercel heartbeat `mem`.
- **Output equivalence (4 vs 7 workers):** 7,500/7,500 export files are identical apart from build-identity and build-instant values.
- **Attribution of peak memory (local, RSS + macOS compressor):**
  - baseline 8.45–8.95 GiB;
  - MLB board archive limited to 21 days: 8.58;
  - Results archive limited: 8.76;
  - both: 8.81 GiB.
  - **The archives drive output size and build time, NOT peak memory.**
  - Peak memory tracks the **number of workers × each worker's baseline footprint**, which matches COST-001 §11 ("memory driven by what pages load").
  - The per-worker footprint is the open COST-002 profiling item.
- **Archive growth:** each MLB game day adds a board page (3–5.5 MB) and a results-date page (1–5 MB), plus `.txt` navigation payloads. Over the season these two route groups grew to **about 680 MB of HTML (60% of the export)**. Removing all but the last 21 days cut **56% of HTML, 51% of the export and 12% of `next build` time**.

## 4. Largest sources of unnecessary spend (ranked)
1. **Killed builds:** 368 CPU-min each. At the 10-14/15 rate (5 in about 13 h) that is about 1,400 CPU-min/day, roughly 35–50% on top of normal spend. Each kill also stalls the queue for up to 1 h.
2. **Timestamp-only and identical-content re-runs:**
   - MLB lineup refresh and MLB daily production: 78–83% of their build-triggering pushes are stamp-only by the loose heuristic (#1088's precise replay: 157 → 52 commits over 10 days);
   - `nightly-settle`: four cron retries per day each rewrite about 330 files whose content is unchanged except `gradedAt`/`generatedAt`;
   - `daily-products`: relative-age text written into committed files.
3. **Per-build weight of the historical archives:** about 56% of HTML; it grows daily.
4. **Clone weight:** about 51 s per deployment, including ignored ones. It is dominated by `data/internal` (1.1 GB, 100k files).
5. **Non-build-input merges:** tests, CI and docs-adjacent changes. About 13 of 183 code-merge builds in 14 days; #1091 addresses these.

## 5. Ranked opportunities (savings as % of 7-day build CPU = 2,832 CPU-min/day)
| # | Opportunity | Est. saving | Confidence | Complexity | Risk / freshness impact | Infra change |
|---|---|---|---|---|---|---|
| P0-1 | **Cap static-gen workers at 4** (#1093) | Eliminates killed builds: 10% of the 7-day average; about 1,400 CPU-min/day at the recent failure rate | High | XS (1 line + guard) | None measured (same time; identical output) | Build config (approval) |
| P0-2 | **Narrow the deploy trigger** (#1091): tests/e2e/CI | ~0.6% (~1 build/day), more on merge-heavy days | High | S | Closure-verified guard; cannot skip a real input | Ignore step (approval) |
| P1-1 | **MLB stamp-only gate** (#1088) | 5–7% (≈8 builds/day avoided, net of the ignored-build charge) | High | M (done; tested) | Suppression-safety assessment; forecasts, settlement and live are never gated; 6 h heartbeat | 2 protected workflows + ignore step (approval) |
| P1-2 | **Slim the historical archives**: static pages for the last N days; older dates via a lightweight archive page reading existing JSON; trim inline SVG/styles on board rows | ~10–15% of build CPU, from time and output size, not memory (local: export −51%, `next build` −11%; also shrinks the Vercel output upload and `.txt` payloads; the clone, install and prebuild steps are unchanged) | Medium (needs a Vercel-side measurement) | M | History stays accessible (same data, lighter page); no record changes; SEO on old dates slightly reduced | App code (approval) |
| P1-2b | **Per-worker build memory (COST-002 proper)**: profile what each static worker loads (shared data modules, per-route loads); load per page instead of per worker where safe | Enables the **Standard build machine** (4 vCPU vs 8 vCPU; about half the CPU-minutes per minute), possibly 40–50% of build CPU. It also removes the residual wedge risk under the cap | Low–medium (profiling not done) | M–L | Byte-identical export required (§11 acceptance: 3 constrained builds, 0 OOM, ≥ 1.5 GiB headroom) | Machine change later (approval) |
| P1-3 | **`nightly-settle` meaningful-change gate**: retries that change only stamps do not commit build inputs | ~2.5–3% (~4 builds/day) | Medium (needs a replay like #1088's) | M | Settlement correctness must be proven by replay; first runs and real grades always publish | Protected workflow (approval) |
| P1-4 | **`daily-products` / `nfl-event-window` / EPL per-run snapshot hygiene**: stop committing per-run snapshots into build inputs; no relative-age text in committed JSON | ~2–3% | Medium | S–M | Provenance snapshots move to `data/internal` (not served) | Workflows (approval) |
| P2-1 | **Deploy coordinator**: Git auto-deploy off for bot commits; one debounced deploy hook (e.g. ≤ 10 min, immediate within 2 h of any event start) | ~20–35% of builds (bursts coalesce) | Low–medium (needs a simulation) | L | Adds ≤ debounce delay to data publication. **Pregame forecast-of-record (Option B, served-by-deployment) needs an immediate path near start times** | Vercel Git settings + new workflow (approval) |
| P2-2 | **Decouple data from page builds**: frequently changing data served as static JSON / Blob and read client-side; builds only for code and daily data | 50–75% of builds | Low (architecture) | XL | Changes the "served revision" evidence model behind forecast-of-record. Significant UX/SEO work | Major |
| P2-3 | **Move `data/internal` out of the deploy repo** (separate data repo or branch) | Clone time 51 s → under 10 s per deployment (about 10–15% of every build, most of every ignored one) | Medium | L | Every workflow that writes `data/internal` changes | Major |

**Realistic target (evidence-based):**
- **P0 + P1 (about 2 weeks): −30% to −40%** of build CPU against the 7-day average. Against the last-24 h run rate, which includes kills, that is about −50% to −55%.
- **Adding P2-1 and P2-3: −50% to −65%.**
- Applied to the founder's figure for the same period, $65.32 of build CPU becomes about **$39–46** after P0+P1 and about **$23–33** with P2.
- The P0+P1 range is the sum of: killed builds about 10%, MLB gate 5–7%, archives 10–15%, `nightly-settle` 2.5–3%, snapshot hygiene 2–3%, and the trigger 0.6%. Non-build on-demand categories are UNKNOWN until the Usage breakdown arrives.

## 6. Protections (nothing here may change)
- **Live tracking is untouched by every option.** It is runtime (`/api/live` with CDN TTLs) and does not depend on builds.
- **Pregame forecast freezing and forecast-of-record:**
  - gates suppress only byte-identical (minus allowlisted stamps) re-runs;
  - first publication and any changed number always publish;
  - P2-1 must keep immediate deploys near start times.
- **Settlement and grading:** never gated without a replay proving identical content. Results and ledger paths are excluded from every stamp rule (tested in #1088).
- **Historical records:**
  - archive slimming changes presentation and delivery only;
  - records stay in git and remain reachable;
  - nothing is rewritten.

## 7. Recommendations on specific PRs
- **#1093 (new, P0):** approve first. It is the confirmed fix for the killed builds, with no measured downside.
- **#1091 (P0):** approve after #1093. It is small and self-verifying; its savings are modest but it removes merge-time risk.
- **#1088 (P1):** approve once #1093 has run cleanly for about 72 h. It is the largest high-confidence saving.
- **#1092, #1090:** ship together as one consolidated release after #1093 is verified.

## 8. Proposed implementation sequence and acceptance criteria
1. **#1093:**
   - the next Production build completes, and its log shows peak `mem` well below 16 G;
   - 0 builds killed at about 46 min over 72 h.
2. **#1091:** a test/CI-only merge shows "Canceled by Ignored Build Step"; real-input merges still build.
3. **#1088:**
   - MLB lineup/daily build-triggering pushes fall to 35% or less of baseline over 7 days;
   - 0 forecast/lineup changes missing from Production (spot-checked against the replay rule);
   - the publication deadline is still updated.
4. **Archive slimming:**
   - HTML 1,087 → ≤ 500 MB;
   - max page ≤ 1.5 MB;
   - every historical date still reachable;
   - post-build guard on HTML and page-size budgets.
5. **`nightly-settle` gate:**
   - replay of 14 days shows 0 settlement/grade differences suppressed;
   - retries with identical content commit no build inputs.
6. **P2 decisions** after 1–5 are measured against the founder's Usage page.

## 9. Monitoring to prevent future spikes (all GitHub-side, $0, no Vercel builds)
- **Daily deploy-cost report workflow:** reads the last 24 h of Vercel statuses and records deployments/day, builds/day, failed, ignored and canceled counts, estimated CPU-min by source, and median build minutes. It keeps one issue open when any threshold is breached:
  - more than 1 killed build per day;
  - more than 75 builds per day;
  - median build over 8 min;
  - estimated CPU-min per day 25% above its 7-day average.
- **Build-memory early warning:** the quality-gate CI already logs `[phase] ALIVE … mem`. Warn when peak `mem` during `next build` exceeds 12 G, or the page count, export size or largest page grows more than 10% a week.
- **Post-build budgets** (with P1-2): total HTML, largest page, page count.
- **Vercel Spend Management** (founder, dashboard): a monthly budget with alerts at 50/75/90%.
