# UFC 329 Ingest + Prediction Readiness (2026-07-10)

**UFC 329 is now really ingested — no fake data.** The repo already had a real, live UFC pipeline; this
pass ran it. The event, 14-fight card, and real sportsbook moneyline odds are live; the V1 moneyline model
computed reads for the matched bouts. Public **picks stay internally gated** (unvalidated) — the
fail-closed design — but the event + card + market-implied odds now surface on `/ufc`. Official money md5
`affe6b21…` unchanged, 19-14, $0.

---

## Provider map (what actually exists — corrects the prior "not ingestable" verdict)

| layer | provider | key | script |
|---|---|---|---|
| schedule + fight card | **free ESPN MMA API** (`site.api.espn.com/.../mma/ufc/scoreboard`) | none | `pipeline/ufc/build_schedule.py` |
| moneyline odds | **The Odds API (MMA)** | `ODDS_API_KEY` ✓ (credit-guarded) | `pipeline/ufc/build_odds.py` |
| fighter stats | committed fighter DB (2,695 fighters) | — | `build_fighter_stats.py` |
| features / model | — | — | `build_features.py` + `model_moneyline.py` + `build_v1.py` |
| readiness / ops | — | — | `build_readiness.py` + `build_ops_status.py` |
| orchestration | — | — | `.github/workflows/ufc-pre-card.yml` |

The prior pass wrongly concluded UFC 329 wasn't ingestable — it only looked at `*_test.py` (the unit
tests) and missed the real `build_*.py` modules + the ESPN/Odds-API fetch.

## What was ingested this pass (real)

Ran the `ufc-pre-card` sequence (money md5 verified unchanged throughout):

- **`build_schedule`** → ESPN returned **"UFC 329: McGregor vs. Holloway 2"**, `2026-07-11`, **14 fights**,
  `isRealCard=True`.
- **`build_odds --max-events 20`** → The Odds API returned **real MMA moneyline**: `oddsReady=True`, 20
  bouts, 20 credits used, ~18,449 remaining.
- **`build_fighter_stats`** → 2,695 fighters / 17,402 fights.
- **`build_features --card-only`** → matched **9/14** bouts to fighter stats (5 blocked — unmatched
  names; never faked).
- **`model_moneyline` + `build_v1`** → `moneylineV1Ready=True`, **9 projections**, `validated=False`.
- **`build_prop_odds`** → prop markets `unavailable` (no method/round/distance odds returned) — honest.
- **`build_readiness` + `build_ops_status`** → `publicLevel=grading-internal`, stage 1 "Internal moneyline
  model (public locked)", `publicPicksVisible=false`.

## Prediction status — market-implied ready, model picks internally gated

- **Market-implied moneyline** reads are real (from the ingested odds) and now render on `/ufc`.
- **Model picks** (`model_adjusted`) are computed but **not public** — the model is unvalidated
  (`moneylineValidated=false`, needs ~150 clean graded fights) and `publicPicksVisible=false`. This is the
  correct fail-closed behavior: no unvalidated pick is shown as a public claim. **No independent-model /
  10k-run / positive-EV / best-bet claim is made.**

## `/ufc` page fix

The page was hiding UFC 329 because a **past** settled card (Freedom 250) set `ufcSettled=true`. Fixed:
`ufcSettled` is now true only when the settled event **is** the current card — so a freshly-ingested
upcoming card (UFC 329, with published odds) shows as active. The page now surfaces the UFC 329 hero +
the real market-implied odds board; picks remain gated. Command-rail descriptor → "UFC 329 · fight week".

## What remains blocked

- **Public model picks** — need validation (backtest ≥150 clean fights; `moneylineValidated`). Internal
  only until then.
- **Method / round-total / goes-distance** markets — The Odds API returned no prop lines for this card;
  `prop-odds` status `unavailable`. Moneyline-only, honestly.
- **5 unmatched bouts** — fighter-name matching didn't resolve them; shown without model stats (never
  faked).

## Guardrails

No fake fights/fighters/odds/predictions. Money md5 `affe6b21…` verified unchanged before + after every
step. UFC paper products not activated (moneyline settlement exists but public picks are gated). Internal
artifacts stay internal. Suite 2057 green.
