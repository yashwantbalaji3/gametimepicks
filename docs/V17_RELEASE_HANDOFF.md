# GameTimePicks v1.7 — release / handoff

**Program:** Bank Builder + Moonshot Recovery & Multi-Sport Product Platform, with the NBA readiness track.
**Branch:** `v17-bankbuilder-moonshot-multisport` (merges of `origin/main`, never rebased).
**Status:** `SHADOW_RUNNING · NO PUBLIC SELECTION CHANGED · NBA PIPELINE RUNNING · NBA BLOCKED FROM PRODUCTS`.
Release SHA, CI run and production proof are appended in §6 after the push.

## 1. What shipped (public behaviour)

| Surface | Before | After |
|---|---|---|
| /bank-builder | "Record 5–0" from a public summary frozen 2026-06-13 | the official protected record (35–34 at release), the same number the homepage, /today and /results print |
| /bank-builder, /moonshot | no statement of which sports could contribute | "Today's eligible universe": per-sport counts, plain reasons, and the caveat that every eligible leg is market-priced with no forecast behind it |
| /mr-dub | "The methodology, proven · The $100 → $19.5K journey" (no artifact carries $19.5K) | "The record, as settled · The $100 → $10K ladders" |
| Bank Builder 7-step preview, skipped card, Moonshot descriptor | "we lock profit…", "the model holds…", a hardcoded World Cup market record, no variance word | reworded; numbers removed; "high variance" named |
| Published lanes (`mr-dub/daily-portfolio.json`) | legs carried no event id, start, market key or line | additive `eventId`, `startUtc`, `marketKey`, `line` on every leg |
| Selection | unchanged — `bank-builder@1` / `moonshot@2` still publish | unchanged; six policies run in shadow beside them |

Nothing about which card is published changed. That is by design: adoption waits for the forward receipt.

## 2. Product policy versions

| Product | Live | Shadow (control → candidates) | Where |
|---|---|---|---|
| Bank Builder | `bank-builder@1` (executor text corrected, S9) | `BB-LEGACY` → `BB-C1` (primary), `BB-C2b` | `app/src/lib/products/selector/policies.mjs` (content-hashed ids) |
| Moonshot | `moonshot@2` | `MS-LEGACY` → `MS-C1`, `MS-C4` | same |
| Eligibility | ProductEligibleLeg v1, `MARKET_PRICED_LEG_POLICY = ADMITTED_PENDING_FOUNDER_DECISION` (gate F1) | | `app/src/lib/products/eligible-leg/contract.mjs` |

## 3. Program artifacts

1. Forensic audit — `docs/V17_BANK_BUILDER_MOONSHOT_FORENSIC_AUDIT.md` (+ `data/internal/products/forensic-v17/`)
2. Product Eligible Leg contract v1 — `docs/V17_PRODUCT_ELIGIBLE_LEG_CONTRACT.md`
3. Sport eligibility matrix — `docs/V17_SPORT_ELIGIBILITY_MATRIX.md`
4. Selector preregistration — `docs/V17_SELECTOR_PREREGISTRATION.md` (looks 1–2)
5. Historical replay receipt — `docs/V17_HISTORICAL_REPLAY_RECEIPT.md` (+ `data/internal/products/selector-replay/`)
6. Forward shadow receipt — `docs/V17_FORWARD_SHADOW_RECEIPT.md` (+ `data/internal/products/selector-shadow/`)
7. NBA readiness receipt — `docs/V17_NBA_READINESS_RECEIPT.md` (+ `data/internal/research/nba/{boxscores,experimental}/`)
8. UX audit, Play surfaces — `docs/V17_UX_AUDIT_PLAY_SURFACES.md`
9. This handoff.

## 4. Automation added

| Workflow | Step | Writes |
|---|---|---|
| `daily-products.yml` | eligible-leg universe + selector shadow at the publication instant (first publication wins) | `data/internal/products/{eligible-legs,selector-shadow}/`, `public/data/products/availability/` |
| `nightly-settle.yml` | grade shadow from linescores, roll shadow ladders, publish shadow for the roll-forward date | same |
| `mlb-daily-production.yml` (unchanged step) | the team-market ingest now archives every capture under its instant | `public/data/mlb/team-markets/captures/<date>/` |
| `sport-schedules.yml` | NBA experimental: grade yesterday (fetch box score), build today | `data/internal/research/nba/experimental/` |

## 5. Remaining gaps

**Blocking nothing today, but decide before the MLB season ends (2026-09-27):**
- **F1** — whether market-priced legs may be product legs. Today admitted and labelled; `REFUSED` empties both products until a validated owner exists.
- **F2** — EPL registry state (artifact says validated out-of-sample; lane calibration UNPROVEN).
- **F3** — what the products do in the MLB postseason and the NBA gap (Oct 20 earliest, and only after validation).

**Non-blocking, ordered:**
1. Retire the two stores frozen 2026-08-17 and the parallel optimizer-derived "Bank Builder" ledger (audit S1/S2); delete the reconciliation block on /bank-builder (UX B-2).
2. Public no-play reason copy and `probabilityBasis` chips after adoption (UX B-1/M-1).
3. Receipt-derived cycle table on the history surfaces (UX B-3).
4. NBA: free roster owner (N-4), regular-season preregistration (N6), de-schedule the dead stats.nba.com crons and delete caches/venv/demo file (N-1/N-2/N-3), calibrate sim dispersion after preseason diagnostics.
5. Delete unmounted components (`world-cup-flex-card`, `dual-ladder-board`, `home-hero`, `nba-finals-stake-row`).
6. Ask GameTime keeps `getParlayCandidates` MLB-only on the optimizer owner; a bounded change may point it at the eligible-leg artifact once a selector is adopted.
7. The Moonshot historical replay is under-powered (27 of 37 days could only run at the capture instant) — the capture archive fixes this going forward, not backward.

## 6. Engineering receipt

| | |
|---|---|
| Local release candidate | branch `v17-bankbuilder-moonshot-multisport`, 11 commits on top of `c0decad62`, `origin/main` merged (last bot commit `932b8d832`) |
| Gate (from `app/`, 2026-09-22) | `lint:scripts` 0 · unit **6,919 pass / 0 fail** (855 files) · `tsc --noEmit` 0 · `npm run build` OK (prune swept 3,089 files / 969 MB from `out/data`) · post-build **601 pass / 0 fail** |
| Built-export proof | `/bank-builder/` and `/moonshot/` render "Today's eligible universe" with the market-priced caveat; `/mr-dub/` prints "The record, as settled · The $100 → $10K ladders"; no banned string in any of the three |
| Routes | none added; two pages gained one server-rendered section; no client JS added |
| New tests | 55 (contract 14 · normalizers 5 · selector 10 · shadow 6 · play-surface copy 5 · NBA parser 10 · NBA pipeline 21 — the last counted in the 6,919) |
| Internal artifacts | forensic-v17 (4 files) · eligible-legs (2/day) · selector-replay (2) · selector-shadow (day + state + ledger) · NBA boxscores 4,180 files / 54 MB · NBA experimental 1 forecast |
| Push / deploy | **not performed by this session** — the push was refused by the session's permission classifier (both `HEAD:main` and the feature branch). The release candidate is fully committed locally and gate-green; the founder pushes, CI runs, and the deployed `build-info.json` SHA is recorded here afterwards. |

### 6.1 Overnight 2026-09-22 (second session)

| | |
|---|---|
| Branch on origin | pushed (`origin/v17-bankbuilder-moonshot-multisport`); `origin/main` `04020f8ea` merged in at `07dd568ec` (merge, never rebase) |
| PR | https://github.com/yashwantbalaji3/gametimepicks/pull/627 |
| CI | run `35693325132` **success** on `07dd568ec` (4/4 checks, merge state CLEAN); run `35695206409` **success** on the full overnight head `7d79f38da` |
| Local gates | `42f569e50`: unit 6,920/0 · post-build 601/0 · `de7c71ef1` tree: unit 6,942/0 · post-build 606/0 (lint 0, tsc 0, build OK both) |
| Push to `main` | **refused again** by the session's permission classifier (`[Merge Without Review]`); the founder merges PR #627 |
| Deployed SHA | still `e02f8fb4` (bot) at handoff — v1.7 not in production |
| Overnight additions | see `docs/V17_OVERNIGHT_HANDOFF_2026-09-22.md` §B–§I |

### 6.2 Production proof (2026-09-22)

PR #627 merged by the founder as `441fefa4b` (13:40:41Z). Production `/data/build-info.json` → `20a19a672` (builtAt 2026-09-22T14:22:12Z), a bot descendant containing the full PR history (ancestry proven with `git merge-base --is-ancestor`). Smoke and shadow evidence: `docs/V17_OVERNIGHT_HANDOFF_2026-09-22.md` §K. **`V1.7 FOUNDATION — PUBLIC AND VERIFIED`.**

### 6.3 Final closeout — `V1.7 FOLLOW-THROUGH — PUBLIC AND VERIFIED` (2026-09-22)

| | |
|---|---|
| PR #628 merge | `070365ea3d128b6c58a893d5fbea562123f17429` (parents `848b56f47` main, `df5f3ad58` branch), committed 2026-09-22T15:49:03Z |
| Production SHA (`/data/build-info.json`) | **`070365ea3d128b6c58a893d5fbea562123f17429`** · builtAt `2026-09-22T15:50:19.866Z` · environment `vercel` · message "Merge pull request #628 from yashwantbalaji3/v17-bankbuilder-moonshot-multisport" |
| Ancestry (`git merge-base --is-ancestor`) | production contains the #628 merge, all **11 of 11** #628 commits (`f2c613dab..df5f3ad58`), the #627 merge `441fefa4b` and the v1.7 head `935493d7c`; production == `origin/main` at verification (0 / 0) |
| Deployment receipt (GitHub deployments API, Vercel-created) | deployment `6594908674` → `success` "Deployment has completed" at 2026-09-22T15:54:50Z (≈ 6 min after the merge commit) |
| CI | `quality-gate` run `35749838905` **success** on `070365ea3` (`main`); PR run `35746651429` success on `df5f3ad58` |
| Smoke (live) | /bank-builder: eligible universe + "no forecast behind it", **"Market construction · priced by the sportsbook market · what the prices imply, not a prediction"** above the card's legs, Record 36–35, no "model N%"; /moonshot: universe + caveat, Market construction ×2, Market-implied chips ×4, "high variance", "4–33 · Settled record · since 2026-08-15 · settled receipts", "Legacy era (June 2026, 7 cards) 0–7 · 2026-06-23 … 2026-07-06"; /mr-dub: "The record, as settled · The $100 → $10K ladders", "Bank Builder 36 – 35", Market construction ×4, Market-implied ×8, "Settled record 4–33", legacy detail; /results: tile "Moonshot 4–33 · since 2026-08-15 · settled receipts · separate paper lane", explorer holds ONE Moonshot row (fold era, note names the legacy 0–7 as kept apart); /today, /, /methodology: footer "last build …", no "last refresh"; **no** "model-qualified" / "the model skipped" / "Model pass" / "model discipline" / "the model holds" / "$19.5K" / "proven"-as-claim / "guaranteed" / "sure thing" on any surface (the two "proven" hits on /methodology are "until grading is proven" and "still unproven") |
| Bank Builder protected record | **36–35** (0 void, 0 pending) — `mr-dub/portfolio.json` |
| Moonshot fold-era record | **4–33** since 2026-08-15 (`portfolio.json .moonshot`, `inBankrollSince` marker) — the primary current record |
| Moonshot legacy record | **0–7**, 7 cards, 2026-06-23 → 2026-07-06 (`product-ledger/moonshot.json`) — labelled legacy, never summed |
| Live selector | `bank-builder@1` / `moonshot@2` (`lifecycle-registry.mjs:133,145`, `selection-policy.mjs`); `policies.mjs` + `select.mjs` byte-identical to the v1.7 head |
| Shadow | BB-C1 / BB-C2b / MS-C1 / MS-C4 **SHADOW ONLY, NOT ADOPTED**; gate `NOT_YET` (all-days decided **1** < 20; forward-only decided **0**); ledger: BB-LEGACY 1-0-0, MS-LEGACY 0-1-0 (2026-09-21), 2026-09-22 published once at 14:22:27Z with 96 eligible legs and **not rewritten** by the two later daily-products runs (content sha `658dc69b12d5` = first commit); pending is held, never a loss |
| `MARKET_PRICED_LEG_POLICY` | `ADMITTED_PENDING_FOUNDER_DECISION` (F1 = Option A recorded in the packet; the constant names the state) |
| Registry | MLB `FULL_MODEL`; NFL, EPL `EXPERIMENTAL_PUBLIC` (not promoted); UFC `SCAFFOLD_ONLY`; **NBA `HISTORICAL_ONLY`**, experimental artifact `productEligible:false`, `dataClass PRIVATE_RESEARCH` |
| EPL (F2 HOLD) | forward receipt `state ACCUMULATING`, **n = 10 of 60**, model LL 1.0277 vs control 1.3677 (paired, no CI yet), `modelId epl-model-v2-elo-poisson`, control `epl-model-v1-split-poisson` kept separate; results capture recovered 2026-09-22T14:47Z (50 rows) |
| Automation on `main` | NFL / NBA / EPL captures use the shared `espn-scoreboard-window.mjs` month plan (the EPL helper delegates to it); no `dates=A-B` range form remains except `capture-ufc-events.mjs` (the MMA endpoint still answers 200 to the range form today; `ufc-fight-week` run 35747213225 success 15:25Z — a latent risk, listed for the next program); Follow registry unions every dated forecast file (`readdirSync`); footer reads `buildInfoFromEnv`; `morning-projections` step env `SKIP_NBA` gated on `vars.NBA_LEGACY_REFRESH` (line 276); doubleheader stub sets `openGraph.url`; `nightly-settle` regenerates the shadow report after grading. The first scheduled runs of the repaired captures on merged code are the next crons (`sport-schedules` ~14:00Z, `epl-settle` ~01:25Z); the local dry-runs (16 NFL / 370 NBA events) and the 14:47Z EPL recovery are the pre-merge proof |
| Remaining investigation | Vercel: the 15 failures since Sep 18 sit at the 45-min ceiling; the merge itself built in ≈6 min — the variance is Vercel-side. The 14 `npx vercel inspect <dpl> --logs` commands in `docs/V17_DEPLOY_TRIGGER_AUDIT.md` are the next step (founder login) |
