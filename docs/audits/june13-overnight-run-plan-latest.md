# June 13 overnight run — plan + source-of-truth map

Run: 2026-06-13 ~05:15 UTC · Base `69a68b4`. Integrity-bound autonomous run: do real,
official-source work; never fabricate projections/odds/results or invent the Step 5 card.

## Source-of-truth map (verified before mutating)
- `/today`, header chip → `public-summary-latest.json` (+ `public-ledger-latest.json`,
  `YesterdaySummary` over dated WC settlement + ledger).
- `/bank-builder` → `public-summary-latest.json`, `public-ledger-latest.json`,
  `official-step4-candidate.json` (gated), WC-flex generator (final-step gated off).
- `/results` → `YesterdaySummary` + parlay/model result artifacts + WC settlement.
- `/picks`, `/build`, `/games` → board loaders (NBA `data.ts`, MLB `data-mlb.ts`, WC
  `world-cup/*`) + suggested-card/parlay artifacts.
- `/nba` → `boards/{date}.json` (latest with leans); `/mlb` → `mlb/boards/{date}.json`;
  `/world-cup` → `world-cup/projections|markets|parlays|settlement`.
- Internal audit-only (DO NOT TOUCH): `summary-latest.json`, `ledger-latest.json`
  ($444.19 experimental ledger), `featured-latest.json`, `active-builder-slip-latest.json`.

## Real-data availability (the binding constraint)
- **NBA June 13**: REAL board `boards/2026-06-13.json` — `isDemo:false`, `dataMode:Live`,
  odds=the_odds_api, schedule=espn_scoreboard. 1 game NY @ SA (Knicks @ Spurs, Finals
  Game 5), 193 real props. → usable.
- **World Cup June 13**: NONE. Latest WC odds/projections = 2026-06-11; player data =
  06-12. Brazil/Morocco, Qatar/Switzerland, Haiti/Scotland have NO June-13 odds/model.
- **MLB June 13**: NONE. Latest board = 2026-06-12.

## Plan (honest scope)
1. Settle June 12 World Cup from official sources (the empty settlement artifact). ✅
2. Confirm NBA Game 5 (June 13) is the live board on /games + /nba. ✅ (already active)
3. Step 5 gate review → Review Pending (no cross-sport June-13 data; see step-5 doc). No card.
4. Audit docs + tests + production verify.
5. NOT done (would require fabrication): June-13 WC/MLB projections/props/cards; an invented
   Step 5 card. Documented honestly.

## UI framework status
The volcanic-lava design system, warm cards, Space Grotesk, by-player props, fixture tabs,
7-lane Picks, Build rail, Bank Builder Road-to-$10K, MLB logos, 10px readability floor were
shipped across PRs #460–467 and remain live. This run verifies them rather than rebuilding.
