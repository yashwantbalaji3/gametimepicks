# NBA Finals Featured Bank Builder Card — Official Settlement (2026-06-10)

## The exact card (from active-builder-slip / featured artifact)
- Event: NBA Finals Game 4 (Spurs @ Knicks, gameId 401859966)
- Stake: $211.85 paper · Combined odds +244 (3.44×) · Projected return $728.76
- Leg 1: **Stephon Castle REB Over 4.5** @ −130 (DraftKings)
- Leg 2: **OG Anunoby PRA Over 23.5** @ −106 (DraftKings)

## Official box-score grading (ESPN summary, settled_leans.jsonl)
| Leg | Final | Line | Result |
|---|---|---|---|
| Castle REB Over 4.5 | **5 REB** | 4.5 | **WIN** |
| Anunoby PRA Over 23.5 | **38** (33 PTS / 4 REB / 1 AST) | 23.5 | **WIN** |

**CARD RESULT: HIT ✓** — settled return $728.76, profit +$516.91 (paper).
`officialResultConfirmed: true`, `settlementSource: espn_summary_boxscore`.

## User's manual "hit" claim
**Confirmed by official data** — both legs cleared comfortably (Anunoby went off for 33).

## Accounting (tracked vs featured)
- `trackedLadder: false` — this is a **featured** paper card, shown separately on
  `/bank-builder`. It does NOT move the tracked bankroll.
- The tracked ladder's June 10 rung settled on the official MLB Builder pick
  (Rengifo + Bregman) → WIN → $211.85 → $444.19. See the featured-card policy doc.

## Public display
Show the featured card prominently as **"Card hit"** with the official final stats and
the paper return, clearly labeled featured/paper and "not part of the tracked ladder."
