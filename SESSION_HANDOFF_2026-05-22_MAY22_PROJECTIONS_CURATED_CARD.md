# SESSION HANDOFF · 2026-05-22 (Day Session) · MAY 22 PROJECTIONS + CURATED CARD

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main`. PR #85 may still be deploying when this is written — it does not block follow-up UI work.
> **Date written:** 2026-05-22 (late morning ET).

This is the second handoff of May 22. The first one — `SESSION_HANDOFF_2026-05-22_OVERNIGHT_PRODUCT_OVERHAUL.md` — covered the overnight PRs #81-#84. This one covers the morning paid-fetch + first-real-snapshot + curated-card session.

---

## 1. WHAT SHIPPED

| PR | Title | Status |
|---|---|---|
| [#85](https://github.com/yashwantbalaji3/gametimepicks/pull/85) | feat(may22): real projections + first pregame snapshot + curated card | **OPEN** (Vercel deploying at write time; expected to merge on green) |

PR #85 contains:

1. **Paid May 22 data fetch.** 39 credits spent (260 → 221, above 220 floor):
   - NBA board for `2026-05-22` — 83 leans for OKC @ SA (WCF Game 3),
     of which 59 are stronger-signal, 8 watch, 16 high-variance.
   - NBA game markets for `2026-05-22` — moneyline, spread, total
     for the one game.
   - MLB board for `2026-05-22` — 302 leans across 15 games on
     `pitcher_strikeouts` + `batter_hits` only (the other 2 markets
     deferred to stay under the budget). 97 stronger-signal, 42 watch,
     129 high-variance.
2. **First real pregame parlay snapshot** at
   `app/public/data/parlays/snapshots/2026-05-22.json`. 6 candidate
   slips, NBA-only, `status: pending`, no result fields. This is the
   inaugural snapshot — the saved-slip persistence pipeline now has
   real ground truth to grade against tonight.
3. **`CuratedTonightCard` component** + `getCuratedTonightPicks()`
   helper. Picks top-1 slip per risk profile (sorted by snapshot
   `score`) and renders them via the shared `ParlayTicketCard` from
   PR #83. Wired on:
   - Homepage between Tonight rail and How-it-works
   - `/parlay-lab` (replacing the older "show every slip" rail which
     was noisy on a single-game slate)
4. **`/about` Model Watchlist section.** Honest read of the current
   strong/weak markets, with explicit note that MLB High-confidence
   isn't separating cleanly from Medium/Low. No 80%-accuracy claim.

## 2. CALIBRATION FINDINGS (RUN ON SETTLED DATA TODAY)

`pipeline.calibration_report --by-market --by-confidence` numbers:

**NBA (677 settled rows):**
- REB · 59.0% on 229 ← strongest, stable
- PTS · 52.0% on 252 ← coin flip
- AST · 51.6% on 190 ← coin flip
- High · 53.9% on 473
- Medium · 59.5% on 79 ← best, but thin
- Low · 51.7% on 118

**MLB (744 settled rows — +162 since the overnight handoff):**
- Hits · 51.3% on 487 ← slight signal
- Total Bases · 48.5% on 204 ← below coin flip
- Strikeouts · 45.3% on 53 ← weakest, tiny sample
- High · **48.3% on 315** ← below coin flip and inverted vs Medium
- Medium · 52.0% on 102
- Low · 51.4% on 327

**The MLB confidence inversion is the most important finding.** The
model's "Stronger signal" tier should outperform "Watch" and
"High-variance" if the calibration is sound; right now it's the
opposite. This is documented in the `/about` watchlist and will need
a calibration pass next.

## 3. PAID API ACCOUNTING

| | Value |
|---|---|
| Starting balance | 260 |
| Spend budget for the day | 70 credits cap; ending balance ≥ 220 |
| Effective allowed spend | min(70, 260 − 220) = 40 credits |
| NBA props 5-22 + 5-23 (multi-day fetch) | 6 credits |
| NBA game markets 5-22 | 3 credits |
| MLB props 5-22 (2 markets × 15 games) | 30 credits |
| **Actual spend** | **39 credits** |
| **Ending balance** | **221** |

Skipped:
- MLB game markets — would have cost another 45 credits (over budget)
- MLB markets 3 + 4 (batter_total_bases, batter_hits_runs_rbis) —
  same budget reason
- NHL / IPL / World Cup — no projection pipeline yet

## 4. MAY 22 COVERAGE SUMMARY

| Sport | Date | Games | Leans | Confidence breakdown | Game markets |
|---|---|---:|---:|---|---|
| NBA | 2026-05-22 | 1 (OKC @ SA WCF G3) | 83 | 59 H / 8 M / 16 L | ✅ |
| MLB | 2026-05-22 | 15 | 302 | 97 H / 42 M / 129 L | ❌ (deferred) |
| NHL / IPL / WC | 2026-05-22 | — | — | — | — |

## 5. FIRST PREGAME PARLAY SNAPSHOT

```
File:          app/public/data/parlays/snapshots/2026-05-22.json
Date:          2026-05-22
sportsIncluded: ['nba']
slipsCount:    6  (3 balanced 2-leg + 3 aggressive 3-leg)
status:        pending
generatedAt:   2026-05-22T14:48:20+00:00 (10:48 AM ET)
```

Tonight's nightly settle (3 AM ET cron) will:
1. Settle the NBA OKC @ SA box score
2. Run `pipeline.grade_parlays --date 2026-05-22`
3. Write `app/public/data/parlays/graded/2026-05-22.json`
4. Update `app/public/data/parlays/summary.json` with the first lifetime
   slip-level record on the site

After that grader run, `/results/parlays` will show its first real
hit rate. Every component in the chain is ready for it.

## 6. CURATED TONIGHT CARD — WHERE IT RENDERS

**Homepage `/`:** between the Tonight rail and How-it-works.
Shows 2 tickets (Balanced 2-leg + Aggressive 3-leg) — Conservative
profile was attempted but the builder produced no candidates because
its rules require ≥ 2 distinct games per slip and tonight is single-game.

**`/parlay-lab`:** replaces the earlier "render every slip" rail above
the live builder.

Honest fallback behavior is locked: the component returns `null` when
no snapshot exists for the date, so the surface disappears cleanly on
days without paid data.

## 7. INTEGRITY CHECKLIST

| Item | Status |
|---|---|
| No fake projections | ✅ — every lean came from real Odds API + ESPN/MLB Stats pipelines |
| No fake odds | ✅ — combined American odds shown only when every leg has `oddsForSide` |
| No fake parlay history | ✅ — snapshot has only `pending` slips; no result fields anywhere |
| No fake hit rate | ✅ — `/results/parlays` still in empty state until tonight's grader runs |
| No 80% claim | ✅ — `/about` watchlist explicitly disclaims it |
| Pending handling honest | ✅ — empty profiles drop silently, snapshot statuses preserved |
| Pushes excluded | ✅ — unchanged from PR #79 contract |
| Public copy clean | ✅ — `pipeline.public_copy_test` green |

## 8. TESTS

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
`npm run typecheck` + `npm run build` both clean.

## 9. WHAT THE NEXT SESSION SHOULD PICK UP FIRST

In priority order:

1. **Confirm tonight's grader produced
   `app/public/data/parlays/graded/2026-05-22.json`** after the
   3 AM ET nightly-settle cron. If yes, the curated card should
   automatically flip to "Graded" framing.
2. **Refresh May 23 NBA/MLB projections** — `app/public/data/boards/2026-05-23.json`
   already has dry-run shells from today's NBA multi-day fetch;
   paid props weren't fetched yet. If May 23 has a slate, repeat
   today's paid pipeline within the 40-credit budget.
3. **MLB candidate slip support in `snapshot_parlays.py`** — today's
   snapshot is NBA-only because the builder still only reads
   `app/public/data/boards/<date>.json`. Wire it to also read the
   MLB board path. With 302 MLB leans on disk, this would have
   dramatically increased today's slip count.
4. **Calibration deep-dive on MLB High-confidence inversion** —
   the most actionable finding from today's report. The right
   approach: use the calibration report CLI to test what filter
   shapes would have re-aligned the tiers on settled data, then
   propose a guardrail change with tests in a separate PR.
5. **PR D (visual system pass)** — still deferred from the overnight
   session: standardize border-radius, spacing, hover lift on
   matchup cards, sticky bottom mobile nav. Low risk now that the
   data + product layer is stable.

## 10. KNOWN LIMITATIONS

1. **NBA-only snapshot.** MLB leans are on disk and live on `/mlb/board`,
   but the snapshot pipeline doesn't yet ingest them.
2. **Partial MLB market coverage.** Only `pitcher_strikeouts` +
   `batter_hits` — `batter_total_bases` and `batter_hits_runs_rbis`
   were deferred to stay under the 40-credit budget.
3. **No NBA Conservative ticket.** Conservative profile requires ≥ 2
   distinct games per slip; tonight has 1 NBA game so the profile
   silently dropped. The curated card renders 2 tickets instead of 3.
4. **No MLB game-markets for 5-22.** Skipped to stay under budget.
   `/mlb/board` shows leans but no Run line / Total chips.
5. **MLB confidence tiers are visibly off.** High at 48.3% is below
   Medium and Low. The `/about` watchlist surfaces this honestly;
   no scoring change shipped yet.

## 11. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #85 squash sha>
git push origin main
# Vercel redeploys in ~1 minute
```

Specific revert points:
- Reverting PR #85 removes the curated card AND the May 22 data
  artifacts AND the snapshot file. The site falls back to the
  "no leans" shell for 2026-05-22 and the curated card disappears
  cleanly (component returns null when the snapshot is gone).
- The morning's paid-fetch credit usage is unrecoverable but the
  data itself can be regenerated from cache while it's still warm.

---

*One day, two handoffs. The model's first real saved-slip slate is
on disk and waiting for tonight's grader. The next session walks in
with both the audit AND the slip persistence pipelines pointing at
the same date — that's a position of real strength.*
