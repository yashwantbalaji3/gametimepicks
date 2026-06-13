# Bank Builder Step 5 — Candidate Replacement Review (June 13, 2026)

**Baseline SHA:** 693face · branch `june13-step5-candidate-replacement` · ~18:20 ET June 13.
**State (UNCHANGED):** bankroll $3,623.97 · record 4–0 · Step 5/5 · target $10,000+. Candidate **pending**, no settlement, no bankroll/ledger mutation.

## User concern
The owner dislikes the **Victor Wembanyama Rebounds Under 11.5** leg: believes the Spurs may win Game 5 with Wembanyama central — a script in which his rebounds go *over*, busting the Under. The Under was a bet *against* the most likely outcome. Re-open the selection; replace it only if a real, model-supported alternative clears the gates.

## Incumbent (PR #474 benchmark)
1. Wembanyama Rebounds **Under** 11.5 @ −122 (DK) — model 0.7195, market 0.5495, edge 20.5%
2. Kyle Freeland Strikeouts Under 4.5 @ −145 (DK) — model 0.708, market 0.5918, edge 11.6%
Combined +207 · $11,142.32 return · combined model **0.5094**. Fragile leg: #1 leans against a Spurs-win script.

## Boards reviewed (real, server-cron board 2026-06-13 15:17 UTC; 196 NBA + 704 MLB recommendations)
A local NBA re-run was deliberately **not** executed — the known local board-scoring regression (0 game-log samples → No Play) would overwrite the server board's real recommendations. The server board carries current DraftKings/FanDuel odds; selection uses those.

### NBA Finals Game 5 (NY @ SA) pool — top model-supported legs
| Leg | Odds | Model | Edge | Script tag | Verdict |
|---|---|---|---|---|---|
| Wembanyama REB **Under** 11.5 | −122 | 0.720 | 20.5% | leans vs Spurs win | **DISFAVORED — dropped** |
| **Miles McBride PTS Over 2.5** | **−128** | **0.711** | **18.6%** | neutral / robust low line | **SELECTED** |
| Mikal Bridges PTS Over 10.5 | −120 | 0.707 | 19.7% | Knicks starter (blowout risk) | runner-up |
| Devin Vassell REB Over 4.5 | −143 | 0.705 | 15.3% | Spurs-positive | runner-up |
| Wembanyama PRA Under 43.5 | −112 | 0.691 | 19.7% | also leans vs Spurs | rejected (same concern) |
| Wembanyama 3PM Over 1.5 | −180 | 0.668 | 6.5% | Wemby-positive | rejected (weak edge, short odds) |

### MLB June 13 pool — Freeland retained
Freeland Strikeouts Under 4.5 (model 0.708, probable starter, no lineup risk) remains a top MLB leg and pairs cross-sport with zero correlation. Cantillo (in-play earlier) and batter props (lineup risk) were already excluded in PR #474. No stronger replacement cleared, so Freeland stays.

## Replacement pairs (all ≥ +176 / $10,000)
| Option | NBA leg | Combined model | Odds | Return |
|---|---|---|---|---|
| **A (chosen)** | McBride PTS Over 2.5 | **0.503** | **+201** | **$10,907.06** |
| B | Bridges PTS Over 10.5 | 0.501 | +210 | $11,225.98 |
| C | Vassell REB Over 4.5 | 0.499 | +187 | $10,405.26 |
| D (incumbent) | Wembanyama REB Under 11.5 | 0.509 | +207 | $11,142.32 |

## Decision: **REPLACE** → McBride Points Over 2.5 + Freeland Strikeouts Under 4.5
- **+201 · $3,623.97 → $10,907.06 · profit +$7,283.09 · combined model 0.503 · combined market 0.332.**
- Selection Rule 1 (prefer a replacement avoiding the disfavored leg when it still reaches $10K+ with strong model/edge/correlation/real odds) is satisfied: McBride clears all — model 0.711, edge 18.6%, zero cross-sport correlation, real FanDuel odds, $10,907 ≥ $10,000.
- Why McBride over Bridges/Vassell: **highest model probability among non-disfavored legs (0.711)** and the most **script-robust** (a 2.5-point line for a rotation guard hits in essentially any game flow — it does not depend on the Knicks staying close, unlike Bridges' 10.5, nor on a specific Spurs rebounding split, unlike Vassell). It is **neutral**, not a bet *against* the Spurs or Wembanyama — directly resolving the owner's concern.
- Incumbent had a marginally higher combined model probability (0.509 vs 0.503, ~0.6pp) but **leaned against the most likely game script**; the ~0.6pp edge does not justify keeping a fragile against-the-grain leg when an acceptable replacement exists (Rule 5).
- **Not** forced toward a Wembanyama-positive/Spurs-positive leg for the owner's narrative — the model chose the strongest valid leg, which happens to be script-neutral.

## Correlation review
Cross-sport (NBA Game 5 points vs MLB pitcher strikeouts), different games → correlation ≈ 0. No same-game stacking. A 2-NBA structure was available but rejected: lower combined model quality and it would concentrate both legs in one game script.

## Integrity
Pending only. Bankroll $3,623.97 / record 4–0 / Step 5/5 untouched. No settlement, no ledger entry, no fabricated odds/props/probabilities. No banned copy.
