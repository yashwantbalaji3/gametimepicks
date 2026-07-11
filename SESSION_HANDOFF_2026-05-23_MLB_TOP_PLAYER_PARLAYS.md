# SESSION HANDOFF · 2026-05-23 · MLB TOP-PLAYER PARLAYS

> **Audience:** the next Claude Code session, plus the operator.
> **Working directory:** `~/Downloads/gametimepicks`
> **Branch state on completion:** clean `main` once PR #92 merges.
> **Date written:** 2026-05-23 (afternoon ET).

Second handoff of May 23. Direct response to user feedback after PR #91 settlement:

> "Wants more MLB parlays · top-player familiarity · all 3 risk levels."

---

## 1. WHAT SHIPPED — PR #92

`feat(parlays): top-player MLB hits card across all risk levels`

### Tighter profile rules (locked by tests)

| Profile | Legs | Per-game cap | Confidence | Min edge |
|---|---|---|---|---|
| Conservative | **exactly 2** | 1 | High only | ≥ 3pp |
| Balanced | **exactly 3** | 2 | High + Medium | ≥ 2pp |
| Aggressive | **4-5** | 3 | All tiers | ≥ 1pp |

Prior rules allowed loose ranges (2-3, 2-4, 2-5) that produced overlapping
slip shapes. User's spec is now the contract — `test_profile_leg_counts`
will fail if anything quietly loosens.

### MLB top-player scorer (new)

`pipeline/mlb_top_players.py` — auditable whitelist of recognizable
MLB hitters (Soto, Judge, Bregman, Lowe, Bichette, Betts, Alonso,
Acuña, etc.) plus a small `TOP_PLAYER_BOOST = 0.05` adder for
`_leg_score`. Boost applies ONLY when `_sport == "mlb"`.

Contract locked by tests:
- Top player at +5pp BEATS non-top at +6pp (re-ranking works)
- Non-top at +12pp STILL BEATS top at +5pp (boost can't override clear edge)
- Boost zero for unknown players (no penalty)
- Boost zero for NBA leans (MLB-only)

This is a **re-ranking** layer, not an injection layer. Names on the
whitelist that aren't in today's real board never appear.

### Doubled MLB candidate pool per profile

Today's snapshot now produces:

| Pool | Count |
|---|---:|
| MLB conservative | 10 |
| MLB balanced | 10 |
| MLB aggressive | 10 |
| Multi-sport aggressive (NBA + MLB) | 4 |
| NBA-only | 0 (single-game slate can't satisfy tight rules) |

NBA legs surface via the multi-sport pool (NY @ CLE players appear
in mixed slips with MLB hitters).

### Parlay Lab UI

- **Risk filter row** (Conservative / Balanced / Aggressive) beside
  the existing Sport filter — compose for "MLB Conservative" etc.
- **Rail eyebrow** switches to "Top-player MLB hits · saved before
  games" when the sport filter is MLB.
- **MLB variance disclaimer** renders only when sport=MLB AND MLB
  slips exist — keeps the disclaimer next to the surface where it matters.
- Rail capacity bumped from 9 → 15 so all 10 conservative MLB slips
  can render under the chip filter.

### Stars showing up tonight (MLB 5-23 saved slips)

Juan Soto · Alex Bregman · Brandon Lowe · Mookie Betts · Pete Alonso ·
Brent Rooker · Bryan Reynolds · Bo Bichette · CJ Abrams · Brett Baty ·
Riley Greene · Spencer Steer · Byron Buxton · Brice Turang · Keibert Ruiz

Plus a few non-top players whose edges are strong enough to clear
the boost gap (Blake Dunn at +18.7pp, Ryan Kreidler at +18pp, etc.).

## 2. PAID API ACCOUNTING

- Starting balance: 204
- Spend: **0** (no paid fetches; all data already on disk from PR #91)
- Ending balance: 204

## 3. HONESTY CHECKLIST

| Item | Status |
|---|---|
| No fabricated players | ✅ — re-ranking only |
| No fabricated odds | ✅ — "—" preserved when missing |
| No fabricated history | ✅ — saved slips still pending |
| Pending handling | ✅ — unchanged |
| Forbidden copy | ✅ — public_copy_test green |
| 80% claim | ✅ — never |
| MLB variance disclaimer | ✅ — rendered next to MLB rail |

## 4. TESTS

```
snapshot_parlays      223  (was 206, +17 NEW)
grade_parlays          25
parlay_builder         39
results_attribution     9
active_slate          42
model_audit           68
calibration_report     7
monte_carlo_validation 14
snapshot_curated      10
grade_curated         13
public_copy          520
```

`npm run typecheck` clean, `npm run build` clean.

## 5. WHAT THE NEXT SESSION SHOULD DO FIRST

1. **Monitor PR #92 production deploy.** Vercel auto-deploy missed
   PR #89's squash merge — keep an eye on this one.
2. **After tonight's nightly settle**, the curated/parlay graders
   will produce the first numbers across the new profile rules.
   Watch whether the tighter conservative (2-leg, 1-per-game) hits
   meaningfully better than balanced/aggressive.
3. **MLB top-player whitelist refresh.** As new stars emerge (call-ups,
   trades), add to `pipeline/mlb_top_players.py`. The list is
   auditable in git — every addition is a one-line diff.
4. **MLB game-markets for upcoming dates** when budget allows.
5. **Wire `snapshot_curated` + `grade_curated` into automation cron**
   — still manual today.

## 6. KNOWN LIMITATIONS

1. NBA-only slips are 0 today because the single ECF G3 slate
   doesn't admit 2+ distinct NBA games under the tight per-game caps.
   Mixed slips cover NBA exposure.
2. Top-player whitelist is hand-maintained. A future PR could
   derive it from a "lineup primary slot" signal if we get that
   data on the MLB board.
3. Rail capacity is 15 slips — beyond that we truncate (truncation
   shouldn't matter for the conservative tier which now produces
   exactly 10).
4. MLB variance disclaimer only renders when sport=MLB — if a user
   stays on "All" they won't see the disclaimer. A future PR could
   make it always-visible when MLB slips exist.

## 7. ROLLBACK

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <PR #92 squash sha>
git push origin main
# Effects:
#   - PROFILE_RULES revert to PR #91 loose ranges
#   - MLB top-player boost disabled
#   - Risk filter chip row disappears
#   - MLB variance disclaimer disappears
#   - Today's snapshot stays on disk (no data loss) but next
#     snapshot run will use the older rules
# If Vercel doesn't deploy automatically:
#   git commit --allow-empty -m "chore: nudge production deploy hook"
#   git push origin main
```

---

*The user's specific request — "more MLB parlays, top-player focus,
all three risk levels" — is now the codified contract. 10 + 10 + 10
real MLB slips per slate, top players appearing transparently in the
sort order, and a risk-filter chip that lets the user scan a single
profile in one click.*
