# Stepped Settlement Engine + Lane B Settlement (pre-Algeria)

**Date:** Monday June 22 2026, ~10:47 PM ET (Jordan/Algeria kicks 11 PM). **Branch:** `pre-algeria-settlement-engine-june23-polish` (off `origin/main` `b2513658`, PR #561).
**Scope:** build a correct STEPPED Bank Builder settlement engine, settle **Lane B Step 1 WON** from official results, keep **Lane A pending** (Algeria not final). Crown / Moonshot / Specials untouched.

## Phase 1 — official status (API-Football, verified)
Argentina **2-0** Austria FT · France **3-0** Iraq FT · Norway **3-2** Senegal FT · Jordan/Algeria **NS** (11 PM). June 23 all NS. → Lane B fully final; Lane A's Algeria leg not final.

## Settlement engine (new)
`pipeline/settlement/settle_stepped_bank_builder.py` — grades the CURRENT stepped cards (`run.laneX.steps[].legs`), which the legacy `settle_active_dual_bank_builder.py` cannot (it only grades double-chance/MLB on the legacy top-level `lane.legs`). Pure, unit-tested graders: WC **moneyline_90** (team must win), **match_total_goals** (Over/Under vs final total; exact integer line → void), **double_chance** ("X or Draw"), **draw_no_bet** (win/void/loss). Re-fetches official FT scores from API-Football (never hardcoded). Dry-run-first; `--lane lane-a|lane-b|all`; only settles a card when all its legs are final.

**It never computes the bankroll itself** — after writing graded leg/step results into the non-protected `dual-bank-builder-active.json`, the portfolio is rebuilt by the existing, tested `app/scripts/build-mr-dub-ledger.mjs` (the single accounting convention). It never touches the protected crown (`public/data/bank-builder/*`) or Moonshot/Specials.

## Lane B dry-run → APPLY
Dry-run: **Lane B Step 1 CARD WON** — Argentina ML WON (`Argentina 2-0 Austria (FT)`) + Under 3.5 WON (`France 3-0 Iraq (FT)` → 3 < 3.5). Lane A dry-run: **PENDING** — Egypt ML WON, Algeria PENDING (`Jordan 0-0 Algeria (NS)`).
Applied `--apply --date 2026-06-22 --lane lane-b` → wrote Lane B Step 1 `settled/won`, legs hit + official, `laneStatus advanced`; Lane A untouched (still pending). Rebuilt the portfolio via `build-mr-dub-ledger.mjs`.

## Payout formula + bankroll before/after (existing convention)
Lane B Step 1: stake **$100**, combined **+177** → decimal 2.7711 → payout **$277.11**. Both legs WON → card WON. Per the project's rolling-ladder convention (`build-mr-dub-ledger.mjs`): **a WON step ROLLS** ($100 → $277.11 rides toward the next rung) — realized P/L **$0** (unrealized until the lane completes/stops), so `currentBankroll = crownFinal + dualRealized` is **unchanged**; the $100 Lane B seed is **released** from open exposure; record **+1 win**.

| field | before | after |
|---|---|---|
| active bankroll | $10,176.17 | **$10,176.17** (unchanged — won rolls) |
| core open exposure | $200 | **$100** (Lane B seed released) |
| total exposure | $200 | **$100** |
| core record | 8-2-0-2 | **9-2-0-1** |
| Lane B Step 1 | pending | **settled WON** (advanced) |
| Lane A Step 3 | pending | **pending** (Algeria NS) |
| crown | $10,376.17 / 5-0 | **$10,376.17 / 5-0 (untouched)** |
| moonshot | stopped 0-1 / $0 | **stopped 0-1 / $0 (untouched)** |
| specials | 0-0 / $0 | **0-0 / $0 (untouched)** |

## June 23 readiness (inherited from #561, still live)
`/world-cup` (Portugal/Uzbekistan, England/Ghana, Panama/Croatia, Colombia/DR Congo) · `/picks` June-23 Parlay Lab · `/world-cup-specials` 5 June-23 candidates · `/moonshot` June-23 candidates Lane A +1044 / Lane B +1715 **ready, $0 exposure** (not activated — no place-exposure flow). `/mr-dub` + `/bank-builder` now show Lane B WON; Lane A pending. Header reads "Latest slate · Jun 23 · Pregame slate."

## Verification
- **Tests:** 1221 / 1221 — 7 new Python grader tests (`pipeline/settlement/settle_stepped_bank_builder_test.py`) + 25 JS tests reconciled to the post-settlement state (9-2-0-1, exposure $100, Lane B WON; bankroll $10,176.17 + crown $10,376.17 kept). **tsc:** clean. **`next build`:** clean.
- **Audits:** no banned copy; `.env` untracked / no secrets; **protected crown (`bank-builder/*`) + `results/` untouched**; the changed data is the authorized official settlement (dual artifact + mr-dub portfolio/ledger/daily-summary). Built static HTML confirms `/bank-builder` shows "Argentina 2-0 Austria" + "France 3-0 Iraq" and `/mr-dub` shows 9-2.
- **Browser QA (mobile 375):** `/mr-dub` bankroll $10,176.17 / crown $10,376.17 / exposure $100 / record 9-2; `/bank-builder` Lane B WON (collapsed cleared step) + Lane A pending; zero overflow; console clean.

## Post-Algeria follow-up command (after Jordan/Algeria is officially FINAL)
```
pipeline/.venv/bin/python -m pipeline.settlement.settle_stepped_bank_builder --dry-run --date 2026-06-22 --lane lane-a
# inspect: Egypt ML WON + Algeria ML graded from the official FT score
pipeline/.venv/bin/python -m pipeline.settlement.settle_stepped_bank_builder --apply --date 2026-06-22 --lane lane-a
node app/scripts/build-mr-dub-ledger.mjs   # rebuild portfolio
```
Do NOT run `--apply --lane lane-a` until Jordan/Algeria status is FT.

## Deliberately NOT changed
- Lane A not settled (Algeria NS — leave pending until official final).
- No Moonshot exposure activated (June-23 candidates stay "ready", $0 — no place-exposure flow yet).
- Bankroll value unchanged (won step rolls — the project convention; not a bug).
- Crown / Moonshot / Specials / June-23 data — untouched.
- Old `settle_active_dual_bank_builder.py` left in place (not used for stepped artifacts) — superseded by the new engine.

## Remaining backlog
1. After Jordan/Algeria FT: settle Lane A via the engine (above command).
2. Moonshot place-exposure flow + accounting tests so "ready" candidates can activate.
3. Generate MLB June-23 board if wanted; persist Specials history across days.
