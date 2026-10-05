# DP parallel work packet — Session 13 (Intelligence + Results V2 + Simulation V2)

For a parallel contributor ("DP"). Every lane is read-only or additive; each deliverable is a file or a PR the founder can
review. Truth semantics are the platform's: missing ≠ zero, pending ≠ loss, withdrawn ≠ loss, projection ≠ probability,
market probability ≠ GameTimePicks model probability.

## Where the substrate is

| Thing | Where |
|---|---|
| Universal Forecast Ledger | `data/internal/forecast-ledger/v1/*.jsonl` + `manifest.json` · contract `docs/FORECAST_LEDGER.md` |
| Forecast Record (public) | `/results/forecasts/`, `/results/forecasts/<sport>/<family>/`, CSVs `/data/forecast-record/v1/` |
| Ask tools over it | `getForecastFamilyPerformance`, `getForecastHistory` (`docs/ASK_GAMETIME.md` §29b) |
| Simulation Engine V2 (SHADOW) | `app/src/lib/sports/nfl/sim-v2/`, `docs/SIMULATION_ENGINE_V2.md`, shadow receipts `data/internal/research/nfl/sim-v2/shadow/` |

## K1 · Ask eval corpus (150–250 questions)

- Draft real questions a reader asks, one per line, with: category · the canonical source that should answer it (tool +
  artifact) · what a correct answer must contain · what it must never contain. Cover: current games, player projections,
  live, historical forecast results (Forecast Record), model performance per family, methodology ("what is a simulation
  here"), Research, product eligibility and history, Mr Dub, NBA factual, UFC, EPL, MLB, follow-ups ("he", "that game"),
  ambiguous names, unsupported questions, freshness ("as of when?").
- Score Production answers on: correctness · completeness · grounding · freshness · clarity · usefulness · deep-link
  quality · fail-closed behaviour. Flag any fabricated number, pending-as-loss, withdrawn-as-loss, market-as-GTP, or a
  stale value stated as current.
- Deliverable: `docs/ask-eval/corpus-v2.csv` + a scored baseline sheet. Engineering turns accepted cases into
  `scripts/ask/golden.mjs` entries.

## K2 · Results completeness audit

For each sport × family: forecast exists? → ledger row exists? → settlement exists? → metric exists? → public page shows
it? Use `manifest.json` `declaredGaps` as the starting list. Deliverable: one table per sport with counts and the first
broken link in the chain. Known gaps to confirm: NFL props Weeks 1–2 (name-only reconciliation rows), MLB projected score,
EPL BTTS/clean sheet/double chance, UFC method/round, NFL score shape.

## K3 · Research discoverability

From global nav, Home, sport hubs, game reports, player rows, Results, Model Lab and Ask: count clicks to (a) a player's
research page, (b) that player's forecast history, (c) a family's Forecast Record page. Record dead ends and places where
context (player, game, family) is lost. Deliverable: click-depth table + top-10 fixes ranked by reader impact.

## K4 · Mobile / accessibility

At 390 px, 1280 px and keyboard-only, on `/results/forecasts/`, three family pages, `/results/`, `/ask/`, a game report,
a player page: horizontal overflow (measure `document.documentElement.scrollWidth`, and remember absolutely positioned
`sr-only` children escape `overflow-x:auto` unless the wrapper is positioned), focus order and visibility, contrast, table
density, empty states, CTA discoverability. Deliverable: issues with route, viewport, screenshot, severity.

## K5 · EPL identity review

Continue exact / ambiguous / unresolved classification of EPL players and fixtures. Note for the ledger: the derived EPL
event id orders team slugs ALPHABETICALLY ("Sunderland v Fulham" is `soccer:epl:fulham-v-sunderland:…`), and the player
grade log slugs "&" as "and". Never guess an identity; an unresolved row stays unresolved.

## K6 · Forbidden without founder approval

model math · calibration bars · forward-test bars · model promotion (including Simulation V2 SHADOW → EXPERIMENTAL / PUBLIC)
· settlement semantics · Mr Dub rules · product selector methodology · paid-provider authorization · frozen historical
receipts · security / RLS architecture · legal / privacy claims.
