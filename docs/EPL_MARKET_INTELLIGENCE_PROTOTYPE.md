# EPL Market Intelligence Prototype — Lane E Design Document

**Status:** DESIGN DOCUMENT (Program 058–061 Lane E). Document only — no code ships with this lane.
**Governing policy:** `docs/PRODUCT_STRATEGY_RESEARCH_TERMINAL.md` (research terminal + market intelligence; no predictive-superiority claims) and `docs/MULTISPORT_PROMOTION_GATES.md` (Soccer/EPL current level: SCAFFOLD; target: MARKET_INTELLIGENCE).
**Evidence base:** the Lane E legacy-soccer audit (settlement reconciliation, identity, artifact inventory) plus direct file verification cited inline. Nothing in this document is fabricated; unverified items are labeled as such.

---

## 1. Scope freeze

The prototype is **EPL only** and **market intelligence only**. Frozen in:

- **One competition.** English Premier League 2026–27. No cups (FA Cup / League Cup / Europe), no other leagues. Cup competitions bring extra time and replays and are explicitly out of scope (§3.6 documents why the lifecycle model still names those states).
- **Market intelligence only — NO model.** De-vigged market-implied probabilities, capture provenance, movement where the capture cadence supports it, and official final results. No Poisson engine, no simulation, no projections, no "our number vs their number." The internal FIFA-Poisson soccer engine stays private and is not part of this lane.
- **No lineup, injury, or weather claims.** The platform has no verified EPL source for any of these. Surfacing them would be fabrication.
- **No broad rewrite.** The legacy Python soccer settlers are frozen, not repaired (§2). The dual-schema `world-cup/settlement/` directory is documented, not migrated. The existing TS engine and identity layer are extended by adapter, not restructured.
- **No money.** No Bank Builder lane, no Moonshot lane, no daily-portfolio candidate, no paper stakes. The canonical bankroll (md5 `affe6b21…`, test-pinned) is untouchable from this lane. Any EPL settlement flow ends at "grade + persist" — it never reaches the money-mutating steps of `scripts/settle_soccer_day.sh` (§2.3).
- **No public promotion.** `app/src/lib/sport-capability-registry.ts` keeps EPL at `DISABLED` ("Nothing is published at all…") until the §5 gates pass and founder sign-off is recorded. The prototype output is preview-only (§4, with an honest note on what "preview-only" means in a static export).

---

## 2. Legacy soccer settlement — reconciliation verdict

The prior audit found **≥6 grader implementations across 2 languages**. The verdict, ratified here as Lane E policy:

### 2.1 Canonical: the TypeScript family

`app/src/lib/settlement/soccer-markets.ts` (pure, deterministic, tested via `soccer-markets.test.mjs`) is the **only** soccer grading engine any future soccer work may build on. Its documented and test-covered policy:

- 90-minute **team markets** (moneyline_90, double chance, draw-no-bet, BTTS, match total goals) settle on `score.fulltime` — the regulation score — for `FT`, `AET`, and `PEN` alike (`STATUS_90_FINAL`).
- **Player props** PEND on `AET`/`PEN` (the official box score is a full-match aggregate including extra time, so no clean 90' line exists), with one arithmetic-certain exception: an over/anytime prop whose full-match count is already at/below the line LOSES. Props never WIN off an ET-inclusive number. `FT` grades directly.
- A player with no official line **voids** rather than loses.
- The engine never fetches and never touches a bankroll — grading and money are separate steps.

Orchestration lives in `scripts/settle_soccer_day.sh` (official results in, grade, persist, then money steps — see §2.3).

### 2.2 Frozen: the legacy Python family

`pipeline/world_cup/settle.py`, `pipeline/world_cup/settle_player_props.py`, `pipeline/settle_active_dual_bank_builder.py`, `pipeline/settle_june19_active.py` are **FROZEN historical code**. They are never pointed at EPL, never repaired, never deleted (history is kept, per platform policy). The audit's specific defects, recorded so nobody "reuses the working soccer settler" by accident:

- `settle.py` grades 90' team markets on the **ET-inclusive goals aggregate** for AET games — contradicting its own docstring and the canonical FT/AET/PEN policy in §2.1.
- `settle_player_props.py` has **no AET/PEN guard at all**.
- The legacy path left **192 of 385 graded legs permanently pending** (audit-measured).

### 2.3 The dual-schema directory — historical, never parsed uniformly

`app/public/data/world-cup/settlement/` contains **two incompatible graded schemas in the same directory** (verified on disk):

| Era | Files | `graded[]` row shape |
|---|---|---|
| Legacy | 2026-06-11 / 2026-06-16 | pick-level: `{id, market, matchId, outcome, pick, regulationScore}` with `win`/`loss` outcomes |
| Current | 2026-06-23 onward | card-level: `{card, product, legs, stake, combinedDecimal, payout, paperPnl, result}` with `won`/`lost` |

**Verdict:** this directory is a closed historical record. No EPL code reads it, no generic "soccer settlement reader" is ever written over it, and no migration is attempted. Any tool that needs World Cup history handles the two eras explicitly or not at all.

**Money boundary:** `scripts/settle_soccer_day.sh` steps 3–6 (seed-model settlement → Mr. Dub ledger reconcile → daily-portfolio roll-forward → money-integrity gate) mutate the canonical Bank Builder bankroll. An EPL settlement flow reuses at most the shape of steps 1–2 (official results → grade + persist under the EPL root) and **must never invoke or clone steps 3–6**.

---

## 3. Canonical adapter design

### 3.1 New artifact root: `app/public/data/soccer/epl/`

All soccer artifacts today live under `app/public/data/world-cup/`, which is **closed as a destination** (guard: `app/src/lib/world-cup-closeout.test.mjs`). Writing EPL output there would resurrect closed surfaces. Therefore:

- New competition-scoped root: `app/public/data/soccer/epl/` with subdirectories for `fixtures/`, `odds/` (snapshot-per-capture, see §3.5), `results/`, `settlement/`.
- The root is competition-scoped by design so a future second competition gets `soccer/<competition>/`, never a shared flat pool.
- A guard test asserts that no EPL pipeline step writes under `world-cup/`, and that nothing under `soccer/epl/` is read by any World Cup surface.
- Every odds row carries a per-row `capturedAt`; the artifact schema enforces `capturedAt < kickoff` eligibility from the **first** artifact (gate G3 — never retrofit; this is the lesson the MLB research archive learned the hard way).

### 3.2 Identity: a soccer adapter for the existing EventIdentity layer

The competition-aware identity layer already exists and is the right foundation — it just has only an MLB adapter today (`app/src/lib/identity/event-identity.ts`, `sport-adapter.ts`, `mlb-adapter.ts`; verified):

- `deriveEventId({sport, league, participants, scheduledStart})` — deterministic, participants sorted, **kickoff to the minute** — is exactly what separates a rematch from the original fixture and a replayed fixture from the abandoned one.
- The Lane E adapter is `soccer-adapter.ts` (or `epl-adapter.ts` if competition-scoped resolution differs): `sport: "soccer"`, `league: "epl"`, participants `home`/`away`, `scheduledStart` = kickoff UTC. Provider ids (Odds API hex event id, results-source fixture id) are attached as `providerIds[]` **aliases**, never as the identity.
- **Hard rule: one fixture is never identified by participant names alone.** EPL clubs meet twice a season (home and away) plus potential cup meetings; a name-pair key collides by construction. This is precisely the defect in the WC-era `pipeline/world_cup/team_aliases.py` (`pair_key` = sorted normalized names, no league or date scoping — verified) and it does not carry forward.
- Provenance `method` records how each join was made, so a name-only join would be visible in the artifact, not silent.

### 3.3 Club aliases: `buildAliasIndex`, collision-refusing

Club naming varies across providers ("Wolverhampton Wanderers" / "Wolves", "Brighton and Hove Albion" / "Brighton"). The Lane E design:

- A small, explicit EPL club alias table (20 clubs, enumerable and reviewable — unlike national-team open sets).
- Indexed through `buildAliasIndex` (`app/src/lib/identity/event-identity.ts`), which **refuses both sides of a collision** (Sprint 043 behavior). An alias that could point at two clubs resolves to neither.
- The WC flat national-team dict is not extended, imported, or consulted.

### 3.4 Market families: 1X2 with a real draw, de-vig ported to TS

The canonical market domain is MLB-shaped today (all verified):

- `GameMarketFamily = "MONEYLINE" | "RUN_LINE" | "TOTAL"` and `MarketSide = "HOME" | "AWAY" | "OVER" | "UNDER"` (`app/src/lib/markets/types.ts`) — no 3-way family, no `DRAW` side.
- `devig_three_way` exists **only in Python** (`pipeline/world_cup/soccer_odds_parser.py`).
- `app/src/lib/markets/load.ts` hardcodes `DATA_DIR` to `public/data/mlb`.
- `app/src/lib/markets/freshness.ts` `CADENCE` describes the MLB one-artifact-per-slate pipeline.

Design decisions:

1. **Add a 3-way family, don't overload MONEYLINE.** A new `MATCH_RESULT_1X2` family (with a `DRAW` side, or a three-outcome row shape if that fits the domain better at implementation time) so no consumer can accidentally render a soccer market as two-sided. The MLB type space is untouched for MLB surfaces.
2. **Port `devig_three_way` to TS** next to the existing two-way probability code (`app/src/lib/markets/probability.ts`), with a cross-language agreement test against the Python implementation's outputs (the identity layer already has this pattern: `cross-language-agreement.test.mjs`).
3. **Parameterize the data root** rather than duplicating the loader: `load.ts`'s hardcoded `mlb` path becomes a per-sport root, or a thin soccer loader reads `soccer/epl/` — decided at implementation time by whichever reads like the surrounding code; either way no EPL surface ever reads `public/data/mlb`.
4. **Freshness cadence is declared per competition.** The MLB `CADENCE` constant is not reused verbatim; EPL captures are weekend-clustered with midweek rounds, and the freshness copy must describe the actual EPL capture cadence, not the MLB one.
5. **Club resolution** goes through §3.3, giving Market Center a resolution state (`RESOLVED`/`UNRESOLVED`) rather than a name-match assumption.

### 3.5 Totals and BTTS: only if provider data proves sound

1X2 is the prototype's committed market. Totals (`totals`) and both-teams-to-score (`btts`) ship **only after** a fresh Odds API capture proves, on real EPL payloads: consistent line points, both/all sides present, and per-row capture timestamps that pass the G3 eligibility rule. The TS engine already grades both markets (§2.1), so settlement is not the blocker — verified provider coverage is (§6). Until then they are FUTURE-WORK, not silently included.

**Movement** is supported only if we keep every capture snapshot per fixture (snapshot-per-capture under `odds/`, never regenerated in place). The MLB domain deliberately has **no movement concept** because its artifact is regenerated in place (`types.ts` header, verified). If EPL captures are single-shot, the prototype shows one capture with its timestamp and no movement claim.

### 3.6 Fixture lifecycle: explicit fail-closed states

**No postponement/abandonment state exists anywhere in soccer settlement today** — a postponed fixture pends forever. EPL winter postponements (weather, fixture congestion) make this a hard gate, not a nice-to-have. The design:

| State | Meaning | Settlement behavior |
|---|---|---|
| `SCHEDULED` | Not kicked off | No settlement |
| `FINAL_FT` | Regulation finish, official score | Team markets + player props grade (§2.1) |
| `POSTPONED` | Called off before/at kickoff, will be rescheduled | **All markets void, fail-closed.** The rescheduled match is a NEW event identity (new kickoff → new `eventId`); markets never roll over. |
| `ABANDONED` | Kicked off, not completed | **All markets void, fail-closed**, unless the competition's official ruling says otherwise — and we do not encode league-rules speculation; absent an official completed result, everything voids. |
| `REPLAYED` | A replacement fixture for a postponed/abandoned one | New `eventId` (kickoff-to-minute guarantees distinctness). The old event keeps its terminal state; nothing is silently re-pointed. |
| `AET` / `PEN` | Extra time / penalties | Not reachable in EPL league play; kept in the model (the TS engine already handles them) so a future cup adapter cannot reintroduce the `settle.py` defect. |

Fail-closed means: an unrecognized or missing status **pends and alarms**; it never grades, and — unlike the legacy path — pending is a visible, counted state, not a silent permanent one. The `EventStatus` union in `event-identity.ts` already carries `postponed`/`cancelled`; `abandoned` is added (or mapped with an explicit settlement-side state) rather than shoehorned into `cancelled`.

Settlement for EPL is lineage-gated from day one: the grading-source join must be injective (Sprint 045 invariant), tested against committed artifacts, not just fixtures.

### 3.7 ID namespaces: the join defect that does not carry forward

WC-era artifacts mixed namespaces — team projections keyed by API-Football numeric fixture id, player props keyed by Odds API hex event id, joined by fixture **name**. In the EPL design every provider id is a `ProviderRef` alias on one `EventIdentity`, and every join goes through the alias index with collision refusal. There is no name-based join path.

---

## 4. Prototype output spec

A **non-public, preview-only** surface (page or JSON artifact) — the acceptance target for the build, not a launch surface.

**Honesty note on "non-public":** this repo statically exports, and noindex/unlinked routes (`/ops`, `/preview`) are still world-readable. "Preview-only" therefore means unlisted and founder-facing, not secret — so every line of the prototype must already meet the public-copy bar (no banned claims), even though it is not promoted anywhere. If the route form is used, it follows the existing `public:false` + `prune-internal-routes` convention.

Per fixture, the prototype shows — and shows **only**:

1. **Fixture identity:** clubs, kickoff (ET, with UTC), `eventId`, and the provider refs it was resolved from (with resolution `method` — provenance is content).
2. **No-vig 1X2 probabilities:** home/draw/away after `devigThreeWay`, alongside the raw prices and the measured overround. Market-implied, labeled as such.
3. **Capture provenance:** `capturedAt`, source (bookmaker count / region), and the G3 eligibility verdict (`capturedAt < kickoff`).
4. **Movement:** only if multi-snapshot capture exists (§3.5); otherwise absent, never simulated.
5. **Final result + settlement state:** official score, source, and the §3.6 lifecycle state — including an honest `POSTPONED`/`ABANDONED` rendering. A postponed fixture is a first-class display state, not a blank.
6. **NO model score. NO pick. NO recommendation. NO lean.** The strategy doc's separation of concerns applies: this surface answers only "what does the market believe and what actually happened."

---

## 5. Promotion gates — pass/fail today (2026-07-29)

Target level: `SCAFFOLD_ONLY → MARKET_INTELLIGENCE (no model)` per `docs/MULTISPORT_PROMOTION_GATES.md`. Founder sign-off recorded in the promoting sprint's program ledger is required regardless.

| Gate | Requirement | EPL today | Verdict |
|---|---|---|---|
| G1 Official results source | Free, machine-readable, per-event official data | No source chosen. API-Football is paid (credential/policy boundary, §6). No free official EPL equivalent of MLB StatsAPI has been verified. | **FAIL** |
| G2 Identity reliability | Injective odds↔results join; alias-collision refusal; repeated-participant events provably distinct | EventIdentity + `buildAliasIndex` exist but have only an MLB adapter; WC alias dict is unscoped; legacy joins were by fixture name | **FAIL** (design in §3.2–3.3 is the repair path) |
| G3 Leakage safety | Per-row `capturedAt < eventStart` from the first artifact | Zero EPL artifacts exist, so nothing enforces anything; §3.1 bakes it into the first schema | **FAIL** (trivially — nothing exists) |
| G4 Settlement quality | Automated, lineage-gated, mutation-tested, fail-closed for postponed/abandoned/no-contest | Canonical TS engine exists and is tested, but no postponement/abandonment state exists anywhere in soccer settlement; no EPL lineage gate; legacy path left 192/385 legs permanently pending | **FAIL** (§3.6 is the hard gate) |
| G5 Evaluation capability | Realistic path to ≥5,000 decisive settled rows before any public probability claim; model/market comparison machinery if a model exists | No model exists (scope freeze), so comparison machinery is vacuous at this level. Rows on disk today: zero. A 380-fixture season with 1X2 (+ totals/BTTS if proven) accumulates a corpus, but the path is unproven until ingestion runs | **FAIL today**; realistic path exists on paper only |
| G6 Product value | Serves the research-terminal thesis (calibration transparency + market intelligence), not content volume | Three-way de-vig with draw handling, movement, and postponement-honest settlement is exactly the market-intelligence pillar; EPL is the highest-liquidity club competition | **Thesis fit: yes — but a gate is passed by evidence and founder sign-off, not argument. PENDING** |

**Net: 5 FAIL + 1 PENDING. EPL stays SCAFFOLD today.** This document is the plan to convert G2/G3/G4 by construction, G1 by vendor decision, G5 by season accumulation, and G6 by founder sign-off.

---

## 6. Data / vendor blockers

1. **The Odds API `soccer_epl` — re-verify everything.** The only provider signal on disk is `"key": "soccer_epl", "active": true` in a **stale** captured discovery listing (`world-cup/odds-discovery-latest.json`, generated 2026-07-03 — 26 days old). No code references `soccer_epl`. Before any build: a fresh discovery capture, confirmation of market coverage on real EPL events (3-way h2h expected but **unverified**; totals/BTTS **unverified**), and measured credit cost per capture. Operational constraint: the local `.env` `ODDS_API_KEY` returns 401; paid ingests run in CI only — vendor verification is therefore a CI job, not a laptop command.
2. **Official results source — open decision with a policy boundary.** API-Football (the WC-era source) is paid; per program guardrails, adding or extending paid credentials is a founder decision, not an engineering default. Free candidates must be **verified for official status, per-event machine-readability, and terms of use** before being proposed — none has been verified, so none is named as viable here. Until G1 has a chosen source, settlement (and therefore the "final result" panel of §4) is blocked; odds-side prototype work is not.
3. **Postponement realism.** EPL winter rounds make §3.6 a launch prerequisite, not a fast-follow. A prototype that cannot render `POSTPONED` honestly does not ship.
4. **Movement depends on capture cadence** (§3.5), which depends on credit cost (item 1). Movement is a conditional feature, not a promise.

---

## 7. Build order + effort estimates (target: EPL season start, mid-August 2026)

Today is 2026-07-29; the season starts in roughly 2.5 weeks. Estimates are engineering estimates (HYPOTHESIS class), sequenced so the blocked items front-load the founder decisions:

| # | Step | Est. | Depends on |
|---|---|---|---|
| 0 | Vendor re-verification in CI: fresh odds discovery, `soccer_epl` event/market payload capture, credit-cost measurement. Founder decision on results source (G1). | 0.5 day eng + founder decision | CI `ODDS_API_KEY`; founder |
| 1 | Artifact root `soccer/epl/` + schemas (per-row `capturedAt`, snapshot-per-capture) + guard tests (nothing writes under `world-cup/`; G3 eligibility enforced from first artifact) | 1 day | — |
| 2 | Soccer EventIdentity adapter + EPL club alias table via `buildAliasIndex` + collision/rematch tests (same club pair, two kickoffs → two ids) | 1.5 days | — |
| 3 | 1X2 market family + `DRAW` handling + `devigThreeWay` TS port + Python cross-agreement test; loader data-root parameterization | 1 day | — |
| 4 | Fixture lifecycle states (§3.6) + fail-closed settlement adapter over `soccer-markets.ts` team-market core + lineage gate against committed artifacts | 1.5 days | Step 2 |
| 5 | Ingestion job (CI): fixtures + 1X2 captures for the opening rounds | 1 day | Steps 0–3 |
| 6 | Preview surface (§4): fixture list, no-vig probabilities, provenance, lifecycle state; EPL-shaped freshness copy | 1.5 days | Steps 3–5 |
| 7 | Results + settlement wiring once G1 source is chosen; first settled round is the G4 live proof | 1 day | Step 0 (G1), Step 4 |
| — | Buffer + founder review of gate status | 1 day | — |

**Total: ≈ 9 working days** — feasible before mid-August only if Step 0 (vendor verification + G1 decision) happens in the first days. Steps 1–4 and 6 are buildable while G1 is pending; Step 7 is not. If G1 is undecided at season start, the prototype launches (preview-only) as odds + provenance with `SCHEDULED` fixtures and an explicit "results source pending" state — honest, but it cannot claim G4 progress.

Explicit non-goals for this window: totals/BTTS (until §3.5 proof), movement (until cadence proof), any public route, any model, any money artifact, any registry state change.

---

## 8. Evidence classification

**PROVEN** (verified in-repo during Lane E)
- Canonical TS settlement policy and its FT/AET/PEN + player-prop-pend behavior (`app/src/lib/settlement/soccer-markets.ts` + tests).
- EventIdentity layer with kickoff-to-minute ids and collision-refusing `buildAliasIndex`; MLB is the only adapter (`app/src/lib/identity/`).
- Dual incompatible graded schemas in `world-cup/settlement/` (pick-level 06-11/06-16 vs card-level 06-23+; row shapes verified on disk).
- WC alias layer is a flat, unscoped national-team dict with sorted-name `pair_key` (`pipeline/world_cup/team_aliases.py`).
- `devig_three_way` exists only in Python (`pipeline/world_cup/soccer_odds_parser.py`); TS market domain has no 3-way family, no DRAW side, `DATA_DIR` hardcoded to `mlb`, MLB-shaped cadence (`app/src/lib/markets/`).
- EPL registry state `DISABLED` — "Nothing is published at all" (`app/src/lib/sport-capability-registry.ts`).
- `settle_soccer_day.sh` steps 3–6 mutate the canonical bankroll (script read directly).
- `world-cup/` is a closed destination with a guard test (`app/src/lib/world-cup-closeout.test.mjs`).

**MEASURED** (prior audit, trusted per program instructions)
- ≥6 soccer grader implementations across 2 languages; `settle.py` grades AET games on the ET-inclusive aggregate; `settle_player_props.py` has no AET/PEN guard; 192 of 385 graded legs left permanently pending by the legacy path.
- Only provider signal for EPL: `soccer_epl` `active:true` in the 2026-07-03 discovery capture (26 days stale at writing); zero EPL fixtures/odds/results on disk; zero code references.

**HYPOTHESIS**
- The Odds API serves 3-way h2h (and possibly totals/BTTS) for `soccer_epl` at acceptable credit cost — expected, unverified until Step 0.
- The §7 effort estimates; the movement-via-snapshots design; the 380-fixture season producing a meaningful G5 corpus.

**BLOCKED**
- Fresh vendor verification (local key 401s; CI-only paid ingests).
- G1 results-source decision (API-Football paid; credential/policy boundary is a founder decision).
- MARKET_INTELLIGENCE promotion itself (5 gates FAIL, G6 pending founder sign-off).

**WALL-CLOCK**
- ~2.5 weeks from writing to the mid-August 2026 season start; the fixture list is immovable. Winter postponements arrive on the league's schedule, not ours — §3.6 cannot be deferred past launch.

**REJECTED**
- Pointing any legacy Python settler at EPL (defects in §2.2).
- Writing EPL artifacts under `world-cup/` (resurrects a closed destination).
- Name-only fixture joins or reuse/extension of the WC alias dict (collides for clubs meeting twice).
- Uniform parsing of the dual-schema settlement directory.
- Any EPL model, player-prop lane, or money product in this lane.
- Cloning `settle_soccer_day.sh` beyond its grade+persist steps.

**FUTURE-WORK**
- Totals/BTTS after provider proof (§3.5); movement after cadence proof.
- Cup competitions (AET/PEN/replays) via the same lifecycle model.
- A club-strength research model — only behind the G5 corpus and the strategy doc's §3 conditions.
- Additional leagues under `soccer/<competition>/` once EPL proves the adapter.
