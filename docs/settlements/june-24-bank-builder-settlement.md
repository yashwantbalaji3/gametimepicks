# June 24, 2026 — Bank Builder Settlement

**Status: `SETTLED` (official). Lane A WON · Lane B LOST.** Graded only from official FT results through the
tested engine; canonical money moved only by the seed model (one lost $100 seed).

> _An earlier pass reported `PENDING_OFFICIAL_RESULTS` because it only looked for a pre-built settlement
> bundle. Root cause + fix are in §3. The official FT results were then supplied by the operator (the site's
> authoritative API-Football v3 source), graded by the tested engine, and applied._

---

## 1. Official FT results (operator-provided · API-Football v3 /fixtures — the site's authoritative WC source)

| Match | Score (FT, 90′) |
|---|---|
| Morocco vs Haiti | **Morocco 4-2 Haiti** |
| Bosnia & Herzegovina vs Qatar | **Bosnia & Herzegovina 3-1 Qatar** |
| Scotland vs Brazil | **Brazil 3-0 Scotland** (Scotland 0-3 Brazil) |
| Switzerland vs Canada | **Switzerland 2-1 Canada** |

Persisted to `world-cup/settlement/official-scores-2026-06-24.json` + graded bundle `…/2026-06-24.json`.

## 2. Locked cards audited (the approved pre-kickoff cards, not regenerated/replacement)

**Lane A — Step 5 (final rung), stake $3,502.57:** Morocco ML (-550) · Bosnia & Herzegovina ML (-275) ·
Scotland/Brazil **Over 2.5** (-127).
**Lane B — Step 3, stake $702.45:** Brazil ML (-320) · Switzerland/Canada **Under 2.5** (-144).

## 3. Settlement-path trace + why it had stopped (Task 1 / Task 8)

- **Source of WC scores:** the app grades soccer from `world-cup/settlement/<date>.json` `.finals`, built from
  **API-Football v3 /fixtures (FT)** via `persist-soccer-settlement.mjs` → graded by the shared engine
  `src/lib/settlement/soccer-markets.ts` (`settleCard`/`gradeLeg`). `settle-daily-portfolio.mjs` then applies
  the seed model. `schedule.json` is an ESPN fixture list with **no scores**; the only results-bearing files
  are the dated settlement bundles.
- **Why the first attempt stopped:** the June-24 bundle did not exist and `API_FOOTBALL_KEY` was unset — so
  there was no on-disk official source. Correct refusal ("no fake settlement"), but it didn't trace the build
  pipeline.
- **Deeper blocker found + fixed:** the locked June-24 BB legs use the WC-team-pool id format
  `WORLD_CUP:<hash>:market:Team`, but the collector parsed `matchId = Number(parts[1])` (→ `NaN`) and left
  moneyline `side` unresolved for the `WORLD_CUP` kind — so even with scores, BB legs could not bind to a
  match. June-23 only settled because its legs used the numeric `team:<id>:…` format. **Fix:** `parseLaneLeg`
  now binds by matchup **name** when no numeric id is present and resolves moneyline home/away by team
  (kind-agnostic). Also: the collector now skips non-active lanes (awaiting Moonshot can't phantom-settle),
  and a dead `seedLost` reference that crashed any **lost**-lane apply was removed. All covered by tests.

## 4. Grading (every leg from the official score — Task 3/4)

### Lane A → **WON** (all 3 legs)
| Leg | Market | Official | Result |
|---|---|---|---|
| Morocco to win | Moneyline 90′ | Morocco 4-2 Haiti → home win | **won** |
| Bosnia & Herzegovina to win | Moneyline 90′ | Bosnia 3-1 Qatar → home win | **won** |
| Over 2.5 | Total Goals (Scotland/Brazil) | 0+3 = **3 goals** > 2.5 | **won** |

### Lane B → **LOST**
| Leg | Market | Official | Result |
|---|---|---|---|
| Brazil to win | Moneyline 90′ | Scotland 0-3 Brazil → away win | won |
| Under 2.5 | Total Goals (Switzerland/Canada) | 2+1 = **3 goals** ≥ 2.5 | **lost** |

> A parlay with one lost leg cannot win → **Lane B LOST** (Brazil ML won, but Under 2.5 missed).

## 5. Payout progression (approved ladder logic)

| Lane | Step | Stake (rolled) | Combined | Result | Outcome |
|---|---|---|---|---|---|
| A | 5 (final) | $3,502.57 | +188 (×2.880) | WON | rolls → **$10,089.23** → **COMPLETES the $10k ladder** |
| B | 3 | $702.45 | +122 | LOST | stops → **−$100 seed** |

- **Lane A reached the final rung** ($10,000 goal cleared at $10,089.23). Completion banking is
  **OPERATOR-GATED** — NOT auto-applied. Flagged: `portfolio.pendingLaneCompletions = [{lane: "A", step: 5,
  finalValue: 10089.23}]` → **`PENDING_LADDER_COMPLETION`**.
- **Seed model:** a won step rolls (bankroll/crown unchanged); a lost step drops its **$100 seed**. Net
  bankroll move = **−$100** (Lane B only).

## 6. Reconciliation

| Metric | Before | After |
|---|---|---|
| Canonical bankroll | $10,176.17 | **$10,076.17** (−$100 Lane B seed) |
| Crown bankroll | $10,376.17 | **$10,376.17** (immutable — never written) |
| Bank Builder record (seed-model, canonical) | 12-2-0 | **13-3-0** |
| Canonical open exposure | $0 | **$0** |

**Mr. Dub master ledger** (product rolled-stake track record, separate layer):

| Product | Record | ROI | P&L | Open exp |
|---|---|---|---|---|
| Bank Builder | 3-1 | +140.37% | **+$8,347.41** | $0 |
| Moonshot | 0-2 | −100% | −$50 | $0 |
| World Cup Specials | 0-5 | −100% | −$50 | $0 |
| Homer Nukes | 0-0 | — | $0 | $20 |
| **Aggregate** | **3-8** | **+136.39%** | **+$8,247.41** (lifetime) | **$20** |

Daily portfolio regenerated post-settlement → **$0 open exposure, no stale active cards**. WC Specials +
Moonshot ledgers untouched (out of scope; their other-game results were not provided — those cards remain
pending, none fabricated). The consumed June-24 approved-card lock was retired (marked settled, lanes
emptied) so a refresh cannot re-pin settled cards.

## 7. Completion status

**`PENDING_LADDER_COMPLETION` (Lane A).** Lane A finished the 5-rung ladder at **$10,089.23 ≥ $10,000 goal**.
No tested dual-lane completion-banking money model exists, so the bankroll was **not** auto-credited the
completed value — it is flagged for an explicit operator banking decision. The win is recorded in the
record (13-3) and the ladder (`laneStatus: completed`); the crown is untouched.

## 8. Verification

- Grading: tested engine (`settleCard`/`gradeLeg`) from official FT only — no inference, no web snippets.
- Money guards: crown immutable (enforced); won-only would forbid a bankroll change; lib/loop W/L agree.
- Tests / tsc / build: recorded with the shipping PR.
- No stale active cards; canonical money integrity preserved (only the lost $100 seed moved).

## Final answer
1. **Lane A = WON** (Morocco ML, Bosnia ML, Scotland/Brazil Over 2.5 — all won).
2. **Lane B = LOST** (Brazil ML won; Switzerland/Canada Under 2.5 lost — 3 goals).
3. **New bankroll = $10,076.17** (−$100 Lane B seed).
4. **New crown bankroll = $10,376.17** (unchanged).
5. **Updated BB record = 13-3-0** (Mr. Dub product layer: BB 3-1; aggregate 3-8, +$8,247.41 lifetime).
6. **$10k ladder = ACHIEVED** by Lane A ($10,089.23, final rung cleared).
7. **Completion banking = NOT triggered** — operator-gated; flagged `PENDING_LADDER_COMPLETION` for an
   explicit operator decision.
