# Bank Builder V2 Methodology (canonical)

_Gate code: `pipeline/daily/bank_builder_v2_eligibility.py`. Companion: `bank_builder_v2_eligibility.md`._

Bank Builder is **not** a normal parlay generator. Parlay Lab can surface good edges across the risk
spectrum; Bank Builder may only use **elite, low-fragility, high-data-quality** legs. After Run #2
went 0/2 on volatile single-player props, V2 scores every candidate on a **survival score** and
refuses to launch unless the slate genuinely supports two strong, independent lanes.

## Survival-first, opportunity-first, role-aware
A leg's survival score (0–100) rewards low-variance team markets and penalizes single-player
variance, unconfirmed-lineup (DNP) risk, longshots, and poor data quality. Eligible ≥ 80. This is
the **risk/fragility** lens from `methodology/risk.ts` applied to Bank Builder.

## Launch policy
- **Two independent lanes**, 2 legs each, no shared leg; lanes should be **game-disjoint** where the
  slate allows (correlated lanes defeat running two).
- Every leg must be **upcoming, odds-backed, non-fragile**, and clear the survival gate.
- **No started/suspended games.** A started game is excluded; a suspended/postponed game is
  no-action (void) for the original slate.
- Prefer ≥1 World Cup leg per lane when the slate supports it.

## Why a winning-looking pick can be rejected (transparency)
- **Argentina moneyline** (−240, ~66% model) was **rejected** (survival ~59): a moneyline has no
  draw cover, so it is more fragile than **Argentina-or-Draw** / **Argentina draw-no-bet**
  (survival 92 / 84), which cover the draw. Argentina won 3–0, so the ML *would* have cashed — but
  the gate scores **pre-game fragility, not the outcome**. Survival ≠ result.
- V2 can **block even a slate full of winning-looking favorites** when they're too few independent
  games to form two non-correlated lanes, or too short-priced to build a meaningful return without
  adding a fragile leg.

## Settlement rules that protect the ladder
- **0-AB / no-PA hitter prop → void** (DNP), never a loss/win.
- **Suspended/rescheduled game → no-action (void)** for the original slate; the resumed game can be
  regenerated later as its own dated slate. (See the settlement runbook.)

## Preserved history (never mutated)
Run #1 ($100 → $10,376.17, 5–0, completed); Run #2 (settled/closed, 0/2); Run #3 (evaluating / not
launched). No new run is launched without an explicit task and a passing gate.
