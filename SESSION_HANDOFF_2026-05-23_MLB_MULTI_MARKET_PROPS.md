# SESSION HANDOFF · 2026-05-23 · MLB MULTI-MARKET PROPS

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main` once PR #93 merges.
> **Date written:** 2026-05-23 (early afternoon ET).

Third handoff of May 23. Direct response to user feedback after PR #92:

> "MLB hits feel calmer · also want strikeouts and total bases · show
> every available prop per player on tap · top stars / hot form."

---

## 1. WHAT SHIPPED — PR #93

`feat(mlb): player prop accordions and multi-market parlay support`

### Paid MLB fetch (28 credits)

| | Value |
|---|---|
| Starting balance | 204 |
| Spend | 28 credits |
| Ending balance | **177** (above 170 floor) |
| Markets fetched | `pitcher_strikeouts`, `batter_total_bases` |
| Markets cache-hit (free) | `batter_hits` |
| Games covered | 15 pregame (1 already-started game auto-excluded) |

### May 23 MLB board (post-merge)

| Market | Leans |
|---|---:|
| batter_hits | 232 |
| batter_total_bases | 85 |
| pitcher_strikeouts | 26 |
| **Total** | **343** |

Confidence distribution: 114 High · 55 Medium · 138 Low · 36 insufficient.

### Per-market risk-profile gates (locked by tests)

`PROFILE_RULES` now carries `mlb_allowed_markets` and
`mlb_max_high_variance_legs`:

| Profile | MLB markets allowed | High-variance cap |
|---|---|---:|
| Conservative | `batter_hits` only | 0 |
| Balanced | hits + total_bases + strikeouts | 1 |
| Aggressive | all 4 (incl. H+R+RBI) | 3 |

`MLB_HIGH_VARIANCE_MARKETS = {batter_total_bases, pitcher_strikeouts}` —
audit-derived: lifetime hits 52.9% vs TB 48.5% vs K 46.2%.

### Regenerated May 23 snapshot

| Bucket | Slips | Market mix |
|---|---:|---|
| MLB conservative | 10 | 100% hits (20 legs) |
| MLB balanced | 10 | 22 hits + 5 TB + 3 K (30 legs) |
| MLB aggressive | 10 | 32 hits + 12 TB + 6 K (50 legs) |
| Multi-sport aggressive | 4 | NBA + MLB mixed |
| **Total** | **34** | |

Top stars on today's MLB slips (still present after the new gates):
Juan Soto · Alex Bregman · Brandon Lowe · Mookie Betts · Pete Alonso ·
Brent Rooker · Bo Bichette · CJ Abrams · Brett Baty · Brice Turang.

### Grading compatibility (no new code needed)

`pipeline.grade_parlays._settled_lookup_for_date` already keys MLB
rows by `(playerId, marketKey, lean, line)`. Settled history covers
all three markets:

- pitcher_strikeouts · 78 settled rows
- batter_hits · 690
- batter_total_bases · 204

So tonight's grader will join `batter_total_bases` and
`pitcher_strikeouts` snapshot legs cleanly when settlement runs.

### UI — no new code

`parlay-ticket-card.tsx` (PR #88) already renders `leg.marketLabel ||
leg.market` so the new MLB legs surface as "Strikeouts" / "Total
Bases" / "Hits" — not raw snake_case keys. The risk filter chip
(PR #92) and sport filter chip (PR #87) already let users scan only
MLB conservative / balanced / aggressive in one click.

`projections-experience.tsx` already groups by player (PR #86),
so tapping a player accordion reveals all their props naturally — no
schema change needed.

## 2. TESTS

```
snapshot_parlays          309  (was 223, +86 NEW)
grade_parlays              25
parlay_builder             39
results_attribution         9
active_slate              42
model_audit               68
calibration_report          7
monte_carlo_validation     14
public_copy              520
```

New assertions locked:
- conservative MLB → batter_hits only
- balanced MLB → ≤1 high-variance leg per slip
- aggressive MLB → ≤3 high-variance legs per slip
- MLB fixture extended (4 → 7 leans across 4 games)

`npm run typecheck` clean, `npm run build` clean.

## 3. HONESTY CHECKLIST

| Item | Status |
|---|---|
| No fabricated markets | ✅ Odds API real fetch |
| No fabricated player props | ✅ board-data-only |
| No fabricated odds | ✅ "—" preserved when missing |
| No fabricated hit rate | ✅ snapshot still pending |
| Pending handling | ✅ unchanged |
| Forbidden copy | ✅ public_copy_test green |
| Paid spend within rules | ✅ 28 ≤ 30 cap, ending 177 ≥ 170 floor |
| Top-player whitelist | ✅ audited, no name injected unless on board |

## 4. WHAT THE NEXT SESSION SHOULD DO FIRST

1. **Watch tonight's nightly settle** for the new MLB markets.
   Curated rail + parlay grader will produce the first numbers
   under the new per-market gates.
2. **Per-market hit-rate breakdown** in `pipeline.calibration_report`
   already exists; surfacing the per-market % on `/about` would let
   users see which MLB markets are stabilizing.
3. **MLB game markets for upcoming dates** (NBA's are easy, MLB's
   need ~30 credits across 15 games). Budget allowing.
4. **Wire `snapshot_curated` + `grade_curated` into the morning +
   nightly cron** — still manual since PR #90.
5. **NBA-only single-game slates** can't satisfy the tight new
   leg-count rules — multi-sport pool still covers NBA exposure.
   Future PR could add a "single-game NBA" override for nights
   like ECF G3.

## 5. KNOWN LIMITATIONS

1. **`batter_hits_runs_rbis` not fetched today** — would have pushed
   over the 30-credit cap. The aggressive profile's
   `mlb_allowed_markets` includes it for future runs.
2. **1 MLB game already started** when we fetched (auto-excluded by
   Odds API); the 16th game's snapshot only includes pregame events.
3. **MLB game-markets (ML/RL/Total chips on matchup cards) still
   missing for 5-23** — out of budget.
4. **Test fixture grew 4 → 7 leans** — a future cleanup could split
   into named constants per profile so adding a new market gate
   doesn't require rewriting the shared fixture.
5. **Vercel may need a nudge on the squash-merge** (PR #89 did,
   #90 didn't, #91-93 cleanly so far).

## 6. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #93 squash sha>
git push origin main
# Effects:
#   - PROFILE_RULES revert to PR #92 (no per-market gates)
#   - Today's snapshot reverts to PR #92's hits-heavy composition
#   - New MLB market leans STAY on disk (no data loss) since they
#     came from the Odds API
#   - Top-player boost remains (PR #92)
# If Vercel doesn't deploy automatically:
#   git commit --allow-empty -m "chore: nudge production deploy hook"
#   git push origin main
```

---

*MLB now ships three real prop categories (hits, total bases,
strikeouts) with calibration-aware market gates. Conservative stays
calm (100% hits), balanced gets variety (≤1 high-variance leg),
aggressive opens the full menu (≤3). Stars still rank thanks to the
PR #92 top-player boost; the new gates simply restrict WHICH markets
each profile can carry, not the player ranking.*
