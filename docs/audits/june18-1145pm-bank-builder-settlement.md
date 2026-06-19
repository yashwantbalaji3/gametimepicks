# June 18 11:45 PM ET — Bank Builder official settlement pass

_Branch `june18-1145pm-bank-builder-settlement` off main `2c7e8153` (#526). Audit at 11:48 PM ET (2026-06-19 03:48 UTC)._

## Settlement audit (official)
| lane | step | leg | market | event | start (UTC) | status | official result | source | action |
|---|---|---|---|---|---|---|---|---|---|
| A | 1 | Mexico (draw no bet) | draw_no_bet | Mexico vs South Korea | 01:00 (Jun 19) | **Final** | **Mexico 1–0** (Romo 50′) — regulation win | ESPN fifa.world | **WON** |
| A | 1 | Juan Soto Hits Over 0.5 | batter_hits | NYM @ PHI (gamePk 823448) | 22:41 | **Final** | **2-for-4, 2 H** (PA 5) | MLB Stats API | **WON** |
| B | 2 | Switzerland moneyline (90′) | moneyline_90 | Switzerland vs Bosnia | 19:00 | **Final** | **Switzerland 4–1** — regulation win | ESPN fifa.world | **WON** |
| B | 2 | Paul Goldschmidt H+R+RBI Over 1.5 | hits_runs_rbis | CWS @ NYY (gamePk 823533) | 23:06 | **Final** | **AB 4, H 1, R 0, RBI 0 → HRR = 1** (batting 2nd) | MLB Stats API | **LOST** |

> Note: a first WebFetch summary reported Goldschmidt absent (DNP). A **direct MLB Stats API box-score read** corrected this — Goldschmidt played (batting order 200, 4 AB, 1 H, 0 R, 0 RBI). HRR = 1 ≤ 1.5 → **loss, not a void**. "Do not assume — official sources only."

## Lane outcomes
- **Lane A Step 1 — WON** (both legs win). $100 → **$197.88** rolls to Step 2. Lane **advances**; Step 2 = **awaiting next qualified pre-event card** (no June 19 slate generated yet — `2026-06-19` projections/odds absent; no fabrication). Lane A stays public.
- **Lane B Step 2 — LOST** (Switzerland won, but Goldschmidt HRR 1 ≤ 1.5; a parlay needs both). Lane **stops** at Step 2, realizes its original **$100** paper stake, **hidden** from the public Bank Builder, queues a fresh **$100** restart (awaiting next qualified pre-event card).

## Mr. Dub paper accounting (ladder model: won step rolls $0; lost step realizes −$100 original stake)
| metric | before | after |
|---|---|---|
| bankroll | $10,276.17 | **$10,176.17** (Lane B Step 2 −$100; Lane A win rolls $0) |
| open exposure | $200 | **$0** (Lane A advanced/awaiting + Lane B stopped — no card currently placed) |
| record (W-L-V-P) | 7-1-0-2 | **8-2-0-0** (Lane A Step 1 won; Lane B Step 2 lost; 2 pendings resolved) |
| settled profit / ROI | $10,176.17 / 101.76x | **$10,076.17 / 100.76x** |

## Paths / state
- **Active artifact** (non-protected): `app/public/data/methodology/launch/dual-bank-builder-active.json`.
- **Protected history** (immutable): `app/public/data/bank-builder/*` (the completed $100 → $10,376.17 crown).
- **Public Bank Builder:** Lane A advanced (Step 1 cleared WON, Step 2 awaiting next card); Lane B = queued $100 starting path (no failure/loss copy shown).
- **Mr. Dub:** full truth — Lane A Step 1 won (rolled), Lane A advanced/awaiting, Lane B Step 1 won (rolled) + Step 2 lost + restart queued, plus prior history.
- **Results:** add a Bank Builder settled-steps block (Lane A Step 1 WON, Lane B Step 2 LOST) with leg results + official source.

## Settlement sources
- World Cup 90-minute regulation result: **ESPN `soccer/fifa.world` scoreboard** (API-Football has no 2026 finals).
- MLB box scores: **MLB Stats API** `/game/{gamePk}/boxscore` + `/feed/live` (status Final).

## Guards
- No fabrication (every result from ESPN fifa.world + MLB Stats API, Final only). No banned copy. Protected `public/data/bank-builder/*` untouched. Only the active engine artifact + Mr. Dub + Results data updated.
