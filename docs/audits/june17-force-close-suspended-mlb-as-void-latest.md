# June 17 — Force-Close Suspended June 16 MLB Legs as No-Action (Void)

_Branch `june17-force-close-suspended-mlb-as-void` off main `359352e`. ~11:25 ET June 17. Official
MLB Stats API only — no fabricated stats._

## 1. Official MLB status — gamePk 824912
San Francisco Giants @ Atlanta Braves: **`abstractGameState=Live`, `detailedState="Suspended:
Rain"`, `codedGameState=U`, `resumeDate=2026-06-17`** (3–2, 2nd inning). Officially **suspended, not
Final**. (If it had flipped to Final, the rule does NOT apply — it would settle normally; it had not.)

## 2. Why the rule is applied
The game was suspended by rain and resumes on a later day. We close the **original June 16 paper
slate** rather than carry stale pending cards forever. The eventual resumed game can be regenerated
as its own dated slate later with fresh context. This is an administrative no-action rule — **not a
fabricated result**; the suspended-game stats are never used to grade the old June 16 cards.

## 3. The rule (implemented)
`pipeline/mlb/settle_mlb_results.py` — new `--void-suspended` flag + `_is_suspended()`. When set,
every leg tied to an officially suspended/postponed (non-Final) game settles as **Void** (outcome
`Void`, `voidReason: "officially suspended/rescheduled — no action for the original slate"`,
graded:True) for the original date — never win/loss/pending. A **Final** game still grades normally
and is never voided. Downstream (`grade_parlays.py`, from the 0-AB PR): `Void → void`; a void leg
**drops from the parlay** (`[void, win, win] → win`; `[void, loss] → loss`; all-void → push).

## 4. Affected legs & slips
44 SF @ ATL (824912) prop legs → **Void** (no-action). The 3 formerly-pending optimizer slips:
| slip (remaining decisive legs) | suspended leg voided | result |
|---|---|---|
| Bryce Eldridge(void) + Nico Hoerner(win) | Eldridge | **WIN** |
| Caratini(void) + Matt Olson(void) + Kody Clemens(win) + David Fry(win) | Olson | **WIN** |
| Blake Dunn(win) + James Wood(win) + Eli White(void) + Carter Jensen(void) | White | **WIN** |

(Other slips that contained an SF @ ATL leg AND an already-losing leg correctly stay **LOSS** — the
void doesn't rescue a slip with a real loss.)

## 5. Before / after (June 16 optimizer)
| | W | L | pending |
|---|---|---|---|
| Before | 6 | 47 | 3 |
| **After** | **9** | **47** | **0** |

Legacy parlay snapshots also **0 pending** (2 W / 16 L). **No June 16 pending items remain.** No
`needs_review`. No push/void slips (all 3 resolved to wins on their remaining legs).

## 6. Preservation (intact)
- World Cup: team **10 W / 1 L**, player props **17 W / 33 L / 22 void**, WC cards 2 W, mixed 4 L.
- Bank Builder: Run #1 **$100 → $10,376.17 · 5–0 · completed** · Run #2 **settled · 0/2** · Run #3
  **evaluating / not launched**. UFC unchanged. 0-AB void rule intact. No new Bank Builder run.
- **No June 17 slate generated.**

## 7. Verification
`tsc` clean · **948 app tests pass** · MLB settle test (incl. new suspended-detection) + grade_parlays
(37) python tests pass · build clean (196 pages). Copy + secret audits clean.

## 8. No fabrication / resumed game
No SF @ ATL box-score stats were used to grade the June 16 cards — the legs are voided (no-action).
When gamePk 824912 resumes and is Final, it can be regenerated/settled as its own resumed-date slate.

## Next recommended task
Comprehensive methodology/process redesign, then June 17 slate generation.
