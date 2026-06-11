# Bank Builder — Step 3 MLB Review (2026-06-11)

**Decision: NO card cleared. Bank Builder stays pending at $728.76, Step 3/5, target $2,000.**
This is paper-only / educational tracking, not betting advice. The bankroll was NOT mutated.

## Current state
- Bankroll: $728.76 · Step 3/5 · Target $2,000 · Record 2–0 · nextPick: none.
- Slate reviewed: 2026-06-11 MLB board (real — `isDemo: false`, schedule = mlb-statsapi, odds =
  the_odds_api/DraftKings, generated 2026-06-11). 8 games, 384 leans.

## Method (real data only)
For all 384 leans I computed last-5 and last-10 hit rates from each lean's `recentSeries` values vs
its line + leaned side, alongside the model probability, market-implied probability, edge, odds
(DraftKings), and confidence already in the artifact. Bank-Builder markets only (batter hits /
total bases / hits+runs+RBIs / pitcher strikeouts). No values were invented.

## What the slate supports
- 43 "BB-grade" legs (High confidence, L5≥60% & L10≥70%, model ≥58%, positive edge, sane odds).
- The strongest-edge legs are heavy Unders with **implausibly large edges** (e.g. Corey Seager
  Hits Under 1.5 @−238, model 88% vs market 70% = +17.9% edge) — the overprojection / market-sanity
  red flag. Rejected: a −238 favorite does not carry an 18% real edge.
- Applying market-sanity gates (modest edge 2–12%, model AND market agreement ≥60%, L5&L10 ≥80%)
  leaves only **4 legs** — and **3 of them are in the same game (CHC @ COL)**, leaving just one
  separate-game anchor (Jimmy Crooks, STL @ NYM).

### The 4 sanity-gated legs
| Player | Game | Market | Pick | Odds | Model | Market | Edge | L5 | L10 |
|---|---|---|---|---|---|---|---|---|---|
| Nico Hoerner | CHC@COL | Hits+Runs+RBIs | Under 2.5 | −168 | 70% | 63% | +7.0% | 100% | 90% |
| Moisés Ballesteros | CHC@COL | Total Bases | Under 1.5 | −151 | 68% | 60% | +7.5% | 80% | 90% |
| Jimmy Crooks | STL@NYM | Hits+Runs+RBIs | Under 1.5 | −167 | 71% | 63% | +8.6% | 80% | 83% |
| Hunter Goodman | CHC@COL | Hits+Runs+RBIs | Over 1.5 | −156 | 68% | 61% | +7.1% | 80% | 80% |

## Why no two-leg card clears (the core finding)
To reach the Step-3 target (~$2,000 return on $728.76 ≈ **+174** combined), each leg must be ~−150.
Best cross-game pairs (different games, no correlation):

| Pair | Combined | Return | Profit | **Combined model prob** |
|---|---|---|---|---|
| Crooks + Hoerner | +155 | $1,858.68 | +$1,129.92 | **~50%** |
| Crooks + Goodman | +162 | $1,912.03 | +$1,183.27 | **~48%** |
| Crooks + Ballesteros | +166 | $1,936.76 | +$1,208.00 | **~48%** |

**Every target-hitting pair has only ~48–50% combined model probability** — the model rates the
two-leg card at roughly a coin flip *or worse*. Meanwhile, the only way to raise combined
confidence is to stack heavy −238 favorites, which combine to **negative odds (~$1,400 return)** —
short of the $2,000 target. The payout target and acceptable confidence are mathematically
incompatible on this slate.

Risking the entire $728.76 ladder (2–0 record) on a sub-coin-flip parlay is exactly the
"forcing weak legs to hit the payout" the gates forbid. → **Decline. Stay pending.**

## Honest limitations (also reasons for declining)
1. **Recent form is a weekly-spaced 10-game sample** (dates 04-14 … 06-05, ~weekly), not true
   consecutive last-5/last-10 game logs — so "L10 90%" is a sampled rate, not a strict last-10.
2. **Confirmed tonight lineups/availability are not in the current artifacts** — Under-hit/HRR legs
   require the listed starter to actually play; unverifiable here.
3. **Single cross-game anchor** (Crooks) — no diversified high-confidence cross-game pair exists.

## Outcome
- No Bank Builder candidate published. Bankroll **$728.76**, Step 3, unchanged. The public
  `/bank-builder` page continues to show the pending state. A candidate publishes only when a
  genuinely high-confidence two-leg card that fits the Step-3 window clears the gates.
