# GametimePicks — Phase 8 Viewer-Readiness Checklist

**Run this checklist before sharing the live site with viewers.** It supersedes the master-program checklist and reflects the runtime fixes made in `Phase 8: viewer-ready stabilization and QA cleanup`.

This is an educational analytics product. Hold the line on:

- no fake props / odds / projections / edges
- no profitability or betting-hype language
- no paid APIs, no scraping, no Odds API calls
- transparent empty states wherever real data is missing
- responsible-use language always visible

---

## A. Repo hygiene

- [ ] On `main` branch, working tree clean before commit
- [ ] `git remote -v` points to `https://github.com/yashwantbalaji3/gametimepicks`
- [ ] No `.env`, `.env.local`, secrets, API keys, or `*.pem` staged
- [ ] `git status` reports only files you intend
- [ ] No accidental `boards/*.json` mutations (`git diff --stat app/public/data/boards/` shows nothing)

## B. Tests — run the master command

```bash
bash scripts/run_all_tests.sh
```

Expected: all green in under ~90 seconds.

- [ ] `pipeline.filter_test` — 58 assertions
- [ ] `pipeline.settle_test` — 66 assertions
- [ ] `pipeline.grouping_test` — 69 assertions
- [ ] `pipeline.recent10_test` — 23 assertions (Phase 8.1)
- [ ] `pipeline.export_results_test` — 38 assertions (Phase 8.2)
- [ ] `pipeline.confidence_guardrails_test` — 43 assertions (Phase 8.3)
- [ ] `pipeline.diagnostics_test` — only if Phase 8 premium installed
- [ ] `cd app && npm run typecheck` — clean
- [ ] `cd app && npm run build` — clean
- [ ] `bash scripts/smoke_test.sh` — passes

## C. Localhost — `cd app && npm run dev`

### `/board`

- [ ] Page renders without the red "1 error" badge in the corner
- [ ] **Console: zero hydration mismatch warnings** (the viewer-ready fix targets this)
- [ ] Console: zero React "duplicate key" warnings
- [ ] Console: zero `[VaultBoard] leaked past applyFilters` warnings
- [ ] Date tabs work — clicking switches the underlying board
- [ ] Game pills work — clicking restricts to that game; active state has gold inner glow
- [ ] Market filter (PTS/REB/AST) works
- [ ] Confidence filter works
- [ ] Pick-type filter works (Over / Under / No Play / Pass)
- [ ] Team filter works
- [ ] Min-edge slider works
- [ ] Sort dropdown works
- [ ] Reset-all clears filters
- [ ] Player cards group PTS/REB/AST under one card per player
- [ ] `+N books` chip appears when alternates exist
- [ ] Each market row shows a `last 10` sparkline OR "no trend" placeholder
- [ ] Confidence tooltip (`i` badge) opens on hover AND on keyboard focus
- [ ] Tooltip popover does NOT cause hydration warnings (the badge is a `<button>` and the popover uses ARIA-roled spans)

### `/results`

- [ ] **No exported settled data** → polished empty state with the 3-step "how to populate" panel
- [ ] **With exported data**:
  - [ ] Lifetime KPI tiles: settled / wins / losses / pushes
  - [ ] Hit rate excludes pushes from denominator
  - [ ] Small-sample warning fires when decisive < 25
  - [ ] By-market / by-confidence / by-game / by-bookmaker buckets render
  - [ ] Buckets with 0 decisive picks show `—` (NOT `0%`)
  - [ ] Largest misses + best calls lists render
- [ ] Hero matches `/board` glow (Phase 8.4 polish)
- [ ] No ROI numbers anywhere
- [ ] No profitability claims

### Mobile (≈375px viewport)

- [ ] Page renders without horizontal scroll
- [ ] All board filters reflow cleanly
- [ ] Player cards stack vertically; sparkline scales to its 96px width
- [ ] `/results` KPI strip reflows from 4-up → 2-up at the sm breakpoint
- [ ] Hero glow doesn't bleed off-screen
- [ ] Tooltip popover stays on-screen (or wraps gracefully)

## D. Honest framing — search & confirm absence

```bash
grep -rin "guaranteed\|lock\|free money\|smash\|can't miss" \
    app/src pipeline/ 2>/dev/null
```

- [ ] Search returns ZERO matches in source code (matches in tests/comments quoting the rule are OK)
- [ ] Footer disclaimer present on every page
- [ ] Methodology + responsible-use links reachable
- [ ] Insufficient-data states say "insufficient data" or "no trend" — NOT a fabricated number

## E. Data-source check

- [ ] `pipeline/cache/` contains only the existing Odds-API cache file (no new ones)
- [ ] `pipeline/validation/` contains `leans_log.jsonl` plus any settlement files YOU intentionally produced
- [ ] `app/public/data/results/` exists if you ran `python -m pipeline.export_results`; otherwise absent (also OK — empty state renders)
- [ ] `app/public/data/boards/*.json` modification times reflect ONLY runs you intended

## F. Production deployment

- [ ] Vercel build passes (Linux runner)
- [ ] Live `/board` and `/results` match localhost
- [ ] Live network tab: zero requests to `api.the-odds-api.com` during page load
- [ ] Live console: same zero-error state as localhost

## G. After-deploy operational sequence (when ready)

1. Fill May 5 final stats in `pipeline/overrides/results_overrides.json`
2. `python -m pipeline.settle_results --date 2026-05-05 --manual-only`
3. `python -m pipeline.export_results`
4. `python -m pipeline.attach_recent10 --all` (free `nba_api`, no Odds API)
5. `python -m pipeline.confidence_guardrails --all` (DRY-RUN ONLY for first slate)
6. `cd app && npm run build`
7. Commit, push, verify Vercel deployment

## H. What's intentionally OUT of scope right now

- Paid odds providers
- X / social automation
- Monetization
- Real-time live game tracking
- ML model retraining
- Multi-sport expansion
- Confidence-threshold recalibration (needs ≥50 settled picks first)

These remain deferred. Solidify the educational/validation foundation before any of them.
