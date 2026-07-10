# Paper Product Operation Audit (2026-07-09)

**Readiness to operate one internal paper slate.** Both previews are promotable; both operated cards will
settle **pending** today (07-09 has no committed finals in any source) — which is the honest, deterministic
outcome. No exposure, nothing public, official money untouched (md5 `affe6b21…`, 19-14, $0).

---

## Previews found

| product | path | status | promotable | legs | sports | markets |
|---|---|---|---|---|---|---|
| Bank Builder | `data/internal/product-previews/bank-builder/2026-07-09.json` | `founder_review` | **yes** | 2 | Soccer | double_chance |
| Moonshot | `data/internal/product-previews/moonshot/2026-07-09.json` | `founder_review` | **yes** | 4 | MLB | run_line, moneyline, total, batter_hits |

## Settlement source per leg

| product | leg | settlementSource | settleable **today**? |
|---|---|---|---|
| BB | France or Draw (DC) | api-football | **pending** — no committed 07-09 WC final |
| BB | Spain or Draw (DC) | api-football | **pending** — no committed 07-09 WC final |
| MS | PIT run line +1.5 | statsapi | **pending** — no committed 07-09 linescore |
| MS | TB moneyline | statsapi | **pending** — no committed 07-09 linescore |
| MS | Over 9 total | statsapi | **pending** — no committed 07-09 linescore |
| MS | Pete Crow-Armstrong hits o0.5 | statsapi | **pending** — 07-09 not in `settled_leans.jsonl` |

## Why everything is pending today (and that's correct)

07-09 is the live slate. Committed final sources cover only earlier dates:
- MLB linescores: `data/internal/mlb/linescores/2026-07-04…08` (no 07-09).
- MLB player-prop actuals: `settled_leans.jsonl` covers 2026-05-16…**07-08** (no 07-09).
- Soccer finals: `world-cup/settlement/2026-06-11…06-26` (no 07-09).

So settling the operated 07-09 cards with committed data yields **all-pending**, deterministically. Finals
are never fetched-and-committed for a live slate (volatile). Pending is **not** a loss.

## What is settleable now (for the extensions, tested on committed history)

- **MLB team markets** (moneyline/run_line/total) — already wired (committed linescore + tested rules).
- **MLB player props** — extendable: `settled_leans.jsonl` has per-prop `{gamePk, marketKey, playerName,
  line, actual, outcome}` → deterministic join by (gamePk, marketKey, player, line); grade via the
  canonical over/under rule on `actual`; DNP → unavailable.
- **Soccer** — extendable: `world-cup/settlement/<date>.json` has committed FT regulation `finals[]`
  `{match, homeGoals, awayGoals, status}` → deterministic double_chance / match_result / draw_no_bet /
  total_goals / BTTS on the FT score.

## Safety posture

| question | answer |
|---|---|
| Would any product create exposure? | **No** — `realExposure:0`, `active:false` |
| Is any preview/card public? | **No** — `public:false`, under `data/internal`, not web-served |
| Would official money be affected? | **No** — money-md5-guarded; paper units only |
| Is the full-game sim used to select legs? | **No** — `fullGameSimUsed:false` |
