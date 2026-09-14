# SESSION HANDOFF · 2026-05-22 · PROJECTIONS REDESIGN

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main`. PR #86 may still be deploying when this is written; verification on the live URL is in §6.
> **Date written:** 2026-05-22 (afternoon ET).

Third handoff of May 22. Previous: overnight overhaul (PRs #81-#84),
morning paid fetch + curated card (PR #85). This handoff covers the
afternoon projections-flow redesign (PR #86).

---

## 1. WHAT SHIPPED — PR #86

**Title:** `feat(projections): consumer-first redesign — date pills + game cards + player accordions`

The `/projections` page has been **completely rebuilt** to replace
the old sport-tile hub with a single four-step consumer-first flow:

```
┌─────────────────────────────────────────────────────────┐
│  Tonight's projections · Today · 16 games · 360 leans  │  ← compact header
├─────────────────────────────────────────────────────────┤
│  [ TODAY ] [ TOMORROW ]                                 │  ← date pills (gold = active)
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│  │ NBA     │ │ MLB     │ │ MLB     │   ← matchup cards
│  │ OKC@SA  │ │ HOU@CHC │ │ STL@CIN │     (sport-tagged)
│  │ chips   │ │ time    │ │ time    │
│  │ Open →  │ │ Open →  │ │ Open →  │
│  └─────────┘ └─────────┘ └─────────┘
└─────────────────────────────────────────────────────────┘

           click a game card →

┌─────────────────────────────────────────────────────────┐
│  ← All games                                            │
│  OKC @ SA · NBA · Oklahoma City · San Antonio · 8:30 PM │
│                                                         │
│  [Moneyline]  [Spread]      [Total]                     │  ← big market cells
│  OKC +105     OKC +1.5      O 217.5                     │
│  SA  -125     SA  -1.5      U 217.5                     │
├─────────────────────────────────────────────────────────┤
│  ▾ Keldon Johnson · Over 10.5 PTS · +36.8% · High-var  │  ← player accordion (collapsed)
│  ▾ Alex Caruso    · Under 10.5 PTS · +33.4%  · High-var │
│  ▾ Wembanyama     · Over 25.5 PTS  · +23.9%  · Strong   │
│      ┌─────────────────────────────────────────────┐    │  ← expanded
│      │ PTS  Over 25.5  Proj 31.1  +23.9%  -112   │    │
│      │ ⌢⌢⌢ recent10 sparkline                    │    │
│      │ REB  Under 13.5 Proj 12.8  +12.3%  +108   │    │
│      │ AST  Over 3.5   Proj 3.8   +10.3%  +112   │    │
│      └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Components shipped

| File | Status | Purpose |
|---|---|---|
| `app/src/app/projections/page.tsx` | rewritten | Server entry point; loads payload, Suspense-wraps client |
| `app/src/components/projections-experience.tsx` | new | Client component owning the entire flow |
| `app/src/lib/data-projections.ts` | new | Sport-agnostic payload loader (NBA + MLB merged) |
| `app/src/app/globals.css` | additions only | `.gtp-projections-date-pill`, `.gtp-matchup-card`, `.gtp-player-accordion` |

### URL state

- `/projections` → today, all games
- `/projections?date=2026-05-23` → tomorrow, all games
- `/projections?date=2026-05-22&game=401873199` → OKC@SA detail view

Back/forward + deep-link both work. `useSearchParams` is wrapped in
a Suspense boundary so static export builds cleanly.

### Sport-agnostic data join

`loadProjectionsPayload()`:
1. Reads every NBA + MLB board directory.
2. Keeps dates with ≥ 1 real lean on disk.
3. **Filters to today + future only** — historical dates belong on
   `/results`, not on a "Tonight's projections" surface.
4. For each game, attempts to join with the matching
   `game-markets/<date>.json` row by full team name (handles MLB
   "Houston Astros" vs board "HOU" cleanly).
5. Normalizes both sports' lean shapes onto one `ProjectionsLean`
   interface so the UI is sport-blind.

## 2. WHY THIS IS A WIN

| Before | After |
|---|---|
| Sport tiles → click → land on dense per-sport board | One unified surface; pick date → pick game → expand player |
| Probable pitchers dominated MLB above the fold | Matchup card collapses to a 12-line preview; expand opens detail |
| Mobile felt zoomed-in (giant padding, full-width cards) | 2-col game grid at 640px+; tighter rhythm; horizontal pill row |
| L · P · A shorthand on detailed views | Stacked "PROJ · EDGE · ODDS" labels (already from PR #82) |
| User had to mentally toggle sport context | Sport tag on every card; same UI for NBA + MLB |
| No deep links to a specific game | `/projections?game=<id>` is share-able |

## 3. HONESTY CHECKLIST

| Item | Status |
|---|---|
| No fabricated projections | ✅ — every lean comes from board JSONs already on disk |
| No fabricated odds | ✅ — market chips show "—" when a value is missing |
| No fabricated hit rate | ✅ — no per-player hit-rate badge; we don't have persisted player audits |
| No fabricated history | ✅ — past dates filtered OUT, not surfaced |
| Sparkline only when ≥ 2 samples | ✅ — `RecentSeriesSparkline` early-returns otherwise |
| Confidence labels | ✅ — routed through PR #82's `confidenceLabel()` helper |
| Forbidden copy | ✅ — `pipeline.public_copy_test` green |
| Pushes excluded | ✅ — unchanged contract |
| Pending handling | ✅ — empty dates dropped; default date is today if present |

## 4. TESTS RUN

```
pipeline.snapshot_parlays_test       75 assertions
pipeline.grade_parlays_test          13 assertions
pipeline.parlay_builder_test         39 assertions
pipeline.results_attribution_test     9 assertions
pipeline.model_audit_test            68 assertions
pipeline.active_slate_test           42 assertions
pipeline.fetch_game_markets_test     37 assertions
pipeline.calibration_report_test      7 assertions
pipeline.public_copy_test            520 assertions
```

`npm run typecheck` clean, `npm run build` clean.

## 5. MOBILE ROUTE WALK (375 × 812)

- `/projections` — 2 date pills (Today / Tomorrow), 16 game cards, **0 horizontal overflow**
- `/projections?game=401873199` — large hero + 3 market cells + 15 player accordions
- `/projections?date=2026-05-23` — tomorrow's slate (1 NBA game)
- `/` (homepage) — curated tickets from PR #85 still rendering (2 tickets visible)
- `/mlb/board` — 15 collapsible accordions from PR #81 still rendering, no overflow
- `/about` — Model Watchlist from PR #85 still rendering

## 6. KNOWN LIMITATIONS

1. **MLB game-markets are missing for 2026-05-22.** Today's session
   skipped them to stay under the 40-credit budget. MLB matchup cards
   on the new flow render correctly without market chips — that's the
   honest behavior, but it means MLB cards look "lighter" than the
   single NBA card.
2. **MLB leans aren't grouped under a stable `gameId` on the board.**
   The data loader joins MLB leans to schedule games via matchup
   abbr pair (away/home), which works on today's 15-game slate but
   could miss a game if both teams play each other twice in a single
   day (e.g. an MLB doubleheader). Add a `gamePk → gameId` map next
   if that scenario lands.
3. **No per-game ML expected-payout in the matchup card.** The card
   shows only "ML <favored team> <price>"; a future polish PR could
   add a small per-game payout preview.
4. **No "sport filter" on the date row.** Today's slate has 1 NBA +
   15 MLB; users wanting only one sport see them all and rely on the
   sport tag inside each card. A filter chip ("All / NBA / MLB")
   above the grid would help — deferred.
5. **`/nba/board` and `/mlb/board` still exist.** They're unchanged
   in this PR and still deep-linked from the date rail. A future PR
   may either deprecate them or simplify them to mirror the new
   flow's card density.

## 7. WHAT THE NEXT SESSION SHOULD PICK UP FIRST

In priority order:

1. **Confirm tonight's grader (3 AM ET cron) graded the May 22 snapshot.**
   Once `app/public/data/parlays/graded/2026-05-22.json` lands, the
   curated card on the homepage and `/parlay-lab` will flip from
   "Saved · pending" to "Graded" automatically.
2. **Add a sport filter chip** ("All · NBA · MLB") above the matchup
   grid in the redesigned `/projections`. The infrastructure is in
   place — `ProjectionsGame.sport` is already on every card.
3. **MLB game-markets for 5-23 onwards.** With budget back to ~221 +
   monthly quota refresh on the 1st, we can afford full MLB ML/total
   chips going forward.
4. **MLB candidate slip support** in `pipeline/snapshot_parlays.py`.
   The data is there; the builder still reads only the NBA board.
5. **Per-player audit persistence.** Today the new player accordion
   could show a "hit rate" badge if we had it. Building per-player
   audits would unlock that surface honestly.

## 8. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #86 squash sha>
git push origin main
# Vercel redeploys in ~1 minute
```

Specific behavior on revert:
- `/projections` falls back to the prior sport-tile hub.
- All other pages are unaffected — no shared component edits.
- No data is lost — the redesign only touched UI files + the new
  loader.

---

*The biggest UX rebuild on the site to date landed safely behind
tests, behind a Suspense boundary for static export, and behind the
existing honesty contract. Tonight's nightly settle is the next
thing to watch — when the grader runs it should produce the first
real lifetime saved-slip record on the site.*
