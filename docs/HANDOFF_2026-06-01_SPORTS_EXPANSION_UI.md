# HANDOFF — Sports Expansion UI (2026-06-01)

> Honest, schedule-aware sports expansion of the GameTime Picks UI. No
> data/pipeline/optimizer/settlement/generated-file changes were made; no
> projections, parlays, results, odds, or schedules were fabricated. Real
> player-prop modelling still exists for **exactly NBA and MLB**.

---

## 1. Repo state

- **Current main SHA:** `33c6534` (after PR #229 merge)
- **Branch:** `main`, working tree clean (only untracked scratch notes)
- **Active slate:** `2026-06-01` — pregame, **MLB-only** (no NBA games that day; honest, not a bug)
- **Latest settled slate:** `2026-05-30`
- **Production:** https://gametimepicks.yashwantbalaji.com (Vercel project `gametimepicks`)

---

## 2. PRs in this work (all squash-merged, gate-passed)

| PR | Title | Merge SHA | Files |
|----|-------|-----------|-------|
| [#227](https://github.com/yashwantbalaji3/gametimepicks/pull/227) | Honest Sports & Events coverage hub | `5f3c018` | `lib/sports-coverage.ts` (new), `lib/sports-coverage.test.mjs` (new, +7 tests), `components/sports-coverage-grid.tsx` (new), `app/events/page.tsx`, `components/command-rail.tsx` |
| [#228](https://github.com/yashwantbalaji3/gametimepicks/pull/228) | Home "Sports coverage" module | `842789e` | `components/home-sports-coverage.tsx` (new), `app/page.tsx` |
| [#229](https://github.com/yashwantbalaji3/gametimepicks/pull/229) | Sport-clarity pointers on Projections + Parlay Lab | `33c6534` | `app/projections/page.tsx`, `app/parlay-lab/page.tsx` |
| #230 (this) | Docs — sports-expansion handoff | _this PR_ | `docs/HANDOFF_2026-06-01_SPORTS_EXPANSION_UI.md` (new) |

Each merge waited for the real `Vercel – gametimepicks` check = SUCCESS **and** `mergeStateStatus` = CLEAN, then synced main.

---

## 3. What is live in production

- **`/events` is now "Sports & Events"** — a coverage hub: a badged grid of
  every league we surface (`SportsCoverageGrid`) above the existing
  schedule-only tabs (WNBA · UFC · FIFA World Cup), which are unchanged.
- **Home** has a compact **"Sports coverage"** sidebar module
  (`HomeSportsCoverage`) — one honest row per league — replacing the old
  thin "Events" module. Path cards, Featured slip, Guided module, and the
  compact Suggested-parlays preview are all unchanged.
- **Desktop rail** item relabeled **"Sports & Events"** (mobile/tablet top
  nav kept short, "Events", to avoid the non-scrolling tablet nav
  overflowing).
- **Projections** and **Parlay Lab** each carry a one-line pointer: only
  NBA & MLB are modelled; other leagues are schedule-only in Sports &
  Events (linked).

The single source of truth is **`app/src/lib/sports-coverage.ts`** — a
typed, client-safe registry consumed by all three surfaces, locked by
`sports-coverage.test.mjs` (only NBA/MLB may be "full"; "coming-soon"
sports have zero links; all links internal; no banned copy).

---

## 4. Sports coverage table (as shipped)

| Sport | Coverage level | Badge shown | Links to |
|-------|----------------|-------------|----------|
| **MLB** | **Projections + Parlays** (full) | `Projections + Parlays` | `/projections`, `/parlay-lab#suggested`, `/results` |
| **NBA** | **Projections + Parlays** (full) | `Projections + Parlays` | same (on game days; June-1 slate is MLB-only) |
| **NHL** | Schedule only | `Schedule only` | `/nhl` |
| **WNBA** | Schedule only | `Schedule only` | `/events` |
| **UFC** | Schedule only | `Schedule only` | `/events` |
| **FIFA / World Cup** | Schedule only | `Schedule only` | `/world-cup` |
| **IPL (Cricket)** | Schedule only | `Schedule only` | `/ipl` |
| **MLS** | **Coming soon** (nothing published) | `Coming soon` | _none_ |
| **EPL** | **Coming soon** (nothing published) | `Coming soon` | _none_ |

- **Projections + Parlays (real model + graded results):** NBA, MLB.
- **Schedule-only:** NHL, WNBA, UFC, FIFA World Cup, IPL.
- **Coming soon (no data at all):** MLS, EPL.

No unsupported sport shows picks, odds, projections, or parlays anywhere.
`/results` remains tied only to graded NBA/MLB — no UFC/MLS/EPL results.

---

## 5. Data sources (all pre-existing; none changed in this work)

- **NBA / MLB projections + grading:** the existing pipelines
  (`pipeline/generate_daily_board.py`, `pipeline/mlb/generate_mlb_board.py`,
  `settle_results.py`, `settle_mlb_results.py`, optimizer + parlay graders).
  Untouched here.
- **Schedule-only snapshots (WNBA/UFC/FIFA):** baked, hand-verified ESPN
  public-scoreboard snapshots in `app/src/lib/event-schedules.ts`, each with
  `retrievedAt` + range attribution. Untouched here.
- **World Cup schedule:** official 104-match Final Draw data under
  `app/public/data/world-cup/`. Untouched.
- **NHL / IPL schedules:** their existing `/nhl` and `/ipl` hubs. Untouched.
- **This expansion added NO new data sources and made NO network calls.**
  It is navigation/copy only over the data that already ships.

---

## 6. What was intentionally NOT added

- **No MLS/EPL schedules.** The repo has zero MLS/EPL data, and the schedule
  layer bakes only hand-verified snapshots. Rather than hand-enter
  unverifiable fixtures (fabrication risk), MLS/EPL are honest **"Coming
  soon"** cards with no links. (User-approved decision.)
- **No real MLS/EPL/UFC odds/projections/parlays.** That would require new
  ingestion + modelling + grading pipelines (out of scope; against the hard
  rules for this UI work).
- **No new Parlay Lab sport tabs.** Tabs are already data-driven
  (`getAvailableSportsFromSlips`) and only show sports with real slips — so
  there were never fake/disabled tabs to remove.
- **No data/pipeline/optimizer/settlement/generated-file edits.** No May-31
  backfill, no June-1 settlement, no same-slate results feeding pregame.

---

## 7. Verification

- **Tests:** `npx tsx --test src/lib/*.test.mjs` → **569 pass / 0 fail**
  (562 baseline + 7 new `sports-coverage` honesty tests).
- **Types:** `npx tsc --noEmit` → clean.
- **Build:** `npm run build` → green, 139/139 static pages.
- **Browser (desktop 1280 + mobile 375)** across `/`, `/events`,
  `/projections`, `/parlay-lab` (+ `#suggested`/`#build`/`#bankroll`),
  `/bank-builder`, `/results`, `/about`:
  - no horizontal overflow; no console errors; no banned copy; no
    user-facing "safe/safety".
  - coverage grid + Home module show correct badges; **MLS/EPL have no
    links**; no unsupported sport implies picks.
  - status bar honest (today 2026-06-01, active slate pregame, latest
    settled 2026-05-30, $100 paper); Results latest settled honest, no
    May-25/26 leak, **no June-1 settled leak**, no UFC/MLS/EPL results.
  - Build My Card still works on Parlay Lab; Bank Builder paper-only;
    Events schedule-only.

---

## 8. Known limitations

- **NBA "no games today"** is communicated implicitly (the projections
  board shows only the sports with games; the slate strip / status bar show
  the MLB-only slate). There is no explicit per-day "No NBA games today"
  banner on `/projections` — a possible future nicety.
- **Schedule snapshots are point-in-time** (WNBA/UFC baked from
  2026-05-29). They are attributed as snapshots, not live, but will age
  until refreshed by a future data task.
- **Some Home/sidebar overlap** remains (path cards vs sidebar modules) —
  pre-existing from the simplified-product work, not addressed here.
- **Coverage levels are capability-based**, not per-day. "Projections +
  Parlays" reflects that NBA/MLB are modelled, not that both have games on
  any given date.

---

## 9. Next work for real MLS / EPL / UFC projections + parlays

To move MLS/EPL/UFC beyond schedule-only/coming-soon (each is a real,
testable pipeline task — not a UI change):

1. **Schedule-only first (low risk):** bake verified ESPN snapshots
   (`soccer/usa.1` for MLS, `soccer/eng.1` for EPL, `mma/ufc` for UFC) into
   `event-schedules.ts` with `retrievedAt`/range attribution, then flip the
   registry level from `coming-soon` → `schedule` and add a schedule tab.
   No modelling needed; just honest schedule data + a fetch/verify step.
2. **Projections (large):** new `pipeline/<sport>/` modules mirroring
   `pipeline/mlb/` — data ingestion (The Odds API supports `soccer_mls`,
   `soccer_epl`, `mma_mixed_martial_arts`; currently unwired), a projection
   model, a board generator, and `loadProjectionsPayload` wiring. Soccer
   markets (goals/shots/cards) and UFC markets (method/round) differ from
   basketball/baseball, so the model + settlement are non-trivial.
3. **Settlement/grading:** per-sport `settle_<sport>_results.py` + extend
   the optimizer/parlay graders to the new markets, with tests.
4. Only after (2)+(3) land with real graded data may the registry mark a
   sport `full` and surface it in Parlay Lab / Results.

---

## 10. Guardrails honored

No data/pipeline/optimizer/settlement/generated-file changes · no fabricated
projections/parlays/results/odds/recent10/schedules · no May-31 backfill ·
no June-1 settlement · no same-slate results altering pregame · Events
schedule-only · Bank Builder paper-only · no fake sportsbook links · no
secrets · no banned betting copy · no user-facing "safe/safety".

**Preview branches #213 / #214 / #215 remained DRAFT and unmerged — never
merged or edited.**

---

*End of handoff. Current main `33c6534`. Active slate 2026-06-01 (pregame,
MLB-only). Latest settled 2026-05-30. Sports coverage: NBA + MLB
projections/parlays; NHL/WNBA/UFC/FIFA/IPL schedule-only; MLS/EPL coming
soon.*
