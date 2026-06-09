# UFC free fighter-stats source inventory + scorecard (June 9, live-researched)

Real web research + tiny fetch tests. Scores 1–5 (5 best).

## Sources

### 1. Greco1899/scrape_ufc_stats (GitHub) — **RECOMMENDED primary**
- Type: pre-generated **CSVs committed to the repo** (no scraping by us).
- License: **GPL-3.0**. Source: ufcstats.com. Refresh: **automated daily** (last
  full refresh 2025-11-22) via GCP Cloud Scheduler.
- Files: `ufc_event_details`, `ufc_fight_details`, `ufc_fight_results`,
  `ufc_fight_stats` (per-fight strikes/TD), `ufc_fighter_details`,
  `ufc_fighter_tott` (height/weight/reach/stance/DOB).
- Verified fields (fetched raw): tott = `FIGHTER,HEIGHT,WEIGHT,REACH,STANCE,DOB,URL`;
  results = `EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,...`. Some cells "--"
  (missing → fail-closed).
- Coverage 5 · Freshness 5 · Legality 4 (GPL; consume as input, attribute, don't
  republish raw) · Ease 5 (download CSVs) · Field richness 4 · Historical depth 5 ·
  Automation 5 · ID mapping 3 (name+ufcstats URL id) · Model use 4 · Grading/backtest 5.
- **Suitability: YES.**

### 2. ESPN MMA API (free JSON) — **RECOMMENDED for live results/schedule**
- `site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard` — verified working
  (returned UFC Freedom 250). Free, no key, same family as our MLB/NBA calls.
- Coverage 3 (events/results, shallow stats) · Freshness 5 · Legality 4 · Ease 5 ·
  Fields 2 (not enough for modeling) · Grading 4.
- **Suitability: YES for schedule + live grading; NO for fighter modeling alone.**

### 3. jansen88/ufc-data (GitHub) — historic odds, but **no license**
- 30yr ufcstats data + **historic betting odds (betmma.tips, 2014+)** in
  `complete_ufc_data.csv`. **No LICENSE file → redistribution risk.**
- Legality 2 (no license) · otherwise rich. **Suitability: MAYBE (odds reference
  only; do not redistribute; prefer forward OddsAPI logging).**

### 4. Kaggle datasets (UFC Complete 1996-2024, Ultimate UFC, rajeevw/ufcdata,
asaniczka/ufc-fighters-statistics, etc.)
- Good for a one-time backtest bootstrap; **require a Kaggle account to download**;
  licenses vary (many CC0/CC-BY — verify per dataset); often stale vs daily CSVs.
- Coverage 4 · Freshness 2 · Legality 3 (varies) · Ease 3 (auth) · **Suitability:
  MAYBE (backtest bootstrap; not for automated daily updates).**

### 5. ufcstats.com direct scrape — **NOT recommended (use #1 instead)**
- No robots.txt (returns 404 → absence is not permission), no API, gray-area ToS.
  Direct scraping is unnecessary because Greco1899 already publishes daily CSVs.
- Legality 2 · **Suitability: NO** (avoid; consume the pre-scraped CSVs).

### 6. BestFightOdds / FightOdds.io / Tapology / Sherdog — historic odds/profiles
- Higher scrape/ToS risk, no clean free API. **Suitability: NO** without approval.

## Verdict
Best free **fighter stats + fight history + results**: **Greco1899 CSVs** (daily,
GPL-3.0). Best free **live results/grading**: **ESPN MMA API**. Best **historic
odds**: none cleanly free → **log OddsAPI snapshots forward** (clean) or a licensed
dataset. This combination can unlock `fighterStatsReady` + `gradingReady` +
`backtestReady` **without paid SportsDataIO**.
