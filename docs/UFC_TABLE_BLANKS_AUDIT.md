# UFC Prediction Table — Blanks Audit + Fill (2026-07-11)

Founder ask: fill every UFC prediction row tonight. Result: **14/14 fights fully populated, zero blank cells,
zero "Insufficient data" rows** — honestly, without faking data.

## Coverage (14 fights)
| tier | count | moneyline | fight type / distance / method / round |
|---|---|---|---|
| **Full data** (odds + fighter model) | 8 | market-implied de-vig | GameTime V1 model reads |
| **Model only** (fighter model, no odds) | 4 | "Odds pending" | GameTime V1 model reads |
| **Odds only** (odds, no fighter model) | 2 | market-implied de-vig | **Market-only fallback** → "Market-only read" / "No clear read" |
| Records only (neither) | 0 | — | — |

## The fill
- **Display-safe rows:** `UfcPredictionRowV1.display` now carries a guaranteed-non-empty string for every
  column (`gameTimeRead, moneyline, winProbability, fightType, distance, method, roundRange, confidence,
  why, coverage`). The UI renders `display.*` — no ad-hoc blank-prone strings.
- **Market-only fallback (Phase 4):** the 2 odds-only fights (incl. **Gable Steveson vs Elisha Ellison** and
  the **John Garza** bout) no longer read "Insufficient data". They show the market-implied moneyline +
  **"Market-only read"** / **"No clear read"** for the model fields (honest: we have a market read but no
  fighter stats), with the model cells flagged Low confidence.
- **Round Range** is now a visible column in the V2 table and a chip in the featured animation.

## Honesty
Moneyline = market-implied. Fight-type/distance/method/round = **experimental V1 reads** (validation in
progress, 0/150, paper-only). Nothing fabricated: fights without fighter stats say "No clear read", not a
made-up projection. No "best bet / lock / positive EV / validated edge / official pick". John Garza + Gable
Steveson remain **unmatched in the fighter DB** (no safe auto-match) — their model cells are honest "No clear
read", their moneyline is live.

## Money / products
Official money untouched (md5 `affe6b21…`, 19-14, $0). UFC excluded from Bank Builder / Moonshot (tested).
