# Program 058–061 — Founder Report

**Date:** 2026-07-29 (session spanned a usage-limit pause; resumed 23:49 ET) · **Operator:** Claude Fable 5, Ultracode autonomous session
**Companion documents:** `PROGRAM_058_061_EXECUTION_LOG.md` (SHAs, baselines, lane ledger) · per-lane docs referenced throughout.

---

## 1. Repository and branch reconciliation

`main` is the authoritative branch (every scheduled workflow pushes `HEAD:main`; `origin/june30-reset` was a 60-commit-stale pointer). Local Sprint 057 (`6fcef8fc`) and `origin/main` had diverged by exactly one commit each; the bot's archive-metadata commit (`ad836c2f`) was preserved and Sprint 057 was **rebased onto it → `32120fb5`**, pushed fast-forward to `origin/main` and synchronized to `origin/june30-reset`. No force-push to `main`; no bot history lost. Sprint 057 is now operationally delivered on the intended remote.

## 2. SHA ledger

| Milestone | SHA |
|---|---|
| Pre-program baseline | `76fae758` |
| Bot commit preserved | `ad836c2f` |
| Sprint 057 rebased + pushed | `32120fb5` |
| Lane C preregistration (before any scoring) | `ecc215fc` |
| Lane C execution (stopping rule triggered) | `e2037ad9` |
| Lane A policy ratification | `5603a5e8` |
| Lane B/D/E/F/G + release integration | see final commits in `git log` (committed after integration validation this session) |

## 3. Strategy ratification (Lane A) — RECOMMENDED: YES

`docs/PRODUCT_STRATEGY_RESEARCH_TERMINAL.md` is now durable product policy: GameTimePicks is a **sports research terminal and market-intelligence platform**. The simulation model is a transparent research layer — never an oracle. Future predictive claims require a preregistered, out-of-sample, market-benchmarked pass (conditions §3 of that doc). `docs/MULTISPORT_PROMOTION_GATES.md` defines the six gates every sport must pass.

Public positioning was repaired to match (the audit found a prediction-first layer contradicting the honest layer, often on the same page):

- /today "Top model picks by market" → **"Largest simulated probabilities by market"** — a factual sort, labeled as such, with a settled-record chip on calibration-failed families.
- Game report hero "GameTimePicks prediction" → **"simulation read · not validated to out-predict the market."**
- /methodology: "profit-locking ladders" → **paper ladders**; "Edge" formula reframed as **model–market gap** ("disagreement measure, not an advantage — large positive gaps were where the model performed worst"); "Proven repeatable" → "Repeated twice on paper"; UFC 6–1 chip de-celebrated to "moneyline record · n=7".
- /results gained the missing benchmark strip (§9 below).
- `batter_total_bases` is now **excluded from every ranked, recommendation-shaped list** (`PREDICTION_DISABLED_MARKETS` in `model-calibration-status.ts`); history stays visible on research surfaces.

## 4. Final MLB variance experiment (Lane C) — IMPROVES_MODEL_ONLY; STOPPING RULE TRIGGERED

Preregistered (`ecc215fc`, before any scoring) → executed (`e2037ad9`). Full detail: `docs/MLB_FINAL_MODEL_DECISION.md`.

- Windows: train ≤06-24 (14,938) · validation 07-01→07-11 (3,721) · **untouched test 07-21→07-27 (2,974)**.
- Validation selected C2 (per-market variance widening, shrunk toward global; k: hits 1.85, Ks 3.31, TB 3.69, HRR 3.81).
- Untouched test: **C2 Brier 0.2462 vs market 0.2409** — 0/3 sub-windows better; leave-one-market-out never below market; still 5.04pp over-forecast.
- The shrink-toward-market hybrid fitted **w = 0 on train — the third independent zero**.
- **Binding consequence per the registration: the independent sportsbook-beating model objective is SUSPENDED.** The simulator continues as research content. Any revival requires a new preregistration and a new data regime (not more post-hoc corrections on this corpus).

Per-market: `batter_hits` RESEARCH_CONTENT_ONLY · `batter_hits_runs_rbis` RESEARCH_CONTENT_ONLY · `batter_total_bases` DISABLE_PREDICTION · `pitcher_strikeouts` INSUFFICIENT_EVIDENCE (n=142 on test).

## 5. Analytics (Lane B) — schema COMPLETE; provider activation is THE one founder action

The provider-neutral, NOOP-by-default, PII-free first-party layer was completed to the program taxonomy: `event-contract.ts` **SCHEMA_VERSION 2** (closed-enum events incl. homepage_viewed, market_row_opened, probability_explainer_opened, market_disagreement_opened, methodology_viewed, status_viewed, sport_interest_selected, feedback_submitted; `MARKET_FAMILIES` + closed `FEEDBACK_TOPICS`; no free text anywhere), funnel mapping extended (/, /methodology, /system-status, /markets), validation tests extended. Contract doc: `docs/PUBLIC_BETA_ANALYTICS_CONTRACT.md` (taxonomy, v1→program name map, funnel/activation/retention definitions, sport-demand signals, acceleration evidence thresholds).

**Founder action (the only one):** sign §7 of `docs/ANALYTICS_ACTIVATION_DECISION.md` (provider choice), provision the endpoint, set `NEXT_PUBLIC_ANALYTICS_ENABLED` + `NEXT_PUBLIC_ANALYTICS_ENDPOINT`. Until then production analytics stays deliberately dark and every adoption question in §12 is unanswerable.

## 6. NBA (Lane D) — first serious adapter; readiness gates honest

`docs/NBA_RESEARCH_ADAPTER_READINESS.md`. NBA ran end-to-end during the 2026 playoffs (54 boards, 2,204 leans, 4,592 settled rows, hit 0.4908 — below coin flip; REB the only family above 0.5454 yet still Brier-worse than the de-vigged market). Gates today: **G1 partial · G2 fail · G3 fail · G4 fail · G5 pass(path) · G6 pass (as market intelligence)**. Prerequisite zero: persist the ISO tip-off instant the ESPN provider already receives and discards — without it no board can ever be research-eligible. Plan: ~4–5 engineer-weeks across 6 weeks starting ~Sep 14 → preseason dress rehearsal → founder go/no-go before late-October tip-off. Market intelligence only; no player-prop model until lineage + capture history are proven; the legacy `sports-coverage.ts` NBA `level:'full'` parlay gate must never re-activate.

## 7. EPL (Lane E) — bounded prototype design; season starts mid-August

`docs/EPL_MARKET_INTELLIGENCE_PROTOTYPE.md`. Canonical verdict on the ≥6 legacy soccer graders: the tested TS engine (`soccer-markets.ts`) is the only permitted base; the defective Python settlers are FROZEN (never pointed at EPL); the dual-schema `world-cup/settlement/` directory is documented history, never parsed uniformly. Design: new `soccer/epl/` artifact root (never `world-cup/`), competition-aware EventIdentity (league scoping + kickoff-to-minute; never name-only fixture joins), 1X2 with explicit draw handling and three-way de-vig ported to TS, fail-closed postponed/abandoned/replayed states (a hard gate — EPL winter postponements are routine). Blockers named: re-verify `soccer_epl` Odds-API coverage/cost; an official results source is a **founder credential/vendor decision** (API-Football is paid). ~2.5 weeks of work to a preview-only prototype.

## 8. UFC (Lane F) — rematch-unsafe settlement repaired

The defect: settlement joined odds to results by a sorted fighter-name pair **without date** (`grade_moneylines.py`, duplicated in `build_backtest_dataset.py`), against a last-write-wins dict over 1,545 bouts with 10 colliding rematch keys (6 with different winners) — the only 2 decided graded rows sat on a collided key and were right **by luck**. The repair keys settlement on the date-qualified `boutId` (already present on every result row), fails closed to pending on missing/ambiguous ids, adds rematch/opposite-winner/no-contest/missing-id fixtures plus a mutation test proving the old join fails them, and writes a regrade correction audit artifact. Consequence accepted: `gradingReady` flips **false** — the honest state. UFC remains **SCAFFOLD_ONLY** (no official free results API, 2 odds snapshots total, sparse volume). Doc: `docs/UFC_IDENTITY_AND_SETTLEMENT_REPAIR.md` (supersedes the Sprint 045 deferral).

## 9. Disagreement explorer / public research value (Lane G, phase 1)

/results now leads with **the benchmark that matters**: raw-model vs calibrated vs de-vigged-market Brier on identical settled rows, rendered through the typed contract adapter (no rate arithmetic in components — Sprint 051 rule), with the "how to read" copy correcting the hit-rate-alone framing. The /today reframing (§3) plus the calibration-failed chips are the phase-1 disagreement pedagogy: **disagreement is not edge; large positive disagreement currently carries negative evidence.** The full explorer (per-row disagreement history) is FUTURE WORK gated on per-row lineage fields in the ledger (named limitation, Phase 0.5).

## 10. Public beta release — classification

| Item | Class |
|---|---|
| First clean post-gate settlement not yet observed (2026-07-30 ET candidate) | WALL_CLOCK_OBSERVATION |
| Corrected pipefail not yet exercised by a real scheduled failure | WALL_CLOCK_OBSERVATION |
| Analytics provider dark | BLOCKED BY FOUNDER DECISION (one action, §5) |
| Ledger rows lack per-row eventId/lineage fields | NAMED_LIMITATION (explorer phase 2 gate) |
| Model does not out-score the sportsbook | NAMED_LIMITATION under the ratified strategy — disclosed on every relevant surface, not a blocker |
| Data-integrity contradictions | **NONE FOUND** (no MANDATORY_BLOCKER) |

**Seven-day observation plan (daily):** nightly-settle stamps clean + lineage verdicts on new dates · quarantine list unchanged (07-28 stays) · money md5 `affe6b21…` + BB lock `cb80473f…` untouched · research artifacts fresh (exporter alarm quiet) · deployed HTML matches contract (built-HTML guards in CI) · route errors/404s · once analytics is signed: activation/retention/funnel per `PUBLIC_BETA_ANALYTICS_CONTRACT.md`.

## 11. What changed for users

Honest reframing on /today, game reports, /methodology, /results (§3, §9); a market benchmark where a bare hit rate used to stand alone; total-bases no longer appears in anything shaped like a recommendation. No probabilities changed; no money artifacts moved; no new sport surfaced.

## 12. New knowledge created

1. Third independent w=0 — the model/market blend question is now closed on this corpus, by protocol.
2. Per-market variance factors (hits 1.85 vs others ≥3.3) — the strikeouts/TB/HRR simulators are broken at the distribution level, not miscalibrated at the edge.
3. UFC's 2/2 correct grades were luck on a collided key — now structurally impossible to repeat.
4. NBA's blocker is one discarded field (ISO tip-off), not a rebuild.
5. EPL's blocker is a vendor decision, not engineering.

## 13. Rejected ideas

- Deploying C5 (variance→Platt, test 0.2444) because it "looked best on test" — test numbers cannot re-select a candidate; that is the registration working as designed.
- Renaming v1 analytics events to program names — wire-shape churn, zero information gain.
- Pointing any legacy Python soccer settler at EPL; writing EPL artifacts under `world-cup/`.
- Regrading UFC history in place — correction is an audit artifact; history is preserved.
- A global variance factor as "the fix" — per-market heterogeneity (1.85→3.81) makes one k a lie.

## 14. Open dependencies (exact instructions)

| Dependency | Owner action |
|---|---|
| Clean settlement proof | Observe nightly-settle after 2026-07-30 ET slate; verify stamps + lineage verdict on the new date; do not force |
| Pipefail live proof | Passive: next real scheduled failure must exit non-zero and alert |
| Analytics activation | Sign `ANALYTICS_ACTIVATION_DECISION.md` §7, provision endpoint, set 2 env vars |
| EPL results vendor | Choose/authorize an official EPL results source (API-Football = paid) before any EPL settlement work |
| Odds-API EPL/NBA credits | Confirm budget before ingestion begins |

## 15. 30/60/90 roadmap

**0–30 (Aug):** observe both wall-clock proofs · founder signs analytics (or explicitly defers) · EPL identity+capture scaffolding behind the vendor decision · UFC repair merged and readiness honest · quarterly-audit cadence documented.
**31–60 (Sep):** first adoption read if analytics live · NBA adapter build from ~Sep 14 (ISO tip-off persistence first) · EPL preview artifact against early-season fixtures · no MLB model R&D (suspended).
**61–90 (Oct):** NBA preseason dress rehearsal → founder go/no-go for tip-off market intelligence · EPL public-preview decision on a month of clean captures · UFC data-investment decision only if bout-identity + odds-capture cadence funded · monetization/distribution experiments on observed adoption.
**Effort allocation (recommended):** product+adoption 35% · data/ops 25% · NBA 20% · EPL 10% · docs/distribution 10% · MLB model R&D 0% (suspended by protocol) · UFC 0% until funded gates.

## 16. Founder decisions required

1. **Ratify** research terminal + market intelligence as company direction — *recommended YES; every alternative now contradicts preregistered evidence.*
2. **Analytics**: sign provider §7 + set env — *recommended YES; adoption evidence gates the 60-day decisions.*
3. **Approve the MLB stopping rule as binding** — *recommended YES; it already triggered.*
4. **NBA first heavy build** (per §6 plan) — *recommended YES.*
5. **EPL market-intelligence-only prototype** + results-vendor authorization — *recommended YES to prototype; vendor is your call.*
6. **UFC stays scaffold** until gates pass — *recommended YES.*
7. **Public beta ships with named limitations** + 7-day observation — *recommended YES.*
8. **Effort allocation §15** — *recommended as stated.*

## 17. Next program (only if evidence warrants)

Program 062 should be adoption-driven, not model-driven: first analytics read → NBA adapter execution → EPL preview. No new model program unless a new data regime (e.g., NBA market-intelligence corpus) yields a preregistered hypothesis worth testing.
