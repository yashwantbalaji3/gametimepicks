# Handoff: 2026-10-02, Session 5 — NFL reliability closeout, PIT @ CLE live acceptance, product-engine audit

**Scope:** Phase A (bounded NFL reliability closeout) shipped; a founder-inserted live acceptance check on PIT @ CLE; Phase B delivered as a **verified audit + dependency map + founder decisions**, not implementation (session-size valve, §7 of the prompt — see §6). This is a point-in-time snapshot: for current truth read the repo, `/data/build-info.json` and `gh pr list`. It continues [`HANDOFF_2026-10-01_SESSION_4_NFL_ROSTER_USAGE.md`](./HANDOFF_2026-10-01_SESSION_4_NFL_ROSTER_USAGE.md).

- **Phase A PRs (merged in order):** #882 (Week-4 results incident + EPL guard) → #878 (live hub) → #877 (A2 rushing) → #879 (A5 Ask) → #880 (A3/A4 Thursday + inactives) → #881 (A6 usage freshness) → #883 (`/today` Moonshot reason).
- **Phase B PRs (merged as one chain, each on an exact-head-tested tree):** #884, #885, #888, #894, #886, #887, #891, #889, #890, #892, #895, #893, #896, #897, #898; then #899, #900, #901 (this doc), #902. #716 untouched (HOLD).
- **Final SHAs:** §9.

## 1. Phase A — what shipped

| Item | Finding (reproduced, not assumed) | Change | Guard / mutation |
|---|---|---|---|
| **A2 rushing allocation** (#877) | Board-published carries pools Σshare > 1 on **23 of 30** joined Week-4 team pools (ARI 1.864: Love .57 + Conner .44 + Benson .30 + Allgeier .26 + Knight .16 + Brissett .13). The share-level model publishes each player's share *when he plays* (shrinkK 0, no reconciliation). Receiving is **not** affected: it publishes from the v1 engine whose multinomial allocation conserves targets. | `withholdOverAllocatedPools` in `opportunity-conservation.mjs` reuses the audit's own `classify`/`EPS` — no new threshold. Board producer withholds a share-sourced family for the TEAM whose pool is `OVER_ALLOCATED` (after the availability and QB1 gates); never renormalises. `families.player_rush_yds.withheldTeams`, coverage receipt state `WITHHELD_POOL_OVER_ALLOCATED`, `integrity.pools`. Weekly "Top 10 · Rushing" withheld while any team is (a top list over 9 of 32 teams is a false claim). Game page / player board / Model detail state it per team. | `auditBoard` + `nfl-roster-audit` recompute Σ from the forecast (`POOL_OVER_ALLOCATED_PUBLISHED`). Probes: producer withhold disabled → LIVE producer test fails; withheld rows re-published → audit exit 1 naming the team. |
| **A3 game-day inactives** (#880, 2nd commit) | ESPN's league injuries feed — the one `capture-injuries.mjs` already reads — **does** carry the official inactives (`Out · Coach's Decision`). PIT @ CLE: 6 players stamped 22:48–23:08Z (T-87…T-67). Our last pre-kickoff capture was 22:30:25Z (T-105) and listed all six `Active`. The per-event summary endpoint carries the same list (same ids). | **No new source or authority.** The Thursday job runs a second pass at **T-55** through the existing `capture-injuries → isBlockingStatus → board` path. QUESTIONABLE stays a state; no participation probability invented. Tonight none of the six held a projection (backup QBs/OL). | A3 tests incl. the real 22:30:25Z board → waits for INACTIVES at 23:20Z. Probe: pass removed → fails. |
| **A4 Thursday cadence** (#880) | `nfl-kickoff-refresh` fires Thursdays `*/30 17-21` UTC (1–5 PM ET): its ≤120-min rule cannot be true on time for a 00:15Z kickoff, and it dispatches the **paid** prop probe. GitHub delivered **1 of 10** slots on 10-01 (21:40Z → `NO_KICKOFF_SOON`). | `nfl-pregame-free-refresh.yml`: first Thursday delivery decides from the committed boards (`lib/ops/pregame-free-refresh.mjs`), **waits inside the job** for ROSTER (T-105) and INACTIVES (T-55), re-decides on freshly pulled boards, waits out any in-flight event window, dispatches `nfl-event-window` with `skip_odds=true`. No secret named; never `probe_props`. | Deterministic tests (fixed clocks). Probe: dispatch → `probe_props=all` fails the contract. 433 workflow-guard tests pass. |
| **A5 named-player Ask** (#879) | `build-ask-projections.mjs` cut each game to `players.slice(0, 6)`; Pittman Jr. ranks 7th (10th in today's rebuild). | Projection carries every PUBLISHED row; `getPublishedForecasts` keeps a compact top 6 for generic questions and gains optional `playerId` (only games where that player holds a published row, the row always included; none ⇒ `NOT_PUBLISHED`). One planner rule. | Probe: named-row branch removed → fails. ⚠ Planner routing is model-dependent — verify on Production with the real provider (§8). |
| **A6 usage freshness** (#881) | No SLA existed. | `usage-freshness.mjs`: every regular-season final in the ESPN results owner older than **`FRESHNESS_MATRIX.results` (36h)** must be in `player-events-v1/<season>.json`; quarantined = accounted. Anchored on the results owner, not the nflverse list the capture reads, so a stall cannot make it vacuous; a stale results owner returns `RESULTS_STALE` (reported). `nfl-roster-audit` adds `USAGE_CAPTURE_LAGGING`. | Probe: one captured final removed → LIVE test + audit fail. |

## 2. Two incidents found during the session

### 2.1 `/live` featured rows "Live tracking temporarily unavailable" during PIT @ CLE (#878)
- **Root cause:** the V2D hub cards read *live values* from the producer artifact `/data/nfl/live-props/<id>.json`. Its producer (`capture-live-props.mjs`) is dispatch-only since the 09-27 paid-probe incident, so the file was a **404**, while the gateway (`/api/live?...&players=1`) was LIVE with 12 player stats keyed `nfl-athlete-<espnId>`.
- **Fix:** restore the documented split (Live Props Phase A): factual live → gateway; frozen pregame + settlement → producer. `lib/live/gateway-live-rows.mjs` merges by the producer's own `predictionId`; the one refresh owner (`use-live-props.ts`) fetches both on one tick; the card's feed is per row by family (anytime TD has no gateway source → stays "unavailable" without a producer record; an unmeasured receiver reads "Awaiting first measurement").
- **Interim (zero credit):** two dispatches of the keyless `nfl-live-props-free.yml` (00:30Z, ~00:56Z) so Production showed last-known values before #878 deployed.
- **Runtime evidence (00:30Z, Q1 7:27):** 55 rows · 18 with a live stat; Warren 11 rush · 1 rec · 11 yds; Judkins 2 rush; Metcalf 2 rec · 22; Boston 1 rec · 5; TD 0 for all at 0–0; passing measured (Rodgers 39, Watson 7) but stays producer-internal (ESTIMATE family). **Frozen pregame: 55/55 rows equal the last pre-kickoff board (22:30:25Z)**; no board commit after kickoff (an event window ran at 00:32Z and left it untouched).
- **Preview verification (#878):** 375 + 1280 — "Live measurements · Updated 0s ago", live 11 / 2 / 5, 0 "unavailable", no overflow, no undefined/NaN/null, no console errors.

### 2.2 `/results/nfl` headlined an opened, ungraded week (#882)
- The 00:32Z event window committed the Week-4 reconciliation (0 final of 16). `readNflWeekReports()` took the newest index entry ⇒ "Week 4: — of our predictions came true · 0 of 0 checks" on `/results/nfl` and the `/results` hub. The rendered guard caught it on #879's CI (it was correct; the page was wrong).
- Fix: `isGradedWeek` (checks > 0 and a final game) — one rule for both surfaces and the guard.

### 2.3 EPL ladder guard vs a legitimate whole-ladder refusal (#882, 2nd commit)
- The 00:40Z `epl-matchweek` run wrote `risk-ladder-epl/latest.json` as `STALE_PRICES` (newest capture 2026-09-19; it is an international break, next kickoff 10-10, and the odds capture deliberately waits for a 30h window). `ladder.test.mjs` demanded four bands of a ladder that correctly built none — every stacked PR went red on it.
- The guard now accepts `NO_PRICES`/`STALE_PRICES` with a reason and no cards; any other state must be `PUBLISHED` with all four bands accounted for. Probes: a card on a refused ladder fails; an unnamed state fails.
- ⚠ Both 2.2 and 2.3 were bot data commits arriving mid-session that turned guards red. In 2.2 the guard was right and the page was wrong; in 2.3 the producer was right and the guard was wrong. Read the artifact before choosing which side to fix.

## 3. Phase A status

| | State |
|---|---|
| PIT @ CLE settlement + Top-5 | **runtime-pending at writing** — see §8 |
| rushing publication safety | withheld on incoherent pools (23 teams Week 4); methodology unchanged |
| game-day inactives | captured by a T-55 pass through the existing owner; no new source |
| Thursday cadence | automated, zero credit |
| named-player Ask | fixed (data path); planner routing to be confirmed on Production |
| usage freshness | enforced (36h, results-anchored) |

## 4. Phase B — dependency map (verified where marked ✔; the rest from a read-only code audit)

| Concern | Suggested Parlays | Bank Builder | Moonshot |
|---|---|---|---|
| Legs from | `pipeline/parlay_optimizer.py` → `parlays/optimizer/<date>.json` (`publicRiskSections`), **MLB props only** | `lib/daily-portfolio/mlb-team-legs.ts` ← `mlb/team-markets/<date>.json` (DraftKings, de-vigged favourite side) | same file, both sides |
| Eligibility | `lib/parlays/card-leg-eligibility.mjs` (demoted families) + optimizer gates | `accounting.ts` `bbEligibility` + `preEvent` | same `bbEligibility` |
| Tier / steps | `build-risk-ladder.mjs` `BANDS` / `BAND_MAX_LEGS` | `bank-builder-ladder.ts` 5 steps $100→$200→$700→$1,400→$3,500→$10,000 | `moonshot-ladder.mjs` $25→$100→$400→$1,000 |
| Joint probability | none (score-ranked) | product of marginals (independence) | product of marginals |
| Correlation | optimizer allows ≤ 2 legs/game | one leg per game per lane; Lane B avoids Lane A's games | 2 legs, different games |
| Freeze | dated ladder file (✔ one commit per dated file observed) | `placed-lanes.mjs` (placed lane never swapped) + md5 money guard | same |
| Settlement | `settle-lab-cards.mjs` → write-once `parlays/lab-settled/` | `settle-mlb-player-props.mjs` → write-once `mr-dub/settled/` | same |
| Record | ✔ ladder `record` = **every optimizer slip** (1,991 decided over 94 days), presented by Results as "paper cards" (`risk-ladder-overall`) | Rule S fold → `mr-dub/portfolio.json` | `portfolio.moonshot` |
| Ask | ✔ `getParlayCandidates` reads the **optimizer pool**, not the published ladder | ✔ `getProductRecord` only — **no tool returns today's official card** | same |
| Workflow | `daily-products.yml` (workflow_run after mlb-daily-production + 11:41Z cron); also nightly-settle | same | same |

Exact tier names (repo): **Low Risk · Medium Risk · High Risk · Longshot** (`risk-taxonomy.ts`); ladder bands low ≤ +100 < medium ≤ +300 < high ≤ +600 < longshot. ⚠ Four tier definitions disagree (ladder bands, optimizer `PUBLIC_RISK_SECTION_SPECS`, `risk-taxonomy.ts` `RISK_GATES`, `risk-levels.ts`), so an Ask "Medium" optimizer slip can be a ladder "High" card.

## 5. Phase B — verified reliability defects (by impact)

1. ✔ **An MLB off day fails the whole `daily-products` job.** 2026-09-28: `pool-gate: INPUT_MISSING — mlb/team-markets/2026-09-28.json has not been written` → exit 20 → no BB/Moonshot no-play receipt, no ladder, no ProductEligibleLeg universe (NFL included), no projection/Ask refresh. From the MLB offseason this recurs **daily**. An honest "no MLB games today" signal is not available from committed files: `statsapi-schedule/2026-09-28.json` (gameCount 0) was captured 09-22, and timestamp-only refreshes are unstaged, so a "0 games" file cannot be dated. **Design proposal:** split the job — MLB money products gated by the pool; sport-neutral steps (eligible legs, projection chain, Ask build) run regardless; an MLB "no slate" verdict from a capture whose freshness is recorded in content. Intersects founder decision F3.
2. ✔ **All three products are MLB-only**; the MLB regular season ended 09-27 and 10-01 held one game, so every product is empty — F3 (postseason/offseason behaviour) is open. NFL/UFC/EPL have separate ladders at `/cards/<sport>`; the NFL ladder is dated 2026-08-24 (`nfl-odds-capture.yml` dispatch-only).
3. ✔ **Ask does not read official product receipts** (§4) — cross-product disagreement with `/build`, and no source for "today's Bank Builder".
4. ✔ **Suggested Parlays record population** (§4) — the public tier record is the optimizer population, not the published cards (`lab-ledger.json` from `lab-settled` is), unsegmented across the 08-17 policy change (disclosed on the cell).
5. ✔ **No started-event guard in the ladder** (gamePk join only; the 08-27 incident was fixed by requiring a gamePk, not a start time). daily-products ran 5× on 10-01; a mid-afternoon run can select a started game.
6. ✔ **`/today` hardcodes Moonshot's no-play reason** ("no two-leg card … reaches its rung's price") while today's lane reason is "fewer than 2 eligible legs". The lanes carry `activationEligibility.reason`; render it verbatim.
7. ✔ **UFC registry contradiction:** `sport-capability-registry.ts` says UFC `SCAFFOLD_ONLY` (07-23, the old market-nudge model) while the UFC ladder publishes the later fitted fight model as PUBLISHED (its own note: the live comparison "currently favours the market"); a 97.6% probability on a +185 underdog.
8. ProductEligibleLeg v1 blocklist omits HOLD / MARKET_CONTEXT / DEMOTE*_TO_MARKET_CONTEXT / ROLE_UNCERTAIN, and the contract feeds only the selector shadow, not the live products (documented in `V17_PRODUCT_ELIGIBLE_LEG_CONTRACT.md`).
9. Dead code: the Moonshot +700 floor and the sport gate in `laneEligibility` are never called.
10. Odds: Suggested Parlay card legs carry no book / capture time / receipt; no hardcoded −110 in product paths (only in user bet-tracking).
- Not borne out: a ladder rewrite after publication (each dated ladder file has exactly one commit); a no-card lane shown as pending (the settled receipt writes `result: "pending"` on an `awaiting` lane with no legs, but Results' `lane-words.mjs` renders it "awaiting").

**Published-receipt record, last 8 product days (committed artifacts only — no reconstruction, no outcome used for selection):**

| Day | Product receipt | Suggested ladder | Lab settled | Mr. Dub settled (BB A/B · Moonshot A/B) |
|---|---|---|---|---|
| 09-24 | ✔ | 3 cards, 1 tier skipped | ✔ | lost/won · awaiting/lost |
| 09-25 | ✔ | 3 cards, 1 skipped | ✔ | won/lost · awaiting/lost |
| 09-26 | ✔ | 3 cards, 1 skipped | ✔ | won/lost · awaiting/lost |
| 09-27 | ✔ | 3 cards, 1 skipped | ✔ | won/won · awaiting/lost |
| 09-28 | **none** (daily-products INPUT_MISSING) | none | none | all awaiting |
| 09-29 | **none** (daily-products failed) | none | none | all awaiting |
| 09-30 | ✔ | 0 cards, 4 skipped (F-1 demoted families) | none | lost/won · awaiting/won |
| 10-01 | ✔ | 0 cards, 4 skipped | none | (pending settle) |

A true replay (input universe at the time → eligibility → selection) needs the frozen optimizer/team-market inputs per day and is left to the Phase B session; these rows are what was actually published.

## 6. Why Phase B stopped at the audit
Phase A grew past its bound: the live-hub incident, the Week-4 results incident and the A3 integration made it seven PRs. The Phase B items above each change a product, a public record or Ask's tool contract; per prompt §7 they go to a fresh session with founder decisions first.

## 7. Founder / model decisions required
1. **F3 — products in the MLB postseason/offseason**, and whether NFL/UFC/EPL legs may enter Bank Builder/Moonshot (needs the eligible-leg contract to gate the live products).
2. **Suggested Parlays record population** — published cards (lab-ledger) vs the optimizer population.
3. **One tier definition** for Low/Medium/High/Longshot across ladder, optimizer, taxonomy and Ask.
4. **UFC fight model** standing (registry vs ladder; live evidence vs market).
5. **Rushing allocation research** (the §7.1 decision, now withheld): candidate constrained allocation (renormalise over the available set, or a Dirichlet/multinomial carries model like v1 targets) → 2014–21 replay (Brier/ECE + coverage against the frozen bars) → forward weeks → publication gate. Until then rushing publishes only for coherent pools.
6. Carried: paused-market MLB calls in the public game-call record; UX-1 nav charter; Ligue 1 odds receipt.

## 8. Runtime-pending at writing
- **PIT @ CLE settlement (A1):** final ≈ 03:30Z; props grade via the event-window / settlement receipts; frozen Oct 1 Top-5 board (00:33:59Z, write-once) settles from canonical grading. Check: `node app/scripts/ops/nfl-lifecycle-trace.mjs` for 401872964, `/results/nfl` after grading (Week 4 becomes the report once its first game grades — #882), Ask "How did PIT vs CLE go?".
- **Named-player Ask on Production** with the real provider: "What is Michael Pittman Jr.'s projection?" for a game that has not started.
- **Thursday 10-08:** first scheduled `nfl-pregame-free-refresh` — expect ROSTER at T-105 and INACTIVES at T-55 dispatches in its log.

## 11. Phase B continuation (same session, second operating mode)

| Unit | PR | What |
|---|---|---|
| B1 | #884 | MLB input classifier (READY / NO_EVENTS same-ET-day only / INPUT_UNAVAILABLE); only MLB money steps gated; everything else commits; failure reported last |
| B2 | #885 | `getOfficialProductCards` — Ask reads the published ladder / Bank Builder / Moonshot / settled lanes; NO CARD PLACED; no tier substitution; no money fields, no optimizer-population record; planner no longer asks a risk style before official cards (Production probe) |
| B3 | #886 | Candidate-pool record labelled as such on /build, Parlay Lab meter, /results, Results semantics (numbers unchanged) |
| B4 | #887 | Ladder record bucketed by each slip's own price (was optimizer section key: "Low" row was 97% +100–+300 slips) |
| B4 | #888 | Ask candidates banded by price; dead `RISK_GATES` removed |
| B5 | #889 | Sport ladders gated by the capability registry (`canShowLiveProjections`) — UFC `SCAFFOLD_ONLY` → `CAPABILITY_GATED` |
| B7 | #890 | Results V2 first slice: NFL season record by prediction family, owner-folded, drill-down from the owner's week files |
| B10 | #891 | Ladder started-event guard (fail closed on unknown start) |
| B8 | #892 | Hub truth fixes: stale NFL "odds lapsed" fallback, missing strip items (EPL Fixtures, NFL Simulations), UTC dates |
| B1b | #893 | Found by the first dry run after #884: the ladder-freshness assert ran before the commit and would block every product on MLB off days — moved after the commit |
| B6 | #894 | Ask stopped claiming NFL live is unavailable (registry/planner/help corpus were stale; Production answered a live PIT @ CLE score question with a refusal) |
| B8 | #895 | Shared hub H1 freshness = the artifact the reads come from (NFL index, UFC card; EPL already); NFL index loader no longer silently empty under tsx |
| — | #896 | Free pregame refresh also covers Monday Night Football (same cron defect as Thursday) |
| B6 | #897 | "Why is this leg in the Bank Builder?" — the lane's own whyThisCard + correlation note, verbatim |
| B8 | #898 | One set of event-status words on hub cards (MLB was printing raw "pregame"/"started") |

### Ask public-readiness (B6) — real provider
| Intent | Production (before) | #885 preview (after) |
|---|---|---|
| Deep-row named player (Mayer, row 7) | ✓ exact board row | — |
| Unpublished player | ✓ honest no-data | — |
| Team / game forecast | ✓ | — |
| Full-game NFL simulation | ✓ honest "none" | — |
| UFC trust | ✓ experimental, no calibration verdict | — |
| Today's Bank Builder | ✗ "no parlay candidates" | ✓ both lanes NO CARD PLACED + reason |
| Today's suggested parlays | ✗ asked for a risk style | ✓ no card per tier + ladder reason |
| Why no Moonshot | ✗ answered about Saved | ✓ lane reason |
| Lowest-risk / "Conservative" | — | ✓ Low risk, no substitution |
| Past day (09-30 Bank Builder) | — | ✓ matches the settled receipt |
| Live NFL score | ✗ "NFL live not available" | fixed in #894 |

### B8 hub grammar — not changed (product choices)
One event-state vocabulary (only UFC uses `lib/sports/event-lifecycle.mjs`); one freshness stamp in the shared H1 (NFL/MLB/UFC adapters pass `freshness: null`; which artifact it names is a design choice); one probability-label format (NFL `KC 61.3%` vs EPL/UFC `Name · 54%`); uniform Live/Ask/research links (only NFL links /live; none link /ask, /players, /teams); `SaveForecastButton` exists only on detail pages.

### Noted, not changed
- `approvedBankBuilderLanes`: defaulted `provider: "consensus"` and `modelConfidence: 0` when absent (the 0 would settle as a 0% probability) — **fixed in #902** (both stay null). A started-event check deliberately does NOT belong there (an approved card is placed pre-game and stays active).
- `/results/date/2026-09-28|29`: lanes read "awaiting" (no card placed — true) but not "not evaluated (input missing)" — reason precision.
- Pre-existing: a local built-export test fails on a stale `out/` (not in CI).

### B9 Live Hub — owner-blocked
`/live` already separates Live now / Upcoming / Final — grading pending / Settled today; featured rows now use gateway facts (#878). The remaining B9 items: UFC live — an adapter exists (`espn-mma.mjs`, `ufc-tracked.mjs`) but UFC is not in `LIVE_PUBLIC_SPORTS` (a publication decision); EPL live adapter (none); an exact live anytime-TD signal (ESPN scoring plays carry prose names only), DK/FD progress rails. Not started rather than invented.

### Tier matrix (B4)
| Surface / owner | Names | Definition | Source |
|---|---|---|---|
| Suggested Parlays ladder (public) | Low risk · Medium risk · High risk · Longshot | combined price −200…+100 · …+300 · …+600 · > +600; max legs 2/3/4/5 | `build-risk-ladder.mjs` BANDS = `risk-odds-bands` `PARLAY_ODDS_BANDS` |
| Taxonomy labels | Low Risk · Medium Risk · High Risk · Longshot (capital R) | aliases conservative→low, balanced→medium, aggressive→high | `risk-taxonomy.ts` |
| Optimizer (internal) | low · medium · high · longshot sections; profiles conservative/balanced/aggressive | < +300 (2 legs) · +300–600 (3–4) · +600–1000 (4–5) · ≥ +1000 (5–6) | `parlay_optimizer.py` `PUBLIC_RISK_SECTION_SPECS` |
| Bettor tiers (prefs) | steady · balanced · adventurous · longshot | which ladder bands a reader sees; cards/day; min bankroll | ladder `bettorTiers`, `prefs/bettor-tiers.mjs` |
| Legacy daily-parlays | low · medium · high · longshot | legs 2 / 2–3 / 3–4 / 4–6 | `risk-levels.ts` (World Cup era) |
| Bank Builder | Lane A (safest) · Lane B (value +200…+700) | 5-step ladder $100→$10,000 | `bank-builder-generation.ts` |
| Moonshot | rungs | $25→$100→$400→$1,000, 2 legs | `moonshot-ladder.mjs` |
| Ask | LOW · MEDIUM · HIGH · LONGSHOT | after #888: the ladder price band | `registry.mjs`, `build-ask-projections.mjs` |
| /results stream | Low risk … Longshot + band text | ladder bands (record re-bucketed by #887) | `risk-ladder-stream.tsx` |

### Founder decision queue
1. **Suggested Parlays public record population.**
   - A — Published cards only (lab-ledger streams): MLB 21–88 (109 cards, 08-17→09-27). What a follower could have played. Migration: Results headline + /build band records switch owner; the 383–1,608 pool becomes a research stat.
   - B — Every optimizer candidate (today): 383–1,608 over 94 days. Measures the generator, not the product; must stay labelled "candidate pool" (#886).
   - C — Published cards, segmented by policy era (pre/post 08-17, F-1 demoted-family withholding 09-30): most honest history, more cells.
   - Recommendation: A for the product record (C if eras matter for the story), B kept as an internal model-quality metric.
2. **Canonical public tier vocabulary.** A — ladder price bands + "Low risk…Longshot" everywhere (bettor tiers become a viewing preference only); B — keep bettor tiers as the public names. Recommendation: A; technical inconsistencies already removed (#887/#888).
3. **MLB postseason vs offseason (F3).** A — postseason: products run on postseason slates as today, off days INPUT_UNAVAILABLE/NO_EVENTS; offseason: MLB lanes OFF_SEASON (needs a dated "no games" signal or a season calendar). B — pause MLB money products from end of regular season. C — move Bank Builder/Moonshot to NFL legs (needs NFL legs to clear the product contract: today 0 qualify, every NFL event is EXPERIMENTAL_LEAN).
4. **UFC model status.** A — keep SCAFFOLD_ONLY (ladder stays gated, #889). B — promote the fitted fight model to EXPERIMENTAL_PUBLIC (passes historical bars; live log-loss 0.710 vs coin 0.693 at n=31, market favoured) — ladder resumes with experimental labelling. C — FULL_MODEL (not supported by current live evidence). Recommendation: A until the live sample beats the market's de-vigged line on its preregistered bar.
5. **Correlation / same-game legs.** 31 of 109 published ladder cards had 2+ legs from one game; the combined price is the product of single-leg prices, which no book offers for correlated legs. A — reject same-game legs on public cards; B — allow with a label that the price is not an available same-game-parlay price. No impact today (F-1 withholds MLB cards).

## 9. Final state (at writing)
- **Main:** `05decfe0f0` after #898 (+ #899/#900 in their merge chain). **Production:** `17d6127e` verified (through #895); the remainder deploys from the same chain.
- **Merge discipline:** every Phase B PR merged only when its exact-head `quality` run was green **and** `git merge-tree` of main + head equalled the tested head tree (no drift). The chain was rebuilt once (12 branches) so parallel CI did not invalidate each other.
- **Production verified this session:** `/live` PIT @ CLE live values (1024/375); zero-credit event window rebuilt 15 boards (22 rushing pools withheld, 0 audit violations, odds step skipped, PIT @ CLE board frozen); KC @ LV game page (KC rushing kept, LV withheld with reason); Ask official cards (PRODUCT_CARDS) and live NFL score with the real provider; `/results/nfl` season section + drill-down (Week 3 receptions: 216 rows = owner's 168/186 + 30 voids); `/results` candidate-pool label; EPL strip Fixtures item.
- **daily-products dry run (#884):** classifier `INPUT_UNAVAILABLE` (10-01 slate 15h old), receipt `bank-builder=INPUTS_MISSING · moonshot=INPUTS_MISSING`; exposed #893 (assert before commit), fixed.

## 10. Backlog (by value)
1. daily-products split (§5.1) — before the MLB offseason.
2. Ask product-receipt tool (§5.3).
3. Ladder started-event guard (§5.5). (`/today` no-play reason §5.6 shipped in #883.)
4. Monday night: the paid kickoff refresh has the same cron shape (`*/30 17-21 * * 1` for a 00:15Z kickoff); a free MNF pass mirrors #880.
5. Rushing allocation research (§7.5).
6. Session 4 carry-overs: v1 engine OUT-player mass to OTHER (§20); `nfl-opportunity-conservation.mjs` still measures receiving against share-level shares although receiving publishes from v1.

## Next recommended fresh session
1. Read PIT @ CLE settlement (§8) and close A1.
2. Founder decisions §7.1–§7.3.
3. Phase B implementation in this order: daily-products split → Ask official-receipt tool → started-event guard + `/today` reason → (after decisions) tier unification and record population.
