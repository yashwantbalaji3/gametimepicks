# June 16 — Full Official Settlement Audit

_Settled June 17 ~01:15 ET. Branch `june17-settle-june16-slate` off main `0570d64`. Official sources
only — no fabrication._

## 1. Settlement time & sources
- World Cup finals: **API-Football** `/fixtures` (operator-verified official-scores artifact
  `world-cup/settlement/official-scores-2026-06-16.json`).
- World Cup player props: **API-Football** `/fixtures/players` (per-player stats, matched by player id)
  + `/fixtures/events` (goals).
- MLB: **MLB Stats API** box scores (via the existing `automation_settle.sh` orchestrator).

## 2. World Cup fixture finals (official, 90-minute)
| Fixture | Final |
|---|---|
| France vs Senegal | **3–1** |
| Iraq vs Norway | **1–4** (Norway) |
| Argentina vs Algeria | **3–0** |

(Austria vs Jordan was scheduled but never odds-backed / in focus, so nothing references it.)

## 3. World Cup team-market settlement (11 graded · 10 W / 1 L)
All moneyline / double-chance / draw-no-bet picks **WON** (France, Norway, Argentina all won).
The two BTTS "No" picks: **lost** on Iraq 1–4 Norway (both scored), **won** on Argentina 3–0
(Algeria didn't score). Extended `pipeline/world_cup/settle.py` to grade the 1X2 double-chance
codes, draw-no-bet (draw → void), and BTTS — previously only moneyline graded.

## 4. World Cup player-prop settlement (72 props · 17 W / 33 L / 22 void)
New `pipeline/world_cup/settle_player_props.py` grades anytime-goalscorer + shots-on-target by exact
API-Football **player id** match. Highlights: Messi hat-trick (3 goals) → goalscorer WON; Mbappé
2 goals / 4 SOT → WON. **22 void** = players in the sportsbook's predicted XI who did not feature
(DNP) — never counted as a loss. **0 needs_review** (all matched officially).

## 5. World Cup suggested cards (2 · both WON)
Both double-chance cards (Norway/Argentina/France or Draw) WON.

## 6. MLB settlement
`automation_settle.sh --date 2026-06-16` (MLB Stats API): leans/optimizer/parlays/curated graded.
**Optimizer slips: 5 W / 47 L / 4 pending** (one late game still in progress — left pending, never a
loss; re-run later for full settlement). Daily + model audits refreshed.

## 7. Mixed cross-sport cards (4 · all LOST)
All four mixed cards shared the MLB leg **Alec Burleson · HRR Over 1.5**, which **lost** (1 < 1.5,
official box score), so all four cards lost regardless of their World Cup leg.

## 8. Bank Builder state verification (unchanged)
- Run #1: **$100 → $10,376.17 · 5–0 · completed** (preserved).
- Run #2: **settled / closed · 0/2 advanced** (preserved).
- Run #3: **not launched** — V2 `evaluating`. No Run #3 artifact. No new lanes created this task.

## 9. Unsettled / void / needs-review
- 22 World Cup player props **void** (DNP — official, source-confirmed).
- 4 MLB optimizer slips **pending** (one late game still in progress at settlement time).
- No `needs_review` items.

## 10. Hindsight note (transparency)
The V2-eligible legs that Run #3 was blocked from using (Argentina-or-Draw, Norway-or-Draw, etc.)
all WON, and Argentina moneyline (rejected by V2) also won (Argentina 3–0). The block was still
correct on its own terms: at evaluation time the upcoming slate had too few independent games to
form two non-correlated lanes. Survival ≠ outcome.

## 11. Verification
- `tsc` clean · **948 app tests + 11 WC settle python tests pass** (new grader + settlement tests) ·
  build clean (196 pages). Results shows June 16 finals; Today (June 17) shows June 16 as settled,
  not active pending (date-gated). Copy + secret audits clean.

## 12. Next recommended task
Re-run the MLB settlement once the final late game completes (clears the 4 pending optimizer slips).
Then generate the June 17 slate when ready.
