# Vercel build-input coverage audit: data/internal paths read by public routes

**Date:** 2026-10-17 (~08:00Z) · **Base:** origin/main `8330f989d7` · **Mode:** read-only analysis. No builds, deploys or merges. The only write was a branch push (below).
**Branch:** `claude/build-input-coverage` @ `7d86c4895148820fbc728e1a2cd01edfa6dfbac5`, pushed. No PR.

## TL;DR

- The ignore step claims four data/internal paths are "the only repo-root internal files a PUBLIC route reads at build". That claim is **false**. The import-graph scan found **19 more referenced files/directories, in 9 groups**, that public routes or `npm run build` steps read at build time.
- **Real staleness, last 14 days:** there were **5 ignore-step skips** that left Production serving old content:
  - **sim-v2 shadow receipts** (4 windows, 8 / 14 / 25 / 29 min). Each window changed the *receipt of record* on 1–5 `/nfl/simulation/[eventId]` pages, so readers saw an older pre-kickoff simulation.
  - **P300 forward receipt** (1 window, 50 min). `/models` showed NFL rushing yards as "Accumulating 216 of 300" after it had already **breached**. The family also changed from "breached" to "holding".
- The other groups had **0** windows, but only because their producing workflows also commit to `app/public/data` today. That coupling is incidental and nothing guarantees it.
- **Cost of adding everything:** 5 extra builds in 14 days, about **0.36 builds/day** against a baseline of 78 Production builds/day (+0.5%).
- **Recommendation:** add all 9 groups (done on the branch). Keep 3 module-level false positives excluded, each with a machine-checked exemption. Land the fail-closed guard `build-input-coverage.test.mjs` (done on the branch).

## 1. The map: data/internal path → readers → covered?

**Method.** For every route in `ROUTE_TABLE` whose classification is not `internal`, I took:
- its `page.tsx` plus every `layout.tsx`/`template.tsx` above it;
- every `route.ts` handler;
- the app-level `sitemap`, `robots`, `manifest`, `not-found` and `layout`;
- every script in the package.json `"build"` chain.

I followed static and dynamic `import`/`require` (relative and `@/`) to closure. In every module reached, I extracted data/internal references in these forms:
- string literals;
- `"data","internal",…` segment runs;
- constants built from those, including constants imported across modules;
- one-argument path helpers such as model-lab's `research("epl/…")`.

Prose strings containing whitespace are ignored. Module granularity over-approximates, so I checked every hit by hand.

### Already covered (the original four)

| data/internal path | read by (public routes / build steps) | in BUILD_INPUTS |
|---|---|---|
| `mlb/model-learning/calibrator-manifest.json` | /markets (disagreement-explorer-loader) | yes |
| `nfl/forecast-receipts/` | /nfl/game, /results/nfl, /my, /matchups, /players, /teams, handler /data/my/nfl-players.json, build-ask-projections | yes |
| `mlb/prediction-snapshots/` | /today (command-center/changes.ts) | yes |
| `forecast-ledger/` | /results, /results/forecasts/**, /models, /players, /teams, build-ask-projections, build-search-index, emit-forecast-record-assets | yes |

### Missing on origin/main (verified real reads)

| # | data/internal path | reader module → public routes / build steps | in BUILD_INPUTS (main) | branch |
|---|---|---|---|---|
| 1 | `research/nfl/sim-v2/shadow/` | sim-v2/public-receipt.mjs → **/nfl/simulation/[eventId]** (`generateStaticParams` and the record shown), /nfl/game/[eventId] (simulation-v2-link) | **no** | added |
| 2 | `research/epl/forward/receipt.json` | command-center/model-status.ts (`modelStatusFor("epl")`) + model-lab.ts → /, /epl, /epl/match/[slug], /models | **no** | added |
| 3 | 11 Model Lab files: `research/nfl/replay/player-props-share-level-forward/receipt.json`, `research/epl/forward-totals/receipt.json`, `research/epl/reports/{epl-totals-shadow-forward-protocol, epl-history-replay-evaluation, epl-elo-poisson-forward-protocol, epl-totals-replay-evaluation}.json`, `research/nfl/reports/{player-props-share-level-second-look, player-props-share-level-estimate-adoption, anytime-td-historical-replay-evaluation, win-margin-historical-replay-evaluation, matchup-totals-historical-replay-evaluation}.json` | command-center/model-lab.ts `research(rel)` → **/models** | **no** | added (12 files with #2) |
| 4 | `nfl/experimental-settlement/` | sports/graded-pick-owners.mjs, results/v2/day.ts, results/v2/overview.ts → /results, /results/date/[date]; build-ask-projections | **no** | added |
| 5 | `research/ufc/model-vs-market/graded.jsonl` | graded-pick-owners.mjs → /results, /results/date/[date]; build-ask-projections | **no** | added |
| 6 | `nfl/winner-corrections/` | results/nfl-model-favored-io.mjs (`CORRECTIONS_DIR`) → /results, /results/date/[date]; build-ask-projections | **no** | added |
| 7 | `nfl/side-decision-cutover.json` | nfl-model-favored-io.mjs → same as #6 | **no** | added |
| 8 | `model-eval/latest-readout.json` | app/results/model-audit/page.tsx (direct `readFileSync`) → **/results/model-audit** | **no** | added |
| 9 | `parlays/optimizer-reconstruction/receipts/` | scripts/ask/build-ask-projections.mjs (build step; output feeds the /ask assets) | **no** | added |

### Referenced but NOT read publicly (false positives, stay excluded)

| path | why it is excluded | guard condition (re-checked by the test) |
|---|---|---|
| `mlb/pregame-archive/settlement-joins/`, `mlb/research-quarantine/`, `mlb/reference/provider-event-aliases.json` | row-lineage-loader.ts names them, but /markets only calls `loadLineageIndex` / `loadDateLineageArtifact`, which read the **exported** artifact under `app/public/data/research/row-lineage/` (already an app/ input) | "allow" list: public modules may import only those names |
| `research/nfl/reports/player-props-v1-evaluation.json` | `loadPlayerPropsFit` in player-props-v1.mjs has **no caller**. Public pages import only the sampling helpers | "forbid": the name must appear nowhere else in any public closure |
| `research/epl/learning/latest.json`, `research/nfl/regular-season-public-card-v1.json`, `research/soccer/*/reports/walk-forward-v1.json`, `research/soccer/preregistration-league-expansion-v1.json`, `mlb/linescores/<date>.json` | provenance/evidence **label strings** in sport-capability-registry.ts, soccer/leagues.mjs and launch/runbook-registry.mjs. None of these modules does file I/O | "label": the module must keep importing no fs and calling no read |

Internal-only readers (/launch, /ops, /preview/*) are pruned from the export and do not count: launch evidence, uiux, products/receipts, end-zone-vault ledger, social, analytics-capture. These literals from the prompt reach **no** public closure: `research/nfl/role-shares-v1`, `nfl/role-evidence`, `nfl/end-zone-vault/ledger.json`, `products/receipts`, `product-cards/paper`, `mlb/pregame-archive/market-snapshots`, `nfl/current`, `research/injuries/nfl/latest.json`, `platform/v1`. Each one is either unreachable from any route (pipeline libs such as data-platform/*, forecast-ledger/adapters/*, role-vocabularies) or reached only from internal routes. `research/epl/forward/receipt.json` from the prompt **is** public (#2).

## 2. Staleness in real history (2026-10-03 → 10-17, first-parent origin/main)

**Data.**
- 1,310 first-parent commits.
- 1,095 GitHub `Production` deployments, fetched with 13 paginated calls. Vercel creates a deployment only when a build completes; ignore-step skips get a "Canceled by Ignored Build Step" commit status and no deployment.
- Commit-to-deploy-complete latency for built commits: p10 3.4, **p50 4.8**, p90 9.7 min.

**Window definition.** A window is a commit that changed path P but has no Production deployment of its own. Staleness runs from commit time to the first completed Production deployment whose sha contains it.

**Batched pushes.** Some windows are carried by a merge commit pushed within 60 s and have no Vercel status of their own. Those are ordinary build latency, not ignore-step skips, so they are listed separately.

**Verification.** I checked all 8 window commits and their serving deployments against Vercel commit statuses (16 calls).

| path group | commits touching (14d) | ignore-step stale windows | batched (not ignore) | median / max staleness | user-visible difference? |
|---|---|---|---|---|---|
| sim-v2/shadow | 38 | **4** | 3 | **19.5 / 29 min** | **Yes, every window.** Re-running `showableSimulationEvents` / `simulationOfRecord` on the served sha vs the new sha changed the record for 2, 1, 3 and 5 games. No new pages: the showable set stayed 16/30. |
| Model Lab set (12 files) | 39 | **1** | 0 | **50 / 50 min** | **Yes.** `21350954b0` (P300 forward receipt). /models kept rush_yds "ACCUMULATING 216/300" when it was FORWARD_BREACHED, receptions BREACHED when it was HOLDING, and stale n (394 → 586). |
| epl/forward/receipt.json | 37 | 0 | 0 | — | — |
| nfl/experimental-settlement | 111 | 0 | 0 | — | — |
| ufc graded.jsonl | 3 | 0 | 0 | — | — |
| winner-corrections / side-cutover | 1 / 1 | 0 | 0 | — | — |
| model-eval/latest-readout.json | 0 | 0 | 0 | — | — |
| parlays recon receipts | 1 | 0 | 0 | — | — |
| *(excluded)* pregame-archive/settlement-joins | 70 | 45 | 3 | 19 / 275 min | not public (see §1) |

**Confirmed ignore-step windows**

| commit | landed | Vercel status | served by | served at | stale |
|---|---|---|---|---|---|
| `a9c70ce22e` (shadow) | 10-06 16:15Z | Canceled by Ignored Build Step | `ca2d1ebbcc` | 16:24Z | 8 min |
| `6ff03a9daa` (shadow) | 10-11 23:58Z | Canceled by Ignored Build Step | `ebf51ec2f8` | 10-12 00:12Z | 14 min |
| `d63b066c3c` (shadow) | 10-13 19:32Z | Canceled by Ignored Build Step | `6c8ab259f9` (weather capture) | 19:56Z | 25 min |
| `c88c9a85df` (shadow) | 10-15 17:21Z | Canceled by Ignored Build Step | `6de43c6186` (weather capture) | 17:49Z | 29 min |
| `21350954b0` (P300 receipt) | 10-06 18:59Z | Canceled by Ignored Build Step | `613fa80c5f` (settlement receipts) | 19:50Z | 50 min |

**Batched pushes, not ignore-step skips:** `75014304c0`, `862d93b0b2` and `09b024c6b5`. Each was carried by a "Merge remote-tracking branch" commit 1 s later and served in about 8–10 min.

**Why the windows are short.** About 78 builds/day from bot commits touching `app/public/data` close each window by coincidence. The risk is unbounded in a quiet period, for example overnight or if bot cadence drops. A shadow receipt written shortly before kickoff can then miss kickoff entirely. Groups 2 and 4–9 show 0 windows only because their producers currently co-commit app/public/data.

## 3. Build-count cost of the additions

| path group | extra builds (14d) | extra builds/day |
|---|---|---|
| sim-v2/shadow | 4 | 0.29 |
| Model Lab set (incl. epl forward) | 1 | 0.07 |
| experimental-settlement, ufc graded, winner-corrections, side-cutover, model-eval readout, parlays recon | 0 | 0 |
| **union of all additions** | **5** | **0.36 (+0.5% of 78/day)** |
| *(for reference, if settlement-joins were added)* | 45 | 3.2 (+4%), not recommended |

## 4. Recommendation and guard

1. **Add all 9 groups** (19 entries). This is a correctness fix at negligible cost; it is implemented on the branch. Model Lab files are listed individually rather than as `research/`. The whole directory is 412 MB, and in 14 days 109 skipped commits touched it, which would cost about 7.8 extra builds/day for no public change.
2. **Keep excluded:** row-lineage archive/quarantine/aliases, `player-props-v1-evaluation.json` and the label strings. Each exclusion carries a re-checked exemption that lapses when the module's public use changes.
3. **Guard** (`app/src/lib/build-input-coverage.test.mjs`, about 2 s, runs in the unit suite):
   - **producer ⇒ reader (fail closed):** every data/internal reference in any non-internal route closure or build-step closure must be covered by a `BUILD_INPUTS` entry, or must be a verified exemption. The failure message names the path, the reader modules and the routes.
   - **reader ⇒ producer:** every data/internal `BUILD_INPUT` must exist on disk and still be referenced publicly, so the list cannot accumulate dead build triggers. Every exemption must still match an uncovered reference and its condition must still hold.
   - **Sentinels:** each extraction form (literal constant, join segments, path helper, cross-module constant) must keep detecting a known reader, so the guard cannot go vacuous.
   - **Negative control:** with origin/main's BUILD_INPUTS, the test fails and lists exactly the 19 missing paths above. With the branch it passes.
   - Markers `# GTP-BUILD-INPUTS-BEGIN/END` were added around the array. `vercel-ignore-build.behavior.test.mjs` now derives one fixture per data/internal entry from the script, so every listed path is behaviour-tested to BUILD. The pregame-archive churn test still asserts SKIP.
4. **Known limits of the guard:**
   - It does not see reads whose path is assembled entirely at runtime from non-literal pieces. Example: `leagueDir(key)` consumed by a future public reader. That case is mitigated by the label exemption requiring no I/O.
   - It does not see reads through `data/` symlinks. Module granularity over-approximates; that is intended.
   - It does not cover `public/data` content copied from data/internal by a non-build workflow. That copy is already an app/ input.

**Tests on the branch:**
- `build-input-coverage`, `vercel-ignore-build.behavior` and `build-trigger-non-inputs` (21/21) pass.
- build-phase-observability, vercel-canonical-project, vercel-preview-gating and daily-production-commit-scope pass.
- `internal-route-exclusion.test.mjs` #5 fails both with and without the change, because it needs a built `app/out/` (post-build phase; no build was run).

**Calls used:** about 35 GitHub API calls.

Scratch artifacts (scratchpad):
- `analyze.mjs` / `map.json`: route → path map
- `history.mjs` / `history.json`: windows
- `simdiff.mjs`: receipt-of-record diff
- `deps_all.jsonl`: deployments
