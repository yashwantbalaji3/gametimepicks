# Dual Bank Builder — Step 1 settlement checklist

Run #2 (Dual Bank Builder), Step 1. Status: **PENDING — do not grade until each event is
official/final.** Artifact: `app/public/data/bank-builder/dual-lanes-latest.json`
(generatedAt 2026-06-15T22:47Z). Both lanes start at **$100**. Settle each leg from the
official source below, then grade the lane (a 2-leg parlay wins only if BOTH legs win).

> Grading rule reminder (per repo convention): settle from the OFFICIAL box score / final
> score only — never from web snippets or screenshots. A push on any leg voids that leg
> (re-price the parlay on the remaining leg). Do not advance/close a lane until both legs
> are final.

---

## Lane A — lower-variance (combined −113 · $100 → ~$188.24)
| Leg | Source (official) | Win condition | Status |
|---|---|---|---|
| **Iran or Draw** (double chance) — `Iran vs New Zealand`, gameId `16`, kickoff 2026-06-16T01:00Z | API-Football `/fixtures?id=…` final score (regulation 90) | Iran win **or** draw ⇒ WIN · New Zealand win ⇒ LOSS | pending |
| **Troy Johnston Over 0.5 hits** — `COL @ CHC`, gameId `9c2784938a40031b48e75139185e2491`, start 2026-06-16T00:06Z | MLB Stats API official box score | hits ≥ 1 ⇒ WIN · 0 hits ⇒ LOSS · (DNP ⇒ void) | pending |

Lane A grades **WON** only if both legs win.

## Lane B — higher-return (combined +115 · $100 → ~$215.11)
| Leg | Source (official) | Win condition | Status |
|---|---|---|---|
| **Mike Trout Under 1.5 hits** — `LAA @ AZ`, gameId `38a1ef501107d0410c8595f25612567d`, start 2026-06-16T01:41Z | MLB Stats API official box score | hits ≤ 1 ⇒ WIN · hits ≥ 2 ⇒ LOSS · (DNP ⇒ void) | pending |
| **Samad Taylor Over 0.5 hits** — `SD @ STL`, gameId `6dc67dec6b0c9f4a591f05d0f5912d23`, start 2026-06-15T23:46Z | MLB Stats API official box score | hits ≥ 1 ⇒ WIN · 0 hits ⇒ LOSS · (DNP ⇒ void) | pending |

Lane B grades **WON** only if both legs win.

---

## When to grade
All four events are evening June 15 ET / early June 16 UTC. Grade after each game/match is
FINAL (MLB: game `Final`; WC: fixture status `FT`). Earliest final ≈ SD @ STL (start 23:46Z),
latest ≈ Iran v NZ (kickoff 01:00Z, final ~03:00Z) and LAA @ AZ.

## How to settle (next task)
- MLB legs: `pipeline/mlb/settle_mlb_results.py` (or the official-box-score grader) per gameId
  + player. WC leg: API-Football `/fixtures?id=16` final score → grade the double chance.
- On settlement, update each lane's `status` (won/lost/push) and, if both legs win, advance the
  lane to Step 2 (compounding the paper bankroll); if a lane loses, mark it closed for this run.
- Do NOT mutate completed Run #1 ($100 → $10,376.17 / 5–0). Keep this checklist's `pending`
  rows until the official results are in.
