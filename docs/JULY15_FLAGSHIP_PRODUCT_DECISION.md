# July 15 Flagship Product Decision

Money locked `affe6b21`, exposure $0. Products activate only with today-dated, settlement-supported, eligible
legs — otherwise honest **No Play**.

## Today's slate
- **World Cup:** England vs Argentina (semifinal, 2026-07-15, 3:00 PM ET).
- **MLB:** none — All-Star break (0 games). Confirmed via StatsAPI + refresh.

## Candidate legs found (from today's WC team markets — the ONLY product-eligible source today)
The daily paper candidate pool generated eligible **team-market** legs from England vs Argentina:
- Draw No Bet — England
- Total Goals — Under 2.5
- Both Teams To Score — No

All are **supported** markets (`match_result` / `double_chance` / `draw_no_bet` / `total_goals` / `btts` are
settlement-supported + product-eligible), today-dated, real de-vigged odds. **$0 placed** (paper candidate pool).

## Rejected (correctly excluded)
- **WC player props** (anytime scorer / shots / SOT / assists) — settlement pending (no 2026 stats plan) →
  product-ineligible. Not placed.
- **MLB anything** — no games today (All-Star break).
- **Internal model outputs** (soccer engine, MLB full-game / pitcher-v1 / bullpen-v1) — internal-only, not adopted,
  product-ineligible.

## Bank Builder — NO PLAY
No operator-approved card exists for 2026-07-15 (`bank-builder-approved.json` absent for today). Bank Builder lane
shows **awaiting** (0 legs, $0 placed). A card is **not forced** — it needs operator approval. Correct No Play.

## Moonshot — NO PLAY (stopped), with an eligible paper candidate pool
The public Moonshot ladder (`moonshot-lane/active.json`) is **status: stopped, exposure $0** — No Play. The daily
pool holds eligible team-market candidates (above) at **$0 placed**; nothing is activated. No settlement-pending
prop is **placed** in any active product.

## Money / exposure — UNCHANGED
`portfolio.json` md5 `affe6b21`, open exposure $0, active bankroll $19,065.40, crown $20,465.40, record 19-14.
No public product card changed to an active/placed bet.

## Verdict
**Both flagship products = honest No Play** (Bank Builder awaiting an approved card; Moonshot stopped). Today's
only eligible legs are WC team markets sitting in the paper candidate pool at $0 — the operator can approve a
Bank Builder card or Moonshot activation from them if desired, but nothing was force-activated. That is the honest,
public-ready state: current slate, real eligible legs available, no fake cards, no settlement-pending props placed.

## Residual — stopped-ladder candidate cosmetics
The stopped Moonshot ladder's informational `candidates` array still lists a settlement-pending goalscorer prop
(paper, not placed, ladder is No Play). Not a placed leg; flagged for a future cosmetic cleanup so a stopped
ladder never *displays* a settlement-pending candidate.
