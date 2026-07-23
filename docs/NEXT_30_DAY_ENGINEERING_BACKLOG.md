# GameTimePicks — Next 30-Day Engineering Backlog

## Overnight update — 2026-07-23 (UFC-graduation mission, HEAD eb677182)

New evidence changes the sequencing below:
- **MLB research repair is now WORKFLOW-enforced** (P0 done): the nightly `mlb-pregame-capture.yml` runs the eligibility
  quarantine safety-net + a HARD leakage gate that fails the run before commit — the bot can no longer reintroduce
  leakage. Remaining P0 = keep it + the live-archive integration green; accumulate qualifying dates (1/30 today).
- **UFC is NOT the next engine.** A forensic audit downgraded it RESEARCH_ONLY → **SCAFFOLD_ONLY** (0 backtestable
  bouts, no real model, 2 confirmed leakage bugs). P1 changes from "UFC backtest" to a **UFC data-foundation rebuild**
  (point-in-time pregame odds capture + bout-identity date-safe join + the `UFC_FEATURE_CONTRACT.md` gate) BEFORE any
  backtest. NBA off-season prep becomes the parallel Q4 track.
- **Event markets: foundation shipped, live BLOCKED.** All providers are LEGAL_REVIEW_REQUIRED → adapters ship
  fixture-only. P1 first step is a **founder ToS review for Polymarket's public read-only APIs**, not code.
- **Highest-leverage MLB transparency fix** (from `MLB_PUBLIC_USEFULNESS_GAP_AUDIT.md`): surface
  `marketSnapshot.capturedAt` (time-to-first-pitch) across board + report — the data already exists in every sim
  artifact; it tells users how stale the compared price is, with no new modeling. Do transparency before cosmetics.

**Revised sequencing:** 24h = preserve MLB cleanliness (integration green, health HEALTHY, 4 artifacts, gate BLOCKED) +
these two founder decisions (UFC rebuild vs NBA-first; Polymarket ToS review). 7d = the winning research track + the
`capturedAt` transparency fix + evidence-warehouse wiring. 30d = NBA reactivation prep, first event-market snapshot
collection (if ToS cleared), MLB trained-model decision only after its gate passes.

---

_Date: 2026-07-23. Companion to `docs/GAMETIMEPICKS_PRODUCT_ARCHITECTURE.md`. **Theme: accuracy + provenance over
feature count.** Nothing in this backlog touches money — `portfolio.json`, Bank Builder, Moonshot, and Mr. Dub are
frozen. **Money impact is "none" for every item below** (money md5 `affe6b21071f2b3be96bb2774eb347c3` must stay
unchanged; modeling gate stays BLOCKED until earned)._

Field key per item: **Objective · Dependencies · Effort (S/M/L) · Risk · User value · Acceptance criteria ·
Founder-approval-needed · Public impact · Money impact.** Ground truth: the five audits + workflows cited in the
architecture doc.

Priority meaning: **P0** = must stay green every day (the floor). **P1** = the next real capability, built
internally/read-only first. **P2** = advanced work that depends on P1 landing.

---

## P0 — Keep the floor green (daily invariants)

> The research **leakage repair is DONE** (`docs/MLB_RESEARCH_TIMESTAMP_INCIDENT.md`, detected 2026-07-22,
> repaired 2026-07-23): 278 post-first-pitch rows quarantined, canonical gate `scripts/lib/research-eligibility.mjs`
> added, observation-quality now PASS with 0 leakage, join monitor PASS, money md5 unchanged. **No remaining repair
> work.** P0 is now about **keeping it green** plus production health and slate completeness.

### P0.1 — Keep the live-archive research integration green
- **Objective:** the nightly `mlb-research-integration.yml` job stays PASS on the clean archive and **fails loudly**
  if quality ever regresses to BLOCKED/FAIL.
- **Dependencies:** the repaired gate (`scripts/lib/research-eligibility.mjs`), `build-mlb-research-observations.mjs`,
  `research-observation-quality.mjs`, `monitor-mlb-research-quality.mjs`; nightly settle + pregame commits landing
  before 12:40 UTC.
- **Effort:** S (monitor an existing workflow).
- **Risk:** Low. A future leak would re-fail the gate — the risk is a *silent* pass, which the workflow's hard-check
  (`status ∈ {PASS,EMPTY}` and `leak == 0`) is designed to prevent.
- **User value:** indirect — protects the honesty of any future public model claim.
- **Acceptance criteria:** nightly run green; observation-quality `PASS`/`EMPTY` with 0 hard violations; join monitor
  overall ≠ FAIL; the workflow's own `md5sum -c` on `portfolio.json` passes; gated suite 29/29
  (`RESEARCH_ARCHIVE_INTEGRATION=1`).
- **Founder-approval-needed:** No (keep-green, internal).
- **Public impact:** None (internal warehouse; `data/internal/*` is pruned from the export).
- **Money impact:** None.

### P0.2 — Production health gate green every deploy
- **Objective:** `app/scripts/health-check.mjs` prints `✓ HEALTHY … Deploy may proceed` (money integrity +
  reconciliation + hygiene + freshness) before any deploy.
- **Dependencies:** `portfolio.json` unchanged; freshness inputs current.
- **Effort:** S.
- **Risk:** Low; it is the existing deploy gate.
- **User value:** the public site never ships a broken/stale/misleading build.
- **Acceptance criteria:** health-check HEALTHY daily; if it fails, STOP and fix the reported item first
  (`PUBLIC_BETA_DAILY_OPERATIONS.md` step 1).
- **Founder-approval-needed:** No.
- **Public impact:** None (gate only).
- **Money impact:** None (verifies the md5; never writes it).

### P0.3 — Current MLB slate completeness
- **Objective:** every public MLB slate has all **four artifacts** for the date: `boards/D.json`,
  `team-markets/D.json`, `player-props/D.json`, `game-simulations/D.json`.
- **Dependencies:** Odds API paid ingest **runs in CI, not locally** (local 401s without a live key); pregame capture
  windows healthy (`capture-window-health.mjs`).
- **Effort:** S–M (operational; re-run failed ingest in CI, don't fabricate).
- **Risk:** Medium — provider outage / credit exhaustion yields an incomplete slate. Mitigation: honest no-play /
  empty states, never fabricated markets (`PUBLIC_BETA_DAILY_OPERATIONS.md` "Missing markets").
- **User value:** the daily product is actually complete, not a partial slate dressed as full.
- **Acceptance criteria:** `mlb-slate-completeness-gate.mjs` passes for D; simulations only exist where both a
  projection and a market probability exist (never faked); social pack refuses games not pregame-frozen.
- **Founder-approval-needed:** No (unless spending Odds credits beyond the daily budget → yes).
- **Public impact:** Keeps `/today`, `/mlb`, `/simulate` honest and complete.
- **Money impact:** None.

### P0.4 — Public-beta honesty invariants hold
- **Objective:** no superiority language, no research-internals leak, four record families stay separate, WC stays
  archive, BB/Moonshot stay paper/$0.
- **Dependencies:** `public-beta-safety.test.mjs`, `record-family-separation.test.mjs`, `world-cup-closeout.test.mjs`,
  the forbidden-vocab scan.
- **Effort:** S (run existing guards in CI).
- **Risk:** Low, but high-cost if breached (a single "edge/EV/beat-market" string is a launch defect).
- **User value:** trust — the product never over-claims.
- **Acceptance criteria:** all named guards green; grep for forbidden vocab in `app/src` (incl. comments) is clean;
  gate still BLOCKED; money md5 `affe6b21…` unchanged.
- **Founder-approval-needed:** No.
- **Public impact:** Protects every public route.
- **Money impact:** None.

---

## P1 — The next real capability (build internal / read-only first)

### P1.1 — Next sport engine: UFC backtest graduation (+ NBA-return readiness)
- **Objective:** run the **leakage-safe historical backtest** UFC needs to move from RESEARCH_ONLY toward a gated
  public surface; in parallel, prepare NBA to resume when its season returns. UFC is the **richest dedicated
  non-MLB stack** (schedule + odds + 2,695-fighter DB + v1/v2 engine + grading) but fail-closes today at 0/150 clean
  rows, `backtestReady:false` (`MULTI_SPORT_CAPABILITY_AUDIT.md` §UFC). NBA is HISTORICAL_ONLY (off-season, returns
  October).
- **Dependencies:** UFC — `data/internal/ufc/*`, the dormant `ufc-*.yml` workflows (all `workflow_dispatch`), a clean
  historical fight dataset (backfill status "not-started"). NBA — the season resuming + live boards flowing again.
- **Effort:** L (UFC backfill + backtest harness); M (NBA readiness checklist).
- **Risk:** Medium. The backtest may show the engine is **not** validated — that is an acceptable, honest outcome; it
  stays internal, not published. Do **not** let a dormant engine ship on optimism.
- **User value:** a second genuinely-modeled sport, if and only if it earns it.
- **Acceptance criteria:** UFC — a documented, leakage-safe backtest with ≥ the required clean-row threshold, compared
  **against the market first**; `readiness-latest.json` flags flip only on real evidence; **never surfaced in product
  cards** until validated. NBA — a written season-return checklist mirroring the MLB four-artifact + health gate.
- **Founder-approval-needed:** **Yes** to publish/graduate either sport. No to run the internal backtest.
- **Public impact:** None until graduation; then a clearly experimental, gated surface (not product cards).
- **Money impact:** None.

### P1.2 — Event-market EVIDENCE warehouse (internal-only foundation for "Markets")
- **Objective:** build the **internal** foundation for event/prediction contracts — the first, read-only layers of
  the 10-item gap list (`SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md` §4): (1) an `EventContract` schema (open outcome
  set + resolution rule + source + deadline), (2) real evidence ingestion normalized into dated items, (3) an
  evidence timeline with source-reliability tiers. **No public route. No model yet.**
- **Dependencies:** none blocking (net-new). Reusable *patterns* only: the manual `pipeline/manual_overrides/
  news_signals.json` shape and the player/team identity registries — neither is event-market scaffolding, so treat
  as reference, not a base.
- **Effort:** L.
- **Risk:** Medium — scope creep. Mitigation: ship **schema + ingestion + evidence timeline only**; explicitly defer
  modeling, pricing, and settlement to P2. Keep it `INTERNAL_ONLY` (excluded from `out/`).
- **User value:** none yet (deliberately) — it is the provenance substrate a future Markets product requires.
- **Acceptance criteria:** schema + evidence store exist under `data/internal/`; every evidence item carries
  `publishedAt`, source, tier; a guard test proves nothing under `/markets/*` is exported or nav-linked.
- **Founder-approval-needed:** No to build internal; **Yes** before any public `/markets` surface.
- **Public impact:** None (internal-only by design; enforced).
- **Money impact:** None.

### P1.3 — Cross-provider market-metadata adapters (read-only)
- **Objective:** a read-only normalization layer that maps **market metadata** (market keys, line formats, book
  identifiers, fixture ids) across providers into one internal shape — so future features aren't hard-wired to a
  single feed. Read-only; captures/normalizes metadata, does not place or price anything.
- **Dependencies:** existing Odds API ingest; provider docs. Credit-safe: prefer `--dry-run` + credit guards.
- **Effort:** M.
- **Risk:** Low–Medium (provider schema drift). Mitigation: adapters fail closed and log gaps rather than guessing.
- **User value:** indirect — resilience + provenance for every downstream sim/market surface.
- **Acceptance criteria:** a documented internal metadata shape; ≥2 providers mapped read-only; a test asserting the
  adapter never fabricates a missing field (emits `market_unavailable`/gap, per `product-status.ts`).
- **Founder-approval-needed:** No (internal, read-only). Yes if it would spend paid credits beyond budget.
- **Public impact:** None directly.
- **Money impact:** None.

### P1.4 — Probability explainability standard
- **Objective:** one **provenance standard** for every probability the site shows — inputs used, model version,
  market anchor, sample size, and calibration status (e.g. "modeled market, not market-proven") — rendered
  consistently. Turns the existing methodology labels (independent / market-anchored / market-implied /
  projection-only / experimental) into a uniform, machine-checkable contract.
- **Dependencies:** `market-coverage.ts`, `model-calibration-status.ts`, existing sim artifacts (`runCount`,
  `modelVersion`).
- **Effort:** M.
- **Risk:** Low. Upside: makes over-claiming structurally hard.
- **User value:** high — a user can always see **why** a number is what it is, and its honest caveats.
- **Acceptance criteria:** a documented provenance schema every public probability carries; a guard test that a
  probability without provenance cannot render; no superiority language introduced.
- **Founder-approval-needed:** No to define; **Yes** to change any public-facing copy/labels.
- **Public impact:** Positive (clarity), copy-only where it touches the surface.
- **Money impact:** None.

---

## P2 — Advanced work (depends on P1 landing)

### P2.1 — Advanced sport features (projection pipelines beyond schedule)
- **Objective:** move a SCAFFOLD_ONLY sport (NHL / Soccer / Cricket) from schedule-only toward a real, **validated**
  projection pipeline; and deepen MLB market coverage where settleable.
- **Dependencies:** a stable per-sport stats + odds source (the current blocker for NHL/IPL/Soccer); P1.3 adapters;
  P1.4 provenance.
- **Effort:** L. **Risk:** Medium (validation may fail → stays coming-soon). **User value:** more genuinely-covered
  sports, only when earned. **Acceptance:** per-sport four-artifact-equivalent + out-of-sample validation before any
  promotion. **Founder-approval-needed:** Yes to publish. **Public impact:** none until validated. **Money impact:** None.

### P2.2 — Event probability models (multi-outcome)
- **Objective:** the N-way / categorical estimator + resolution engine (gap items 4–6) on top of the P1.2 warehouse —
  still internal until validated out-of-sample against captured event prices.
- **Dependencies:** **P1.2** (evidence warehouse) must exist first. **Effort:** L. **Risk:** High (net-new modeling
  domain; the prop simulator cannot be reused — audit §5). **User value:** the core of a future Markets product.
- **Acceptance:** leakage-safe backtest vs captured event prices, market-compared first; internal-only until it clears
  a gate. **Founder-approval-needed:** Yes to publish. **Public impact:** none until gated. **Money impact:** None.

### P2.3 — Cross-provider comparison (model-vs-market, incl. event prices)
- **Objective:** a read-only comparison layer — model probability vs market-implied across books, and (for events)
  vs Kalshi/Polymarket price capture (gap item 7). Comparison + calibration only; **no** "we beat X" framing.
- **Dependencies:** P1.3, P2.2, event-price capture. **Effort:** M–L. **Risk:** Medium (must stay strictly
  comparison, never a superiority claim). **User value:** honest context ("model gap" vs the market).
- **Acceptance:** every comparison labeled market-first; forbidden-vocab scan clean; sample-size disclaimers present.
  **Founder-approval-needed:** Yes (public surface). **Public impact:** additive context. **Money impact:** None.

### P2.4 — Alerts (opt-in, read-only)
- **Objective:** opt-in notifications for line moves, lineup/scratch changes, and slate-ready — read-only signals,
  no auto-action.
- **Dependencies:** P1.3 metadata; pregame capture health. **Effort:** M. **Risk:** Low–Medium (notification noise;
  must never imply a pick). **User value:** timeliness. **Acceptance:** opt-in only; every alert is informational,
  never a recommendation or auto-post (posting stays a human action). **Founder-approval-needed:** Yes (new public
  channel). **Public impact:** opt-in feature. **Money impact:** None.

---

## Recommended sequencing

### Next 24 hours — **P0 only, nothing public changes**
1. Confirm `mlb-research-integration.yml` ran green on the clean archive (PASS/EMPTY, 0 violations, join monitor
   ≠ FAIL, portfolio md5 check green). [P0.1]
2. `health-check.mjs` HEALTHY before any deploy. [P0.2]
3. Today's MLB slate has all four artifacts; `mlb-slate-completeness-gate.mjs` passes; no fabricated fills. [P0.3]
4. Honesty guards green + forbidden-vocab scan clean; gate BLOCKED; money md5 unchanged. [P0.4]
   _No nav change, no new route, no publish._

### Next 7 days — **build P1 foundations internally (no publish, mostly no founder approval to build)**
1. Stand up the **event-evidence warehouse** schema + ingestion + evidence timeline — `INTERNAL_ONLY`, with the
   guard proving `/markets/*` is neither exported nor linked. [P1.2]
2. Land the **cross-provider metadata adapter** (read-only, credit-safe). [P1.3]
3. Draft + prototype the **probability explainability standard** (schema + guard; copy changes held for approval). [P1.4]
4. Run the **UFC leakage-safe backtest** and write the NBA-return readiness checklist — internal; publish nothing. [P1.1]
   _Everything internal/read-only. Money frozen. Public surface unchanged._

### Next 30 days — **review, then promote only what earned it**
1. Founder review of P1 outputs. If the UFC backtest validates out-of-sample, plan a **gated, experimental** public
   surface (never product cards); if not, keep it internal and honest. [P1.1]
2. Apply the explainability standard to public probabilities (copy/labels) **after** founder sign-off. [P1.4]
3. Begin P2 **only** where its P1 dependency landed: multi-outcome event model on the warehouse [P2.2], one
   advanced sport pipeline [P2.1], cross-provider comparison [P2.3], opt-in alerts [P2.4] — each internal-first,
   each promoted to public **only** after a passing honesty gate + founder approval.

**Invariant for the whole window:** accuracy and provenance win over feature count. Every promotion to public must
first extend a guard (`sports-coverage.ts`, `product-status.ts`, `public-beta-safety.test.mjs`,
`record-family-separation.test.mjs`, `world-cup-closeout.test.mjs`, or `mlb-research-integration.yml`). **Money impact
is none for every item; the modeling gate stays BLOCKED until the dataset earns otherwise.**
