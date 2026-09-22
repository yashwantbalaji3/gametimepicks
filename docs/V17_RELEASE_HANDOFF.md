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
