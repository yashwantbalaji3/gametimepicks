# UFC Predicted Winner + Method of Victory (2026-07-11)

Founder ask: show the **exact predicted winner** and **method of victory** for every UFC fight, in the table
and on the homepage. Delivered — honestly, without faking data.

## Engine
`UfcPredictionRowV1.prediction` (+ display strings): `predictedWinner` / `predictedWinnerSource` /
`predictedWinnerConfidence`, `methodOfVictory` / `methodSource` / `methodConfidence`, and a combined
`winnerMethodText` ("Costa by KO/TKO").

- **Winner (market-implied):** the higher de-vigged fighter when a clear favorite exists —
  `max(noVigA, noVigB) ≥ 0.55` → that fighter; else **"No clear winner"**. Confidence ≥.70 High / ≥.60 Medium
  / ≥.55 Low. No odds ⇒ "No clear winner" (a winner is **never** invented from thin air).
- **Method (experimental V1):** the model's method mix (`decision≈distance, KO≈striking, sub≈grappling`,
  normalized) — top ≥ 40% → Decision / KO/TKO / Submission; else **"No clear method"**.

## UFC 329 result (14 fights)
| metric | count |
|---|---|
| Predicted winner = named fighter (market-backed) | **6** |
| Method of victory = read (Decision/KO/TKO/Submission) | **12** |
| "No clear winner" | **8** (4 no odds + 4 near-pick'em <55%) |
| "No clear method" | **2** (the odds-only fights with no fighter model) |

**Blunt:** 8 fights show "No clear winner" — 4 have no two-sided odds yet, and 4 are genuine near-pick'em
markets (favorite under 55% de-vigged). That is honest, not a bug: we do not manufacture a winner for a
coin-flip or an odds-pending bout.

## UI
- **`/ufc` table:** **Predicted winner** + **Method of victory** are the first two cells of every fight card,
  with a "Costa by KO/TKO" hero line, confidence, and a Source chip (Market-implied / V1 model / Market-only).
- **Homepage:** a compact **"Tonight's UFC picks"** board (Fight · Winner · Method · Conf) with a
  "View all UFC predictions →" CTA to `/ufc`, shown only when an upcoming UFC card exists.
- **Featured animation:** shows the same `winnerMethodText` as the table (consistency).

## Honesty / guardrails
Winner = market-implied; method = experimental V1 read — **paper-only, validation in progress (0/150)**.
No "best bet / lock / positive EV / validated edge / official pick". No fabricated stats/odds/outcomes. UFC
stays excluded from Bank Builder / Moonshot. Money md5 `affe6b21…` unchanged, 19-14, $0.
