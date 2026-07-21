# July 21 Review Build + Flagship Restart — Mission Log

Money locked `affe6b21`, record 19-14, exposure **$0** — unchanged throughout. Products restarted from Step 1 in
Review/Paper mode. Paid MLB refresh used (approved).

## Precheck
HEAD `8540309a`, both refs aligned, no drift, money md5 `affe6b21`, forensic PERFECT. Real ET: Mon Jul 20 ~22:49.

## Paid July-21 MLB refresh (credits used ~a few hundred; ~15,594 Odds credits remaining)
`refresh_daily_products.sh --date 2026-07-21` (money md5-guarded). Also surfaced + FIXED a refresh bug (the
empty-slate guard filtered on `x.home`/`x.away` but the board uses `homeTeamName` — a real slate was mis-counted
"0 games"). Re-ran team markets + generated the 10k sims.
- **MLB July 21: 15 scheduled games.** Odds posted for **3** games so far (July-20 night); those 3 have team
  markets + 10k player-prop sims (**5 model-qualified picks, 4 with positive edge**). The other 12 games are
  scheduled but unpriced — books post July-21 lines through tomorrow. **Not fabricated.**
- WC: complete → empty slate (archive). NBA/NFL/NHL: offseason/future.

## Flagship restart (Review Mode · Paper · $0)
- **Bank Builder** — both lanes restarted from **Step 1** (Lane A cycle 9 active with a 2-leg review card
  Wrobleski+Buehler +268; Lane B cycle 8 active, awaiting). Prior WC cycles preserved in `priorLane`. Canonical
  money untouched. Detail: `JULY21_BANK_BUILDER_RESTART.md`.
- **Moonshot** — restarted from **Step 1** MLB (from stopped WC), 2-leg review card Wheeler+Gausman +278; stale
  WC candidate/prior-run props cleared. `/moonshot` shows the card. Detail: `JULY21_MOONSHOT_RESTART.md`.
- **Exposure $0 everywhere** (portfolio 0, moonshot 0, daily-portfolio 0, all step stakes 0). Legs are MLB
  pitcher-strikeout props (deterministic StatsAPI settlement, real model edge) — no settlement-pending props, no
  WC, no internal model outputs. `restart-both-lanes-0721.mjs` (mirrors the proven 0701 pattern).

## Verification (independent)
Money md5 `affe6b21` ✓ · forensic MATHEMATICALLY PERFECT ✓ · exposure $0 ✓ · both BB lanes Step-1/active/fresh
cycle ✓ · Moonshot active/Step-1/MLB ✓ · no `player_goal_scorer`/settlement-pending market in any ACTIVE card ✓
(the one WC goalscorer reference is confined to laneB's preserved `priorLane` history, not rendered on
`/bank-builder`) · tsc clean · **suite 2276/2276** (35 restart-broken tests fixed to the new Step-1 MLB reality) ·
build exit 0.

## Public state (built `out/`)
- Home / `/simulate` / `/mlb`: MLB-first (July-21 games); no stale WC hero.
- `/moonshot`: **Step 1 · Review Mode** with the Wheeler+Gausman legs, $0.
- `/bank-builder`: **Step 1 · Paper · $0** (restarted; see display gap below).
- `/world-cup`: archive/completed (round-of-32 "completed" page).

## Known residuals (for the founder)
1. **Only 3 of 15 MLB games priced tonight** (July-20 night). Re-run the MLB refresh + sims tomorrow morning for
   full coverage → more eligible legs → Lane B + fuller cards can activate.
2. **`/bank-builder` display gap:** ClimbHero shows the Step-1 status ("Step 1 · Paper · $0", restarted) but not
   the individual Wrobleski/Buehler review legs (it reads the daily-portfolio card, not the ladder review legs).
   The legs are in the artifact + `JULY21_BANK_BUILDER_RESTART.md`. Wiring them into ClimbHero is a follow-up.
3. **Top-10 "team" tab** still sourced only from the (empty) WC board — empty state, not broken. MLB fallback is a
   follow-up (`top10-picks.ts`).
4. **World Cup settlement** remains pending (no trusted 90' source).
