# SESSION HANDOFF · 2026-05-22 · CALIBRATED + CURATED PROJECTIONS

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main` at `48f3e32`.
> **Date written:** 2026-05-22 (early afternoon ET).

Fifth handoff of May 22. This session addressed the calibration
finding from PR #88 ("MLB High confidence is inverted") in the UI
layer + added a curated projections rail + ran Monte Carlo over
today's slate in shadow mode.

---

## 1. WHAT SHIPPED — PR #89

| | Value |
|---|---|
| PR | [#89](https://github.com/yashwantbalaji3/gametimepicks/pull/89) |
| Title | `feat(calibration+curated): downgrade inverted tiers + curated projections rail` |
| Merged | 2026-05-22T17:?? UTC |
| SHA | `48f3e32` |
| Production | live; verified by /about copy and /parlay-lab MLB labels |

### Calibration overlay (the headline change)

`app/src/lib/confidence-calibration.ts` is the new source of truth.
It carries a per-sport per-tier health table built from today's
audit:

| Sport | Tier | Health | Settled data |
|---|---|---|---|
| NBA | High | strong | 53.9% on 473 |
| NBA | Medium | thin | 59.5% on 79 (sample too small to promote) |
| NBA | Low | watch | 51.7% on 118 |
| MLB | High | **inverted** | 48.3% on 315 (below Med+Low) |
| MLB | Medium | watch | 52.0% on 102 |
| MLB | Low | watch | 51.4% on 327 |

`calibratedConfidenceLabel(sport, tier)` wraps the friendly label
with the overlay. **Inverted (sport, tier) combos render
"Calibration watch" in muted warn color instead of "Stronger signal"
in green.** The raw confidence value, edge, projection — all
untouched. Only the display label flips.

Wired through:
- `parlay-ticket-card.tsx` — leg signal line
- `projections-experience.tsx` — player accordion badge (with
  tooltip explaining the downgrade)
- `curated-projections-card.tsx` — Signal cell on each pick

Result on live MLB data: every MLB "Stronger signal" surface across
the site now reads "Calibration watch" with a muted warn accent.

### Curated projections rail

`app/src/lib/curated-projections.ts` exposes
`selectCuratedPicks(leans, opts)` returning up to 6 picks per slate
(3-per-sport cap) sorted by:

```
score = 0.55 × confidence_weight
      + 0.30 × min(1.0, |edge| / 12)
      + market_boost          (REB strongest)
      + 0.15 if health=strong
      + 0.05 if health=thin
```

Hard filters: skip if anomaly-flagged, skip if calibration health is
"inverted", skip if market rule unknown, skip if `|edge|` below the
market floor (NBA REB 3pp / NBA PTS+AST 5pp / MLB hits 4pp / MLB K
5pp).

`app/src/components/curated-projections-card.tsx` renders the rail
with reason tags (Strong market / Watchlist / High-variance), avatar,
matchup, line, PROJ / EDGE / SIGNAL cell trio. Mounted on the
homepage between the Tonight sports rail and the existing
`CuratedTonightCard` (parlay tickets).

Today's live output:
- 3 NBA REB picks (Wembanyama × 2 + Keldon Johnson) tagged "Strong
  market", labeled "Stronger signal"
- 3 MLB Hits picks (Brandon Lowe, James Wood, ...) tagged
  "Watchlist", labeled "Watch"
- Zero MLB Strikeouts picks (high market floor + High tier
  excluded)

### Monte Carlo shadow runner

`pipeline/monte_carlo_shadow.py` runs the existing
`monte_carlo_props.simulate` over every NBA + MLB lean that has
≥3 recent samples and writes
`app/public/data/audit/monte_carlo_shadow_2026-05-22.json`. This is
AUDIT-ONLY — no UI, no production scoring, no UI label depends on
it.

Today's run scored 351 leans. Breakdown by MC recommendation:
- Strong: **16**
- Watch: **23**
- High-variance: **307**
- Avoid: **5**

Consistent with the audit finding that production confidence tiers
overstate signal: only ~5% of leans pass the MC "Strong" gate even
though the production model labels many more as "High".

### /about Watchlist update

The Model Watchlist now explicitly says:
1. MLB "Stronger signal" labels are auto-downgraded to "Calibration
   watch" everywhere on the site.
2. The Monte Carlo guardrail is in shadow mode pending real
   out-of-sample backtest.
3. The curated rail prefers selectivity over volume.

## 2. PAID API ACCOUNTING

- Probed balance: **221 / 1000**
- MLB game-markets fetch (15 games × 3 markets = **45 credits**)
  was over the 20-credit cap → **skipped honestly**
- Final balance: 221 (no spend this session)

## 3. HONESTY CHECKLIST

| Item | Status |
|---|---|
| No fabricated picks | ✅ Curated picks are real settled-data-filtered leans |
| No fabricated odds | ✅ MLB game-markets stayed "—" honestly |
| No fabricated hit rate | ✅ Curated rail shows no per-pick hit rate |
| Pending handling | ✅ unchanged |
| Production scoring change | ✅ none |
| Inverted tier downgrade | ✅ shipped in the UI overlay |
| 80% claim | ✅ none anywhere |
| Forbidden copy | ✅ public_copy_test green (520 assertions) |

## 4. TESTS

All 10 pipeline test suites green (962+ assertions):
- snapshot_parlays · grade_parlays · parlay_builder · model_audit
- results_attribution · active_slate · fetch_game_markets
- calibration_report · monte_carlo · public_copy

`npm run typecheck` clean, `npm run build` clean (122 static pages).

## 5. MOBILE ROUTE WALK (375px)

- `/` — Curated projections rail renders with 6 picks (3 NBA + 3 MLB),
  reason tags visible, Signal cells show calibrated labels
- `/projections?game=<NBA gameId>` — player accordion still shows
  "Stronger signal" for NBA (correct)
- `/parlay-lab?game=<MLB gameId>` — MLB legs now show "Calibration
  watch" in muted warn color (downgraded from "Stronger signal")
- `/about` — Watchlist updated copy live
- 0 horizontal overflow on every page

## 6. WHAT THE NEXT SESSION SHOULD PICK UP FIRST

In priority order:

1. **MLB game-markets when budget allows.** Skipped today; would
   add the Run line / Total chips to MLB matchup cards on
   `/projections` and `/parlay-lab`.
2. **Compare MC shadow recommendations vs settled outcomes.** The
   shadow artifact has 351 entries; the next dates that settle can
   be joined to validate (or refute) the MC "Strong" gate. If
   validated on ≥ 100 settled rows across multiple dates, that's
   the path to promote MC into the production confidence pipeline.
3. **Per-market edge floors in the production builder.** Today's
   curated logic uses market-specific floors (NBA REB 3pp vs PTS
   5pp). The Parlay Lab builder still uses a global floor per risk
   profile. Aligning them would tighten parlay candidate quality.
4. **Confirm tonight's grader.** Once the 3 AM ET nightly settle
   runs and grades the May 22 snapshot, `/results/parlays` will
   show its first real lifetime record (17 slips were saved
   pregame).
5. **Live news/injury suppression.** The biggest remaining honest
   gap in projection quality — no way to react to a late scratch.

## 7. KNOWN LIMITATIONS

1. **MLB game-markets missing for 2026-05-22** — budget-capped.
   MLB matchup cards render without ML/Spread/Total chips.
2. **Curated rail uses point projections** — the Monte Carlo
   shadow output is not consumed by the rail yet (would require
   the validation step above).
3. **Curated reason tags are coarse** — "Watchlist" lumps MLB
   Hits and NBA PTS together even though they have different
   audit profiles. A future PR could split these into more
   nuanced tags.
4. **Calibration table is hard-coded** — when the audit refreshes
   with more dates, the table in `confidence-calibration.ts`
   needs a manual update. A future PR can read it directly from
   `model_audit.json`.

## 8. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit 48f3e32
git push origin main
# Vercel redeploys in ~1 minute.
# Effects:
#   - Homepage curated projections rail disappears
#   - MLB confidence labels return to raw "Stronger signal"
#   - Monte Carlo shadow JSON stays on disk (no production
#     dependency)
#   - All other pages unchanged
```

---

*The most-actionable methodology finding from yesterday's overnight
work is now reflected in the UI. Every "Stronger signal" label a
user sees is now honest to the audit data, and the curated rail
gives the casual user a short, defensible list of tonight's reads.*
