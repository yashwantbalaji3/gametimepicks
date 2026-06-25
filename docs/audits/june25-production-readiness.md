# June 25, 2026 — Production Readiness Report

_Generated 2026-06-25, after the official June-24 Bank Builder settlement. Money integrity held throughout._

## Verdict

**Settled June-24 state: PRODUCTION-READY (verified).** Settlement applied + reconciled, 1400/1400 tests
pass, tsc + build clean, all public pages render with zero console errors and zero broken images.

**June-25 daily content: BLOCKED on data.** The June-25 odds/projections/MLB-props pull has not run in this
environment (API keys dormant), so no June-25 cards can be generated without fabrication. See §7–8.

**Readiness score: 8.5 / 10** — the platform and the settled ledger are ship-ready; the −1.5 is the June-25
content gap (an external data dependency, not a code defect) plus the operator decision pending on Lane A's
ladder completion.

---

## 1. Current bankroll
**$10,076.17** (was $10,176.17; −$100 from Lane B's lost seed on June 24).

## 2. Current crown bankroll
**$10,376.17** — immutable, never written by settlement (verified by hard guard).

## 3. Current Bank Builder record (canonical seed-model)
**13-3-0** (was 12-2-0; +1 win Lane A, +1 loss Lane B on June 24).

## 4. Current ledger summary (Mr. Dub master ledger — product rolled-stake track record)
| Product | Record | ROI | P&L | Open exp | Status |
|---|---|---|---|---|---|
| Bank Builder | 3-1 | +140.37% | +$8,347.41 | $0 | fresh |
| Moonshot | 0-2 | −100% | −$50.00 | $0 | fresh |
| World Cup Specials | 0-5 | −100% | −$50.00 | $0 | fresh |
| Homer Nukes | 0-0 | — | $0.00 | $20 | fresh |
| **Aggregate** | **3-8** | **+136.39%** | **+$8,247.41** (lifetime) | **$20** | — |

Canonical portfolio (seed-model layer, separate): settled profit **+$9,976.17**, drawdown **$300** (2.89% from
the $10,376.17 HWM), ROI 99.76×. Reconciled two independent ways (seed model + ledger reconstruction agree).

## 5. Current exposure
- **Canonical Bank Builder open exposure: $0** (both June-24 lanes settled).
- **Master-ledger open exposure: $20** — Homer Nukes' two $10 June-24 lanes, still unsettled (no MLB results
  pulled). Moonshot $0 (awaiting), WC Specials $0 (paper history).

## 6. June 24 settlement summary
Official FT (operator-provided, API-Football v3): Morocco 4-2 Haiti · Bosnia 3-1 Qatar · Brazil 3-0 Scotland ·
Switzerland 2-1 Canada.
- **Lane A WON** — Morocco ML + Bosnia ML + Scotland/Brazil Over 2.5 → $3,502.57 rolled to **$10,089.23**,
  **COMPLETING the $10,000 five-rung ladder**. Flagged `PENDING_LADDER_COMPLETION` (operator-gated; bankroll
  NOT auto-credited — see §9).
- **Lane B LOST** — Brazil ML won, but Switzerland/Canada Under 2.5 lost (3 goals) → lane stopped, −$100 seed.
- Graded by the tested engine (`settleCard`), not assumed. Full detail:
  [docs/settlements/june-24-bank-builder-settlement.md](../settlements/june-24-bank-builder-settlement.md).

## 7. June 25 product status
| Product | June-25 status | Reason |
|---|---|---|
| Bank Builder | **No new card** | (a) no June-25 WC odds/projections; (b) Lane A's ladder is complete (pending operator banking decision); Lane B is stopped (restart at $100 when a slate exists). |
| Moonshot | **Awaiting** | No June-25 WC odds → no longshot pool to build from. |
| World Cup Specials | **Not generated** | No June-25 WC odds/projections. June-24 specials remain (partially settleable — see §8). |
| Homer Nukes | **Not generated** | No June-25 MLB home-run-props/boards. |

The June-25 schedule (6 WC fixtures: Ecuador/Germany, Curaçao/Ivory Coast, Japan/Sweden, Tunisia/Netherlands,
Türkiye/USA, Paraguay/Australia) is present, but **only the fixture list** — no odds, no projections, no model
probabilities. Generation was **not** attempted with fabricated data.

## 8. Remaining blockers
- **P0 — June-25 daily data pull.** Provide June-25 WC odds + projections (Odds API / API-Football) and MLB
  home-run-props, or enable the dormant `ODDS_API_KEY` / `API_FOOTBALL_KEY`. Then run the daily refresh to
  generate all four products' June-25 cards. **Nothing fabricated until then.**
- **P0 — Lane A completion-banking decision** (operator). See §9.
- **P1 — June-24 World Cup Specials full settlement.** Only the 4 Bank Builder games have official results;
  the WC Specials cards also reference **Czechia/Mexico** and **South Africa/South Korea**, whose FT scores
  were not provided. Supply those two results to settle + archive the June-24 specials cleanly. (Their
  ledgers were left untouched — no partial/fabricated settlement.)
- **P1 — WC projection MODEL probability is inverted/buggy** (selectors already prefer de-vigged market
  outlook; quarantine the raw model prob). **P1 — Homer Nukes Statcast inputs (0/7, data-gated).**

## 9. Ladder completion review (PENDING_LADDER_COMPLETION)
**Recommendation: KEEP PENDING — do NOT auto-advance/bank.**
Evidence: (1) there is **no tested completion-banking money model** in the codebase — every reference states
completion banking is "OPERATOR-GATED (not an auto-applied money model)"; (2) Step 5 is the final rung, so
there is no rung to auto-advance into; (3) auto-crediting the $10,089.23 rolled value into the bankroll would
be an **untested money mutation**, violating the money-integrity invariant. The completion is recorded
(`portfolio.pendingLaneCompletions`, ladder `laneStatus: "completed"`, record 13-3) and surfaced on Mr. Dub
+ Bank Builder; the bankroll/crown are untouched pending an explicit operator banking model.

---

## Acceptance criteria status
- ✅ Settlement fully reconciled (canonical + master ledger + daily-summary; two independent paths agree).
- ✅ All ledgers updated (no stale June-23; derived fields recomputed; completion flagged).
- ⛔ June 25 content generated — **BLOCKED on the data pull** (no fabrication). All four products documented.
- ✅ No stale June-24 active cards (lock retired; daily portfolio $0 exposure; settled lanes show settled).
- ✅ All tests passing (1400/1400), ✅ tsc clean, ✅ build clean.
- ✅ Production-readiness report generated (this document).
