# June 24, 2026 — Bank Builder Settlement

**Status: `PENDING_OFFICIAL_RESULTS` — settlement BLOCKED. No bankroll/crown/record/ledger was mutated.**

> Money integrity invariant held: canonical values are unchanged because **no leg has been officially
> graded**. The tested settlement path refuses to run without an official-results bundle ("no fake
> settlement"), and none exists for June 24. Results were **not assumed, not modeled, not web-scraped.**

---

## Step 1 — Canonical state (recorded before any action)

| Field | Value |
|---|---|
| Active bankroll | **$10,176.17** |
| Crown bankroll | **$10,376.17** |
| Bank Builder record | **12-2-0** (W-L-V) |
| Canonical open exposure | **$0** (seed-model; daily-view exposure is separate) |
| Settled profit | $10,076.17 |
| Moonshot | stopped · 0-1 · $0 exposure (separate, not part of this settlement) |

Daily-view (the at-risk seed for today's active lanes): BB open exposure **$200** (2 lanes × $100 seed),
Moonshot $0 (both lanes awaiting). Master ledger: BB 2-0 / +$2,463.20, aggregate 2-7 / +$2,363.20 / $220.

---

## Step 2 — Active locked June-24 cards (the approved, pre-kickoff cards — NOT regenerated/replacement)

Source: `app/public/data/mr-dub/bank-builder-locks.json` (🔒 approved-card lock), reflected in
`daily-portfolio.json`.

### Lane A — Step 5 (final rung) · rolled stake **$3,502.57** → target **$10,089.23** (goal $10,000)
| Leg | Match | Market | Line | Odds |
|---|---|---|---|---|
| Morocco to win | Morocco vs Haiti | Moneyline (90′) | — | -550 |
| Bosnia & Herzegovina to win | Bosnia & Herzegovina vs Qatar | Moneyline (90′) | — | -275 |
| Over 2.5 Goals | Scotland vs Brazil | Match Total Goals | 2.5 | -127 |

### Lane B — Step 3 · rolled stake **$702.45** → target **$1,562.22** (goal $1,400)
| Leg | Match | Market | Line | Odds |
|---|---|---|---|---|
| Brazil to win | Scotland vs Brazil | Moneyline (90′) | — | -320 |
| Under 2.5 Goals | Switzerland vs Canada | Match Total Goals | 2.5 | -144 |

---

## Step 3 — Official results: UNAVAILABLE

The tested path grades only from `public/data/world-cup/settlement/2026-06-24.json`, built from **API-Football
official FT (regulation 90′) results**. Verification:

- `public/data/world-cup/settlement/2026-06-24.json` → **does not exist** (latest bundle is `2026-06-23.json`).
- `settle-daily-portfolio.mjs --date 2026-06-24` (dry-run) → *"no official results bundle … settlement is
  gated on official finals (no fake settlement)."*
- `API_FOOTBALL_KEY` → **not set**; no `.env.local`. The fetch path is dormant (operator secret not configured).

Kickoffs (19:00Z / 22:00Z June 24) are past as of generation (≈01:24Z June 25), so the matches are presumably
final — but **no authoritative box score is reachable**, so grading cannot proceed.

### Matches that need official FT scores (the four driving Bank Builder)
| matchId | Match | Drives |
|---|---|---|
| 1489405 | Morocco vs Haiti | Lane A — Morocco ML |
| 1539009 | Bosnia & Herzegovina vs Qatar | Lane A — Bosnia ML |
| 1489406 | Scotland vs Brazil | Lane A — Over 2.5 · Lane B — Brazil ML |
| 1489408 | Switzerland vs Canada | Lane B — Under 2.5 |

(Operator-fill template emitted by `settle-soccer-slate.mjs --date 2026-06-24`; write the FT scores into
`public/data/world-cup/settlement/2026-06-24.json` with `source` = API-Football/ESPN operator-verified.)

---

## Step 4 — Grading

| Lane | Leg | Final result | W/L |
|---|---|---|---|
| A | Morocco to win | **undetermined — no official source** | — |
| A | Bosnia & Herzegovina to win | **undetermined** | — |
| A | Over 2.5 (Scotland/Brazil) | **undetermined** | — |
| B | Brazil to win | **undetermined** | — |
| B | Under 2.5 (Switzerland/Canada) | **undetermined** | — |

**Lane A = UNDETERMINED.  Lane B = UNDETERMINED.** No result is asserted.

---

## Step 5 — Settlement-integrity review (current values + expected impact per outcome)

**Current (frozen):** bankroll $10,176.17 · crown $10,376.17 · record 12-2-0 · daily seed exposure $200.

Seed model: a WON lane **rolls** (bankroll/crown UNCHANGED, the rolled balance is the display/target, the
$100 seed is the only at-risk cash); a LOST lane drops its **$100 seed** (crown never changes).

| Outcome | Lane A | Lane B | Bankroll | Crown | Record |
|---|---|---|---|---|---|
| Both WON | rolls → COMPLETES ladder ($10,089) | rolls → Step 4 ($1,562) | $10,176.17 (unchanged) | $10,376.17 | 14-2 |
| A WON / B LOST | COMPLETES ladder | −$100 seed, stopped | $10,076.17 | $10,376.17 | 13-3 |
| A LOST / B WON | −$100 seed, stopped | rolls → Step 4 | $10,076.17 | $10,376.17 | 13-3 |
| Both LOST | −$100 seed, stopped | −$100 seed, stopped | $9,976.17 | $10,376.17 | 12-4 |

These are scenario projections for review only — **not predictions and not applied.**

---

## Step 6 — Apply: NOT executed

Grading is incomplete (no official results), so the apply path was **not run**. Per the script's hard guard,
`--apply` would itself refuse without the official bundle.

## Step 7 — Completion detection

Lane A sits on **Step 5, the final rung** (start $3,500 → goal $10,000). **If** Lane A is officially graded
WON, it completes the ladder — and per the tested path, **completion banking is OPERATOR-GATED**: it is NOT
auto-applied to bankroll/crown; the lane is flagged in `portfolio.pendingLaneCompletions` as
**`PENDING_LADDER_COMPLETION`** and a completion report is produced. No tested auto-banking money model
exists. (Currently moot — Lane A is undetermined.)

## Step 8 — Ledger updates: NONE

No settled result → Bank Builder ledger, product-performance ledger, master ledger, and daily portfolio are
**unchanged**. Existing reconciliation still holds (BB 2-0 / +$2,463.20; aggregate 2-7 / +$2,363.20 / $220).

---

## Step 10 — Verification

- Canonical money integrity: bankroll $10,176.17 / crown $10,376.17 / 12-2-0 — **unchanged** (dry-runs write nothing).
- No stale active cards: today's locked Lane A/B remain the active June-24 cards; nothing was dropped or swapped.
- Test / tsc / build gates: see the run recorded with this settlement.

---

## Recommended next action

1. Provide official FT results — either:
   - set `API_FOOTBALL_KEY` and run the fetch, **or**
   - write operator-verified FT scores into `public/data/world-cup/settlement/2026-06-24.json` (4 matches above).
2. Re-run `npx tsx app/scripts/settle-daily-portfolio.mjs --date 2026-06-24` (dry-run) to grade + review.
3. Only then `--apply` to advance the seed-model ladder. If Lane A grades WON, expect `PENDING_LADDER_COMPLETION`
   (operator decision required for completion banking).
