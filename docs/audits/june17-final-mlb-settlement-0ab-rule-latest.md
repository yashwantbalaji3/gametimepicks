# June 17 — Final June 16 MLB Settlement + 0-AB Void Rule

_Branch `june17-final-mlb-settlement-0ab-rule` off main `568fe72`. Re-run ~02:00 ET June 17.
Official MLB Stats API only._

## Official SF @ ATL status
gamePk **824912** (San Francisco Giants @ Atlanta Braves) is officially **"Suspended: Rain"
(codedGameState=U)**, `resumeDate=2026-06-17` — it resumes later today, **not Final**. (A separate
gamePk 824913 is the regularly scheduled June-17 game.) Per the suspended-game rule, legs tied to
this game stay **pending** — not fabricated.

## 0-AB / DNP void rule (implemented)
`pipeline/mlb/settle_mlb_results.py`: when a hitter is in a Final box score but recorded **no plate
appearance** (empty batting line, or AB=0 and PA=0 — a defensive sub / pinch runner), the hitter
prop now settles as **Void** (graded, refunded), never a win/loss. A batter with ≥1 PA grades
normally from the box score. The void result flows through the graders:
- `pipeline/grade_parlays.py`: `_MLB_OUTCOME_TO_RESULT` maps `Void → void`; `_grade_slip_status`
  **drops a void leg** from the parlay (`[void, win, win] → win`; all-void → push/refund).
- Tests added: `settle_mlb_results_test.test_zero_ab_void_rule` (Over 0.5 with 0 PA → void; AB>0 H=0
  → loss; AB>0 H=1 Under 1.5 → win; AB>0 H=2 → loss) and `grade_parlays_test.test_void_leg_drops_from_slip`.

## The 4 previously-pending optimizer slips
| slip | unresolved/void leg | game | outcome |
|---|---|---|---|
| Jase Bowen + Slater + Lewis + Rafaela | Bowen 0-PA (g823045 **Final**) | resolved | **WON** (Bowen voids → 3 winning legs) |
| Bryce Eldridge + Nico Hoerner | Eldridge (g824912 **suspended**) | not final | **pending** |
| Caratini(void) + Matt Olson + Kody Clemens + David Fry | Olson (g824912 **suspended**) | not final | **pending** (Caratini DNP voids; Olson keeps it pending) |
| Blake Dunn + James Wood + Eli White + Carter Jensen(void) | Eli White (g824912 **suspended**) | not final | **pending** (Jensen DNP voids; White keeps it pending) |

All six final-game players that were stuck "unresolved" (Bowen, Karros, Caratini, Jensen,
Higashioka, Mack) had **0 plate appearances** → correctly **voided**.

## Before / after (June 16 optimizer)
| | W | L | void legs | pending slips |
|---|---|---|---|---|
| Before (PR #502) | 5 | 47 | 0 (left unresolved) | 4 |
| **After** | **6** | **47** | 45 void prop legs | **3** |

One slip moved pending → **WON**; 3 remain pending solely because of the officially-suspended
SF @ ATL game. MLB validation leans: 262 W / 283 L / **45 Void**.

## Preservation (all intact)
- World Cup: team **10 W / 1 L**, player props **17 W / 33 L / 22 void**, WC cards 2 W, mixed 4 L.
- Bank Builder: Run #1 **$100 → $10,376.17 · 5–0 · completed**; Run #2 **settled · 0/2**; Run #3
  **evaluating / not launched** (no new run). UFC unchanged.

## Verification
`tsc` clean · **948 app tests pass** · MLB settle test + grade_parlays test (37) pass (incl. new
0-AB + void-drop tests) · build clean (196 pages). Copy + secret audits clean.

## Remaining pending & why
3 optimizer slips remain pending — each contains a player from the officially **suspended** SF @ ATL
game (gamePk 824912). They will settle once that game resumes and is Final.

## Next recommended task
Re-run `SETTLE_DATE=2026-06-16 SKIP_NBA=1 bash scripts/automation_settle.sh` after gamePk 824912 is
Final to clear the last 3 slips; then generate the June 17 slate.
