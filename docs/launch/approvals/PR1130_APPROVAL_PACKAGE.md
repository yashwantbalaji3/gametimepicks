# PR #1130: eligible-operator allowlist (founder approval package)

- **Candidate head (local merge, not pushed):** `b4aa6c6173858606370eb06ee5515cd6437f961d` on local branch `claude/eligible-operators-allowlist-rebase`.
  - Parents: the PR head `126196a73201ebb347e07b9651d8c93aa2613e5a` and `origin/main` `c0ffb1b7c5c0c8ac0343f1555642eb445b3ed625` (includes #1129).
  - The merge was clean: no conflicts and no hand edits.
- **Original PR head:** `126196a73201ebb347e07b9651d8c93aa2613e5a`. The PR is still a draft and is not merged.
- **Main has moved since then:** `origin/main` is now `a44d0720f6`, one bot data commit (`auto: mlb lineup refresh … [skip ci]`).
  - It still merges cleanly with the candidate (`git merge-tree`). No re-gate is needed for a data-only commit.
- **Prepared:** 2026-10-18, by a verifier session. Nothing was pushed, no data was written, and no paid API was called.

## Scope: 12 files, +236 −12, all code and tests
- **M-1, render-time withhold-and-count (MLB):**
  - `lib/mlb/mlb-props.ts` filters `loadMlbPropsBoard` to eligible providers. The filter takes either the key or the display title.
  - The new `countIneligibleMlbProps` counts the rows withheld.
  - The `/mlb` boards state "N unsupported sportsbook offers not shown" (`props-board.tsx`, `mlb-flagship-sections.tsx`, `app/mlb/page.tsx`).
  - A withheld row is never re-priced from another book.
- **M-2, forward-only selection among eligible books:**
  - MLB ingest (`ingest-normalize.ts`) skips books that are not on the list.
  - The NFL prop ladder (`prop-display-selection.mjs`) filters its candidates to eligible books before the DK → FD → most-coverage steps. If no eligible book posted the market, the row is absent.
  - Prices already captured or frozen keep their original book.
- **NFL market cell:** `prediction-board.tsx` shows "Price not shown" for a frozen capture from an ineligible book. The live rail then falls back to the model band instead of the offshore line.
- **Allowlist module:** `lib/sports/odds/eligible-operators.mjs` (policy `eligible-operators@1`), plus 3 new test files and 1 extended test file.
- **Out of scope:**
  - **M-3/M-4:** offshore books still feed the no-vig consensus that benchmarks read.
  - Jurisdiction or state gating.
  - Smart Betslip.
  - Any rewrite of historical artifacts.

## Allowlist and licensing basis
- **Eligible (fail-closed):** 9 provider keys, which are 8 operators.
  - `draftkings`, `fanduel`, `betmgm`, `williamhill_us` + `caesars` (both are Caesars), `betrivers`, `fanatics`, `espnbet`, `betparx`.
  - Each operator is on Pennsylvania's licensed online sportsbook list (checked 2026-10-18).
  - Display titles resolve too, because the MLB board stores titles such as "BetMGM".
- **Known offshore (6 keys):** `bovada`, `betonlineag`, `mybookieag`, `betus`, `lowvig`, `betanysports`.
  - The first five are in the provider's `us` region and have regulator actions on record (MI, TN, FL; see the PR's research doc).
  - This list exists only so that guards can name these books. Eligibility never depends on it.
- **Unknown, empty or non-string key ⇒ not eligible.** Tested with `hardrockbet`, `ballybet`, `fliff`, `""`, `null` and `42`.
  - A new book stays off the page until someone adds it with a citation.

## Before → after on current data
Before = Production, which serves `c0ffb1b7` (per `/data/build-info.json`). After = a local build of the candidate.

| Measure | Before | After |
|---|---|---|
| `/mlb` batter props board (2026-10-18, newest; no 10-19 file yet) | 120 rows (126 incl. 6 pitcher) | **99** (105 incl. 6 pitcher) |
| Offshore offers on that board | 21, all BetOnline.ag | 0 shown; notice reads **"21 unsupported sportsbook offers not shown"** (in `out/mlb/index.html`) |
| `/mlb` HTML mentions of an offshore name | 46 (4 in visible text, 42 in payload) | **0** |
| Providers on the board (before) | BetOnline.ag 21 · DraftKings 43 · BetMGM 24 · BetRivers 23 · Caesars 15 | the 105 shown rows are from these four licensed books |
| `nfl/markets/latest.json` offshore `sportsbook` values | 7 (betonlineag, anytime-TD Yes, Oct 11 events 401872982/983×2/985×2/989/992) | file unchanged; the next capture can't select them (M-2) |
| Pages rendering those 7 NFL rows | 0 | 0 |
| Built HTML naming BetOnline/Bovada/MyBookie/BetUS/LowVig in **visible text** | 1 (`/mlb`) | **0** |
| Built HTML containing an offshore key **anywhere** (incl. RSC payload) | 2 (`/mlb`, `/nfl/game/401872960`) | **1** (`/nfl/game/401872960`; payload only, see O-6) |

- **The 21 withheld MLB offers all come from one game, TB @ CLE.** They are 8 hits offers and 13 total-bases offers, across 16 players.
  - Every one of the 16 players has at least one DraftKings-priced lean on the model board (`mlb/boards/2026-10-18.json`, 41 leans, all DK).
  - **10 of the 21** have a lean on the exact same market and line. Those leans stay visible and unchanged.
  - The other 11 offers had no model content of their own.
- **Raw JSON is not public:** `/data/mlb/player-props/latest.json` → **404**, and `/data/nfl/markets/latest.json` → **404** (Production, curl).
- **Historical integrity:** `git diff --name-only origin/main...b4aa6c61 -- data app/public/data` → **0 files**. Against the merged base, `git diff --name-only c0ffb1b7 b4aa6c61 -- data app/public/data` → **0 files**.
  - Of the 12 changed files, all are under `app/src/`. Captures, frozen forecasts, ledgers and settlements are byte-identical.

## Gate (on candidate `b4aa6c61`)
- **Targeted tests:** 25 / 25 pass, 0 fail.
  - Files: `eligible-operators`, `ingest-normalize-eligibility`, `mlb-props-eligibility`, `prop-display-selection`, `prop-display-policy`.
- **`npx tsc --noEmit -p .`:** clean, no output.
- **Unit phase:** 1,183 files → **pass**.
  - 9,511 tests: 9,506 pass, 0 fail, 5 skipped.
- **Build:** `npm run build` (default, no dev routes) → ok. `next-build` took 139.7 s.
- **Post-build phase:** 124 rendered-guard files → **pass**.
  - 710 tests: 707 pass, 0 fail, 3 skipped.
- **Data hygiene:** the unit and build phases dirtied `app/public/data/nfl/live-props/*` (the known `live-props-producer` test, until #1132) and `data/ask-projection/v1/recent/*`. Both were restored with `git checkout -- data/ app/public/data/`. Nothing was committed.

## Remaining limitations and open founder or counsel questions
- **O-1 Jurisdiction:** licensed books are shown to every visitor in every state. GTP has no geo or state gating, which is unchanged from today's DK/FD display. State-aware eligibility is a counsel item (SB-01).
- **O-2 Age:** 21+ vs 18+ wording and gating is a counsel decision. This PR does not touch it.
- **O-3 MLB price selection:** M-2 makes MLB ingest pick the bettor-best price **among eligible books**. NFL keeps the DK → FD → most-coverage ladder, restricted to eligible books.
  - Should MLB adopt the NFL ladder, so both sports pick a book the same way?
- **O-4 Consensus (M-3/M-4):** offshore books still feed the no-vig consensus that model benchmarks read. They are never displayed as a named price. Excluding them changes model outputs, so it is a separate founder decision.
- **O-5 Wording:** "unsupported sportsbook offers not shown" is a placeholder until jurisdiction eligibility exists. Confirm it, or supply the final copy.
- **O-6 Offshore key in page source and raw JSON:** a residual, not visible on the page.
  - `/nfl/game/401872960` (a 09-27 game, now final) carries `"sportsbook":"betonlineag"` (Zay Flowers anytime-TD +110) in its serialized client props. The same was true before.
  - After the change, the anytime-TD tab renders "Price not shown" instead of the book.
  - `/data/nfl/live-props/401872960.json` is public (**200** on Production) and contains the same key. Live Hub polls these files.
  - No artifact is rewritten. Founder decision: accept as historical record, or follow up by stripping it at render or by not exporting it.
- **O-7 Guard coverage:** the render-time guard covers the MLB props board and the NFL prediction-board market cell.
  - The NFL forecast `PlayerRow` (`/nfl` hub and the game family tabs) and the `/nfl` vault's `marketPrice` still print `sportsbook` without a check. They rely on M-2 forward selection.
  - No current page reaches an offshore value through them (0 in the build).
  - Suggested follow-up: apply `isEligibleOperator` there too.
- **O-8 JS chunks:** `_next/static/chunks/…/nfl/game/[eventId]` contains the offshore key list and the pre-existing `bookmakerLabel` map ("Bovada", "BetOnline", …). This is code, not page content.

## Cost
- One Production build on merge.
- No new workflows, no paid API calls, no data regeneration.

## Rollback
- `git revert -m 1 <merge commit>`, then one Production build.
- No data cleanup is needed, because no artifact was written or rewritten.
- The withheld offers reappear exactly as before.

## Approval line
> Approve #1130 at exact head b4aa6c6173858606370eb06ee5515cd6437f961d

(If the coordinator re-merges main before pushing, the head changes and this line must be updated to the pushed SHA.)
