# Alternate Lines — Grading Plan

> Plan only. No alternate data exists in the feed yet (see
> `alternate-lines-readiness-latest.md`). This documents how alternate-line
> ladders WOULD be settled + validated before any public surfacing. No
> fabrication; nothing is wired live.

## 1. Record shape (per rung)
Mirror `app/src/lib/alternate-lines.ts::AlternateLineRecord`:
`sport, date, gameId, playerId, playerName, team, opponent, market, mainLine,
alternateLine, side, overOdds, underOdds, devigOver, devigUnder, provider, asOf`.
A player+market is a **ladder** of rungs (multiple `alternateLine` values), each
two-way priced.

## 2. Grading key
- **Grading key:** `(sport, date, gameId, playerId, market, alternateLine, side)`.
- **Final stat field:** the same settled actual already used by standard
  settlement — `mlb_settled_leans.jsonl.actual` (the player's realized stat for
  that market that game). No new stat source needed; alternate rungs settle off
  the *same* final stat as the main line.

## 3. Settlement rule (per rung)
For chosen `side` at `alternateLine`:
- Over hits iff `actual > alternateLine`.
- Under hits iff `actual < alternateLine`.
- `actual == alternateLine` → **push** (excluded from W/L denominator).
- In-progress / DNP → pending (never a loss), exactly like main-line settlement.

Because every rung settles off the same `actual`, grading is a pure function of
the existing settled stat — no extra API calls to settle.

## 4. De-vig + calibration
- De-vig each rung two-way: `deVigAlternateLine(overOdds, underOdds)` →
  `devigOver/devigUnder` (already in the helper, tested). One-sided rungs cannot
  be de-vigged → `partial`, excluded from "beats-market" tests.
- Validation flows through the SAME hardened gate as everything else
  (`audit-v2-candidate-search` / `v2-candidate-gates`): observed hit rate vs the
  rung's de-vigged probability, Wilson naive + Bonferroni-corrected CI, adjusted
  p, date stability, single-date leave-one-out, leakage. Alternate rungs do NOT
  bypass any gate.

## 5. Pipeline integration (sketch — gated, not built)
1. Shadow-fetch + store alternate ladders (paid; approval required — see
   `docs/ALTERNATE_LINES_SHADOW_FETCH_PLAN.md`).
2. A settlement step grades each stored rung off `actual` (pure; no API).
3. Add an alternate-line settled log (e.g. `pipeline/validation/mlb_alt_settled_leans.jsonl`)
   with the grading key + outcome + de-vig.
4. Extend the candidate search to read it as additional segments (still gated).
5. Internal ladder simulation (no public write).
6. Neutral UI ladder only after a corrected launch candidate + operator approval.

## 6. Completeness classification
Use `classifyAlternateLineCompleteness`:
- `complete` (two-way + ids + numeric line) → usable for de-vig + grading.
- `partial` (one-sided) → gradable but not de-viggable → excluded from market-beat
  tests; reported separately.
- `missing` (no odds) → unusable; logged as a coverage gap.

## 7. Hard rules
- No `edgePct`/`confidence` as quality signals.
- No public copy implying "safe"/"guaranteed"/"better hit rate". Neutral framing:
  "higher de-vigged probability / lower payout" (a number, not a claim).
- Alternate rungs must clear the SAME corrected launch gates before any public use.

*Plan only; no alternate data, no live wiring, no fabrication.*
