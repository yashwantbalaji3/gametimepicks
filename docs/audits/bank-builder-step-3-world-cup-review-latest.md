# Bank Builder — Step 3 World Cup Review (2026-06-11)

**Decision: DECLINE. No World Cup card cleared. Bank Builder stays pending at $728.76, Step 3/5,
target $2,000.** Paper-only / educational. No bankroll, ledger, or data mutation.

## MLB candidate removal
There was no published MLB Bank Builder candidate to remove — the prior MLB review already declined
and left Step 3 pending (`nextPick` absent). Confirmed: bankroll $728.76, Step 3, no MLB card on the
public Bank Builder slot. ✓

## Tonight's World Cup fixtures (real data)
Two fixtures with projections: **Mexico vs South Africa** (matchId 1489369) and **South Korea vs
Czechia** (1538999). Player props for both are `pre_lineup_likely` (lineups not posted) →
**barred from Bank Builder by default** (no pre-lineup props). So only parlay-eligible **team
markets** were considered.

## Eligible team legs (only 3, real DraftKings/Odds-API prices)
| Leg | Match | Market | Odds | Model | Market | Edge | Risk |
|---|---|---|---|---|---|---|---|
| South Africa or Draw | MEX v RSA | Double chance | +195 | **36%** | 32% | +3.8% | High |
| South Korea or Czechia | KOR v CZE | Double chance | −270 | **71%** | 68% | +2.8% | Low |
| Over 2.5 goals | KOR v CZE | Total goals | +125 | **45%** | 43% | +2.0% | High |

Only **one** leg is Bank-Builder-grade (South Korea or Czechia DC, model 71%, market-agreed, Low
risk). The other two have model probabilities of **36% and 45% — the model favors them to lose** —
disqualified for the flagship ladder.

## Why no card clears
- **Single solid leg alone** (−270): returns **$998.40** on $728.76 — far short of the $2,000 target.
- **Two-leg combos:**
  | Card | Combined | Return | Combined model prob | Problem |
  |---|---|---|---|---|
  | SKorCZE + SAorDraw | +304 | $2,945 | **26%** | overshoots target; pairs a 36% leg |
  | SKorCZE + Over 2.5 | +208 | $2,245 | **32%** | **same match → correlated** (DC + Over) |
  | SAorDraw + Over 2.5 | +564 | $4,800 | 16% | two losing-model legs |
- Every path to ~$2,000 requires either a sub-50%-model leg or a same-match correlated pairing.
  Risking the entire $728.76 ladder (2–0 record) on a **26–32% combined model probability** card is
  exactly the "force a weak/correlated card to hit the payout" the gates forbid.

## Correlation review
The only near-target two-leg card (SKorCZE DC + Over 2.5) draws **both legs from the same Korea vs
Czechia match** — double chance on the favorite + Over 2.5 goals are match-script correlated, and it
violates the one-leg-per-match rule. Rejected.

## Market / lineup review
Team markets (moneyline / double chance / total goals) are live from real books; corners are not
priced for these fixtures. All player-prop markets are pre-lineup (`pre_lineup_likely`) and barred.
No model-only or pending-market leg was considered.

## Outcome
Decline. Bank Builder Step 3 stays **pending at $728.76**. A candidate publishes only when a
genuinely high-confidence card that fits the Step-3 window clears — not before.

## UI cleanup (2026-06-11)
The /bank-builder page now prioritizes the $728.76 Step-3 ladder and moves the separate +100
"$100 educational builder" into a clearly-labeled, visually-distinct section (PR #446). No
bankroll/step/ledger/pending change.
