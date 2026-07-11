# UFC Fighter Matching Audit (2026-07-10)

How the Prediction Engine V1 joins UFC 329 fighters to the 2,695-fighter stats DB, and why 2 rows remain
"Insufficient data".

## Matching

`norm()` in `ufc-prediction-engine.ts`: **fold diacritics** (`normalize("NFD")` → strip combining marks) →
lowercase → strip punctuation → collapse spaces. Then `buildFighterIndex` keys the DB by normalized
`canonicalName` + every normalized `alias`. Each row records `fighterAMatchQuality` / `fighterBMatchQuality`
(`matched` | `unmatched`).

## The fix this pass

`norm` previously deleted non-`a-z` characters BEFORE folding, so **"Benoît"** → `"benot"` and missed the
DB's **"Benoit Saint Denis"**. Folding first → `"benoit saint denis"` → **matched**. That recovered one fight
(insufficient 3 → 2).

## UFC 329 result

| fighter | outcome |
|---|---|
| Benoît Saint Denis | ✅ matched (diacritic fold) |
| John Garza | ❌ unmatched — not in the DB; only "Pablo Garza" shares the last name (a **false** match, rejected) |
| Gable Steveson | ❌ unmatched — not in the DB (Olympic-wrestling crossover debut; no MMA finish history) |

**26 of 28 fighters matched → 12 of 14 fights carry a model read.**

## Why no aggressive fallback

Last-name / token-set fallback was deliberately NOT used for the 2 unmatched: "Garza" → "Pablo Garza" and
"Steveson" → nothing would be a dangerous false match. The mission's rule — *"avoid dangerous false matches;
do not use weak fallback if it creates ambiguity"* — is honored. Those rows stay honestly "Insufficient data".

## To fill the last 2 rows (honest)

They need John Garza + Gable Steveson added to the fighter DB (`build_fighter_stats.py` against a source that
carries them). No safe automated match exists today; faking stats is not an option.
