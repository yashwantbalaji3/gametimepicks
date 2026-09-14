# SESSION HANDOFF · 2026-05-22 · DYNAMIC CALIBRATION + CURATED TRACKING

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main` once PR #90 lands (poll Vercel + nudge with empty commit if it stalls — same issue as PR #89).
> **Date written:** 2026-05-22 (mid-afternoon ET).

Sixth handoff of May 22. Continues the calibration + curated work
from PR #89 by making both **data-driven** (no more hard-coded
tables) and **trackable** (curated picks now have a real snapshot
+ grading pipeline of their own).

---

## 1. WHAT SHIPPED — PR #90

**Title:** `feat(calibration+curated-tracking): dynamic audit + curated grading + MC validation`

Three coordinated tracks:

### Track A — Dynamic confidence calibration

- Split into TWO files:
  - `app/src/lib/confidence-calibration-rules.ts` — pure logic, **client-safe** (`classifyTier`, `calibratedConfidenceLabelFromTable`, `CALIBRATION_RULES`).
  - `app/src/lib/confidence-calibration.ts` — server-only, reads `model_audit.json` via fs/path, exposes `loadCalibrationTable()` + back-compat wrappers.
- Inversion rule tightened: a tier is "inverted" ONLY when ≥ 2 non-thin rivals beat it by ≥ 1.5pp. Previously a single small Medium sample could falsely flip NBA High.
- Thresholds (CALIBRATION_RULES):
  - `thinSample`: 60 decisive
  - `invertedMarginPp`: 1.5
  - `strongHitRate`: 0.57
  - `strongMinSample`: 100
- Server pages now call `loadCalibrationTable()` once and pass the table down to every client surface (`ProjectionsExperience`, `ParlayLabExperience`, `ParlayTicketCard`) via a `calibrationTable` prop.

Current classification on live data (after audit refresh):
- NBA High → **watch** (53.9% on 473; doesn't clear 57% strong floor)
- NBA Medium → **thin** (79 decisive, below 60 floor lifted to 79 ≥ 60 — actually "watch")
- NBA Low → **watch** (51.7% on 118)
- MLB High → **inverted** (48.3% on 315; Med 52% + Low 51.4% both beat by ≥ 1.5pp)
- MLB Medium / Low → **watch**

### Track B — Curated card snapshot + grading

- `pipeline/snapshot_curated.py` writes pregame curated picks to `app/public/data/curated/snapshots/<date>.json`. Same selection rules as the UI helper, including the live calibration gate (no inverted tiers).
- `pipeline/grade_curated.py` joins to NBA + MLB settled rows, never counts pending as loss, excludes pushes from hit-rate denominator, writes `app/public/data/curated/graded/<date>.json` + refreshes `app/public/data/curated/summary.json` with `bySport` / `byReason` / `byHealth` breakdowns.
- 23 tests total (10 snapshot + 13 grading) lock the contract.

Real data committed:
- `app/public/data/curated/snapshots/2026-05-22.json` — 6 picks (3 NBA REB + 3 MLB Hits).
- `app/public/data/curated/graded/2026-05-22.json` — all 6 pending.
- `app/public/data/curated/summary.json` — 0-0-0-6.

### Track C — Monte Carlo shadow validation

- `pipeline/monte_carlo_validation.py` reads every `monte_carlo_shadow_<date>.json` audit file + joins to NBA + MLB settled rows.
- Per-recommendation breakdown (Strong / Watch / High-variance / Avoid).
- Returns `validationStatus: "pending"` and refuses to claim numbers when zero decisive rows joined.
- Today: 351 leans / **0 joined** / pending (May 22 not yet settled).
- 14 validation tests lock joins-per-date, pending semantics, empty handling.
- **No production scoring change.** MC stays shadow.

### Track D — /about Watchlist update

- Calls out that calibration is now audit-driven.
- Explains the curated rail snapshot + grading pipeline.
- Restates fail-closed thresholds (no tier earns "Stronger signal" without ≥ 100 rows AND ≥ 57% hit rate).

---

## 2. PAID API ACCOUNTING

- **Starting balance**: 221 / 1000.
- **Spend this session**: 0.
- **Ending balance**: 221 / 1000.

May 23 NBA was already populated (72 leans, propsAvailable=true)
from the multi-day fetch during the morning session — no additional
fetch needed today. MLB game-markets for 2026-05-22 still missing
(would have cost ~45 credits, over the 20-credit cap).

---

## 3. CRITICAL CONSTRAINT — Vercel Deploy Hook

PR #89 needed an empty-commit nudge because Vercel didn't deploy
the squash-merge to production automatically. Watch for this on
PR #90:

```bash
gh pr merge 90 --squash --delete-branch
git checkout main && git pull origin main
sleep 90
curl -sIL https://gametimepicks.yashwantbalaji.com/about | grep last-modified
# If last-modified is older than ~2 minutes after merge:
git commit --allow-empty -m "chore: nudge production deploy hook"
git push origin main
```

---

## 4. HONESTY CHECKLIST

| Item | Status |
|---|---|
| No fabricated curated picks | ✅ — 6 real picks from real boards |
| No fake curated performance | ✅ — summary is 0-0-0-6 pending |
| No fake MC performance | ✅ — validation reports `pending` for May 22 |
| Pending handling | ✅ never counts as loss |
| Pushes excluded from hit rate | ✅ unchanged |
| Calibration data-driven | ✅ reads `model_audit.json` live |
| Fail closed | ✅ missing audit → empty table → no overlay; no promotion |
| No production scoring change | ✅ Monte Carlo stays shadow |
| 80% claim anywhere | ✅ none |
| Forbidden copy | ✅ public_copy_test green |

---

## 5. TESTS

```
pipeline.snapshot_parlays_test          203 assertions
pipeline.grade_parlays_test              25 assertions
pipeline.parlay_builder_test             39 assertions
pipeline.results_attribution_test         9 assertions
pipeline.model_audit_test                68 assertions
pipeline.active_slate_test               42 assertions
pipeline.fetch_game_markets_test         37 assertions
pipeline.calibration_report_test          7 assertions
pipeline.monte_carlo_props_test          12 assertions
pipeline.snapshot_curated_test           10 assertions   (NEW)
pipeline.grade_curated_test              13 assertions   (NEW)
pipeline.monte_carlo_validation_test     14 assertions   (NEW)
confidence-calibration.test.mjs           7 assertions   (NEW, node:test)
pipeline.public_copy_test               520 assertions
```

`npm run typecheck` clean, `npm run build` clean (122 static pages).

---

## 6. WHAT THE NEXT SESSION SHOULD PICK UP FIRST

1. **Confirm tonight's grader.** After the 3 AM ET nightly settle:
   - `pipeline.grade_parlays --date 2026-05-22` → first lifetime parlay slip hit rate
   - `pipeline.grade_curated --date 2026-05-22` → first curated record on `summary.json`
   - `pipeline.monte_carlo_validation` → first MC vs settled join (~351 leans should now have data)
2. **Wire `grade_curated` into the nightly automation script.** It's currently manual; should run alongside `grade_parlays`.
3. **MLB game-markets for May 23+** when budget allows — currently the only honest gap on the consumer surface.
4. **Build a `pipeline.snapshot_curated` automation hook** that fires during the morning-projections cron so the next session's curated rail is captured automatically.
5. **MC validation surface on /about** once the first real settled date joins — show by-recommendation hit rates.

---

## 7. KNOWN LIMITATIONS

1. MLB game-markets still missing for 2026-05-22 (budget-capped).
2. `pipeline.snapshot_curated` is manual; need to wire into automation_projections.sh.
3. MC validation has no UI surface yet — surface after first decisive joined.
4. Vercel deploy hook is unreliable post-squash-merge (see §3).
5. Curated snapshot uses Python-side replicas of the TS curated selector. Both files lock the same logic via tests, but a future PR could DRY them into a shared schema.

---

## 8. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #90 merge sha>
git push origin main
# Effects of revert:
#   - Calibration table returns to PR #89's hard-coded shape
#   - /parlay-lab + /projections keep working (table prop is optional;
#     missing prop = EMPTY_CALIBRATION_TABLE = no overlay = raw labels)
#   - Curated snapshot/graded JSON stays on disk (no UI depends on them)
#   - Monte Carlo validation files stay on disk (audit only)
#   - All other pages unaffected
```

---

*The model now self-calibrates from the audit it ships, the curated
rail can be graded honestly the moment dates settle, and Monte Carlo
has a real validation harness waiting for data. The next session
walks into a position where every methodology claim has an
auditable backing file.*
