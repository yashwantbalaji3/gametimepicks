# Ladder Methodology v2 — Profit-Preserving Bank Builder + 3-Day Moonshot + Top 10 Board
*Shipped as PURE POLICY + DISPLAY (2026-07-05). The live settlement engine still runs v1 all-in;
v2 money mutation is intentionally NOT activated — see "Settlement changes required" below.*

## Why v2 (settled evidence, not theory)
- v1 rolls 100% of every win: July-3 proved the cost — a $700.78 Step-3 position died on one leg.
- Market reliability (canonical settled legs): **DC 8-0 · DNB strong · ML 8-2 (both losses knockout
  draw-traps) · totals 10-6 (recent losses all 90'-draw traps) · BTTS 1-3 · player props banned**.
- Card shape: **2-leg 12-7 vs 3-leg 2-2** (directional) — fewer, stronger legs.
- Odds bands: insufficient data (n≤12 per band) — no rule derived. Labeled insufficient.

## The v2 Bank Builder (7 steps, cash-out from Step 3) — `bankBuilderStepPolicy(step, roll, risk)`
| Step | Target× | Cash-out (of winnings) | Max legs | Band | Markets |
|---|---|---|---|---|---|
| 1 | 2.0 | — | 3 | standard | DC/DNB/ML/totals/BTTS |
| 2 | 3.5 | — | 3 | standard | DC/DNB/ML/totals/BTTS |
| 3 | 2.3 | **25%** | 2 | protected | DC/DNB/ML/totals (no BTTS from here) |
| 4 | 2.0 | **30%** | 2 | protected | DC/DNB/ML/totals |
| 5 | 1.8 | **35%** | 2 | safety-first | DC/DNB/ML |
| 6 | 1.6 | **40%** | 2 | safety-first | DC/DNB/ML |
| 7 | 1.5 | **40%** | 2 | safety-first | DC/DNB only |

Key rules (all unit-tested in `lib/methodology/ladder-policy.test.mjs`):
- **Safe under target**: min acceptable payout = 60% of the intended edge — an honest under-target
  card beats forcing a weak leg to hit the rung (the July-3 lesson).
- "Elevated" recent risk (fresh restart after stops) shaves targets ~10%.
- Cash-out + roll always reconcile exactly to the payout; extraction grows with the win
  ($700→$2,100 win at Step 3 ⇒ $350 banked, $1,750 rolls).
- No player props, ever. BTTS excluded from Step 3+. Reliability weights shared with the live
  survival selector (`MARKET_RELIABILITY`).

## Moonshot 3-day ladder — `moonshotLadderPolicy(day, roll, allowProps=false)`
Day 1 $25→$100 (4.0×) · Day 2 $100→$400 (4.0×) · Day 3 $400→$1,500 (3.75×). 3-6 legs, grouped by
game, team markets preferred, props only via explicit labeled opt-in, NO-PLAY days never forced.

## Model Top 10 Picks — `buildTop10Board(root, date, nowMs)`
Universal board (WC team markets + WC artifact-qualified props + MLB non-Pass leans). Ranking =
market-reliability × model probability + edge bonus — **never payout**. Props take a hard 0.5
reliability haircut (≈8% settled WC hit); MLB leans 0.7 (nightly-validated). Pregame only, no Pass
leans, ≤2 picks per game, every pick carries reason + risk + source artifact. Tabs: Top 10 / Safe /
Value / Team / Props on /today (home inherits). **The Bank Builder pool = this board's team-market
family** — same underlying picks, same reliability weights, so the products can never disagree.

## Settlement changes REQUIRED before v2 money activation (deliberately not done in this pass)
The v1 canonical model: won steps roll 100% (unrealized); a lost lane realizes −$100 seed; crown = Σ
banked ladder finals. v2 partial cash-out breaks three invariants at once:
1. `settle-daily-portfolio` must split a win into realized (`cashOut`) + rolled (`rollForward`) and
   write BOTH to the ledger event (new fields: `cashOut`, `rollForward`, `activeRisk`).
2. `forensic-money-audit` day-chain must accept mid-ladder realized profit (today it treats any
   non-seed realization as an error — that guard is load-bearing; it must learn the v2 event type).
3. `banked-ladders.json` needs a `partialExtractions[]` series so crown/HWM/drawdown stay derivable,
   and Mr. Dub's flagship must show extracted-profit separately from the active roll.
Activation checklist: implement behind a `LADDER_V2` flag → dry-run a full synthetic 7-step cycle →
extend forensic + idempotence gates → migrate pinned tests with the authoritative table → only then
run the first live v2 card. v1 history remains immutable throughout.
