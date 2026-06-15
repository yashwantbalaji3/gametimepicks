# June 15 — V1 merge + methodology/model upgrade + paid-run audit

Single source of truth for the June 15 work: (0) merge the V1 theme, (1–12) audit and
upgrade the multi-sport methodology/model framework + rebuild `/methodology`, (13–14)
generate the June 15 slate and clean active state. Honest, fail-closed, no fabrication.

---

## Phase 0 — V1 theme merge (DONE)

- **PR #488** ("UI/UX V1 full-site revamp preview (crimson-black)") was `OPEN / MERGEABLE /
  CLEAN`, all checks green (both Vercel deploys success), **0 `app/public/data` files** in
  the diff, secret + copy audits clean.
- Merged squash → **main `97005f8`** ("Apply V1 immersive UI system across app (#488)").
- **Production verified** (gametime-picks.vercel.app): `/`, `/today`, `/picks`, `/ufc`,
  `/results`, `/bank-builder`, `/methodology` all **200**; crimson token `rgba(242,54,69)`
  live on the homepage → V1 is the live baseline.
- **Integrity preserved on prod:** Bank Builder `$10,376.17 / 5–0 / completed`; UFC 250
  settlement untouched (presentation-only PR, no data changed).

Upgrade branch: `june15-methodology-model-upgrade-paid-run` (off `97005f8`).

---

## Phase 2 — Current-state methodology/model audit

The repo is far more mature than the public `/methodology` page implies. The model/projection/
card stack is real, pure-function-heavy, test-locked, and explicitly honesty-gated. Several
strong guardrail modules already exist but are **PROPOSED / not yet wired** into the live
optimizer (the repo's own convention requires an operator-approved promotion path before a
guardrail changes a published number).

### Shared / universal math (app/src/lib)
- **Current inputs:** per-leg American odds, model probability, recent-game series.
- **Current formulas:** `odds-math.ts` (`americanToDecimal`, `decimalToAmerican`,
  `combinedParlayPayoutPer100` → returns **null** if any leg lacks odds, never invents a
  price; `formatAmerican`). `parlay.ts` (`americanToImplied`, `impliedToAmerican`).
  `parlay-payout.ts` (`projectedPayoutForStake`, `sanitizeStake` clamp [1, 10000]).
  `v2-candidate-gates.ts` (full statistics layer: `normCdf`/`erfc`/`invNorm`, `wilson` CI,
  `correctedZ` Bonferroni, `poissonBinomialPValue`, `classifyCandidate` launch gates with
  de-vig baseline, date-stability, single-date-dependence, distinct-date minimums).
- **Current outputs:** combined decimal/American odds, profit/100, payout for stake.
- **Gaps:** no single shared no-vig two-way helper in TS (de-vig is computed ad hoc per
  call site + `score_model.py::devig_two_way` in Python); no shared **composite confidence**
  scorer (confidence ≈ edge-magnitude tiering today); no shared **data-quality A–D** scorer;
  no single **concentration score** (0–1) consumable by UI/cards.
- **Ready for June 15:** yes (pure math, no data dependency).

### Confidence / calibration
- **Inputs:** settled-result audit (`app/public/data/audit/model_audit.json`), raw edge tier.
- **Formulas:** `confidence-calibration-rules.ts` — `CALIBRATION_RULES` (thinSample 60,
  invertedMarginPp 1.5, strongHitRate 0.57, strongMinSample 100); `classifyTier` →
  `strong | watch | inverted | thin`; `calibratedConfidenceLabelFromTable` **downgrades**
  a "High" tier to "Model lean" when settled data shows it underperforms lower tiers
  (inverted), honestly, without hiding the lean.
- **Gaps:** calibration scope is `nba | mlb` only; UFC/soccer not yet in the calibration table.
- **Ready:** yes (read-only overlay).

### UFC / MMA
- **Inputs:** moneyline (h2h) odds (The Odds API MMA), fighter record / recent win rate /
  finish rate / sig-strikes-per-round / takedowns-per-round / reach / experience (UFCStats
  dataset), per-bout `dataQuality`.
- **Model:** `pipeline/ufc/model_moneyline.py` — market-implied baseline **+ small capped
  stats adjustment** (weights `recentWinRate .06`, `winRate .05`, `finishRate .03`,
  `sigStr .004`, `td .02`, `reach .002`, `exp .001`; logistic cap `MAX_ADJ 0.04`; shrink
  toward market 0.85 when `dataQuality < 0.75`, else 0.5). `publicEligible` requires
  `validated` (no-leakage backtest, `build_readiness.py`) **and** `dataQuality ≥ 0.75`.
- **Expanded model-only:** `build_expanded_projections.py` — goes-distance / total-rounds /
  method from real finish/method history. **No prop odds in feed → model-only, NOT parlay
  eligible**, shown for insight + graded for learning.
- **Settlement:** `grade_moneylines.py` vs official ESPN MMA finals (STATUS_FINAL only).
- **June 14 learning (UFC 250, settled):** moneyline **6–1** (Hokit +320 dog hit; Topuria
  80% / −520 fav upset), suggested cards **0–4** — *every card busted by shared Topuria
  exposure*; expanded finish/distance 5/6.
- **Gaps / upgrade opportunities:** card concentration was the failure mode → needs a
  hard concentration cap so one favorite can't anchor every card; heavy-favorite upset
  penalty; explicit underdog-value surfacing; market-disagreement flag.
- **Ready for June 15:** moneyline only **if** a real June 15 MMA slate + live odds exist;
  else "no slate". Props stay model-only.

### MLB
- **Inputs:** schedule + game logs (MLB Stats API), prop odds (DK/FD via Odds API): batter
  hits / total bases / (HR+R+RBI), pitcher strikeouts.
- **Model:** `pipeline/mlb/mlb_model.py` — pitcher K: `0.55·mean(last3) + 0.45·mean(season)`,
  `σ = max(stdev(season),1.6)`, `P(Over)=1−Φ((line−proj)/σ)`; batter: `0.5·last10 + 0.5·season`,
  `σ = max(stdev(season), market_floor)`. Edge tiers High ≥5pp / Med ≥2.5pp / Low; R5
  anomaly cap (edge ≥20pp → flag + cap Low). stdlib-only, conservative by design.
- **Settlement:** `settle_mlb_results.py` vs official MLB Stats API boxscores.
- **Gaps:** no park/weather/bullpen-fatigue/handedness-split inputs yet (documented).
- **Ready for June 15:** **primary paid-run target** — needs a live odds fetch (see Phase 13).

### NBA
- **Inputs:** player game logs (nba_api), prop odds.
- **Model:** `score_model.py` — `proj = 0.45·last5 + 0.35·last10 + 0.20·season + 0.30·(split−base)`,
  `P(Over)=1−Φ((line−proj)/σ)`; confidence by edge + data-quality; guardrails
  (`confidence_guardrails.py` R5 anomaly, suspicious_edge).
- **Settlement:** `settle_results.py` (manual override → nba_api → ESPN → stats_unavailable).
- **June 15 reality:** boards for 2026-06-14/15 are **empty (0 games / 0 leans, `isDemo`)** —
  NBA season is over → honest **"no slate today"**, not stale.
- **Ready:** clean now (show no-slate / settled finals; never show old Finals as active).

### World Cup / soccer
- **Inputs (when credentialed):** national-team recent form (API_FOOTBALL), de-vigged market.
- **Model:** `pipeline/world_cup/projection_model.py` — Poisson HDA + O/U, market-anchored
  prior (opening-day max weight 0.18), gates (underdog floor 0.15, min sample 5, min edge
  ML 0.03 / total 0.025). Player props via Poisson. Settlement regulation-90 only.
- **June 15 reality:** **no `API_FOOTBALL` credential configured**; only cached files exist
  (`market-outlook-2026-06-11`) → **unavailable / cached**. Fail closed: exclude from active
  picks and paid cards; show "needs data".

### Bank Builder
- **Logic:** `bank-builder-official-candidate.ts` / `parlay-suggested.ts` — selects from
  official Suggested parlays in a **+100 American window** (ignores edge/confidence by
  design); paper-only ladder; settles only on official results; `diagnoseBuilderPool`
  reports honestly when no eligible slip exists.
- **State (must preserve):** `$10,376.17 / 5–0 / completed`, no pending Step 5. New ladder
  = "coming soon".

### Suggested cards / parlay builders
- **Builders:** `parlay-builder.ts` (`PROFILE_RULES` conservative/balanced/aggressive:
  confidence tiers, minEdge, maxLegs, requireRecent10, requireValidPlayerId, maxLegsPerGame,
  excludeAnomalies), `snapshot_parlays.py` (official snapshots, stable slip IDs, skips expired
  games), `custom-parlay-grade.ts` (0–100 educational grade), `parlay.ts` (paste-mode
  matching; never invents lines).
- **Concentration:** `parlay-decorrelation.ts` measures same-game / same-market / same-team /
  duplicate-player shape and checks caps — **PROPOSED, NOT WIRED** into the live optimizer.
- **Gap (the June-14 UFC lesson):** no live, cross-card anchor-exposure cap. This is the
  highest-value safe upgrade.

### Stale / availability gating
- `freshness.ts` (`currentEtDate` real-ET day boundary, `dayLabelFor`), `active-slate.ts`
  (`selectActiveSlate`: prefer today → nearest future with leans → no_current/no_data;
  never shows a past slate as "Today"), `projection-availability.ts` (actionable count).
- **Ready:** robust; drives the June 15 active-state cleanup.

### June 15 data-source availability (assessed 2026-06-15 12:07 ET)
| Sport | June 15 data | Decision |
|---|---|---|
| MLB | no board yet; live odds gated by `ODDS_DRY_RUN=true` | primary target — needs odds decision (Phase 13) |
| NBA | boards empty, season over | **no slate today** (honest) |
| UFC | 250 settled June 14; no June 15 card found | **no new slate** (recap stays in results) |
| Soccer | no `API_FOOTBALL` cred; only cached June-11 | **unavailable / needs data** (fail closed) |

> **Paid-run blocker:** real June-15 odds require spending the owner's paid `ODDS_API_KEY`
> (env is deliberately `ODDS_DRY_RUN=true`, `ODDS_MAX_EVENTS_PER_RUN=2`). This is an
> owner-cost decision — surfaced before any live fetch in Phase 13.

---

## Upgrade plan (Phases 3–12) — safe + additive, no silent rewiring
1. **New `projection-framework.ts`** (pure, tested): canonical projection/card field schema +
   the formulas the product should standardize on — `noVigTwoWay`, `edgePoints`,
   `compositeConfidence` (blends edge, data completeness, sample, freshness, market
   agreement), `dataQualityTier` (A/B/C/D/unavailable), `concentrationScore` (0–1),
   `isParlayEligible` gate. Additive — does not delete or silently re-point working code.
2. **Wire the concentration guardrail** where it changes no settled number (card display +
   the documented promotion path), per the repo's operator-approval convention.
3. **Rebuild `/methodology`** as a true multi-sport hub (V1 crimson) + add a content test.
4. **Defer** (documented, not faked): core projection-model coefficient changes (need a
   no-leakage backtest before they can move a published number), UFC/soccer calibration-table
   expansion, park/weather/lineup feeds, soccer credentialing.

---

## Phases 13–14 — June 15 paid run + active-state cleanup (DONE)

Owner approved the live MLB run (ample monthly odds credits).

### Live MLB run (paid)
- `generate_mlb_board.py --date 2026-06-15` run **live** (dry-run disabled via inline env for
  the process only; `.env` left byte-identical). Built-in credit guards relaxed to cover the
  full slate.
- Result: **10 games scheduled → 10 with odds**, 465 prop rows → **465 leans**
  (High 199 / Medium 64 / Low 169 / insufficient 33). Markets: pitcher_strikeouts, batter_hits,
  batter_total_bases, batter_hits_runs_rbis (DK + FD, us region).
- **Credits: 409 → 369, exactly 40 spent** (as estimated). Key validated via the free
  `/sports` endpoint first.
- Enriched: `attach_recent_games` (437/465 leans got recent-game context).
- Cards: `snapshot_parlays --date 2026-06-15` → **18 slips** (conservative/balanced/aggressive
  × 6); `snapshot_optimizer` → legPool; `build_mixed_sport_cards` → cross-sport daily cards.

### Per-sport June 15 outcome
| Sport | Outcome |
|---|---|
| MLB | **10 games, 465 leans, 18 suggested cards** (Low/Medium/High tiers) — live, odds-backed |
| UFC | **no June 15 slate** (ESPN MMA = 0 events); UFC 250 stays a settled recap in /results |
| NBA | **no slate** (0 events, season over) |
| Soccer | **failed closed** — no `API_FOOTBALL_KEY`; stale June-12 projections gated out everywhere |

### Stale-content cleanup (code fixes)
- `/games`: gate the UFC event row on `!ufcSettled` → settled UFC 250 no longer shows as
  "Upcoming" (verified 0 "Upcoming" in built HTML).
- `/today`: sports-grid `live` for UFC now `ufcLive && !ufcSettled` → UFC reads "Off today"
  with the settled recap (not a live featured slate).
- `/today`: WC projections/player-props/cards **date-gated to today** + `wcLive` requires
  fresh credentialed projections → stale June-12 soccer no longer shows as "Live today / 8
  projections / 164 props / 7 cards"; now "Off today · 4 Games · 0 Projections" (real fixtures,
  no fabricated analytics).
- `build_mixed_sport_cards._wc_legs(date)`: stale WC pool gated by run-date → no stale soccer
  legs in mixed cards (mixed cards = 0 today; only MLB is live, cross-sport needs 2 live sports).
- Already-correct (verified, no change needed): `/picks` nulls settled-UFC cards and
  date-gates WC parlays; `loadDailyMixedCards(today)` date-gates; Bank Builder shows completed.

### Browser verification (dev server, desktop + mobile 375px, 0 console errors)
- `/today`: MLB "Live today · 10 Games · 465 Leans · 199 High conf · 06-15 Slate"; UFC "Off
  today" + "Officially settled 6-1" recap; World Cup "Off today · 4 Games · 0 Projections";
  Bank Builder "$100 → $10,376.17 · 5–0 · Completed". No overflow.
- `/picks`: "Suggested cards · Monday, June 15 · 18 live"; goals Recommended/Lower-risk/
  Higher-return (6 each); filters All/Mixed/World Cup/MLB(18); WC + Mixed honestly empty.
- `/methodology`: "How GameTimePicks builds projections" + all 6 sports + universal math +
  UFC 250 learning + integrity + roadmap.

---

## Phases 15–17 — tests / build / audits / verification

- **903 app tests pass**, `tsc --noEmit` clean, `npm run build` clean (187 static pages).
- 11 new `projection-framework` tests + 8 new `/methodology` content tests, both green.
- **Copy audit**: no banned whole-words in changed app/data/pipeline files.
- **Secret audit**: staged diff clean; `.env` byte-identical (live run used inline env, never
  edited the file); no odds key or cache committed.
- **Data audit**: only June 15 new data files + the daily-cards regen changed. Bank Builder
  data **byte-identical** ($10,376.17 / 5–0 / completed); UFC 250 settlement **byte-identical**;
  no historical results mutated; all June 15 artifacts carry the 2026-06-15 date.

---

## Soccer credential spec (owner request — not added this run; documented for the owner)

To take World Cup / soccer out of "unavailable / needs credential", the repo expects:

| Item | Value |
|---|---|
| **Env var** | `API_FOOTBALL_KEY` (required). Optional: `WC_API_FOOTBALL_LEAGUE` (default `1` = World Cup), `WC_API_FOOTBALL_SEASON` (default `2026`). |
| **Provider** | API-Football (API-SPORTS **direct**, not RapidAPI). |
| **Base URL** | `https://v3.football.api-sports.io` |
| **Auth header** | `x-apisports-key: <API_FOOTBALL_KEY>` — **yes, `x-apisports-key` is required** (direct API-SPORTS auth). |
| **Player photos** | `https://media.api-sports.io/football/players/{playerId}.png` |
| **Odds** | Prices still come from `ODDS_API_KEY` (The Odds API), not API-Football. |
| **Code** | `pipeline/world_cup/providers/api_football.py` (`ApiFootballProvider`). |

**Endpoints used (capabilities):** `/fixtures` (schedule ✓), `/fixtures/lineups` (lineups ✓),
`/teams` + `/teams/statistics` (team stats / form ✓), `/players` + `/players/squads` +
`/fixtures/players` (player stats ✓), `/leagues` (standings/league meta ✓), `/odds` (provider
odds discovery; live prices via The Odds API). So with the key set it supports **World Cup
schedule, odds, standings, lineups, and player/team stats**.

**To enable on Vercel:** add env var **`API_FOOTBALL_KEY`** (and optionally
`WC_API_FOOTBALL_LEAGUE` / `WC_API_FOOTBALL_SEASON`) in the project settings, then run the
`pipeline/world_cup/*` builders for the date. Until then soccer stays unavailable/needs-credential
and is excluded from active picks and cards (no fabricated soccer projections).

Phases 13–17 recorded below as executed.
