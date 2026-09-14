# Results + Logo Session (2026-05-15)

**Start:** 2026-05-15
**Starting HEAD:** `2692f1c` (PR #35 / branch `feature/playoff-context-player-visuals`)
**PR #35:** OPEN / CLEAN / 12 files / 2 commits / all checks pass

## Phase 0 ✓
- Branch matches; tree clean except 7 untracked session docs + `gametime-picks-logo.png`
- PR #35 still open and green

## Phase 1 — Logo file
- **Found:** `./gametime-picks-logo.png` (repo root)
- **Dimensions:** 1659 × 948, RGB (no alpha), ~2.5 MB
- **Visual:** vault-door + crossed batons + "GAME TIME PICKS" wordmark; gold + silver on dark slate. Strong casino fit.
- **Caveats:** no transparent background — the logo is on its own dark backdrop. File size is heavy but acceptable as a one-time static asset.
- **Plan:** copy to `app/public/brand/gametime-picks-logo.png`; render via plain `<img>` (site is static-export with `images.unoptimized: true`). Fall back to the existing CSS BrandMark if `onError` fires.

## Phase 2 — Settlement system audit

**Existing architecture is fully built and audited:**

| File | Role |
|---|---|
| `pipeline/settle_results.py` | Grades Over/Under leans against actual stats. nba_api auto-fetch (priority 2) + manual overrides (priority 1). Idempotent per-date. `--dry-run` supported. |
| `pipeline/export_results.py` | Sanitizes + copies settled rows to `app/public/data/results/`. |
| `pipeline/validation/leans_log.jsonl` | Append-only log of every emitted lean. **2,304 rows across 10 dates** including **326 May 15 leans**. |
| `pipeline/validation/settled_leans.jsonl` | **Empty** — no date has been settled. |
| `pipeline/validation/comparison_report_2026-05-05.json` | Exists but `decisive=0`, all aggregates null — May 5 was settled once with no actual stats (override template all nulls). |
| `pipeline/overrides/results_overrides.json` | Template for May 5 — all PTS/REB/AST values are `null`. |
| `app/public/data/results/lifetime_summary.json` | `totalSettled: 0`, `hitRate: null`, `decisive: 0`. |
| `app/public/data/results/available_dates.json` | `dates: []`. |
| `app/public/data/results/settled_leans.jsonl` | 0 lines. |

## Phase 3 — May 15 data audit

May 15 board: 2 games (`0042500206` DET@CLE 7:00 pm ET, `0042500236` SAS@MIN 9:30 pm ET), 163 scored leans (97 H / 17 M / 49 L), 31 R5 anomalies. All projections + lines + edges + confidences are loaded — settlement-ready as soon as final stats land.

## Phase 4 — Box score feasibility

- nba_api installs correctly (Python 3.9, with NumPy 1.x/2.x mismatch warnings that are non-fatal).
- `BoxScoreTraditionalV2(game_id="0042500206")` **connects** but returns an **empty player frame**. Same for `0042500236`.
- Interpretation: the game IDs encode "2025-26 playoffs" but stats.nba.com has no actual stats for these IDs (system simulates a future date relative to real NBA data).
- The May 5 attempt (`comparison_report_2026-05-05.json`) also returned 0 stats — same cause.

**No real final stats are available from any free source for May 15 right now.** Running the settlement script would produce 0 decisive picks — the same state we already have.

## Phase 5 — Proposal

### A. Logo integration

- Copy `gametime-picks-logo.png` → `app/public/brand/gametime-picks-logo.png`
- Extend `BrandMark` component to accept a new `useImage` prop or render the real image by default with `onError` → existing CSS lockup fallback
- Add `.gtp-logo-img` CSS for sizing (nav: ~42px tall, footer: ~32px tall)
- Keep existing `BrandMark` component (CSS lockup is the fallback)
- Wire into: `nav.tsx` (lockup link), `footer.tsx` (compact)
- Accessibility: `alt="GameTime Picks"`

### B. Results grading — DEFERRED (honest path)

We cannot ship real settled stats because no free source has them yet. Per the hard rules: **do not fabricate**. Instead:

- **Do not** run `pipeline/settle_results.py` for production (would produce 0-decisive output anyway).
- **Do not** edit `app/public/data/results/*` or `pipeline/overrides/*`.
- **Do** improve the Results UI to make the awaiting state truly useful (see C).
- **Document** as future pipeline work: once the operator authorizes a one-shot run (manual override fill-in from NBA.com box scores, or a future date when nba_api auto-fetch works), running `python -m pipeline.settle_results --date 2026-05-15 && python -m pipeline.export_results` will light the page up automatically — the architecture is already in place.

### C. Results UI plan (UI-only, no fake data)

Build a real **"awaiting settlement" preview table** sourced from the May 15 board JSON. Surfaces, per game:

- Game context chip (Eastern Conf Semis · Game 6 / Western Conf Semis · Game 6)
- Player row table:
  - Player avatar (NBA CDN) + name
  - Market (PTS / REB / AST)
  - Line + side (Over/Under)
  - Model projection
  - Edge %
  - Confidence pill
  - Result column = "pending" with "awaits box score"
- Counts at the top: "163 projections loaded · 0 settled · 2 games awaiting final box scores"

Plus:

- A **"Calibration roadmap"** day-by-day strip showing only real states (no fabricated trend):
  - Today: "pending settlement"
  - When data arrives: shows hit rate per day
  - With only 0 settled slates, the strip explicitly says "first settled slate will appear here"
- Educational "How a lean grades" callout (Over: actual > line wins, Under: actual < line wins, push if equal; No Play excluded from hit-rate denominator)
- Honest framing maintained throughout

### D. Safety

- ✅ no fake results
- ✅ no paid API
- ✅ no workflow trigger
- ✅ no edits to `app/public/data/results/*` or `pipeline/*`
- ✅ no edits to `pipeline/overrides/*`
- ✅ no board JSON mutation
- ✅ all new tables read from existing data

### Files to change

- **New:** `app/public/brand/gametime-picks-logo.png` (copy of uploaded file)
- **New:** `app/src/components/awaiting-settlement-table.tsx` (presentational, real-data preview)
- **New:** `app/src/components/calibration-roadmap.tsx` (presentational, honest day-by-day strip)
- `app/src/components/brand-mark.tsx` (render real logo with CSS fallback)
- `app/src/app/results/page.tsx` (wire new components)
- `app/src/app/globals.css` (logo + table + roadmap CSS)

