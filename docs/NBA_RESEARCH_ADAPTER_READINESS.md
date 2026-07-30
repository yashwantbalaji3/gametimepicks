# NBA Research Adapter Readiness

**Status:** ASSESSMENT — document only, no code changed. Program 058–061, Lane D.
**Date:** 2026-07-29.
**Governing policy:** docs/MULTISPORT_PROMOTION_GATES.md (six gates, ratified) and docs/PRODUCT_STRATEGY_RESEARCH_TERMINAL.md (research terminal + market intelligence; the model is a transparent research layer; no predictive-superiority claims, ever).
**Verdict today:** NBA is **NOT READY** for promotion. Target level for the 2026-27 season is **MARKET_INTELLIGENCE (no model)**, reachable by tip-off (late Oct 2026) if the preseason work plan in §5 executes. RESEARCH_MODEL and FULL_MODEL are explicitly out of scope (§6).

---

## 1. Current state summary

NBA is the only non-MLB sport that has run the platform end-to-end at volume:

- **54 boards** generated 2026-05-04 → 2026-06-13 (playoffs), producing **2,204 leans** and **4,592 settled rows** (3,635 decisive; hit rate 0.4908). Last real data: 2026-06-13.
- Registry state is **HISTORICAL_ONLY** (`app/src/lib/sport-capability-registry.ts:62-73`): off-season, and every board since 06-13 carries `dataMode: ScheduleUnavailable` from stats.nba.com timeouts (the 2026-07-29 `board.json` carries this failureReason). The settled record stays published; there is no live projection capability.
- Ingestion stopped for **two independent reasons**: (a) the season ended 06-13 (multi-provider-confirmed), and (b) stats.nba.com times out from CI. The `morning-projections` cron (`.github/workflows/morning-projections.yml`) still emits empty scaffolds daily.
- **Settlement source resilience is better than projection resilience**: 94.3% of decisive rows settled from ESPN box scores, only 5.7% from nba_api. The stats.nba.com fragility hits PROJECTIONS (game logs), not settlement.
- **903 of 4,592 settled rows are invalid** because `pipeline/settle_results.py:80` `SUPPORTED_MARKETS = ("PTS", "REB", "AST")` short-circuits 3PM/PRA/STL/BLK.
- **0 of 54 boards are research-eligible** (leakage): tip-off is stored only as display text (`'8:30 PM ET'`). The ESPN provider *receives* the ISO tip-off instant and discards it (`pipeline/providers/espn_provider.py:371` captures `ev.get("date")`; `:404-419` `_format_tipoff_et` reduces it to a display string). Backfilling boards is prohibited (leakage).
- **Historical model quality:** below coin-flip overall; REB is the only family above 0.5 (0.5454), and even REB's Brier is **+0.0069 worse** than the de-vigged market. `publicApproved: false`. This is a market-intelligence case, not a prediction case — exactly the ratified thesis.
- **Identity groundwork exists but is unwired at scale:** `app/src/lib/nba/identity-contract.ts` (30-tricode set, alias map, player crosswalk, `parseNbaComGameId`, reschedule lineage) plus feature-timing / pregame-snapshot / rebounds-prototype contracts — all flagged `public: false`.
- **Standing risk:** `app/src/lib/sports-coverage.ts` still carries NBA `level: 'full'` because it feeds the legacy `MODELED_SPORT_KEYS` parlay gate. That gate must never re-activate NBA; the capability registry, not this field, drives what is promised publicly.

---

## 2. Six-gate scorecard (per docs/MULTISPORT_PROMOTION_GATES.md, graded TODAY)

| Gate | Verdict today | Evidence |
|---|---|---|
| G1 Official results source | **PARTIAL** | Settlement machinery proven at volume (4,592 rows), but 94.3% settled from ESPN box scores, not the league-official stats.nba.com feed (5.7% nba_api). Whether ESPN box scores satisfy "official" under G1 needs an explicit founder ruling; stats.nba.com remains usable as the official settlement source since its fragility hits projections, not settlement. |
| G2 Identity reliability | **FAIL** | Player ids drift across providers (Bridges: nba_api 1628969 vs ESPN 3147657); 3 game-id namespaces; the odds→game join is by **team full-name** — the exact anti-pattern that produced the UFC rematch collision and the MLB doubleheader collision. `identity-contract.ts` exists (tricodes, alias map, crosswalk, `parseNbaComGameId`, reschedule lineage) but is `public:false` and untested at scale. Matches the gates doc: "G2 untested at scale". |
| G3 Leakage safety | **FAIL** | 0/54 boards research-eligible. Tip-off persisted only as display text; the ESPN provider receives the ISO instant and discards it (`espn_provider.py:371, 404-419`). Per-row `capturedAt < eventStart` cannot be enforced without a persisted instant. Backfill is prohibited. **Single unblock: persist the ISO tip-off** (prerequisite zero, §3.1). |
| G4 Settlement quality | **FAIL** | Settlement ran at volume, but: 903/4,592 rows invalid from the `SUPPORTED_MARKETS` short-circuit (`settle_results.py:80`); no lineage gate has ever run for NBA (the proven-live lineage gate covers MLB only, Sprint 049); quarantine semantics never exercised on NBA postponements. Matches the gates doc: "G4 dry-runs needed". |
| G5 Evaluation capability | **PASS (path)** | 3,635 decisive rows accumulated in a single ~6-week playoff run with small slates. A full 82-game regular season makes ≥5,000 decisive rows realistic well before any public probability claim. Identical-row model/market comparison machinery exists (MLB reference implementation) and the NBA historical corpus already supports it (REB Brier vs de-vigged market computed above). |
| G6 Product value | **PASS (as market intelligence)** | The Odds API historically supplied NBA h2h/spreads/totals from 11 books plus 10 of 11 prop families (turnovers unavailable) — `market-probe-latest.json` 2026-06-10. Calibration transparency + market intelligence is exactly the research-terminal thesis; the below-coin-flip model result *supports* this framing (the honest product is the market layer, not a predictor). |

**Score: 2 pass / 1 partial / 3 fail.** Blocking gates are G2, G3, G4 — identical to the gates doc's audited blockers. All three are engineering work with known shapes, not open research questions.

---

## 3. Adapter contract plan

### 3.1 Prerequisite zero: persist the ISO tip-off instant

The single unblock for G3. `espn_provider.py` already receives the ISO instant (`tipoff_iso = ev.get("date") or comp.get("date")`, line 371) and reduces it to `'8:30 PM ET'` via `_format_tipoff_et` (lines 404-419). The change is to **carry `tipoffIso` through to the board artifact alongside the display string**, so `researchEligible = capturedAt < tipoffIso` becomes computable per-row from the first new artifact onward. Forward-only; the 54 historical boards stay ineligible forever (backfill is prohibited — G3 says "Never retrofit").

### 3.2 Sport-independent pieces to reuse (do not rebuild)

- `app/src/lib/identity/event-identity.ts` — canonical event identity.
- `app/src/lib/identity/sport-adapter.ts` — the per-sport adapter seam this plan fills in.
- `app/src/lib/identity/settlement-lineage.ts` — lineage that the MLB settlement gate already proved live (refused 641 rows on the CLE@CIN collision, Sprint 049); NBA settlement must gate on the same machinery.
- `app/src/lib/nba/identity-contract.ts` and siblings (feature-timing, pregame-snapshot, rebounds-prototype contracts) — already written, `public:false`; the work is wiring and scale-testing, not authoring. The odds→game join moves from team full-name to event identity (date + tricodes + game id), with alias-collision refusal on the `buildAliasIndex` pattern (refuse BOTH sides of a collision, Sprint 043).

### 3.3 Market Center parameterization — exactly 3 seams

`app/src/lib/markets/` is MLB-hardcoded at three points and nowhere else:

1. **Family vocabulary** — `types.ts` (`PlayerMarketFamily`, provider-key maps). Add NBA game-market vocabulary; player-prop families deferred (§4).
2. **Data directory** — `load.ts:35` `DATA_DIR = path.join(process.cwd(), "public", "data", "mlb")`. Parameterize by sport.
3. **Calibration import** — `pairing.ts` imports `../mlb/model-calibration-status`. Needs a per-sport calibration-status source; NBA's reports no model (nothing model-derived is displayed).

### 3.4 Settlement whitelist expansion (recovers the invalid 5th of rows, forward-only)

Expand `settle_results.py` `SUPPORTED_MARKETS` beyond `("PTS","REB","AST")` with box-score field maps for 3PM/STL/BLK and PRA synthesis (PTS+REB+AST). This is what made 903/4,592 historical rows invalid. Historical rows remain labelled as invalid, never restamped.

### 3.5 Standing guard

`sports-coverage.ts` NBA `level:'full'` exists only for the legacy parlay gate. Any NBA reactivation must be driven by the capability registry; the legacy gate must not silently re-enable NBA parlays. Add/keep a guard when the adapter lands.

---

## 4. Initial market-intelligence scope (season 2026-27, at MARKET_INTELLIGENCE level)

**In scope:**

- Schedule + identity: game ids (all 3 namespaces crosswalked), tricodes, persisted ISO tip-off.
- Game markets only: **moneyline (h2h), spread, total** — proven Odds API coverage across 11 books (probe 2026-06-10).
- **De-vig** as the first-class transformation (board implieds are vigged; MLB Sprint 046 precedent).
- **Line movement only if multiple captures per event exist** — never inferred from a single capture.
- Results + settlement of game markets, lineage-gated, from the G1-ratified source.

**Out of scope (until lineage + capture history are proven over real season weeks):**

- Any player-prop model. Props enter, if ever, as market display only, after the settlement whitelist (§3.4) and per-row leakage enforcement have run live.
- Any probability of our own, any lean, any pick. The historical model is below coin-flip and `publicApproved:false`; nothing model-derived surfaces.

---

## 5. Preseason work plan (NBA preseason ~mid-Oct 2026; season tip-off late Oct 2026)

Total estimated effort: **~4–5 engineer-weeks** spread over 6 calendar weeks, sequenced so the preseason itself is the live dress rehearsal. Dates are anchored to the NBA calendar; slippage compresses the rehearsal window, not the gates.

| Week | Window | Work | Effort |
|---|---|---|---|
| W1 | ~Sep 14–18 | **Prerequisite zero**: persist ISO tip-off through `espn_provider.py` into the board schema + guard test asserting every new board row carries `tipoffIso` and computes `researchEligible`. | 2–3 days |
| W2 | ~Sep 21–25 | **Identity (G2)**: wire `identity-contract.ts` into live schedule scaffolds; replace team-full-name odds→game join with event-identity join; alias-collision refusal; crosswalk the 3 game-id namespaces and the player-id drift (nba_api vs ESPN). Scale-test against the 54 historical boards (read-only). | 4–5 days |
| W3 | ~Sep 28–Oct 2 | **Market Center (G6 plumbing)**: parameterize the 3 seams (§3.3); NBA data dir; h2h/spread/total vocabulary; de-vig pass. | 3–4 days |
| W4 | ~Oct 5–9 | **Settlement (G4)**: whitelist expansion + field maps + PRA synthesis (§3.4); wire `settlement-lineage.ts` gating into NBA settlement; dry-run against the 2026 playoff corpus (labelling only, no restamping). G1 founder ruling on ESPN-vs-official recorded. | 4–5 days |
| W5 | preseason wk 1 (~Oct 12–16) | **Live rehearsal, capture side**: real preseason boards with per-row `capturedAt < tipoffIso` enforced from the first artifact; verify researchEligible > 0 on day one; ingest ML/spread/total; multiple captures per event where budget allows (movement prerequisite). | 3–4 days + monitoring |
| W6 | preseason wk 2 (~Oct 19–23) | **Live rehearsal, settlement side**: lineage-gated settlement dry-runs on preseason finals; exercise quarantine semantics on at least one postponed/altered event (fail-closed); go/no-go review. **Founder sign-off for MARKET_INTELLIGENCE promotion recorded in the promoting sprint's program ledger**, per the gates doc. | 3 days |
| Tip-off | late Oct | MARKET_INTELLIGENCE live **only if** G2/G3/G4 pass on preseason evidence and G1 is ratified. Otherwise the sport stays HISTORICAL_ONLY and the season starts in capture-only mode. | — |

Open operational items folded into the plan: quiet or repurpose the daily empty-scaffold emissions from `morning-projections.yml` (W1, trivial); stats.nba.com CI access matters only for the projection path, which is out of scope at this level — settlement does not depend on it (94.3% ESPN precedent).

---

## 6. Non-goals (explicit)

- **No FULL_MODEL promotion** and no RESEARCH_MODEL promotion this season-start. Levels above MARKET_INTELLIGENCE require their own gate evidence and founder sign-off later.
- **No public probabilities** of any kind — no leans, no picks, no model numbers. The historical model is below coin-flip and its one above-0.5 family (REB) is still Brier-worse than the de-vigged market.
- **No backfill** of the 54 historical boards' eligibility or tip-off instants (leakage; "Never retrofit").
- **No player-prop model at launch**; props require proven lineage + capture history first (§4).
- **No re-activation of the legacy parlay gate** via `sports-coverage.ts` `level:'full'`.
- **No claims of predictive superiority, ROI, or market-beating** anywhere, per the ratified strategy — this document and everything it plans describe a research and market-intelligence layer.

---

## 7. Evidence classification

**PROVEN** (verified against artifacts/code in this repo):
- End-to-end NBA run: 54 boards 2026-05-04→06-13, 2,204 leans, 4,592 settled rows (3,635 decisive, hit 0.4908); last real data 2026-06-13; registry HISTORICAL_ONLY (`sport-capability-registry.ts:62-73`).
- ESPN carried 94.3% of decisive settlements, nba_api 5.7%; stats.nba.com fragility hits projections (game logs), not settlement.
- `settle_results.py:80` short-circuit invalidates 903/4,592 rows (3PM/PRA/STL/BLK).
- 0/54 boards research-eligible; ISO tip-off received and discarded at `espn_provider.py:371, 404-419`.
- The 2026-07-29 board carries `ScheduleUnavailable`; `morning-projections` still emits empty scaffolds daily.
- Historical model below coin-flip; REB 0.5454 hit but Brier +0.0069 worse than de-vigged market; `publicApproved:false`.
- Odds API NBA coverage: h2h/spreads/totals across 11 books + 10/11 prop families (no turnovers) — probe 2026-06-10.
- Market Center MLB-hardcoding is exactly 3 seams (`types.ts` vocabulary, `load.ts:35` DATA_DIR, `pairing.ts` calibration import).
- `identity-contract.ts` + 3 sibling contracts exist, `public:false`; `event-identity.ts` / `sport-adapter.ts` / `settlement-lineage.ts` exist and the lineage gate ran live for MLB (Sprint 049).

**MEASURED BUT NOT PROVEN:**
- Hit 0.4908 is measured on boards that are all research-ineligible — it describes the corpus, not a forward capability.
- stats.nba.com CI timeouts are observed (failureReason on current boards) but the root cause (CI egress vs endpoint policy) has not been isolated; irrelevant to the MARKET_INTELLIGENCE path.

**HYPOTHESIS** (planned, not yet demonstrated):
- Whitelist + box-score field maps + PRA synthesis fully recover the four unsettleable families.
- Parameterizing the 3 seams is sufficient to run Market Center for NBA game markets.
- Preseason volume is adequate as a live rehearsal for G2/G3/G4.

**BLOCKED:**
- Research eligibility of the 54 historical boards — permanently (backfill prohibited).
- Live NBA projections — until the stats.nba.com projection path is solved or replaced; out of scope at MARKET_INTELLIGENCE level.
- Any promotion — until founder sign-off is recorded per the gates doc.

**WALL-CLOCK** (nothing shortens these):
- No live NBA data until preseason ~mid-Oct 2026; season tip-off late Oct 2026. Capture history and line-movement evidence can only accrue in real time after prerequisite zero ships.

**REJECTED:**
- Backfilling tip-off instants or eligibility (leakage).
- Settling from web snippets or scraping (banned platform-wide, G1).
- Promoting because artifacts/pages exist (gates doc anti-pattern; "NBA pages ≠ NBA readiness").
- Surfacing the historical model as a predictor in any form.

**FUTURE WORK** (after MARKET_INTELLIGENCE is live and proven):
- Player-prop market intelligence once per-row lineage + capture history exist over real season weeks.
- RESEARCH_MODEL (shadow-only) evaluation using the identical-row model/market comparison machinery, with the MLB Sprint 056 lesson applied up front (simulation variance understated 4.6× at the tails — any NBA distribution work starts from variance-width validation, not projection accuracy).
- Turnovers family, if a provider begins supplying it.
