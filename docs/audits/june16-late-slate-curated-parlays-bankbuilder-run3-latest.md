# June 16 — Late slate (8:27 PM ET): started-game gating + Bank Builder V2 Run #3 decision

_Branch `june16-late-slate-curated-parlays-bankbuilder-run3` off main `b1b94b8`. Now 00:27 UTC
(June 17) ≈ 8:27 PM ET June 16._

## Late-slate reality check (live data)
- **France v Senegal: FT 3-1** (final) · **Iraq v Norway: FT 1-4** (final) — API-Football live status.
- **Argentina v Algeria: NS (not started)**, kicks off 01:00 UTC — the **only upcoming** WC game.
  Austria v Jordan (04:00 UTC) has no odds-backed projection.
- MLB: remaining games offer only fragile single-player batter props (no team markets on the board).

## Bank Builder V2 — Run #3 decision: BLOCKED (evaluating)
Re-ran V2 at the current time (the launcher excludes started games). **decision = `evaluating`.**
- **2 eligible legs across 1 game:** Argentina or Draw (92), Argentina draw-no-bet (84) — both from
  the single upcoming Argentina/Algeria game.
- **Argentina moneyline (−240, 66% model) explicitly evaluated → survival 59, does NOT clear the 80
  bar** (no draw cover → more fragile). Recorded in the artifact `notes` + the V2 panel.
- MLB candidates (Cole Young, Zack Gelof, Jo Adell hits) rejected — unconfirmed-lineup DNP risk
  (survival 23–25).
- **Blockers:** only 2 eligible legs (need ≥4 for two lanes); the strongest non-fragile legs span
  only 1 upcoming game (two lanes would be over-correlated). → **No Run #3 launched; Run #2 untouched.**
  Honest: a dual run needs ≥2 independent upcoming games with ≥4 non-fragile legs; tonight has 1.

## Started/final game gating (the correctness fix)
France & Iraq are FINAL but were still shown as active pregame picks. Fixed:
- `curated-picks.ts`: each `CuratedGame` now has `status: "upcoming" | "started"` (kickoff vs now);
  started games are **not** Bank Builder eligible and sort after upcoming games.
- World Cup curated cards: "started · for reference" vs "upcoming" badge.
- Today World Cup focus: each game computes `started`; started games get a "started" chip and are
  de-emphasized; the headline now reads **"1 upcoming · 3 World Cup games in focus"** (was "3 in
  focus", which implied all were live).

## Verification
- `tsc` clean · **943 tsx tests + 11 V2 python tests pass** · build clean (195 pages) · copy +
  secret audits clean. Browser: started badges + "1 upcoming · 3 in focus" headline + V2 Argentina
  note verified (screenshot).

## Deferred (honest)
Full suggested-card generation from curated picks (constrained tonight — only 1 upcoming WC game, so
fresh multi-leg upcoming cards can't be built without stale/started legs or same-game correlation);
Parlay Lab/Build leg-drawer + survival visuals. These remain the next build when ≥2 upcoming games
exist. Run #1, Run #2, UFC 250 preserved.
