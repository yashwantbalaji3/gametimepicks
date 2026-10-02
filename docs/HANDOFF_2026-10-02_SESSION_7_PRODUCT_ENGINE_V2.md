# Handoff: 2026-10-02, Session 7 — Active-Sports Product Engine V2

Point-in-time record. Current truth = the repo + `docs/PRODUCT_ENGINE_V2.md` (the canonical V2 contracts) +
Production. Ownership: COMMON / UNASSIGNED.

**Final main / Production:** `150bb89677` (+ this docs PR) / `150bb896`.

**Start state (verified 11:04Z):**
- main `92c3fe6013`, Production `d6485907`.
- Only open PR: #716 (intentional HOLD, untouched).
- daily-products last failed at 04:50Z on `e4bf2e83`, which predates D3. On main the MLB off-day path works: in a scratch worktree 10-02 classifies `NO_EVENTS` and all four lanes write "postseason off day, next on 2026-10-03".

## 1. Outcome in one paragraph

The V2 infrastructure has shipped, every public product still runs on V1, and making any V2 selector public is a methodology gate.

**Shipped:**
- one leg contract for every sport (RecommendationReceiptV2 + leg-floor@2);
- a daily recommendation universe that measures GameTimePicks-vs-market probability coverage;
- a Suggested Parlays V2 forward shadow with a time-safe replay;
- Bank Builder / Moonshot V2 designated as the preregistered BB-C1 / MS-C1, with a parity proof that the V2 floor changes nothing in their pool.

**Truth fixes reached Production:**
- UFC paper cards were leaking onto `/ufc` while UFC is SCAFFOLD_ONLY, and the lab settler would have graded them into the public record.
- Product pages printed generic "no card reached this step's price" sentences on a no-games day.
- Ask gained a 30-day official-card history and a published-card record per risk level.

**Why V2 is a methodology gate:** the registry admits only MLB into official products, and every eligible MLB leg is a market-implied team market (F1 = A). So **no product leg carries a GameTimePicks model probability today**, and no V2 ranking can claim an evidence edge over V1.

## 2. Baseline re-measurement (Phase 0)

**Product output, 09-17 → 10-01, from committed artifacts:**
- **Ladder:**
  - Through 09-27: 3 cards a day (medium / high / longshot; low skipped).
  - 09-28 / 09-29: no receipt (INPUT_MISSING failures, pre-D3).
  - From 09-30: 0 cards, because F-1 withholds the demoted families.
- **BB / Moonshot:** placed on MLB team markets daily until 09-30. 10-01 was NO_PLAY (one game; one leg per event).

**Candidate universe (`build-recommendation-universe.mjs`):**

| Slate | Candidates | Eligible | Usable GTP probability | Market-only | None |
|---|---:|---:|---:|---:|---:|
| Sun 09-27 | 1,363 | 84 | 273 (NFL TD) | 84 | 603 |
| Thu 10-01 | 92 | 6 | 18 | 6 | 41 |
| Sun 10-04 | 751 | 0 | 293 | 0 | 430 |

- **Eligible legs:** all MLB team markets, market-implied.
- **Usable GameTimePicks probabilities:** only NFL anytime-TD rows, all blocked (NFL is sport-gated, roles are uncertain, and the props settlement path is unproven).
- **MLB props:** 100% MODEL_DEMOTED (hits, total bases, H+R+RBI, pitcher Ks).

**§14 answers:**
- V1 Suggested Parlays rank by optimizer `score = Σ edgePct/100 − 0.05·(legs−2)`. The edge is the demoted MLB prop model's projection against the line; the ladder takes the top score per band, ties to fewer legs.
- What V1 does not rank on: GTP probability, market probability, freshness, availability and correlation. Its only dependency guard is one leg per event (D5).
- V1 BB/Moonshot rank by max joint de-vigged market probability among cards reaching the rung (ties: smaller decimal, fewer legs, id). It is fully price/market-driven and deterministic.
- Sport mix is MLB-only by the registry, not by accident.

## 3. What shipped (PRs)

| PR | What | State |
|---|---|---|
| #919 | UFC read-time capability gate (`/ufc`, `/cards/ufc`, lab settler) + replay-safety split + two guards rotted by bot data (cohort 0-win bucket; EPL model-only rows) | merged (§9) |
| #920 | Product Engine V2: receipt, floor, sources, universe builder, SP V2 selector + forward shadow + replay, V2_CANDIDATES, floor parity guard, shadow firewall, `docs/PRODUCT_ENGINE_V2.md` | merged (§9) |
| #921 | Ask: 30-day official-card history; published-card record per risk level (D1 population only) | merged (§9) |
| #922 | `/today`, `/bank-builder`, `/moonshot` state each lane's own no-card reason; NO_EVENTS panel on `/bank-builder` | merged (§9) |
| #923 | MLB off day no longer fails `mlb-daily-production` (Homer Nukes assert gated on a board with games). That failure skipped the chained daily-products run. | merged (§9) |
| #924 | Ask planner is told today's ET product date ("September 25" was planned as 2025-09-25 on Production) | merged (§9) |

## 4. The V2 contracts

`docs/PRODUCT_ENGINE_V2.md` is the canonical, versioned copy. In summary:
- **RecommendationReceiptV2:** identity / market / forecast / context, with `probabilityKind` MODEL | MARKET_IMPLIED | NONE and a probability detail.
- **leg-floor@2:** gates 1–8 with typed exclusion codes, plus card-level SAME_EVENT / SAME_ENTITY / DUPLICATE codes.
- **SP-V2 tiers:**

  | Tier | Band | Legs | Per-leg floor | Objective |
  |---|---|---|---|---|
  | Low Risk | −200…+100 | 2 | — | max joint p |
  | Medium Risk | +100…+300 | ≤3 | p ≥ .40 | max fair ratio @0.01, then joint p |
  | High Risk | +300…+600 | ≤4 | p ≥ .35 | same as Medium |
  | Longshot | > +600 | ≤5 | p ≥ .25 | same as Medium |

  Legs are disjoint across tiers, pricing is DERIVED_INDEPENDENT_PRODUCT, and the probability basis is labelled MARKET_IMPLIED.
- **BB V2 = BB-C1:** Lane B ranks for the rung, and same team / opponent is forbidden.
- **MS V2 = MS-C1:** joint-p floor .20 (.32 on the final rung), drawing on the full pool rather than Bank Builder's leftovers.
- **Eras:** no public era change, because nothing was promoted. Results keeps POLICY_V1 / POLICY_V2 (08-17). A V2 promotion must start a new era (POLICY_V3), never blend with existing ones.

## 5. Replays

**Suggested Parlays (09-21 → 10-01, time-safe on the committed universes):**
- V1 as published: 21 cards, 1–20.
- V2: 27 cards, 10–17. The market expected 7.4 wins, so this is no skill claim.
- V1 legs that pass leg-floor@2: 0 of 72. V2 rule violations: 0.
- Record: `data/internal/products/engine-v2/sp-replay.json`.

**Bank Builder / Moonshot:**
- Historical replay (v1.7, 08-15 → 09-20): BB-C1 37–34 vs legacy 32–39 paired.
- Forward shadow (09-21 → 09-30): BB-C1 6–7 (survival .462) vs control 9–6 (.60); MS-C1 1–2.
- Both gates `NOT_YET`.
- Not re-tuned. Choosing between them on these outcomes would be hindsight.

## 6. Active sports

| Sport | Today |
|---|---|
| MLB postseason | Game days → market-implied team legs. Off day (10-02) → NO_EVENTS, other sports unaffected. Season end → OFF_SEASON (D3, `lib/mlb/season-state.mjs`). |
| NFL | SPORT_GATED (EXPERIMENTAL_PUBLIC). Thursday / Sunday / Monday universes measured. |
| EPL | SPORT_GATED. International break, odds stale until the 10-10 window. |
| UFC | Gated, now also at the read boundary (#919). |
| NBA | Predictions shadow / withheld; nothing normalised. |

## 7. Automation

**daily-products:** `build-recommendation-universe` → `suggested-parlays-shadow build`.
- The step is skipped on `INPUT_UNAVAILABLE`, so an empty universe is never locked in.
- Both artifacts are write-once per date.
- Network-free: no credits and no paid calls.

**nightly-settle:** `suggested-parlays-shadow grade`. Pending is never a loss.

**Freeze:**
- V1: dated ladder file / `placed-lanes` + md5 money guard.
- V2: first publication wins.

## 8. Mutation probes (each landed, each restored)

| Probe | Result |
|---|---|
| Sport gate removed (UFC / NBA / NFL / EPL enter) | 1 fail |
| Role gate removed | 1 fail |
| Staleness removed | 1 fail |
| Market-implied carried as `probability` | 4 fail |
| Same-event allowed | 1 fail |
| Tiers share legs | 1 fail |
| Band ignored | 1 fail |
| Per-leg floor ignored | 1 fail, after adding a dedicated test |
| Shadow path referenced by a Results owner | 1 fail |
| UFC loader gate removed | 2 fail |
| UFC settler gate removed | 1 fail |
| `/today` fallback-first | 1 fail |
| Lane reason dropped from the read model | 1 fail |
| Moonshot reason branch disabled | 1 fail |
| Main's Homer Nukes assert step restored (off-day producer) | 2 fail |

Already covered by tests in this session's suite:
- **Per-family (`engine-v2.test.mjs`):** PAUSED / REJECTED / HOLD / ESTIMATE_BELOW_BAR / ROLE_UNCERTAIN / SCAFFOLD_ONLY families refused; OUT / QUESTIONABLE refused; demoted model refused; missing probability ≠ 0%; unread price ≠ −110; missing receipt = MARKET_MISSING; started event refused.
- **Card and record behaviour:** duplicate leg; no-card ≠ pending (SP `NO_QUALIFYING_CARD`, Ask `laneState`); pending is never graded a loss (shadow grade).

## 9. Final state

### Merges

Each PR merged only when its exact head was green (`quality` + `python` + Vercel) **and** `git merge-tree origin/main <head>` equalled the tested head tree. A code gap was always closed with `merge origin/main` + re-CI, never a rebase.

| PR | Merged | Merge commit |
|---|---|---|
| #919 | 11:50:35Z | `7873ea1454` |
| #920 | 11:56:02Z | `4841df45a7` |
| #921 | 12:18:06Z | `145edffef3` |
| #922 | 12:40:50Z | `37afce80bf` |
| #923 | 12:59:04Z | `9b6e844f63` |
| #924 | 13:20:19Z | `150bb89677` (gap = one gtp-bot nightly-settle commit; data/report paths only, zero overlap) |

### Production acceptance (browser pane + real-provider Ask)

| Check | Production SHA | Result |
|---|---|---|
| UFC leak | `7873ea14` | `/ufc` renders no UFC cards; `/cards/ufc` states the registry refusal (SCAFFOLD_ONLY) |
| Engine V2 | `4841df45` | deployed; nothing public changed by design |
| Ask | `145edffe` | "How have Low Risk cards performed?" → "0–1 … published cards only" (verifier PASS); "How has the Longshot tier done?" → 4–33 (PASS); "the official Suggested Parlays cards from 2026-09-25" → the three published cards (PASS — NOT PUBLISHED before #921); "What's today's Bank Builder?" → both lanes NO CARD PLACED with the lane reason (PASS). The year-less "September 25" was planned as 2025 → fixed in #924, verified on `150bb896`: "September 25" → the 2026-09-25 cards (PASS); "the Bank Builder card on Sept 30" → both lanes with their finals (PASS) |
| Lane reasons | `37afce80` | `/today`, `/bank-builder`, `/moonshot` carry 0 generic "no card reached this step's price" / "slate offered no combination" sentences; each lane shows its own reason; the NO_EVENTS panel matches the header |

- 375 px and 1280 px across `/`, `/today`, `/build`, `/bank-builder`, `/moonshot`, `/results`, `/ufc`, `/cards/ufc`, `/mr-dub`: 0 horizontal overflow, 0 undefined/NaN, 0 console errors.

### Today's daily-products (an MLB postseason off day)

The run failed safely: nothing was published and no money moved. The chain of causes:
1. The 11:10Z `mlb-daily-production` failed at "Assert Homer Nukes produced its board". On a 0-game slate Homer Nukes writes no board by design. Fixed in #923.
2. The chained daily-products run was therefore skipped (it triggers on producer **success**).
3. The 11:41Z cron backstop had not fired by 12:45Z.
4. A manual dispatch at 12:45Z (`37008660443`) classified `NO_EVENTS` and wrote all four lanes as "the 2026-10-02 slate holds no games". The evidence ledger then stopped the commit with an INCIDENT: the board existed but `game-simulations/2026-10-02.json` did not, because the failed producer never committed it. This is correct fail-closed behaviour.

**Recovery:** the next scheduled `mlb-daily-production` (17:24Z) runs on `9b6e844f`, succeeds on the 0-game board (the sim generator does write a 0-game file), and chains daily-products. That writes today's receipts, the first Product Engine V2 universe and the SP-V2 shadow day.

The paid-ingest producer was **not** hand-dispatched (paid-data boundary).

The first full V2 forward day with games is **10-03**: Division Series, 4 games.

## 10. Founder / model gates (only genuine ones)

1. **Suggested Parlays leg source + SP-V2 methodology.** V1 can no longer publish: every family in its pool is demoted. The options:
   - **A.** Adopt SP-V2 on MLB team markets as a labelled market construction (F1-style), starting a new Results era.
   - **B.** Keep the ladder empty until a model family passes.
   - **C.** Keep collecting SP-V2 forward shadow, then decide.

   **Recommendation: C, then A.** Run the shadow through the Division Series and decide with forward evidence on publication rate and rule cleanliness, not on win rate.
2. **BB-C1 / MS-C1 adoption.** The preregistered gate requires ≥ 20 decided lane-days. The MLB postseason (≤ 4 games a day, World Series ends in late October) may not reach it before MLB leaves the universe. Choose between:
   - waiting for MLB 2027;
   - extending the pool via (3);
   - adopting on the Lane-B-target principle alone. That last option is a methodology call.
3. **NFL into official products.** This needs a registry promotion or a family-level product gate, and also:
   - confirmed roles (T-55 inactives);
   - a PROVEN prop settlement path;
   - pre-kickoff prop prices.

   Anytime TD is the only family that already publishes a model probability.

## 11. Known risks

- **Odds capture timing:** the V2 universe is locked at the first daily-products run after the MLB markets exist. Prices captured later in the day are not in that day's shadow; this is by design and matches the selector shadow.
- **NFL replays:** the NFL boards are latest-per-event, not time-locked, so NFL replays read later captures.
- **Bot-data rot:** two guards rotted under bot data commits between green runs. Main's quality gate does not run on `[skip ci]` data commits, so expect more.

## 12. Backlog

1. Results product date history and drilldown for Suggested Parlays. `/results/date/[date]` covers BB / Moonshot only.
2. Grade non-MLB legs in the SP shadow once a sport enters the universe.
3. Retire or point the three older eligibility modules (`product-eligible-leg.mjs`, `recommendation-receipt.mjs`, `eligible-leg/v2.mjs`) at engine-v2. They are not read by any product.
4. `/build` copy says "Model-built cards" while V1's model is demoted. Revisit if SP-V2 is adopted.

## Next recommended fresh session

1. Read the first forward SP-V2 shadow days (10-03 onward), the BB / MS shadow ledger, and the 10-03 Division Series settlement.
2. Founder gates 1–3.
3. The Results Suggested Parlays day history (backlog 1).
