# Next program — reality check and execution proposal (written at the v1.7 close, 2026-09-22)

**Status:** PROPOSAL. Nothing here is started. v1.7 closed `V1.7 FOLLOW-THROUGH — PUBLIC AND VERIFIED`
(production `070365ea3`, `docs/V17_RELEASE_HANDOFF.md` §6.3). Three bounded parallel tracks are proposed;
each names what is true today, the highest-value next work, dependencies, founder gates, risks, ordering,
and what an autonomous session may execute without waiting.

Invariants that every track inherits: the live selector stays `bank-builder@1` / `moonshot@2` until the
preregistered forward gate passes and the founder writes the adoption receipt; no registry or model status
moves without a receipt; NBA is `HISTORICAL_ONLY`; F1 = Option A (market constructions, labelled); F2 = HOLD;
pending is never a loss; missing is never zero; a market price is not a forecast.

---

## Track A — NBA end-to-end readiness (calendar-driven: preseason Oct 3, regular season Oct 20)

### Current state (measured, `docs/V17_NBA_READINESS_RECEIPT.md`)
| Piece | State |
|---|---|
| Canonical data | 4,179 finals · 4,179/4,179 box scores · 113,080 player rows, DNP explicit, null-not-zero (316 non-observation rows nulled; `active` key on 202 files only) |
| Roster owner | **LIVE** (free ESPN team roster endpoint): 30/30 teams, 561 players, raw kept 14 days as a workflow artifact, normalised artifacts committed daily by `sport-schedules.yml`; two-way status not exposed (never inferred) |
| Schedule | capture repaired (month form); 370 events over 70 days available; the committed artifact refreshes on the next cron |
| Model v0 | Elo (two streams) + trailing-window minutes + per-minute rates + seeded 10k sim; preseason artifact `productEligible:false`; roster reconciliation recorded (22 of 40 simulated players no longer rostered, 16 rostered players have no history) |
| Dispersion | v0 margin SD 22.09 vs realised 15.98; decomposition done (independence across ~18.6 pooled players, unconstrained minutes, no shared pace, OT unmodelled); v1 plan C1–C5 preregistered on dev 2023-24 + 2024-25 / assessment 2025-26 |
| Preregistration | `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` look 1 (bars per market, no pooled adoption, forward-shadow requirement) |
| Automation | `sport-schedules.yml` builds/grades the experimental forecasts daily; legacy stats.nba.com halves gated off (`auto-refresh`, `morning-projections`) |
| Price receipt | **none** — no authorized NBA odds capture exists; the product column is unreachable regardless of model quality |

### Highest-value next work (in order)
1. **A1 · Roster-gated pool v0.1** (versioned `nba-preseason-experimental-v0.1`, its own artifact family, never overwriting v0): a simulated player must be on the captured roster as of the forecast instant; rostered players with no history get an explicit `INSUFFICIENT_HISTORY` minutes state (null, not zero) and a documented prior; v0 keeps running beside it so the two can be graded side by side from Oct 3. Tests: traded player excluded, rookie present with null history, roster capture missing → the forecast refuses (never falls back to box-score membership).
2. **A2 · Minutes / rotation model v0.1**: minutes as a constrained allocation (240 per team, per-player caps, rotation depth from the last N games and the roster), replacing the per-run unconstrained draw — this is C1 of the dispersion plan and the largest single variance term (minutes ±17 min vs real 0.96).
3. **A3 · Dispersion v1 (C2–C5)**: shared pace/possession draw per game, team-level residual, OT handling, rescale bounds — fitted on the preregistered dev split, scored once on the assessment split, receipt written before Oct 20. Target: sim margin SD within ±1.5 of realised on 2025-26 with 80% interval coverage 0.78–0.82.
4. **A4 · Preseason experimental pipeline for Oct 3**: already scheduled; add the grader's preseason bucket report and a daily internal summary (minutes MAE, production-given-minutes MAE) so the population is *observed*, never used as regular-season evidence.
5. **A5 · Regular-season shadow from Oct 20**: freeze v0.1/v1 versions on Oct 19, start the forward ledger, report Brier/log loss vs Elo and vs market only where a price receipt exists.
6. **A6 · Market-by-market validation** per the preregistration bars; each family earns `PUBLIC` separately; product eligibility is a second, later decision.
7. **A7 · Bank Builder / Moonshot eligibility**: only after A6 and only through the ProductEligibleLeg contract (the `nba` slot already exists and refuses today); needs a price receipt (A-gate below).

### Dependencies
A2 → A3 (minutes first, then environment); A1 independent; A5 needs A1–A3 frozen by Oct 19; A7 needs A6 **and** an odds receipt.

### Founder gates
- **Paid NBA odds capture** (any provider credit) — charter 4.2 #8. Without it A7 is unreachable; A1–A6 need no gate.
- Registry moves (`HISTORICAL_ONLY` → anything) — receipt-gated, founder decides.
- Any public NBA surface (even "experimental") — founder decides; the charter forbids a tout-like preseason surface.

### Risks
- Preseason tuning leaking into regular-season claims (mitigated: separate populations, preregistered split).
- Roster churn Oct 16–19 (cuts, two-ways): A1 must re-read the roster at every forecast instant.
- Two-way status unobservable free → minutes priors may over-weight fringe players; document, don't infer.
- `morning-projections` still writes NBA singletons if `NBA_LEGACY_REFRESH` is ever flipped back on.

### Autonomous
A1, A2, A3 (research artifacts, versioned, internal), A4, A5 setup, receipts. Not autonomous: any registry change, any public route, any paid capture.

---

## Track B — Vercel / static-export reliability (ground truth: `docs/V17_DEPLOY_TRIGGER_AUDIT.md`)

### Current state
| Fact | Value |
|---|---|
| Trigger policy | correct; 0 unnecessary data builds in 7 days (every data build touched a build-time fs input); `[skip ci]` never reaches Vercel; keep-set-aware skipping rejected as unsafe |
| Build time | local cold 117 s for 2,474 pages (players 1,771); Vercel median 6.8 min; the #628 merge built in ≈6 min |
| Failures | 15 since Sep 18 (0/240 before, 15/206 after), 14 in a 46.0–46.4-min band = the 45-min ceiling; cause unknown without Vercel logs |
| Export | `out/` 1.4 GB / 6,667 files: `/mlb` ≈628 MB, `/players` ≈342 MB, `/results` ≈271 MB; `output: "export"` copies 991 MB of `public/` then prune deletes 944 MB |
| Duplicates | 53% of builds superseded before completion (Vercel cancels only queued builds; ≥8 concurrency slots so nothing queues) |
| Latent | `capture-ufc-events.mjs` still uses the ESPN range form (answers 200 today; the same change killed NFL/NBA/EPL on Sep 20) |

### Highest-value next work (in order)
1. **B1 · Close the log gap** — founder runs the 14 `npx vercel inspect <dpl> --logs` commands; an autonomous session then classifies where the 45 minutes go (upload vs build vs queue). Everything below is ordered on the assumption the upload dominates; B1 can reorder it.
2. **B2 · Shrink the export without changing semantics**: (a) the `/mlb` explorer's 6.4 MB board pages — the P5O tuple/person-id packing brought 1,771→1,511 KB once; the same discipline for the remaining RSC payloads; (b) `/players` 1,771 pages — audit which player pages carry data no reader reaches (DeferUntilVisible children serialise once); (c) `/results` 271 MB — the per-cell style objects and the per-day rows (P268 lesson: a 1,160 KB page); (d) stop copying `public/data` into `out/` before prune (emit the keep-set directly, or move the internal working tree out of `public/` — the prune script's own comment says `public/data` is an internal working tree that `output: "export"` mirrors). Each change measured by `du` on `out/` and by the weight budgets that already exist; never raise a budget.
3. **B3 · Coalesce sibling bot pushes safely**: the bots already share a writer queue (`gtp-generated-artifacts` concurrency); the lever is fewer, batched commits per window (e.g. one commit per chained run instead of one per step) — never `[skip ci]`, never a data-aware skip. Measure: superseded share 53% → target < 20%.
4. **B4 · UFC capture onto the shared month plan** (10 lines; the helper exists) before ESPN changes the MMA endpoint too.
5. **B5 · Build-time watchdog**: a step that refuses at 30 min with a named phase, so a slow build fails with a reason instead of a ceiling kill.

### Dependencies
B1 informs B2's ordering; B2 items independent of each other; B3 independent; B4 independent.

### Founder gates
- Vercel logs / dashboard access (B1) — founder only.
- Plan/billing changes (build minutes, concurrency) — founder only.
- Nothing else; B2–B5 are engineering with existing guards.

### Risks
- A payload cut that drops a field a reader reaches (mitigated: the existing rendered guards + weight budgets; measure, don't assume).
- Coalescing that delays a publication past its SLO (mitigated: the publication watchdog exists; measure lateness before and after).
- Moving `public/data` is a wide refactor (337 build-time readers) — do it behind the same path helper, one consumer at a time, or not at all.

### Autonomous
B2 (a)(b)(c), B3 measurement + a bounded first step, B4, B5. Not autonomous: B1, plan changes.

---

## Track C — Results & Trust v2 (ground truth: `docs/V19_RESULTS_TRUST_ARCHITECTURE.md`, `docs/V17_PRODUCT_STORE_OWNERSHIP.md`)

### Current state
| Fact | Value |
|---|---|
| Owners | settlement truth `mr-dub/settled/*`; protected record `mr-dub/portfolio.json` (Bank Builder 36–35; Moonshot fold 4–33); legacy Moonshot ledger 0–7 (now labelled legacy everywhere); parlay lab ledger; per-sport graded picks |
| Contradictions left (C1–C10 in the V19 doc) | three "Bank Builder" records still exist in artifacts (36–35 protected / 5–0 June summary still feeding `crownRung` on `/` and `/today` and the results hub tile "Road to $10K completed 5–0" / the retired 30–37 store's stale file); the frozen trio (`dual-bank-builder-active.json`, `moonshot-lane/active.json`, `products/lifecycle/latest.json`) still read on 8 / 4 / 4 mounted routes; record hole 2026-07-08 → 08-14 undisclosed (C8); four copy-pasted portfolio readers, no shared loader (C10) |
| Vocabulary | forecast record / product record / cycle completion / leg hit rate / calibration / MAE / bankroll defined; "accuracy" and "win rate" banned as generic |
| Cycle history | derivable from receipts (`derive-cycle-table.mjs`, internal): BB 21 cycles / 0 completed / 1 open; MS 32 / 0; eras marked |

### Highest-value next work (in order)
1. **C1 · One shared results loader** (C10): a single `results/projection` read that every surface (home, /today, /results, /bank-builder, /moonshot, /mr-dub, Ask) consumes, with the window, n, era and owner on every cell — the mechanical precondition for everything below.
2. **C2 · Retire the frozen trio** per the 8-step plan in `V17_PRODUCT_STORE_OWNERSHIP.md` §7 (now unblocked by the Moonshot-era decision): repoint the 16 mounted readers to the receipt owners, keep the June artifacts as archive, delete the reconciliation block on /bank-builder, pin with tests that the canonical owner supplies every field.
3. **C3 · The "5–0" June summary**: decide its one honest home (a "completed ladders" archive tile with the June dates) and stop it feeding `crownRung` on `/` and `/today`; disclose the C8 hole as a dated gap on the record surfaces.
4. **C4 · Simple-first hierarchy**: Overall → Sport → Market → Forecast receipt, with Bank Builder / Moonshot histories as separately owned panels (receipt-derived cycle table public), pending / push / void as first-class states, progressive disclosure; mobile-first at 375 px (the /results page is 63k chars of text today).
5. **C5 · Ask GameTime** reads the same projection (it serves no product record today) — after C1.

### Dependencies
C1 → C2 → C3 → C4; C5 after C1. Track A/B independent.

### Founder gates
- Where the June "5–0" completed-ladder record lives publicly (identity question, not a code question).
- Any headline metric definition change (the vocabulary is fixed; a new public metric needs an owner and a stable definition).
- Visual direction ("sports broadcast × analytics terminal") for C4 — a design review, not a code gate.

### Risks
- Retiring a store that an unmounted-but-imported path still reads (mitigated: the ownership graph lists every reader; tests pin the field supply).
- A projection that quietly sums populations (mitigated: `RECORD_TYPES` closed set, era on every row, the read-model refusal tests).
- Word-ceiling / payload regressions on the homepage and /results (existing budgets; measure).

### Autonomous
C1, C2, C3 (except the founder's "5–0" home), C5 groundwork, the cycle table made public behind the existing copy guards. Not autonomous: the "5–0" identity decision, the visual redesign.

---

## Recommended ordering across tracks

| Week | A (NBA) | B (Vercel) | C (Results) |
|---|---|---|---|
| Sep 23 – 29 (camps Sep 29) | A1 roster-gated v0.1 · A2 minutes v0.1 | B4 UFC month plan · B1 (founder logs) · B3 measurement | C1 shared loader |
| Sep 30 – Oct 6 (preseason Oct 3) | A3 dispersion v1 on the split · A4 preseason reports | B2 (a) `/mlb` payload · B5 watchdog | C2 frozen-trio retirement |
| Oct 7 – 19 | A5 shadow setup, freeze Oct 19 | B2 (b)(c) · B3 first coalescing step | C3 June record home · C4 hierarchy (design) |
| Oct 20 → | A5 forward ledger · A6 per-market receipts | measure superseded share | C4 build · C5 Ask |

MLB regular season ends Sep 27; the Bank Builder / Moonshot universe thins from Sep 28 under F1 = A with the
honest off-day state — no product work is scheduled for that gap on purpose (F3).

## What one autonomous session should do first (if started tomorrow)
1. B4 (UFC onto the shared plan) — smallest, prevents the next silent capture death.
2. A1 (roster-gated pool v0.1) — the largest NBA quality gap with the clearest test surface.
3. C1 (shared results loader) — precondition for every Results & Trust step.
Each on the feature branch with the full gate; a PR per track; the founder merges.
